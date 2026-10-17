/**
 * Pool de conexões WebSocket NATS do console web (WP5).
 *
 * ── PROBLEMA ────────────────────────────────────────────────────────────────
 * Cada módulo remoto (terminal, tela, arquivos, processos) abria o SEU próprio
 * WebSocket falando o protocolo cru do NATS (CONNECT/SUB/PUB/MSG/PING/PONG).
 * Duas instâncias do MESMO módulo — ou dois módulos da MESMA sessão — abriam
 * conexões distintas para o mesmo servidor com as mesmas credenciais.
 *
 * ── CONTRATO ────────────────────────────────────────────────────────────────
 *   acquire(config)  -> PooledNatsSocket (refcount++). Devolve a MESMA instância
 *                       para a mesma CHAVE: url normalizada (barra final) +
 *                       identidade das credenciais (o JWT).
 *   release(socket)  -> refcount--. Em zero o socket é DESCARTADO após um
 *                       debounce (StrictMode monta→desmonta→monta em sequência
 *                       e fechar na hora derrubaria a conexão reutilizável).
 *   sub(socket, subject, handler) -> () => void
 *                       Assina um subject (um único SUB por subject, N
 *                       handlers). O handle remove só aquele handler; o UNSUB
 *                       só vai para a rede quando o último handler sai. As
 *                       assinaturas são RE-SUBscritas automaticamente após
 *                       cada reconexão.
 *   publish(socket, subject, payload) -> boolean
 *                       Publica um PAYLOAD (o framing PUB é do pool, com o
 *                       comprimento em BYTES UTF-8). Devolve false quando a
 *                       conexão não está autenticada (o chamador decide
 *                       enfileirar/descartar).
 *   onState(socket, handler) -> () => void
 *                       Fan-out de estado: { state: 'open' | 'reconnecting' |
 *                       'closed' | 'error' | 'connecting' }, com attempt /
 *                       reason / error { code, reason } / fatal.
 *   reconnect(socket)   Reconexão IMPERATIVA (botão "Reconectar"): descarta a
 *                       geração atual e abre outra sem perder assinaturas.
 *
 *   Comportamento de rede: um único WebSocket por chave; CONNECT com
 *   auth_token (mesmas opções do código anterior: lang/version/protocol/
 *   headers/verbose); PING→PONG; parser incremental com teto de buffer;
 *   reconexão com backoff exponencial + jitter DESCENDENTE (0–25%, então a
 *   primeira tentativa nunca passa da base de 1s) e renovação de credenciais
 *   (getFreshCredentials) antes de cada tentativa.
 *
 *   Erros: falha de protocolo (-ERR vira 'nats_error') é RECUPERÁVEL (conta
 *   tentativa e reconecta). Cabeçalho MSG inválido e estouro do buffer do
 *   protocolo são FATAIS para aquela conexão (encerra o socket e emite
 *   'error' + 'closed' fatal) — nunca afetam as outras chaves do pool.
 *
 * ── LIMITAÇÕES CONHECIDAS ───────────────────────────────────────────────────
 * - Credenciais são POR SESSÃO (RemoteSessionParticipant): sessões diferentes
 *   (JWT diferente) continuam exigindo conexões distintas — é intencional.
 * - A chave inclui o JWT inteiro (não um hash): identidade exata, sem risco de
 *   colisão. O token já está em memória do browser; a chave nunca é logada.
 * - O primeiro acquire define getFreshCredentials/limites de reconexão da
 *   chave; acquires seguintes reutilizam esses parâmetros.
 * - Só PUB (sem HPUB/request-reply/inbox) e sem JetStream: o console usa
 *   subjects fixos de telemetria/comando.
 * - Um único orçamento de reconexão por conexão: se ele se esgota
 *   ('closed' fatal, reason 'retries_exhausted'), os assinantes precisam de
 *   um reconnect() explícito (é o que o botão Reconectar faz).
 * - Assinaturas com wildcard funcionam (o roteamento é por SID, não por
 *   subject), mas o pool não valida a sintaxe do subject.
 */

export type NatsMessageHandler = (payload: string) => void;

export type PoolSocketState = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

export type PoolErrorCode =
    | 'nats_error'
    | 'protocol_error'
    | 'protocol_overflow'
    | 'socket_error';

export interface PoolErrorInfo {
    code: PoolErrorCode;
    reason: string;
}

export type PoolCloseReason =
    | 'retries_exhausted'
    | 'protocol_error'
    | 'protocol_overflow'
    | 'released'
    | 'manual';

export interface PoolStateEvent {
    state: PoolSocketState;
    /** Tentativa de reconexão em curso (state === 'reconnecting'). */
    attempt?: number;
    /** Presente quando state === 'error'. */
    error?: PoolErrorInfo;
    /** Presente quando state === 'closed'. */
    reason?: PoolCloseReason;
    /** true = o pool desistiu de reconectar; só um reconnect() explícito volta. */
    fatal?: boolean;
}

export interface NatsSocketConfig {
    /** URL do WebSocket NATS (ex.: "wss://host/nats" — a barra final é normalizada). */
    url: string;
    /** JWT escopado da sessão remota; vai no access_token da URL e no CONNECT. */
    jwt: string;
    /**
     * Renova as credenciais ANTES de cada tentativa automática de reconexão.
     * O JWT do viewer tem TTL próprio: reusar o da abertura cai em -ERR até
     * esgotar as tentativas.
     */
    getFreshCredentials?: () => Promise<string>;
    maxReconnectAttempts?: number;
    reconnectBaseDelayMs?: number;
    reconnectMaxDelayMs?: number;
}

export interface PooledNatsSocket {
    /** url normalizada + identidade das credenciais. */
    readonly key: string;
    readonly url: string;
    getState(): PoolSocketState;
    isOpen(): boolean;
    sub(subject: string, handler: NatsMessageHandler): () => void;
    publish(subject: string, payload: string): boolean;
    onState(handler: (event: PoolStateEvent) => void): () => void;
    /** Reconexão imperativa (descarta a geração atual, preserva assinaturas). */
    reconnect(): void;
    /** Decrementa o refcount (idempotente). */
    release(): void;
}

// ── Constantes ──────────────────────────────────────────────────────────────

const WS_OPEN = 1;
const CRLF = new Uint8Array([13, 10]);

/** Teto de assinaturas por conexão: bug de caller não pode crescer sem limite. */
export const MAX_SUBSCRIPTIONS_PER_SOCKET = 256;

/**
 * Debounce do descarte quando o refcount chega a zero. Curto de propósito:
 * cobre o ciclo do StrictMode sem segurar conexões órfãs.
 */
export const POOL_DISPOSE_DEBOUNCE_MS = 100;

/** Teto do buffer do protocolo NATS (mesmo valor do hook antigo). */
const MAX_PROTOCOL_BUFFER_BYTES = 4 * 1024 * 1024;

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_RECONNECT_BASE_MS = 1000;
const DEFAULT_RECONNECT_MAX_MS = 16000;
/** Jitter DESCENDENTE: espalha clientes sem estourar a janela de backoff. */
const RECONNECT_JITTER = 0.25;

// ── Utilidades de protocolo ─────────────────────────────────────────────────

function appendBytes(
    left: Uint8Array<ArrayBufferLike>,
    right: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> {
    const result = new Uint8Array(left.length + right.length);
    result.set(left);
    result.set(right, left.length);
    return result;
}

// findCrlf procura o CRLF a partir de 'from' (cursor). Sem o cursor, cada
// mensagem revarria o buffer desde o início: com um prefixo longo sem CRLF o
// custo vira O(n²). O chamador avança o cursor e o zera quando consome bytes.
function findCrlf(data: Uint8Array<ArrayBufferLike>, from = 0): number {
    for (let i = Math.max(0, from); i <= data.length - CRLF.length; i++) {
        if (data[i] === CRLF[0] && data[i + 1] === CRLF[1]) return i;
    }
    return -1;
}

/** Frame PUB com o comprimento em BYTES (não em code points). */
function buildPub(subject: string, payload: string): string {
    const len = new TextEncoder().encode(payload).length;
    return `PUB ${subject} ${len}\r\n${payload}\r\n`;
}

/** Barra final no path: nginx responde 308 em "/nats" e o browser não segue em WS. */
export function normalizeNatsUrl(url: string): string {
    return url && !url.endsWith('/') ? url + '/' : url;
}

/**
 * Chave do pool: URL normalizada + identidade das credenciais. O JWT inteiro
 * entra na chave para que credenciais diferentes NUNCA compartilhem conexão.
 */
export function natsSocketPoolKey(config: Pick<NatsSocketConfig, 'url' | 'jwt'>): string {
    return `${normalizeNatsUrl(config.url)}|${config.jwt}`;
}

// ── Conexão ─────────────────────────────────────────────────────────────────

interface Subscription {
    sid: number;
    /**
     * handler -> quantas assinaturas ATIVAS ele tem neste subject. Um Map com
     * contagem (e não um Set) porque cada handle de sub() deve remover só a SUA
     * assinatura: com Set, um mesmo handler assinado duas vezes morria na
     * primeira remoção.
     */
    handlers: Map<NatsMessageHandler, number>;
}

interface PendingMsg {
    subject: string;
    sid: number;
    /** Offset do fim do corpo (payload + CRLF) dentro do buffer. */
    end: number;
}

class PooledConnection implements PooledNatsSocket {
    readonly key: string;
    readonly url: string;

    private jwt: string;
    private readonly refreshCredentials: (() => Promise<string>) | undefined;
    private readonly maxReconnectAttempts: number;
    private readonly reconnectBaseMs: number;
    private readonly reconnectMaxMs: number;
    private readonly onDisposed: (connection: PooledConnection) => void;

    private ws: WebSocket | null = null;
    private generation = 0;
    private authenticated = false;
    private connectSent = false;
    private currentState: PoolSocketState = 'closed';
    private refCount = 0;
    private attempt = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private disposeTimer: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;

    private readonly subscriptions = new Map<string, Subscription>();
    private readonly sidToSubject = new Map<number, string>();
    private nextSid = 0;
    private readonly stateHandlers = new Set<(event: PoolStateEvent) => void>();

    // Estado do parser, reiniciado a cada geração de socket.
    private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array();
    private scanFrom = 0;
    private pendingMsg: PendingMsg | null = null;
    private readonly protocolDecoder = new TextDecoder();

    constructor(config: NatsSocketConfig, onDisposed: (connection: PooledConnection) => void) {
        this.key = natsSocketPoolKey(config);
        this.url = normalizeNatsUrl(config.url);
        this.jwt = config.jwt;
        this.refreshCredentials = config.getFreshCredentials;
        this.maxReconnectAttempts = Math.max(0, config.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS);
        this.reconnectBaseMs = Math.max(0, config.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_MS);
        this.reconnectMaxMs = Math.max(this.reconnectBaseMs, config.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_MS);
        this.onDisposed = onDisposed;
    }

    // ── API pública ─────────────────────────────────────────────────────────

    getState(): PoolSocketState {
        return this.currentState;
    }

    isOpen(): boolean {
        return this.authenticated && this.ws !== null && this.ws.readyState === WS_OPEN;
    }

    sub(subject: string, handler: NatsMessageHandler): () => void {
        if (this.disposed) return () => { /* pool já descartado */ };

        let entry = this.subscriptions.get(subject);
        if (!entry) {
            if (this.subscriptions.size >= MAX_SUBSCRIPTIONS_PER_SOCKET) {
                throw new Error(
                    `Limite de ${MAX_SUBSCRIPTIONS_PER_SOCKET} assinaturas por conexão NATS excedido (${this.url}).`,
                );
            }
            this.nextSid += 1;
            entry = { sid: this.nextSid, handlers: new Map() };
            this.subscriptions.set(subject, entry);
            this.sidToSubject.set(entry.sid, subject);
            this.sendSub(subject, entry.sid);
        }
        entry.handlers.set(handler, (entry.handlers.get(handler) ?? 0) + 1);

        const subscription = entry;
        let active = true;
        return () => {
            if (!active) return;
            active = false;
            const current = this.subscriptions.get(subject);
            if (!current || current !== subscription) return;
            const count = current.handlers.get(handler) ?? 0;
            if (count === 0) return;
            if (count > 1) {
                current.handlers.set(handler, count - 1);
                return;
            }
            current.handlers.delete(handler);
            if (current.handlers.size > 0) return;
            this.subscriptions.delete(subject);
            this.sidToSubject.delete(current.sid);
            this.sendRaw(`UNSUB ${current.sid}`);
        };
    }

    publish(subject: string, payload: string): boolean {
        if (!this.isOpen()) return false;
        return this.sendRaw(buildPub(subject, payload));
    }

    onState(handler: (event: PoolStateEvent) => void): () => void {
        this.stateHandlers.add(handler);
        return () => {
            this.stateHandlers.delete(handler);
        };
    }

    reconnect(): void {
        if (this.disposed || this.refCount === 0) return;
        this.clearReconnectTimer();
        this.attempt = 0;
        this.releaseSocket('manual');
        this.currentState = 'connecting';
        this.emitState({ state: 'connecting' });
        this.connect();
    }

    release(): void {
        if (this.disposed || this.refCount === 0) return;
        this.refCount -= 1;
        if (this.refCount > 0) return;
        this.clearReconnectTimer();
        this.attempt = 0;
        if (this.disposeTimer !== null) clearTimeout(this.disposeTimer);
        this.disposeTimer = setTimeout(() => {
            this.disposeTimer = null;
            if (this.refCount === 0) this.dispose();
        }, POOL_DISPOSE_DEBOUNCE_MS);
    }

    retain(): void {
        this.refCount += 1;
        if (this.disposeTimer !== null) {
            clearTimeout(this.disposeTimer);
            this.disposeTimer = null;
        }
        if (this.refCount === 1 && this.ws === null && !this.disposed) {
            this.attempt = 0;
            this.connect();
        }
    }

    /** Descarte imediato (reset do pool em testes / teardown da aplicação). */
    shutdown(): void {
        this.refCount = 0;
        this.dispose();
    }

    // ── Conexão ─────────────────────────────────────────────────────────────

    private connect(): void {
        if (this.disposed || this.refCount === 0) return;
        this.generation += 1;
        const generation = this.generation;
        this.authenticated = false;
        this.connectSent = false;
        this.resetParser();

        let ws: WebSocket;
        try {
            ws = new WebSocket(`${this.url}?access_token=${encodeURIComponent(this.jwt)}`);
        } catch (err) {
            this.emitState({
                state: 'error',
                error: {
                    code: 'socket_error',
                    reason: err instanceof Error ? err.message : 'falha ao abrir o WebSocket NATS',
                },
            });
            this.scheduleReconnect();
            return;
        }
        ws.binaryType = 'arraybuffer';
        this.ws = ws;
        this.currentState = 'connecting';

        // Guarda de socket OBSOLETO: ao trocar de geração (reconnect manual,
        // nova tentativa) os eventos da conexão anterior chegam DEPOIS e não
        // podem mexer no estado da nova nem entregar frames de sessão antiga.
        ws.onopen = () => { /* aguarda INFO */ };
        ws.onmessage = (event: MessageEvent) => {
            if (generation !== this.generation) return;
            this.handleData(event.data);
        };
        ws.onerror = () => { /* tratado no onclose */ };
        ws.onclose = () => {
            this.handleClose(generation);
        };
    }

    private handleClose(generation: number): void {
        if (generation !== this.generation) return;
        if (this.disposed) return;
        this.authenticated = false;
        this.ws = null;
        this.resetParser();
        if (this.refCount === 0) {
            this.dispose();
            return;
        }
        this.scheduleReconnect();
    }

    private scheduleReconnect(): void {
        if (this.disposed || this.refCount === 0) {
            this.dispose();
            return;
        }
        if (this.attempt >= this.maxReconnectAttempts) {
            this.attempt = 0;
            this.currentState = 'closed';
            this.emitState({ state: 'closed', reason: 'retries_exhausted', fatal: true });
            return;
        }
        const index = this.attempt;
        this.attempt += 1;
        const base = Math.min(this.reconnectBaseMs * 2 ** index, this.reconnectMaxMs);
        const delay = Math.round(base * (1 - Math.random() * RECONNECT_JITTER));
        this.currentState = 'reconnecting';
        this.emitState({ state: 'reconnecting', attempt: this.attempt });
        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.attemptReconnect();
        }, delay);
    }

    private async attemptReconnect(): Promise<void> {
        if (this.disposed || this.refCount === 0) {
            this.dispose();
            return;
        }
        // Geração no início da tentativa: getFreshCredentials é assíncrono e,
        // durante o await, o botão Reconectar (reconnect()) ou um release podem
        // trocar a geração. Retomar depois disso abriria uma SEGUNDA conexão e
        // deixaria a do reconnect manual órfã/aberta (vazamento de WebSocket e
        // de conexão autenticada no NATS).
        const generation = this.generation;
        const refresh = this.refreshCredentials;
        if (refresh) {
            try {
                const next = await refresh();
                if (typeof next === 'string' && next !== '') this.jwt = next;
            } catch {
                // Melhor esforço: tenta com o JWT atual.
            }
        }
        if (this.disposed || this.refCount === 0) {
            this.dispose();
            return;
        }
        if (generation !== this.generation) return;
        this.connect();
    }

    /** Descarta a geração atual sem agendar reconexão. */
    private releaseSocket(reason: PoolCloseReason): void {
        this.generation += 1;
        this.authenticated = false;
        this.connectSent = false;
        this.resetParser();
        const ws = this.ws;
        this.ws = null;
        if (!ws) return;
        try {
            ws.close(4000, reason);
        } catch {
            // socket já fechado
        }
    }

    private dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clearReconnectTimer();
        if (this.disposeTimer !== null) {
            clearTimeout(this.disposeTimer);
            this.disposeTimer = null;
        }
        this.releaseSocket('released');
        this.subscriptions.clear();
        this.sidToSubject.clear();
        this.stateHandlers.clear();
        this.currentState = 'closed';
        this.onDisposed(this);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private sendRaw(frame: string): boolean {
        const ws = this.ws;
        if (!ws || ws.readyState !== WS_OPEN) return false;
        try {
            ws.send(frame);
            return true;
        } catch {
            return false;
        }
    }

    private sendSub(subject: string, sid: number): void {
        if (!this.authenticated) return;
        this.sendRaw(`SUB ${subject} ${sid}`);
    }

    private emitState(event: PoolStateEvent): void {
        // Cópia: um handler que se remove durante o fan-out não pode alterar a
        // iteração, e um handler com exceção não pode calar os demais.
        for (const handler of [...this.stateHandlers]) {
            try {
                handler(event);
            } catch {
                // handler com defeito não derruba a conexão compartilhada
            }
        }
    }

    // ── Parser do protocolo ─────────────────────────────────────────────────

    private resetParser(): void {
        this.buffer = new Uint8Array();
        this.scanFrom = 0;
        this.pendingMsg = null;
    }

    private handleData(data: unknown): void {
        // Aceita string, ArrayBuffer e views: alguns ambientes entregam a view
        // binária em vez do ArrayBuffer cru, e instanceof ArrayBuffer falha
        // entre realms (ArrayBuffer.isView é independente de realm).
        const bytes = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : data instanceof ArrayBuffer
                ? new Uint8Array(data)
                : ArrayBuffer.isView(data)
                    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
                    : null;
        if (!bytes || bytes.length === 0) return;
        this.buffer = appendBytes(this.buffer, bytes);
        if (this.buffer.length > MAX_PROTOCOL_BUFFER_BYTES) {
            this.abortConnection('protocol_overflow', 'Buffer do protocolo NATS acima do limite.', true);
            return;
        }
        this.processProtocol();
    }

    private processProtocol(): void {
        const generation = this.generation;
        if (!this.consumePending()) return;

        while (generation === this.generation) {
            const lineEnd = findCrlf(this.buffer, this.scanFrom);
            if (lineEnd < 0) {
                // Sem CRLF: a próxima busca recomeça no fim (um CRLF pode
                // começar no último byte) em vez de revarrer o buffer.
                this.scanFrom = this.buffer.length > 0 ? this.buffer.length - 1 : 0;
                return;
            }

            const line = this.protocolDecoder.decode(this.buffer.slice(0, lineEnd));
            const tokens = line.trim().split(/\s+/);

            if (tokens[0] === 'MSG') {
                // MSG <subject> <sid> [reply] <bytes>
                const payloadIndex = tokens.length === 5 ? 4 : 3;
                const payloadLength = Number.parseInt(tokens[payloadIndex] ?? '0', 10);
                if (!Number.isInteger(payloadLength) || payloadLength < 0) {
                    this.abortConnection('protocol_error', line, true);
                    return;
                }
                const sid = Number.parseInt(tokens[2] ?? '', 10);
                this.buffer = this.buffer.slice(lineEnd + 2);
                this.scanFrom = 0;
                // Consome só o HEADER; o corpo (payloadLength + CRLF) fica pendente.
                this.pendingMsg = {
                    subject: tokens[1] ?? '',
                    sid: Number.isInteger(sid) ? sid : -1,
                    end: payloadLength + 2,
                };
                if (!this.consumePending()) return;
                continue;
            }

            this.buffer = this.buffer.slice(lineEnd + 2);
            this.scanFrom = 0;

            if (tokens[0] === 'INFO') {
                if (this.connectSent || this.authenticated) continue;
                this.connectSent = true;
                this.sendRaw(`CONNECT ${JSON.stringify({
                    lang: 'discovery-web',
                    version: '1.0',
                    protocol: 1,
                    headers: true,
                    verbose: true,
                    auth_token: this.jwt,
                })}`);
                continue;
            }

            if (tokens[0] === '+OK') {
                if (!this.connectSent || this.authenticated) continue;
                this.authenticated = true;
                this.attempt = 0;
                // Re-SUB de TODAS as assinaturas ativas antes de avisar os
                // assinantes: quando o handler de 'open' publica (hello), os
                // SUBs já foram para a rede.
                for (const [subject, entry] of this.subscriptions) {
                    this.sendSub(subject, entry.sid);
                }
                this.currentState = 'open';
                this.emitState({ state: 'open' });
                continue;
            }

            if (tokens[0] === 'PING') {
                this.sendRaw('PONG');
                continue;
            }

            if (tokens[0] === '-ERR') {
                const reason = line.replace(/^-ERR\s*/i, '').replace(/^['"]|['"]$/g, '');
                this.abortConnection('nats_error', reason, false);
                return;
            }
        }
    }

    /** Conclui o corpo de uma MSG já cabeçalhada; false = ainda faltam bytes. */
    private consumePending(): boolean {
        const pending = this.pendingMsg;
        if (pending === null) return true;
        if (this.buffer.length < pending.end) return false;
        const payload = this.protocolDecoder.decode(this.buffer.slice(0, pending.end - 2));
        this.buffer = this.buffer.slice(pending.end);
        this.pendingMsg = null;
        this.scanFrom = 0;
        this.deliver(pending.subject, pending.sid, payload);
        return true;
    }

    private deliver(subject: string, sid: number, payload: string): void {
        const subscribedSubject = this.sidToSubject.get(sid) ?? subject;
        const entry = this.subscriptions.get(subscribedSubject);
        if (!entry) return;
        for (const handler of [...entry.handlers.keys()]) {
            try {
                handler(payload);
            } catch {
                // handler com defeito não interrompe o fan-out nem o parser
            }
        }
    }

    private abortConnection(code: PoolErrorCode, reason: string, fatal: boolean): void {
        // Notifica ANTES de fechar: o assinante precisa saber POR QUE caiu.
        this.emitState({ state: 'error', error: { code, reason } });
        this.releaseSocket(code === 'nats_error' ? 'manual' : code === 'protocol_overflow' ? 'protocol_overflow' : 'protocol_error');
        if (fatal) {
            this.clearReconnectTimer();
            this.attempt = 0;
            this.currentState = 'closed';
            this.emitState({
                state: 'closed',
                reason: code === 'protocol_overflow' ? 'protocol_overflow' : 'protocol_error',
                fatal: true,
            });
            return;
        }
        this.scheduleReconnect();
    }
}

// ── Pool (singleton do módulo) ──────────────────────────────────────────────

const pool = new Map<string, PooledConnection>();

function disposeConnection(connection: PooledConnection): void {
    if (pool.get(connection.key) === connection) pool.delete(connection.key);
}

/**
 * Pega (ou abre) a conexão compartilhada da chave e incrementa o refcount.
 * Quem chama DEVE chamar release() no unmount/cleanup.
 */
export function acquire(config: NatsSocketConfig): PooledNatsSocket {
    const key = natsSocketPoolKey(config);
    const existing = pool.get(key);
    const connection = existing ?? new PooledConnection(config, disposeConnection);
    if (!existing) pool.set(key, connection);
    connection.retain();
    return connection;
}

/** Decrementa o refcount; em zero a conexão é descartada (com debounce). */
export function release(socket: PooledNatsSocket): void {
    socket.release();
}

/** Assina um subject; devolve o handle de unsubscribe (idempotente). */
export function sub(
    socket: PooledNatsSocket,
    subject: string,
    handler: NatsMessageHandler,
): () => void {
    return socket.sub(subject, handler);
}

/** Publica um payload no subject (framing PUB do pool). */
export function publish(socket: PooledNatsSocket, subject: string, payload: string): boolean {
    return socket.publish(subject, payload);
}

/** Assina eventos de estado da conexão compartilhada. */
export function onState(
    socket: PooledNatsSocket,
    handler: (event: PoolStateEvent) => void,
): () => void {
    return socket.onState(handler);
}

/** Quantidade de conexões vivas no pool (diagnóstico / devtools). */
export function natsPoolSize(): number {
    return pool.size;
}

/**
 * Fecha e descarta TODAS as conexões do pool. Usado no teardown da aplicação e
 * pelos testes (o pool é singleton de módulo e sobrevive entre casos).
 */
export function resetNatsSocketPool(): void {
    const connections = [...pool.values()];
    pool.clear();
    for (const connection of connections) connection.shutdown();
}
