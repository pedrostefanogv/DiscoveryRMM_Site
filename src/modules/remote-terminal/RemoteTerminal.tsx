import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import {
  useTerminalStream,
  type TerminalErrorInfo,
  type TerminalStatsInfo,
} from './useTerminalStream';
import CompletionPopup from './CompletionPopup';
import {
  COMPLETION_PAGE_SIZE,
  applyCompletion,
  completionKeystrokes,
  detectPrompt,
  promptRequiresMask,
  type CompletionRequest,
  type CompletionResponse,
  type PromptKind,
} from './terminalInput';
import { useTheme } from '@/theme/ThemeContext';
import '@xterm/xterm/css/xterm.css';

// Controles/teclas construídos em runtime (estáveis contra escapes no fonte).
const ESC = String.fromCharCode(27);
const CSI = ESC + '[';
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const CTRL_SPACE = String.fromCharCode(0); // Ctrl+Espaço no xterm
const SHIFT_TAB = CSI + 'Z';
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
  /**
   * Renova as credenciais NATS antes de um reconnect AUTOMÁTICO. Sem isto o
   * hook reusa o JWT da abertura e o WebSocket cai em -ERR authorization.
   */
  getFreshCredentials?: () => Promise<string>;
  /**
   * Reconexão imperativa no MESMO componente (a página incrementa a cada
   * "Reconectar"): preserva o scrollback do xterm e o lastSeq do replay.
   */
  reconnectToken?: number;
  /**
   * A aba do terminal está visível. O viewer fica MONTADO mesmo quando outra
   * aba está ativa (apenas oculto) para a sessão e o buffer sobreviverem à
   * troca de aba; ao voltar, refaz o fit e repinta o canvas.
   */
  isVisible?: boolean;
}

// TermReadyInfo compatível com o hook (avoid import cycle). Os campos v3 são
// OPCIONAIS: agentes antigos não os enviam e o viewer mantém o comportamento
// anterior (feature-detect por capabilitiesVersion/campos ausentes).
interface TermReadyPayload {
  shells?: string[];
  consoleId?: string;
  termCols?: number;
  termRows?: number;
  /** Backend em uso no agente (conpty/legacy) para ajustes visuais. */
  backend?: string;
  shellPath?: string;
  capabilitiesVersion?: number;
  shellKind?: string;
  supportsVt?: boolean;
  supportsResize?: boolean;
  supportsCompletionQuery?: boolean;
  encoding?: string;
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

export interface LegacyEditor {
  /** Trata a tecla; true = consumida localmente (não vai ao shell). */
  handleKey(data: string): boolean;
  /** Remove o eco do child da saída (retorna o restante). */
  filterEcho(data: string): string;
  /** Invalida a âncora da linha (resize reflowa o buffer do xterm). */
  onResize(): void;
  /**
   * Entra/sai do MODO PROMPT: cada tecla vai imediatamente ao shell (sem
   * esperar Enter). Em senha o display é mascarado com '*' e a linha NUNCA é
   * gravada no histórico local.
   */
  setPromptMode(kind: PromptKind | null): void;
  isPromptMode(): boolean;
  getLine(): string;
  getCursor(): number;
  /** Aplica uma completion ao buffer local e redesenha. */
  setLine(line: string, cursor: number): void;
}

export function createLegacyEditor(term: Terminal, getSend: () => (data: string) => void): LegacyEditor {
  const state = {
    line: '',
    cursor: 0,
    history: [] as string[],
    histIdx: -1,
    draft: '',
    start: null as LegacyLineStart | null,
    suppress: null as { expected: string; timer: number } | null,
    // Modo prompt (T2): kind != null => envio imediato por tecla.
    prompt: null as PromptKind | null,
    promptBuffer: '',
    // Caracteres de senha digitados aguardando supressão do eco do child.
    secretEcho: '',
  };

  const clearPrompt = () => {
    state.prompt = null;
    state.promptBuffer = '';
    state.secretEcho = '';
    state.start = null;
    state.histIdx = -1;
    state.draft = '';
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
    // Segredo: suprime o eco dos caracteres digitados (o '*' já foi desenhado).
    if (state.secretEcho.length > 0 && data.length > 0) {
      let i = 0;
      while (i < data.length && i < state.secretEcho.length && data[i] === state.secretEcho[i]) i++;
      if (i > 0) {
        state.secretEcho = state.secretEcho.slice(i);
        data = data.slice(i);
      }
    }
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

  // MODO PROMPT (T2): cada tecla vai imediatamente ao shell — sem bufferizar
  // até o Enter. Senha é mascarada e NUNCA entra no histórico local.
  const handlePromptKey = (data: string): boolean => {
    const kind = state.prompt;
    if (kind === null) return false;
    const secret = promptRequiresMask(kind);
    // Colar com múltiplas linhas: envia o bloco e encerra o prompt.
    if (data.length > 1 && (data.includes(CR) || data.includes(LF))) {
      const normalized = data.split(CR + LF).join(CR).split(LF).join(CR);
      const parts = normalized.split(CR);
      for (let i = 0; i < parts.length; i++) {
        if (secret && parts[i].length > 0) term.write('*'.repeat(parts[i].length));
        getSend()(parts[i] + CR);
      }
      clearPrompt();
      term.write(CR + LF);
      return true;
    }
    if (data === CR || data === LF) {
      const line = state.promptBuffer;
      // Histórico só para prompt NÃO-secreto; a senha jamais é gravada.
      if (!secret) {
        const trimmed = line.trim();
        if (trimmed !== '') {
          const hist = state.history;
          if (hist.length === 0 || hist[hist.length - 1] !== line) {
            hist.push(line);
            if (hist.length > 200) hist.shift();
          }
        }
      }
      clearPrompt();
      term.write(CR + LF);
      // As teclas já foram enviadas individualmente; aqui só o Enter.
      getSend()(CR);
      return true;
    }
    if (data === DEL || data === BS) {
      if (state.promptBuffer.length > 0) {
        state.promptBuffer = state.promptBuffer.slice(0, -1);
        if (secret) term.write(BS + ' ' + BS);
      }
      getSend()(BS);
      return true;
    }
    if (data >= ' ' && !data.startsWith(ESC)) {
      state.promptBuffer += data;
      if (secret) {
        state.secretEcho += data;
        term.write('*'.repeat([...data].length));
      }
      // Envio IMEDIATO. Em prompt não-secreto o child ecoa; não desenhamos
      // localmente para não duplicar.
      getSend()(data);
      return true;
    }
    // Outras teclas de controle: repassa direto ao shell.
    getSend()(data);
    return true;
  };

  const handleKey = (data: string): boolean => {
    if (state.prompt !== null) return handlePromptKey(data);
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
    setPromptMode: (kind: PromptKind | null) => {
      state.prompt = kind;
      state.promptBuffer = '';
      state.secretEcho = '';
      state.start = null;
      state.histIdx = -1;
    },
    isPromptMode: () => state.prompt !== null,
    getLine: () => state.line,
    getCursor: () => state.cursor,
    setLine: (line: string, cursor: number) => {
      anchorLine();
      state.line = line;
      state.cursor = Math.max(0, Math.min(line.length, cursor));
      redraw();
    },
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

// Formata a telemetria do agent para o painel discreto de métricas.
function formatCount(value: number | undefined): string {
  return Number.isFinite(value) ? String(value) : '—';
}

function formatUptime(ms: number | undefined): string {
  if (!Number.isFinite(ms) || (ms as number) <= 0) return '—';
  const total = Math.floor((ms as number) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h${m}m` : m > 0 ? `${m}m${s}s` : `${s}s`;
}

// Console único — um terminal por sessão de suporte remoto.
export default function RemoteTerminal({
  sessionId,
  agentId,
  natsSubject = '',
  natsUrl = '',
  jwt = '',
  nkeySeed = '',
  onConnectionChange,
  onShells,
  getFreshCredentials,
  reconnectToken,
  isVisible = true,
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
  // ── Contrato v3 (feature-detect) ─────────────────────────────────────────
  // Só habilita completions se o agent declarou supportsCompletionQuery.
  const supportsCompletionRef = useRef(false);
  const shellKindRef = useRef<string | null>(null);
  // Rolling tail da saída (sem ANSI) para detectar prompt pendente.
  const outputTailRef = useRef('');
  // Modo prompt atual (T2). Fica em ref para o handler de teclado não precisar
  // ser re-registrado a cada mudança.
  const promptKindRef = useRef<PromptKind | null>(null);
  // Completion aberta: resposta, índice e reqId para descartar respostas velhas.
  const completionResRef = useRef<CompletionResponse | null>(null);
  const completionIndexRef = useRef(0);
  const completionReqIdRef = useRef<string | null>(null);
  // true quando a requisicao e um ciclo de Tab/Shift+Tab (1 match) e nao uma
  // lista paginada (Ctrl+Espaco); muda o tratamento da resposta.
  const completionAutoApplyRef = useRef(false);
  // (input,cursor) do momento do pedido: se a linha mudar antes da resposta,
  // a completion é descartada (aplicar índices antigos corromperia a linha).
  const completionReqLineRef = useRef<{ input: string; cursor: number } | null>(null);
  const reqCounterRef = useRef(0);
  const { mode } = useTheme();

  // Wire NATS stream — console único (subjects fixos term.out / term.in)
  const {
    isConnected,
    sendData,
    sendResize,
    sendCompletionRequest,
    onOutput,
    onExit,
    onReady,
    onError,
    onReset,
    onStats,
    onCompletion,
    error,
  } = useTerminalStream({
    natsSubject,
    natsUrl,
    jwt,
    nkeySeed,
    getFreshCredentials,
    reconnectToken,
  });

  // Último erro reportado pelo agente/hook, exibido como banner persistente.
  const [terminalError, setTerminalError] = useState<TerminalErrorInfo | null>(null);
  // T5: diagnóstico (shellKind/backend) e gate de completions.
  const [supportsCompletion, setSupportsCompletion] = useState(false);
  const [shellInfo, setShellInfo] = useState<{ backend: string | null; shellKind: string | null }>({
    backend: null,
    shellKind: null,
  });
  // T2: sinal visual do modo prompt (não polui a UI por padrão: só quando ativo).
  const [promptKind, setPromptKind] = useState<PromptKind | null>(null);
  // T4: telemetria do agent. Painel fechado por padrão.
  const [stats, setStats] = useState<TerminalStatsInfo | null>(null);
  const [showStats, setShowStats] = useState(false);
  // T1: popup de completions.
  const [completion, setCompletion] = useState<CompletionResponse | null>(null);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [completionStyle, setCompletionStyle] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  // ── T1/T2: helpers de completions e modo prompt (ConPTY) ────────────────

  // Linha/cursor atuais: no legacy usa o buffer local do editor; no ConPTY lê
  // a linha do buffer do xterm (o shell edita o buffer remoto).
  const getCompletionInput = useCallback((): { input: string; cursor: number } => {
    const backend = backendRef.current;
    if (backend === 'legacy' || backend === 'none') {
      const editor = legacyEditorRef.current;
      if (editor) return { input: editor.getLine(), cursor: editor.getCursor() };
    }
    const term = termRef.current;
    if (!term) return { input: '', cursor: 0 };
    const buffer = term.buffer.active;
    const line = buffer.getLine(buffer.cursorY);
    const text = line ? line.translateToString(true) : '';
    return { input: text, cursor: buffer.cursorX };
  }, []);

  // Posição do popup acima da linha do cursor (célula = container / cols).
  const computeCompletionStyle = useCallback(() => {
    const term = termRef.current;
    const host = containerRef.current;
    if (!term || !host) return;
    const rect = host.getBoundingClientRect();
    const cols = term.cols > 0 ? term.cols : 80;
    const rows = term.rows > 0 ? term.rows : 24;
    const cellW = rect.width / cols;
    const cellH = rect.height / rows;
    const cursorX = term.buffer.active.cursorX;
    const cursorY = term.buffer.active.cursorY;
    setCompletionStyle({
      left: Math.max(4, rect.left + cursorX * cellW),
      top: Math.max(4, rect.top + cursorY * cellH - 176),
    });
  }, []);

  const closeCompletion = useCallback(() => {
    completionResRef.current = null;
    completionReqIdRef.current = null;
    completionAutoApplyRef.current = false;
    completionReqLineRef.current = null;
    setCompletion(null);
    setCompletionIndex(0);
  }, []);

  const requestCompletion = useCallback((forward: boolean | null, page = 0) => {
    if (!supportsCompletionRef.current) return;
    const { input, cursor } = getCompletionInput();
    completionReqLineRef.current = { input, cursor };
    reqCounterRef.current += 1;
    const reqId = `${Date.now().toString(36)}-${reqCounterRef.current}`;
    completionReqIdRef.current = reqId;
    completionAutoApplyRef.current = forward !== null;
    const req: CompletionRequest = {
      reqId,
      input,
      cursor,
      forward,
      page,
      pageSize: COMPLETION_PAGE_SIZE,
    };
    sendCompletionRequest(req);
  }, [getCompletionInput, sendCompletionRequest]);

  const applyCompletionMatch = useCallback((index: number) => {
    const res = completionResRef.current;
    if (!res) return;
    const { input, cursor } = getCompletionInput();
    // Resposta calculada para outro momento da linha: descarta (não corrompe).
    const asked = completionReqLineRef.current;
    if (asked && (asked.input !== input || asked.cursor !== cursor)) {
      closeCompletion();
      return;
    }
    const result = applyCompletion(input, cursor, res, index);
    if (!result.match) return;
    const backend = backendRef.current;
    if (backend === 'legacy' || backend === 'none') {
      // Buffer local do editor: substitui [replacementIndex, +length).
      legacyEditorRef.current?.setLine(result.line, result.cursor);
    } else {
      // ConPTY: o shell edita o buffer remoto; envia os keystrokes.
      const keystrokes = completionKeystrokes(cursor, res, index);
      if (keystrokes) sendData(keystrokes);
    }
    closeCompletion();
  }, [closeCompletion, getCompletionInput, sendData]);

  const moveCompletionSelection = useCallback((delta: number) => {
    const res = completionResRef.current;
    if (!res) return;
    const matches = Array.isArray(res.matches) ? res.matches : [];
    if (matches.length === 0) return;
    const next = completionIndexRef.current + delta;
    if (next < 0) {
      completionIndexRef.current = matches.length - 1;
      setCompletionIndex(matches.length - 1);
    } else if (next >= matches.length) {
      if (res.hasMore) {
        completionIndexRef.current = 0;
        setCompletionIndex(0);
        requestCompletion(null, (res.page ?? 0) + 1);
        return;
      }
      completionIndexRef.current = 0;
      setCompletionIndex(0);
    } else {
      completionIndexRef.current = next;
      setCompletionIndex(next);
    }
  }, [requestCompletion]);

  // ConPTY: modo prompt com envio IMEDIATO; senha mascarada no display.
  const handleConptyPromptKey = useCallback((data: string): boolean => {
    const kind = promptKindRef.current;
    if (kind === null) return false;
    const secret = promptRequiresMask(kind);
    if (data === CR || data === LF) {
      promptKindRef.current = null;
      setPromptKind(null);
      // NAO escreve CR+LF local: no ConPTY o proprio shell emite o newline —
      // escrever aqui gerava uma linha em branco extra.
      sendData(CR);
      return true;
    }
    if (data === DEL || data === BS) {
      if (secret) termRef.current?.write(BS + ' ' + BS);
      sendData(BS);
      return true;
    }
    if (data >= ' ' && !data.startsWith(ESC)) {
      if (secret) termRef.current?.write('*'.repeat([...data].length));
      sendData(data);
      return true;
    }
    sendData(data);
    return true;
  }, [sendData]);

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
      // Ctrl+Shift+C copia a seleção (o ClipboardAddon cobre o paste; sem isto
      // não havia atalho de cópia — Ctrl+C precisa continuar indo ao shell como
      // SIGINT).
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        const selection = term.getSelection();
        if (selection) {
          void navigator.clipboard?.writeText(selection).catch(() => {});
          return false;
        }
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


  // Re-aplica o fit quando a conexão abre (garante resize correto para o agent).
  useEffect(() => {
    if (!isConnected) return;
    // Pequeno delay para o layout estabilizar
    const t = setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
        const t2 = termRef.current;
        // Container oculto (aba inativa) mede 0x0 — não guardar como "último
        // fit" e não enviar resize inválido ao agente.
        if (t2 && t2.cols > 0 && t2.rows > 0) {
          lastFittedCols = t2.cols; lastFittedRows = t2.rows;
          // Envia as dimensões reais MESMO sem onResize: quando o fit não muda
          // o tamanho o evento não dispara e o console ficaria no default do
          // agente (120x40) até o usuário redimensionar a janela.
          sendResize(t2.cols, t2.rows);
        }
      } catch { /* ignore */ }
    }, 50);
    return () => clearTimeout(t);
  }, [isConnected, sendResize]);

  // term.ready — reporta shells disponíveis ao pai
  useEffect(() => {
    const unsubscribe = onReady((info: TermReadyPayload) => {
      // Console pronto = sessão saudável: limpa o erro anterior. NÃO limpamos
      // no isConnected: um erro recebido no MESMO lote do +OK (start falhou +
      // hello) seria apagado pelo efeito que roda logo depois.
      setTerminalError(null);
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
        // Só marca o backend para o editor de linha do modo legacy. O aviso ao
        // usuário vem do AGENTE, no próprio stream (NewLegacyShell): antes o
        // viewer escrevia um SEGUNDO banner, duplicando a mensagem — e ele
        // atribuía o 0xC0000142 ao AV/EDR, diagnóstico que se provou INCORRETO
        // (era o STARTF_USESTDHANDLES ausente no spawn do ConPTY).
        backendRef.current = info.backend;
      }
      // T5: capacidades do contrato v3 (feature-detect). Agente antigo não manda
      // supportsCompletionQuery -> completions ficam desabilitadas e Tab segue
      // indo ao shell (comportamento atual).
      supportsCompletionRef.current = info.supportsCompletionQuery === true;
      setSupportsCompletion(info.supportsCompletionQuery === true);
      shellKindRef.current = typeof info.shellKind === 'string' ? info.shellKind : null;
      setShellInfo({
        backend: info.backend ?? backendRef.current,
        shellKind: typeof info.shellKind === 'string' ? info.shellKind : null,
      });
    });
    return unsubscribe;
  }, [onReady, onShells]);

  useEffect(() => {
    const unsubscribe = onOutput((data: string) => {
      // T2: saída com quebra de linha encerra um prompt pendente (o usuário
      // submeteu ou o shell avançou para nova saída).
      if (promptKindRef.current !== null && /[\r\n]/.test(data)) {
        promptKindRef.current = null;
        setPromptKind(null);
        legacyEditorRef.current?.setPromptMode(null);
      }
      // Heurística conservadora sobre uma janela curta do fim da saída.
      outputTailRef.current = (outputTailRef.current + data).slice(-2048);
      const kind = detectPrompt(outputTailRef.current);
      if (kind !== null) {
        promptKindRef.current = kind;
        setPromptKind(kind);
        legacyEditorRef.current?.setPromptMode(kind);
      }
      // No legacy, o eco do child sobre a última linha enviada é removido
      // (o editor já mostrou a linha localmente) — evita texto duplicado.
      const editor = legacyEditorRef.current;
      const filtered = editor ? editor.filterEcho(data) : data;
      if (filtered) termRef.current?.write(filtered);
    });
    return unsubscribe;
  }, [onOutput]);

  // T4: telemetria 'stats' (agent->viewer). Best-effort: não altera a UI por
  // padrão — só alimenta o painel quando o usuário o abre.
  useEffect(() => {
    const unsubscribe = onStats((info: TerminalStatsInfo) => setStats(info));
    return unsubscribe;
  }, [onStats]);

  // T1: respostas 'completion.res' roteadas por reqId (respostas velhas são
  // descartadas para não reabrir um popup já fechado).
  useEffect(() => {
    const unsubscribe = onCompletion((res: CompletionResponse) => {
      if (res.reqId !== completionReqIdRef.current) return;
      if (!res.ok) {
        closeCompletion();
        return;
      }
      // Ciclo de Tab/Shift+Tab: a resposta traz 1 match (pageSize 1) e deve ser
      // APLICADA imediatamente. Abrir popup aqui impedia o ciclo — o proximo
      // Tab apenas confirmava o match em vez de pedir o proximo.
      const isCycle =
        completionAutoApplyRef.current &&
        res.pageSize === 1 &&
        Array.isArray(res.matches) &&
        res.matches.length === 1;
      completionResRef.current = res;
      completionIndexRef.current = 0;
      if (isCycle) {
        applyCompletionMatch(0);
        return;
      }
      setCompletion(res);
      setCompletionIndex(0);
      computeCompletionStyle();
    });
    return unsubscribe;
  }, [onCompletion, closeCompletion, computeCompletionStyle, applyCompletionMatch]);

  useEffect(() => {
    sendDataRef.current = sendData;
  }, [sendData]);

  useEffect(() => {
    if (!termRef.current) return;
    const dispose = termRef.current.onData((data) => {
      // 1) Popup de completions aberto: teclado navega/aplica/fecha. A tecla
      //    Tab NUNCA é repassada ao shell enquanto o popup trata a completions.
      if (completionResRef.current !== null) {
        if (data === KEY_DOWN || data === String.fromCharCode(14)) { // Ctrl+N
          moveCompletionSelection(1);
          return;
        }
        if (data === KEY_UP || data === SHIFT_TAB || data === String.fromCharCode(16)) { // Ctrl+P
          moveCompletionSelection(-1);
          return;
        }
        if (data === TAB || data === CR || data === LF) {
          applyCompletionMatch(completionIndexRef.current);
          return;
        }
        if (data === ESC) {
          closeCompletion();
          return;
        }
      }
      // 2) Atalhos de completions do contrato v3 (feature-detect). Em modo
      //    prompt a tecla vai CRUA para o shell (senha/pager/confirmacao).
      if (supportsCompletionRef.current && promptKindRef.current === null) {
        if (data === CTRL_SPACE) {
          requestCompletion(null, 0);
          return;
        }
        if (data === TAB) {
          requestCompletion(true, 0);
          return;
        }
        if (data === SHIFT_TAB) {
          requestCompletion(false, 0);
          return;
        }
      }
      // 3) Modo prompt no ConPTY: envio imediato + mascaramento de senha.
      const isLegacy = backendRef.current === 'legacy' || backendRef.current === 'none';
      if (!isLegacy && promptKindRef.current !== null && handleConptyPromptKey(data)) return;
      // 4) Modo legacy (stdin em PIPE): edição de linha LOCAL via editor — o
      // child em pipe não processa VT (setas/histórico) e ainda ecoa o input.
      // O editor segura a linha no front e só envia no Enter. Ativa SOMENTE
      // depois do term.ready (backend legacy/none) para não interferir no
      // fluxo normal do ConPTY.
      if (isLegacy) {
        const editor = legacyEditorRef.current;
        if (editor && editor.handleKey(data)) return;
      }
      sendData(data);
    });
    return () => dispose.dispose();
  }, [sendData, requestCompletion, moveCompletionSelection, applyCompletionMatch, closeCompletion, handleConptyPromptKey]);

  // Voltou a ficar visível (troca de aba): o container saiu de 0x0, então
  // refaz o fit, repinta o canvas e reenvia as dimensões reais ao agent.
  useEffect(() => {
    if (!isVisible) return;
    const t = window.setTimeout(() => {
      try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
      const term = termRef.current;
      if (term && term.rows > 0) {
        try { term.refresh(0, term.rows - 1); } catch { /* ignore */ }
        lastFittedCols = term.cols; lastFittedRows = term.rows;
        sendResize(term.cols, term.rows);
      }
    }, 30);
    return () => window.clearTimeout(t);
  }, [isVisible, sendResize]);

  // Debounce de 200 ms (mesmo padrão do MeshCentral): o ResizeObserver dispara
  // em rajada durante o arraste da janela e cada evento viraria um
  // ResizePseudoConsole + uma república de ready.
  const resizeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!termRef.current) return;
    const dispose = termRef.current.onResize(({ cols, rows }) => {
      legacyEditorRef.current?.onResize();
      if (resizeTimerRef.current !== null) window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null;
        sendResize(cols, rows);
      }, 200);
    });
    return () => {
      dispose.dispose();
      if (resizeTimerRef.current !== null) window.clearTimeout(resizeTimerRef.current);
    };
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

  // Erros de terminal/sessão reportados pelo agente (.term.out error / .event).
  // Sem isto a falha ao iniciar o console era invisível: terminal vazio, sem
  // mensagem, e o operador sem saber o que aconteceu.
  useEffect(() => {
    const unsubscribe = onError((info: TerminalErrorInfo) => {
      setTerminalError(info);
      termRef.current?.writeln(`\r\n\x1b[1;31m── Erro no terminal (${info.code}): ${info.reason} ──\x1b[0m\r\n`);
    });
    return unsubscribe;
  }, [onError]);

  // O anel de replay do agente não cobriu a lacuna: limpa o buffer para não
  // emendar saída nova em saída velha.
  useEffect(() => {
    const unsubscribe = onReset(() => {
      termRef.current?.reset();
      closeCompletion();
    });
    return unsubscribe;
  }, [onReset, closeCompletion]);

  // NÃO encerrar a sessão no unmount. Este componente é desmontado em dois
  // fluxos que precisam da sessão VIVA:
  //   1) "Reconectar" (a página troca a `key` para remontar com credencial
  //      nova) — o cleanup antigo chamava stopSession e MATAVA a sessão que o
  //      reconnect acabou de verificar como ativa;
  //   2) troca de aba (só a aba ativa é renderizada) — encerrava o terminal
  //      imediatamente em vez de deixar a política de liveness decidir.
  // O ciclo de vida é da página (stopTabSession / handleStop / handleSwitchShell
  // / resolução de conflito); as sessões sem viewer são encerradas pelo
  // watchdog de liveness do agent (MissedPingsBeforeClose).
  const bannerMessage = terminalError
    ? `Terminal: ${terminalError.reason} (${terminalError.code})`
    : error
      ? `Conexão NATS: ${error}`
      : null;

  return (
    // data-* com a identidade da sessão: o encerramento deixou de ser
    // responsabilidade deste componente, mas os atributos mantêm a sessão
    // rastreável no DOM (E2E/diagnóstico) sem prop morta.
    <div
      className="flex flex-col h-full bg-background"
      data-session-id={sessionId}
      data-agent-id={agentId}
    >
      {bannerMessage && (
        <div
          role="alert"
          data-testid="terminal-error-banner"
          className="px-3 py-1.5 text-xs bg-danger/15 text-danger border-b border-danger/30"
        >
          {bannerMessage}
        </div>
      )}
      {/* T2: sinal visual do modo prompt (só aparece quando ativo). */}
      {promptKind !== null && (
        <div
          data-testid="terminal-prompt-indicator"
          className="px-3 py-1 text-[11px] bg-warning/15 text-warning border-b border-warning/30"
        >
          {promptRequiresMask(promptKind)
            ? '🔒 Prompt de senha — entrada mascarada (fora do histórico)'
            : '⌨ Prompt interativo — envio imediato por tecla'}
        </div>
      )}
      {/* xterm.js container */}
      <div ref={containerRef} className="flex-1" style={{ minHeight: 0 }} />

      {/* T1: popup de completions acima da linha do cursor. */}
      {completion && (
        <CompletionPopup
          matches={completion.matches}
          selectedIndex={completionIndex}
          totalCount={completion.totalCount}
          page={completion.page}
          hasMore={completion.hasMore}
          style={{ left: completionStyle.left, top: completionStyle.top }}
          onHover={(index) => {
            completionIndexRef.current = index;
            setCompletionIndex(index);
          }}
          onSelect={(index) => applyCompletionMatch(index)}
        />
      )}

      {/* T4: painel de métricas — FECHADO por padrão (não polui a UI). */}
      {showStats && (
        <div
          data-testid="terminal-stats-panel"
          className="border-t border-border bg-surface-light px-3 py-1.5 text-[11px] text-muted-foreground"
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-4">
            <span>framesOut: <b className="text-foreground">{formatCount(stats?.framesOut)}</b></span>
            <span>bytesOut: <b className="text-foreground">{formatCount(stats?.bytesOut)}</b></span>
            <span>inputRejected: <b className="text-foreground">{formatCount(stats?.inputRejected)}</b></span>
          <span>inputRateLimited: <b className="text-foreground">{formatCount(stats?.inputRateLimited)}</b></span>
          <span>resizeRateLimited: <b className="text-foreground">{formatCount(stats?.resizeRateLimited)}</b></span>
          <span>pipeDroppedBytes: <b className="text-foreground">{formatCount(stats?.pipeDroppedBytes)}</b></span>
            <span>flushHolds: <b className="text-foreground">{formatCount(stats?.flushHolds)}</b></span>
            <span>publishErrors: <b className="text-foreground">{formatCount(stats?.publishErrors)}</b></span>
            <span>replayResets: <b className="text-foreground">{formatCount(stats?.replayResets)}</b></span>
            <span>uptime: <b className="text-foreground">{formatUptime(stats?.uptimeMs)}</b></span>
            <span>avgFlushBytes: <b className="text-foreground">{formatCount(stats?.avgFlushBytes)}</b></span>
          </div>
          <div className="mt-0.5 text-[10px]">
            backend: {shellInfo.backend ?? '—'} · shellKind: {shellInfo.shellKind ?? '—'} · capabilities:{' '}
            {supportsCompletion ? 'v1' : 'ausente'}
          </div>
        </div>
      )}

      {/* Rodapé discreto: diagnóstico + métricas + completions. */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-2 py-0.5 text-[10px] text-muted-foreground">
        <span data-testid="terminal-diagnostics">
          {shellInfo.backend ?? 'backend?'}
          {shellInfo.shellKind ? ` · ${shellInfo.shellKind}` : ''}
        </span>
        <button
          type="button"
          data-testid="terminal-stats-toggle"
          aria-expanded={showStats}
          onClick={() => setShowStats((value) => !value)}
          className="rounded border border-border px-1.5 py-0.5 hover:bg-surface-hover"
        >
          Métricas
        </button>
        <button
          type="button"
          data-testid="terminal-completions-toggle"
          disabled={!supportsCompletion}
          title={
            supportsCompletion
              ? 'Listar completions (Ctrl+Espaço)'
              : 'Indisponível: agente sem supportsCompletionQuery'
          }
          onClick={() => requestCompletion(null, 0)}
          className="rounded border border-border px-1.5 py-0.5 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Completions
        </button>
      </div>
    </div>
  );
}
