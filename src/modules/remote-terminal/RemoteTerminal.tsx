import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { useTerminalStream } from './useTerminalStream';
import { remoteSessionsApi } from '@/api/remote-sessions';
import { useTheme } from '@/theme/ThemeContext';
import '@xterm/xterm/css/xterm.css';

// Controles/teclas construídos em runtime (estáveis contra escapes no fonte).
const ESC = String.fromCharCode(27);
const CSI = ESC + '[';
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const BS = String.fromCharCode(8); // backspace VT (0x08)
const DEL = String.fromCharCode(127); // backspace do xterm (0x7f)

// Sequências de teclas emitidas pelo xterm.
const KEY_UP = CSI + 'A';
const KEY_DOWN = CSI + 'B';
const KEY_RIGHT = CSI + 'C';
const KEY_LEFT = CSI + 'D';
const KEY_HOME = CSI + 'H';
const KEY_HOME_ALT = CSI + '1~';
const KEY_END = CSI + 'F';
const KEY_END_ALT = CSI + '4~';
const KEY_DELETE = CSI + '3~';

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
  /** Backend em uso no agente (conpty/legacy) para ajustes visuais. */
  backend?: string;
}

// Últimas dimensões fitadas do terminal, persistem entre sessões da página:
// o próximo startSession (terminal) já nasce com termCols/termRows corretos
// (a API/agent suportam — evita console 120×40 + corrida de resize no boot).
let lastFittedCols = 0;
let lastFittedRows = 0;
/** Dimensões do último fit do terminal remoto (0,0 se nunca fitado). */
export function getLastFittedTermDims(): { cols: number; rows: number } {
  return { cols: lastFittedCols, rows: lastFittedRows };
}


// ── Editor de linha local do modo compatibilidade (legacy) ──────────────────
// No legacy o stdin do shell é uma PIPE: o child não processa VT (setas,
// histórico, Home/End/Delete são impossíveis lá) e AINDA ECOA o que recebe
// (provado em harness 20/09: "e","cho T"... + "\r" literal; 0x7f/0x08 voltam
// literais — nada é editado). O editor segura a linha no front (buffer
// local), envia linha+CR no Enter e SUPRIME o eco do child para não duplicar.
type LegacyLineStart = { x: number; y: number };

interface LegacyEditor {
  /** Trata a tecla; true = consumida localmente (não vai ao shell). */
  handleKey(data: string): boolean;
  /** Remove o eco do child da saída (retorna o restante). */
  filterEcho(data: string): string;
  /** Invalida a âncora da linha (resize reflowa o buffer do xterm). */
  onResize(): void;
}

function createLegacyEditor(term: Terminal, getSend: () => (data: string) => void): LegacyEditor {
  const state = {
    line: '',
    cursor: 0,
    history: [] as string[],
    histIdx: -1,
    draft: '',
    start: null as LegacyLineStart | null,
    suppress: null as { expected: string; timer: number } | null,
  };

  const clearSuppress = () => {
    if (state.suppress !== null) {
      if (state.suppress.timer) window.clearTimeout(state.suppress.timer);
      state.suppress = null;
    }
  };

  // Âncora = coluna/linha onde a NOSSA linha começa (logo após o prompt do
  // child). Registrada na primeira tecla da linha; o child ecoa o prompt pela
  // pipe, então nunca o reescrevemos — só editamos da âncora em diante.
  const anchorLine = () => {
    if (state.start === null) {
      const b = term.buffer.active;
      state.start = { x: b.cursorX, y: b.cursorY };
    }
  };

  // Posiciona o cursor do xterm na posição lógica do cursor da linha
  // (trata wrap: cursor no fim de uma linha cheia fica na última coluna).
  const placeCursor = () => {
    if (state.start === null) return;
    const cols = term.cols || 80;
    const total = (state.start.x - 1) + state.cursor;
    if (total <= 0) {
      term.write(CSI + String(state.start.y + 1) + ';' + String(state.start.x) + 'H');
      return;
    }
    const row = state.start.y + Math.floor((total - 1) / cols);
    const col = ((total - 1) % cols) + 1;
    term.write(CSI + String(row + 1) + ';' + String(col) + 'H');
  };

  // Redesenha a linha da âncora até o fim da tela (preserva o prompt).
  const redraw = () => {
    if (state.start === null) return;
    const cols = term.cols || 80;
    const off = state.start.x - 1;
    const row = state.start.y + Math.floor(off / cols);
    const col = (off % cols) + 1;
    term.write(CSI + String(row + 1) + ';' + String(col) + 'H' + CSI + 'J');
    term.write(state.line.slice(0, state.cursor) + state.line.slice(state.cursor));
    placeCursor();
  };

  // Submete a linha: histórico + limpeza + envio "linha\r" em UMA escrita.
  const submit = (line: string) => {
    const trimmed = line.trim();
    if (trimmed !== '') {
      const hist = state.history;
      if (hist.length === 0 || hist[hist.length - 1] !== line) {
        hist.push(line);
        if (hist.length > 200) hist.shift();
      }
    }
    state.histIdx = -1;
    state.draft = '';
    state.line = '';
    state.cursor = 0;
    state.start = null;
    term.write(CR + LF);
    const low = trimmed.toLowerCase();
    if (low === 'clear' || low === 'cls') {
      // cls no child limpa o console OCULTO (nada chega na pipe): limpamos
      // a visualização local — o novo prompt do child reconstrói a tela.
      term.clear();
    }
    if (line.length > 0) {
      clearSuppress();
      state.suppress = {
        expected: line,
        timer: window.setTimeout(clearSuppress, 5000),
      };
    }
    getSend()(line + CR);
  };

  const filterEcho = (data: string): string => {
    if (state.suppress === null) return data;
    const exp = state.suppress.expected;
    let i = 0;
    while (i < data.length && i < exp.length && data[i] === exp[i]) i++;
    if (i === 0) {
      // o eco não bateu com o esperado — desiste (mostra como vier)
      clearSuppress();
      return data;
    }
    const rest = data.slice(i);
    if (i >= exp.length) {
      clearSuppress();
    } else {
      state.suppress = { expected: exp.slice(i), timer: 0 };
    }
    return rest;
  };

  const handleKey = (data: string): boolean => {
    // Colar com múltiplas linhas: submete as linhas completas, buffer o resto.
    if (data.length > 1 && (data.includes(CR) || data.includes(LF))) {
      const normalized = data.split(CR + LF).join(CR).split(LF).join(CR);
      const parts = normalized.split(CR);
      for (let i = 0; i < parts.length - 1; i++) {
        submit(state.line + parts[i]);
      }
      state.line = parts[parts.length - 1];
      state.cursor = state.line.length;
      if (state.line.length > 0) {
        anchorLine();
        redraw();
      }
      return true;
    }
    // Colar texto multi-char (sem newline): insere como bloco.
    if (data.length > 1 && !data.startsWith(ESC)) {
      anchorLine();
      state.line = state.line.slice(0, state.cursor) + data + state.line.slice(state.cursor);
      state.cursor += data.length;
      redraw();
      return true;
    }
    switch (data) {
      case CR: {
        anchorLine();
        submit(state.line);
        return true;
      }
      case DEL:
      case BS: {
        if (state.cursor === 0) return true;
        anchorLine();
        if (state.cursor === state.line.length) {
          // fast path: apaga o último char visível
          state.line = state.line.slice(0, -1);
          state.cursor--;
          term.write(BS + ' ' + BS);
        } else {
          state.line = state.line.slice(0, state.cursor - 1) + state.line.slice(state.cursor);
          state.cursor--;
          redraw();
        }
        return true;
      }
      case KEY_DELETE: {
        if (state.cursor < state.line.length) {
          anchorLine();
          state.line = state.line.slice(0, state.cursor) + state.line.slice(state.cursor + 1);
          redraw();
        }
        return true;
      }
      case KEY_LEFT: {
        if (state.cursor > 0) { state.cursor--; placeCursor(); }
        return true;
      }
      case KEY_RIGHT: {
        if (state.cursor < state.line.length) { state.cursor++; placeCursor(); }
        return true;
      }
      case KEY_HOME:
      case KEY_HOME_ALT:
      case String.fromCharCode(1): { // Ctrl+A
        state.cursor = 0;
        placeCursor();
        return true;
      }
      case KEY_END:
      case KEY_END_ALT:
      case String.fromCharCode(5): { // Ctrl+E
        state.cursor = state.line.length;
        placeCursor();
        return true;
      }
      case KEY_UP:
      case KEY_DOWN: {
        const hist = state.history;
        if (hist.length === 0) return true;
        if (data === KEY_UP) {
          if (state.histIdx === -1) {
            state.draft = state.line;
            state.histIdx = hist.length - 1;
          } else if (state.histIdx > 0) {
            state.histIdx--;
          }
          state.line = hist[state.histIdx];
        } else {
          if (state.histIdx === -1) return true;
          if (state.histIdx >= hist.length - 1) {
            state.histIdx = -1;
            state.line = state.draft;
          } else {
            state.histIdx++;
            state.line = hist[state.histIdx];
          }
        }
        anchorLine();
        state.cursor = state.line.length;
        redraw();
        return true;
      }
      case TAB:
        return true; // sem completação no legacy (pipe não suporta)
      case String.fromCharCode(12): { // Ctrl+L
        term.clear();
        anchorLine();
        redraw();
        return true;
      }
      case String.fromCharCode(21): { // Ctrl+U — limpa a linha
        anchorLine();
        state.line = '';
        state.cursor = 0;
        redraw();
        return true;
      }
      case String.fromCharCode(3): { // Ctrl+C — não interrompe (pipe); limpa a linha
        anchorLine();
        state.line = '';
        state.cursor = 0;
        state.histIdx = -1;
        redraw();
        return true;
      }
      default:
        break;
    }
    // Caracteres imprimíveis (1 ou mais).
    if (data >= ' ' && !data.startsWith(ESC)) {
      anchorLine();
      if (state.cursor === state.line.length) {
        // fast path: append no fim (sem redraw)
        state.line += data;
        state.cursor += data.length;
        term.write(data);
      } else {
        state.line = state.line.slice(0, state.cursor) + data + state.line.slice(state.cursor);
        state.cursor += data.length;
        redraw();
      }
      return true;
    }
    return false; // tecla desconhecida → repassa (comportamento antigo)
  };

  return {
    handleKey,
    filterEcho,
    onResize: () => { state.start = null; },
  };
}

const TERM_THEME_DARK = {
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

const TERM_THEME_LIGHT = {
  background: '#ffffff',
  foreground: '#0f172a',
  cursor: '#2563eb',
  cursorAccent: '#ffffff',
  selectionBackground: '#bfdbfe',
  black: '#1e293b',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#e2e8f0',
  brightBlack: '#475569',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
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
  // Backend em uso no agente ('conpty' | 'legacy' | 'none'). Inicia como null
  // ("ainda não sabemos") — as conversões de input do modo legacy NUNCA devem
  // ser aplicadas antes do term.ready reportar, para não corromper o fluxo
  // normal do ConPTY (onde `\x7f` é o backspace correto).
  const backendRef = useRef<string | null>(null);
  // Editor de linha local do modo legacy (histórico/setas/clear — ver createLegacyEditor).
  const legacyEditorRef = useRef<LegacyEditor | null>(null);
  // sendData mais recente (o editor envia a linha submetida pelo caminho atual).
  const sendDataRef = useRef<(data: string) => void>(() => {});
  // Backend já anunciado no banner: o agent REPUBLICA o term.ready no 1º
  // term.in e em CADA resize (handshake/reconexão) — sem dedup, o banner
  // aparecia duplicado (bug visto em 20/09: resize do fit → ready → banner 2×).
  const backendAnnouncedRef = useRef<string | null>(null);
  const { mode } = useTheme();

  // Initialize xterm.js (uma única instância)
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
      theme: mode === 'dark' ? TERM_THEME_DARK : TERM_THEME_LIGHT,
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
    lastFittedCols = term.cols;
    lastFittedRows = term.rows;

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    legacyEditorRef.current = createLegacyEditor(term, () => sendDataRef.current);

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

  // Atualiza o tema do terminal ao alternar claro/escuro SEM recriar a
  // instância (preserva o buffer/histórico da sessão ativa).
  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.options.theme = mode === 'dark' ? TERM_THEME_DARK : TERM_THEME_LIGHT;
  }, [mode]);

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
      try {
        fitAddonRef.current?.fit();
        const t2 = termRef.current;
        if (t2) { lastFittedCols = t2.cols; lastFittedRows = t2.rows; }
      } catch { /* ignore */ }
    }, 50);
    return () => clearTimeout(t);
  }, [isConnected]);

  // term.ready — reporta shells disponíveis ao pai
  useEffect(() => {
    const unsubscribe = onReady((info: TermReadyPayload) => {
      if (Array.isArray(info.shells) && info.shells.length > 0) {
        onShells?.(info.shells);
      }
      // NÃO forçar resize para as dims do agent (120×40 default do payload):
      // sobrescrevia o fit real do container e o terminal ficava desalinhado
      // até o usuário redimensionar a janela. Fazemos fit LOCAL abaixo e o
      // onResize envia as dimensões reais ao agent (que redimensiona o ConPTY).
      // Backend legacy (ConPTY indisponível/instável): informa o usuário com
      // um aviso discreto. NOTA: NÃO ativamos convertEol/windowsMode aqui —
      // o console real (cmd/powershell via pipe) já emite \r\n; convertEol
      // adicionaria um \r extra e causaria linha em branco duplicada.
      // O que corrige a formatação é o resize real + ANSI que agora são
      // aplicados no lado do agente.
      if (info.backend) {
        backendRef.current = info.backend;
        // Banner APENAS na primeira vez que este backend é anunciado — o
        // agent republica o term.ready no 1º term.in e em cada resize;
        // sem dedup o banner aparecia duplicado (bug 20/09).
        if (
          (info.backend === 'legacy' || info.backend === 'none') &&
          backendAnnouncedRef.current !== info.backend
        ) {
          backendAnnouncedRef.current = info.backend;
          const t = termRef.current;
          // Modo legacy = stdin em PIPE (sem ConPTY): VT não é processado no
          // child. O editor local (createLegacyEditor) cobre edição/histórico.
          t?.writeln(ESC + '[1;33m── Modo compatibilidade (ConPTY indisponível neste agente) ──' + ESC + '[0m');
          t?.writeln(ESC + '[33m   Edição local ativa: ↑/↓ histórico, Backspace/Home/End/Delete, clear/cls, Ctrl+L' + ESC + '[0m');
          t?.writeln(ESC + '[33m   TAB e Ctrl+C (interromper) não funcionam — causa comum: AV/EDR encerra o ConPTY (0xC0000142)' + ESC + '[0m');
        }
      }
    });
    return unsubscribe;
  }, [onReady, onShells]);

  useEffect(() => {
    const unsubscribe = onOutput((data: string) => {
      // No legacy, o eco do child sobre a última linha enviada é removido
      // (o editor já mostrou a linha localmente) — evita texto duplicado.
      const editor = legacyEditorRef.current;
      const filtered = editor ? editor.filterEcho(data) : data;
      if (filtered) termRef.current?.write(filtered);
    });
    return unsubscribe;
  }, [onOutput]);

  useEffect(() => {
    sendDataRef.current = sendData;
  }, [sendData]);

  useEffect(() => {
    if (!termRef.current) return;
    const dispose = termRef.current.onData((data) => {
      // Modo legacy (stdin em PIPE): edição de linha LOCAL via editor — o
      // child em pipe não processa VT (setas/histórico/impossíveis) e ainda
      // ecoa o input. O editor segura a linha no front e só envia no Enter.
      // Ativa SOMENTE depois do term.ready (backend legacy/none) para não
      // interferir no fluxo normal do ConPTY.
      const backend = backendRef.current;
      if (backend !== null && (backend === 'legacy' || backend === 'none')) {
        const editor = legacyEditorRef.current;
        if (editor && editor.handleKey(data)) return;
      }
      sendData(data);
    });
    return () => dispose.dispose();
  }, [sendData]);

  useEffect(() => {
    if (!termRef.current) return;
    const dispose = termRef.current.onResize(({ cols, rows }) => {
      legacyEditorRef.current?.onResize();
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
    <div className="flex flex-col h-full bg-background">
      {/* xterm.js container */}
      <div ref={containerRef} className="flex-1" style={{ minHeight: 0 }} />
    </div>
  );
}
