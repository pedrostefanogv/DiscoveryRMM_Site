import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { useTerminalStream } from './useTerminalStream';
import { remoteSessionsApi } from '@/api/remote-sessions';
import '@xterm/xterm/css/xterm.css';

// ── Types ──

interface TerminalTab {
  id: string;
  shell: string;
  label: string;
  natsSubject: string;
}

interface RemoteTerminalProps {
  sessionId: string;
  agentId: string;
  natsSubject?: string;
  natsUrl?: string;
  jwt?: string;
  nkeySeed?: string;
}

function shellLabel(shell: string): string {
  if (shell === 'powershell') return 'PowerShell';
  if (shell === 'cmd') return 'CMD';
  if (shell.startsWith('wsl:')) return `WSL (${shell.slice(4)})`;
  if (shell === 'wsl') return 'WSL';
  return shell;
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

export default function RemoteTerminal({
  sessionId,
  agentId,
  natsSubject = '',
  natsUrl = '',
  jwt = '',
  nkeySeed = '',
}: RemoteTerminalProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [status, setStatus] = useState<'connected' | 'disconnected'>('disconnected');

  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabsInitializedRef = useRef(false);

  // Create initial tab
  useEffect(() => {
    if (tabsInitializedRef.current || !natsSubject || !natsUrl || !jwt) return;
    tabsInitializedRef.current = true;
    const initialTab: TerminalTab = {
      id: 'default',
      shell: 'powershell',
      label: 'PowerShell',
      natsSubject,
    };
    setTabs([initialTab]);
    setActiveTabId('default');
  }, [natsSubject, natsUrl, jwt]);

  // Initialize xterm.js for active tab
  useEffect(() => {
    if (!activeTabId || !containerRef.current) return;

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

    setStatus('connected');
    term.writeln('\x1b[1;36m── DiscoveryRMM Terminal ──\x1b[0m');
    term.writeln('');

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });
    resizeObserver.observe(containerRef.current);

    term.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        try {
          (searchAddon as any).show?.({
            placeholder: 'Buscar no terminal...',
          });
        } catch { /* addon pode nao expor show em runtime */ }
        return false;
      }
      return true;
    });

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [activeTabId]);

  // Wire NATS stream
  const activeTab = tabs.find(t => t.id === activeTabId);
  const { isConnected, sendData, sendResize, onOutput } = useTerminalStream({
    natsSubject: activeTab?.natsSubject ?? natsSubject,
    tabId: activeTabId,
    natsUrl,
    jwt,
    nkeySeed,
  });

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
  }, [sendData, activeTabId]);

  useEffect(() => {
    if (!termRef.current) return;
    const dispose = termRef.current.onResize(({ cols, rows }) => {
      sendResize(cols, rows);
    });
    return () => dispose.dispose();
  }, [sendResize, activeTabId]);

  useEffect(() => {
    setStatus(isConnected ? 'connected' : 'disconnected');
  }, [isConnected]);

  const handleCreateTab = useCallback(async (shell: string) => {
    try {
      await remoteSessionsApi.createTerminalTab(agentId, sessionId, shell, 120, 40);
    } catch { /* fallback: tab created via NATS term.create */ }
    const newTab: TerminalTab = {
      id: crypto.randomUUID(),
      shell,
      label: shellLabel(shell),
      natsSubject,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [agentId, sessionId, natsSubject]);

  const handleCloseTab = useCallback((tabId: string) => {
    remoteSessionsApi.closeTerminalTab(agentId, sessionId, tabId).catch(() => {});
    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) {
      setTabs(prev => {
        const remaining = prev.filter(t => t.id !== tabId);
        if (remaining.length > 0) setActiveTabId(remaining[remaining.length - 1].id);
        return remaining;
      });
    }
  }, [agentId, sessionId, activeTabId]);

  useEffect(() => {
    return () => {
      remoteSessionsApi.stopSession(agentId, sessionId).catch(() => {});
    };
  }, [agentId, sessionId]);

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-t cursor-pointer whitespace-nowrap border-x border-t ${
                tab.id === activeTabId
                  ? 'bg-slate-950 text-slate-200 border-slate-700'
                  : 'bg-slate-800 text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              <span>{tab.label}</span>
              {tabs.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); handleCloseTab(tab.id); }}
                  className="ml-1 text-slate-600 hover:text-red-400 leading-none"
                  title="Fechar aba"
                >×</button>
              )}
            </div>
          ))}
          <div className="relative group">
            <button className="px-2 py-0.5 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded cursor-pointer" title="Nova aba">+</button>
            <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-50">
              {['powershell', 'cmd'].map(shell => (
                <button key={shell} onClick={() => handleCreateTab(shell)} className="block w-full text-left px-3 py-1.5 text-slate-300 hover:bg-slate-700 whitespace-nowrap text-xs">
                  + {shellLabel(shell)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 ${status === 'connected' ? 'text-emerald-400' : 'text-red-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-400' : 'bg-red-400'}`} />
          {status === 'connected' ? 'Conectado' : 'Desconectado'}
        </span>
      </div>
      {/* xterm.js container */}
      <div ref={containerRef} className="flex-1" style={{ minHeight: 0 }} />
    </div>
  );
}
