import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { useTerminalStream } from './useTerminalStream';
import { remoteSessionsApi } from '@/api/remote-sessions';
import '@xterm/xterm/css/xterm.css';

interface RemoteTerminalProps {
  sessionId: string;
  agentId: string;
  natsSubject?: string;
  natsUrl?: string;
  jwt?: string;
  nkeySeed?: string;
  /** Reporta o status de conexão ao pai (para exibir na barra de rodapé unificada). */
  onConnectionChange?: (connected: boolean) => void;
  /** Reporta os shells disponíveis ao pai (para popular o seletor de shell). */
  onShells?: (shells: string[]) => void;
}

// TermReadyInfo compatível com o hook (avoid import cycle)
interface TermReadyPayload {
  shells?: string[];
  consoleId?: string;
  termCols?: number;
  termRows?: number;
}

const TERM_THEME = {
  background: '#0f172a',
  foreground: '#e2e8f0',
  cursor: '#38bdf8',
  cursorAccent: '#0f172a',
  selectionBackground: '#334155',
  black: '#1e293b',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e2e8f0',
  brightBlack: '#475569',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#f8fafc',
};

// Console único — um único terminal por sessão (como o MeshCentral).
export default function RemoteTerminal({
  sessionId,
  agentId,
  natsSubject = '',
  natsUrl = '',
  jwt = '',
  nkeySeed = '',
  onConnectionChange,
  onShells,
}: RemoteTerminalProps) {
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Initialize xterm.js (uma única instância)
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
      theme: TERM_THEME,
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    const clipboardAddon = new ClipboardAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(clipboardAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('\x1b[1;36m── DiscoveryRMM Terminal ──\x1b[0m');
    term.writeln('');

    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });
    resizeObserver.observe(containerRef.current);

    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        try {
          (searchAddon as any).show?.({ placeholder: 'Buscar no terminal...' });
        } catch { /* addon pode nao expor show em runtime */ }
        return false;
      }
      return true;
    });

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Wire NATS stream — console único (subjects fixos term.out / term.in)
  const { isConnected, sendData, sendResize, onOutput, onExit, onReady } = useTerminalStream({
    natsSubject,
    natsUrl,
    jwt,
    nkeySeed,
  });

  // Re-aplica o fit quando a conexão abre (garante resize correto para o agent).
  useEffect(() => {
    if (!isConnected) return;
    // Pequeno delay para o layout estabilizar
    const t = setTimeout(() => {
      try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
    }, 50);
    return () => clearTimeout(t);
  }, [isConnected]);

  // term.ready — reporta shells disponíveis ao pai
  useEffect(() => {
    const unsubscribe = onReady((info: TermReadyPayload) => {
      if (Array.isArray(info.shells) && info.shells.length > 0) {
        onShells?.(info.shells);
      }
      // Se o agente informou dimensões, ajusta o terminal local
      if (info.termCols && info.termRows && termRef.current) {
        termRef.current.resize(info.termCols, info.termRows);
      }
    });
    return unsubscribe;
  }, [onReady, onShells]);

  useEffect(() => {
    const unsubscribe = onOutput((data: string) => {
      termRef.current?.write(data);
    });
    return unsubscribe;
  }, [onOutput]);

  useEffect(() => {
    if (!termRef.current) return;
    const dispose = termRef.current.onData((data) => {
      sendData(data);
    });
    return () => dispose.dispose();
  }, [sendData]);

  useEffect(() => {
    if (!termRef.current) return;
    const dispose = termRef.current.onResize(({ cols, rows }) => {
      sendResize(cols, rows);
    });
    return () => dispose.dispose();
  }, [sendResize]);

  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  // Mostra aviso de shell encerrado
  useEffect(() => {
    const unsubscribe = onExit((reason: string) => {
      termRef.current?.writeln(`\r\n\x1b[1;33m── Shell encerrado: ${reason} ──\x1b[0m\r\n`);
    });
    return unsubscribe;
  }, [onExit]);

  // Para a sessão ao desmontar
  useEffect(() => {
    return () => {
      remoteSessionsApi.stopSession(agentId, sessionId).catch(() => {});
    };
  }, [agentId, sessionId]);

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* xterm.js container */}
      <div ref={containerRef} className="flex-1" style={{ minHeight: 0 }} />
    </div>
  );
}
