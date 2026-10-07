/**
 * Lógica pura do terminal remoto: detecção de prompt (modo input bruto /
 * segredo), aplicação de completions e cálculo de keystrokes de correção.
 *
 * Fica separada do componente/hook para ser testável sem xterm/WebSocket.
 * Contrato realtime v3 (aditivo):
 *   BASE = tenant.<t>.site.<s>.agent.<a>.remote.session.<sessionId>
 *   - completion.req  (viewer->agent): CompletionRequest
 *   - completion.res  (agent->viewer): CompletionResponse
 */

export interface CompletionMatch {
    /** Texto que substitui [replacementIndex, replacementIndex+replacementLength). */
    text: string;
    listItem?: string;
    type?: string;
    tooltip?: string;
}

export interface CompletionRequest {
    reqId: string;
    input: string;
    cursor: number;
    /** null = lista paginada; true = próximo (Tab); false = anterior (Shift+Tab). */
    forward: boolean | null;
    page: number;
    pageSize: number;
}

export interface CompletionResponse {
    reqId: string;
    ok: boolean;
    error?: string;
    replacementIndex: number;
    replacementLength: number;
    matches: CompletionMatch[];
    totalCount: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}

/** Tamanho padrão da página de completions pedida ao agente. */
export const COMPLETION_PAGE_SIZE = 50;

// ── Prompt / segredo ────────────────────────────────────────────────────────

export type PromptKind = 'password' | 'confirm' | 'pager' | 'presskey' | 'generic';

// Heurísticas conservadoras (ancoradas no FIM da última linha) para não
// confundir saída comum com prompt pendente.
const PASSWORD_RE = /(?:password|senha|passphrase)\s*:?\s*$/i;
const CONFIRM_RE = /[[(]\s*[YyNn](?:\s*\/\s*[YyNn])?\s*[\])][\s:]*$/;
const PAGER_RE = /--More--/;
const PRESS_KEY_RE = /press any key/i;
// Generico: linha CURTA terminando em ':' — evita casar linhas longas de
// saida (logs/tabelas) e entrar em modo prompt sem necessidade.
const GENERIC_RE = /^[^\r\n]{1,80}:\s?$/;

// Escapes ANSI (CSI/OSC/SS2/SS3) — removidos antes de casar os padrões.
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/** Remove sequências ANSI para que a heurística veja só o texto visível. */
export function stripAnsi(input: string): string {
    return input.replace(ANSI_RE, '');
}

/** Última linha não vazia (sem ANSI) de um trecho de saída. */
export function lastPromptLine(tail: string): string {
    const clean = stripAnsi(tail);
    const parts = clean.split(/\r\n|\r|\n/);
    for (let i = parts.length - 1; i >= 0; i--) {
        const line = parts[i];
        if (line.trim() !== '') return line.slice(-512);
    }
    return '';
}

/**
 * Detecta um prompt pendente no fim da saída. Prioriza senha > confirmação >
 * paginador > "press any key" > prompt genérico terminando em ':'.
 */
export function detectPrompt(tail: string): PromptKind | null {
    const line = lastPromptLine(tail);
    if (line === '') return null;
    if (PASSWORD_RE.test(line)) return 'password';
    if (CONFIRM_RE.test(line)) return 'confirm';
    if (PAGER_RE.test(line)) return 'pager';
    if (PRESS_KEY_RE.test(line)) return 'presskey';
    // R11: rejeita linhas com espaçamento de tabela/saída (2+ espaços).
    if (GENERIC_RE.test(line) && !/\s{2,}/.test(line.trim())) return 'generic';
    return null;
}

/** Só senha exige mascaramento de exibição. */
export function promptRequiresMask(kind: PromptKind | null): boolean {
    return kind === 'password';
}

// ── Completions ─────────────────────────────────────────────────────────────

function safeMatches(res: CompletionResponse | null | undefined): CompletionMatch[] {
    return Array.isArray(res?.matches) ? res!.matches : [];
}

function safeText(res: CompletionResponse | null | undefined, matchIndex: number): string {
    const matches = safeMatches(res);
    if (matchIndex < 0 || matchIndex >= matches.length) return '';
    const text = matches[matchIndex]?.text;
    return typeof text === 'string' ? text : '';
}

/**
 * Aplica um match substituindo [replacementIndex, replacementIndex+length) na
 * linha atual. Devolve a linha/cursor resultantes e o match aplicado (null se
 * o índice não existe).
 */
export function applyCompletion(
    line: string,
    cursor: number,
    res: CompletionResponse | null | undefined,
    matchIndex: number,
): { line: string; cursor: number; match: CompletionMatch | null } {
    const matches = safeMatches(res);
    if (matchIndex < 0 || matchIndex >= matches.length) {
        return { line, cursor, match: null };
    }
    const text = safeText(res, matchIndex);
    const rawIndex = Number.isFinite(res?.replacementIndex) ? Number(res!.replacementIndex) : cursor;
    const rawLength = Number.isFinite(res?.replacementLength) ? Number(res!.replacementLength) : 0;
    const start = Math.max(0, Math.min(line.length, rawIndex));
    const end = Math.max(start, Math.min(line.length, start + Math.max(0, rawLength)));
    const before = line.slice(0, start);
    const after = line.slice(end);
    return { line: before + text + after, cursor: before.length + text.length, match: matches[matchIndex] };
}

const ESC = '\x1b';
const KEY_LEFT = ESC + '[D';
const KEY_RIGHT = ESC + '[C';
const KEY_DELETE = ESC + '[3~';

/**
 * Keystrokes equivalentes para aplicar um match no shell (caminho ConPTY):
 * posiciona o cursor no início da substituição, apaga o trecho e digita o
 * texto. O shell (readline/PSReadLine) é quem edita o buffer remoto.
 */
export function completionKeystrokes(
    cursor: number,
    res: CompletionResponse | null | undefined,
    matchIndex: number,
): string {
    const text = safeText(res, matchIndex);
    const rawIndex = Number.isFinite(res?.replacementIndex) ? Number(res!.replacementIndex) : cursor;
    const rawLength = Number.isFinite(res?.replacementLength) ? Number(res!.replacementLength) : 0;
    const start = Math.max(0, rawIndex);
    const length = Math.max(0, rawLength);
    let keys = '';
    if (cursor > start) keys += KEY_LEFT.repeat(cursor - start);
    else if (cursor < start) keys += KEY_RIGHT.repeat(start - cursor);
    keys += KEY_DELETE.repeat(length);
    keys += text;
    return keys;
}

/**
 * Keystrokes para o caminho LEGACY (pipe). No pipe não há edição remota: o
 * editor local já aplicou a substituição, então só o texto final é enviado.
 */
export function completionApplyText(res: CompletionResponse | null | undefined, matchIndex: number): string {
    return safeText(res, matchIndex);
}
