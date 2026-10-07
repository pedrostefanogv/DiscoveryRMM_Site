import { useRef, useEffect, useState, useCallback } from 'react';
import type { CompletionRequest, CompletionResponse } from './terminalInput';

interface UseTerminalStreamOptions {
    natsSubject: string;
    natsUrl: string;
    jwt: string;
    nkeySeed: string;
    /**
     * Renova as credenciais NATS antes de uma tentativa AUTOMÁTICA de
     * reconexão e devolve o novo JWT. Sem isto o reconnect reusa o JWT da
     * abertura (o do viewer tem TTL próprio): 5 tentativas em `-ERR` e
     * "Conexão NATS perdida". O caminho manual (botão Reconectar) já refaz o
     * fetch no componente pai.
     */
    getFreshCredentials?: () => Promise<string>;
    /**
     * Sinal imperativo de reconexão: quando muda, o hook derruba o socket atual
     * e reconecta no MESMO componente — preservando o xterm (scrollback) e o
     * lastSeq (o agente reenvia só o que faltou, em vez de reenviar o anel).
     * Substitui a remontagem por `key` que a página fazia no reconnect.
     */
    reconnectToken?: number;
}

export interface TerminalReadyInfo {
    shells: string[];
    consoleId?: string;
    termCols?: number;
    termRows?: number;
    /** Backend de shell em uso no agente: 'conpty' | 'legacy' | 'none'. */
    backend?: string;
    /** Binário resolvido no agente (ex.: caminho do pwsh/powershell). */
    shellPath?: string;
    // ── Contrato v3 (A): campos ADITIVOS do term.ready ──────────────────────
    // Ausentes em agentes antigos — o viewer faz feature-detect e mantém o
    // comportamento legado quando não vêm.
    /** Presente => agente fala o contrato v3 (capabilitiesVersion >= 1). */
    capabilitiesVersion?: number;
    /** Tipo de shell reportado pelo agente (ex.: 'powershell', 'cmd', 'bash'). */
    shellKind?: string;
    supportsVt?: boolean;
    supportsResize?: boolean;
    /** Habilita completion.req/res (Ctrl+Espaço / Tab). */
    supportsCompletionQuery?: boolean;
    encoding?: string;
}

/** Contadores do subject 'stats' (agent->viewer, a cada ~2s). */
export interface TerminalStatsInfo {
    sessionId?: string;
    timestampMs?: number;
    framesOut?: number;
    bytesOut?: number;
    inputFrames?: number;
    inputBytes?: number;
    inputRejected?: number;
    inputTooLarge?: number;
    /** R2: mensagens de input descartadas pelo rate limit do agente. */
    inputRateLimited?: number;
    /** R2: resizes descartados pelo rate limit do agente. */
    resizeRateLimited?: number;
    /** R8: bytes descartados pelo backpressure do dispatcher de saída. */
    pipeDroppedBytes?: number;
    flushHolds?: number;
    flushForcedAtCap?: number;
    publishErrors?: number;
    replayResets?: number;
    replayGapFrames?: number;
    uptimeMs?: number;
    avgFlushBytes?: number;
    lastFlushBytes?: number;
}

/**
 * Frame de gravação (agent->API): documentado aqui para alinhar o contrato
 * (E). O viewer não publica em recording.term — quem grava é o agente.
 */
export interface TerminalRecordingFrame {
    data: string;
    seq: number;
    timestampMs: number;
    /** Ausente é tratado como 'output' (retrocompatibilidade). */
    kind?: 'output' | 'ready' | 'resize' | 'exit' | 'error';
    exitCode?: number;
    cols?: number;
    rows?: number;
    backend?: string;
    shellKind?: string;
}

export interface TerminalErrorInfo {
    code: string;
    reason: string;
}

interface UseTerminalStreamReturn {
    isConnected: boolean;
    sendData: (data: string) => void;
    sendResize: (cols: number, rows: number) => void;
    onOutput: (callback: (data: string) => void) => () => void;
    onExit: (callback: (reason: string) => void) => () => void;
    onReady: (callback: (info: TerminalReadyInfo) => void) => () => void;
    /** Erro de terminal/sessão reportado pelo agente (não é erro de rede). */
    onError: (callback: (info: TerminalErrorInfo) => void) => () => void;
    /**
     * O agente não tem mais o trecho de saída que o viewer perdeu (anel de
     * replay estourado): o viewer deve limpar o buffer em vez de emendar
     * saída nova em saída velha.
     */
    onReset: (callback: () => void) => () => void;
    /** Contadores de telemetria do agente (subject 'stats'). */
    onStats: (callback: (info: TerminalStatsInfo) => void) => () => void;
    /** Respostas de completions (subject 'completion.res'), roteadas por reqId. */
    onCompletion: (callback: (res: CompletionResponse) => void) => () => void;
    /** Publica 'completion.req' (viewer->agent) se o contrato v3 suportar. */
    sendCompletionRequest: (req: CompletionRequest) => void;
    error: string | null;
}

const CRLF = new Uint8Array([13, 10]);

// Limites da fila de input pendente (WS caído/CONNECTING). Não é para acumular
// indefinidamente: o excesso é REPORTADO (não descartado em silêncio).
const MAX_PENDING_INPUT = 512;
const MAX_PENDING_INPUT_BYTES = 1 << 20; // 1 MB de mensagens prontas

// Um PUB com mais que isto de UTF-8 é fatiado: o agente rejeita PUBs acima de
// 32 KB de base64 (~24 KB de texto) e antes o paste grande era engolido.
const MAX_INPUT_CHUNK_BYTES = 16 * 1024;

// Teto do buffer do protocolo NATS. Um frame anunciado com tamanho absurdo (ou
// um servidor quebrado) acumularia memória no browser sem limite.
const MAX_PROTOCOL_BUFFER_BYTES = 4 * 1024 * 1024;

function appendBytes(left: Uint8Array<ArrayBufferLike>, right: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
    const result = new Uint8Array(left.length + right.length);
    result.set(left);
    result.set(right, left.length);
    return result;
}

// findCrlf procura o CRLF a partir de `from` (cursor). Sem o cursor, cada
// mensagem revarria o buffer desde o início: com um prefixo longo sem CRLF o
// custo vira O(n²). O chamador avança o cursor e o zera quando consome bytes.
function findCrlf(data: Uint8Array<ArrayBufferLike>, from = 0): number {
    for (let i = Math.max(0, from); i <= data.length - CRLF.length; i++) {
        if (data[i] === CRLF[0] && data[i + 1] === CRLF[1]) return i;
    }
    return -1;
}

/**
 * Fatiamento por limite de BYTES sem quebrar runa UTF-8: itera por code point
 * (for...of) e fecha o pedaço quando o próximo estouraria o teto. Um paste de
 * 100 KB vira vários PUBs válidos em vez de um único PUB rejeitado.
 */
export function chunkUtf8(input: string, maxBytes: number = MAX_INPUT_CHUNK_BYTES): string[] {
    const enc = new TextEncoder();
    if (enc.encode(input).length <= maxBytes) return [input];
    const out: string[] = [];
    let cur = '';
    let curBytes = 0;
    for (const ch of input) {
        const bytes = enc.encode(ch).length;
        if (curBytes + bytes > maxBytes && cur !== '') {
            out.push(cur);
            cur = '';
            curBytes = 0;
        }
        cur += ch;
        curBytes += bytes;
    }
    if (cur !== '') out.push(cur);
    return out;
}

// Monta um frame do protocolo NATS (PUB) com o comprimento em BYTES.
function buildPub(subject: string, payload: string): string {
    const len = new TextEncoder().encode(payload).length;
    return `PUB ${subject} ${len}\r\n${payload}\r\n`;
}

// Codifica string UTF-8 → base64. btoa() puro falha com caracteres fora do
// Latin-1 (acentos, emoji, símbolos) com InvalidCharacterError, o que quebrava
// o envio de input do terminal remoto silenciosamente.
function toBase64(input: string): string {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

// Decodifica base64 → bytes. A decodificação UTF-8 usa um TextDecoder
// PERSISTENTE com { stream: true } (ver connect) — um decoder novo por
// mensagem quebraria um caractere multi-byte dividido entre mensagens (U+FFFD).
function base64ToBytes(b64: string): Uint8Array<ArrayBufferLike> {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// Console único: usa subjects fixos term.out / term.in (sem tabId),
// um terminal por sessão de suporte remoto.
export function useTerminalStream({
    natsSubject,
    natsUrl,
    jwt,
    nkeySeed: _nkeySeed,
    getFreshCredentials,
    reconnectToken = 0,
}: UseTerminalStreamOptions): UseTerminalStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const outputCallbacksRef = useRef<Set<(data: string) => void>>(new Set());
    const exitCallbacksRef = useRef<Set<(reason: string) => void>>(new Set());
    const readyCallbacksRef = useRef<Set<(info: TerminalReadyInfo) => void>>(new Set());
    const errorCallbacksRef = useRef<Set<(info: TerminalErrorInfo) => void>>(new Set());
    const resetCallbacksRef = useRef<Set<() => void>>(new Set());
    const statsCallbacksRef = useRef<Set<(info: TerminalStatsInfo) => void>>(new Set());
    const completionCallbacksRef = useRef<Set<(res: CompletionResponse) => void>>(new Set());
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    // JWT mutável: o reconnect automático precisa poder trocar a credencial
    // (o valor da prop só muda quando o pai refaz o fetch / remonta o viewer).
    const jwtRef = useRef(jwt);
    const freshCredsRef = useRef(getFreshCredentials);
    // Só publica depois do +OK (PUB antes do CONNECT é inválido no protocolo).
    const authenticatedRef = useRef(false);

    // Último seq de term.out renderizado: vai no hello para o agente reenviar
    // apenas o que o viewer perdeu (-1 = nunca viu nada).
    const lastSeqRef = useRef(-1);
    // Últimas dimensões conhecidas (vão no hello, cobrindo o caso em que o
    // ResizeObserver não dispara porque o fit não mudou o tamanho).
    const lastDimsRef = useRef<{ cols: number; rows: number } | null>(null);

    // Fila de input (FIFO limitada) e último resize (coalescido).
    const pendingInputRef = useRef<string[]>([]);
    const pendingInputBytesRef = useRef(0);
    const pendingResizeRef = useRef<string | null>(null);

    const maxReconnect = 5;
    const delays = [1000, 2000, 4000, 8000, 16000];

    // Normaliza UUIDs (remove hífens) para bater com o Agent
    const subj = natsSubject.replace(/-/g, '');
    const outSubject = `${subj}.term.out`;
    const inSubject = `${subj}.term.in`;
    const readySubject = `${subj}.term.ready`;
    const eventSubject = `${subj}.event`;
    // Contrato v3: telemetria e completions. Agents antigos não publicam
    // nesses subjects — o viewer assina e simplesmente não recebe nada.
    const statsSubject = `${subj}.stats`;
    const completionReqSubject = `${subj}.completion.req`;
    const completionResSubject = `${subj}.completion.res`;

    useEffect(() => { jwtRef.current = jwt; }, [jwt]);
    useEffect(() => { freshCredsRef.current = getFreshCredentials; }, [getFreshCredentials]);

    const reportError = useCallback((info: TerminalErrorInfo) => {
        errorCallbacksRef.current.forEach(cb => cb(info));
    }, []);

    const connect = useCallback(() => {
        if (!mountedRef.current) return;
        try {
            // FIX 2026-09-17: barra final no path (nginx 308 "/nats" -> "/nats/" e o
            // browser nao segue redirect em WebSocket -> CloseEvent 1006).
            const normalizedUrl = natsUrl && !natsUrl.endsWith('/') ? natsUrl + '/' : natsUrl;
            const wsUrl = `${normalizedUrl}?access_token=${encodeURIComponent(jwtRef.current)}`;
            const ws = new WebSocket(wsUrl);
            ws.binaryType = 'arraybuffer';
            wsRef.current = ws;
            authenticatedRef.current = false;

            let protocolBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array();
            let connectSent = false;
            let authenticated = false;
            // Cursor do CRLF e MSG já cabeçalhada aguardando o corpo: evitam
            // revarrer/parsear o buffer inteiro a cada chunk de um payload
            // grande (o custo anterior era O(n²) por payload fatiado).
            let scanFrom = 0;
            let pendingMsg: { subject: string; end: number } | null = null;

            // Decoder UTF-8 PERSISTENTE por conexão ({ stream: true }): o
            // term.out pode dividir um caractere multi-byte entre mensagens
            // (o agent já retém runas incompletas como 1ª defesa; aqui qualquer
            // runa que ainda atravesse uma mensagem é concluída na próxima,
            // sem U+FFFD). Reconexão cria novo decoder (estado limpo).
            const utf8Stream = new TextDecoder('utf-8');
            // Decoder do CABEÇALHO do protocolo, reutilizado por mensagem (o
            // anterior criava um TextDecoder novo a cada onmessage).
            const protoDecoder = new TextDecoder();

            const sendProtocol = (cmd: string) => ws?.send(new TextEncoder().encode(`${cmd}\r\n`));

            const handleTermOut = (payload: string) => {
                try {
                    const parsed = JSON.parse(payload);
                    if (!parsed || typeof parsed !== 'object') {
                        outputCallbacksRef.current.forEach(cb => cb(payload));
                        return;
                    }
                    if (parsed.exit) {
                        exitCallbacksRef.current.forEach(cb => cb(String(parsed.reason ?? 'shell encerrado')));
                        return;
                    }
                    if (parsed.error) {
                        errorCallbacksRef.current.forEach(cb => cb({
                            code: String(parsed.code ?? 'terminal_error'),
                            reason: String(parsed.reason ?? 'erro no terminal'),
                        }));
                        return;
                    }
                    if (parsed.reset) {
                        // NÃO mexe em lastSeqRef: o viewer só pode assumir
                        // continuidade até o último seq que ELE recebeu. O agent
                        // manda apenas `requestedFrom` (a posição que não pôde
                        // cobrir); adotar outro valor pularia um frame.
                        resetCallbacksRef.current.forEach(cb => cb());
                        return;
                    }
                    if (typeof parsed.data === 'string') {
                        if (typeof parsed.seq === 'number') lastSeqRef.current = parsed.seq;
                        try {
                            const decoded = utf8Stream.decode(base64ToBytes(parsed.data), { stream: true });
                            outputCallbacksRef.current.forEach(cb => cb(decoded));
                        } catch {
                            outputCallbacksRef.current.forEach(cb => cb(parsed.data));
                        }
                        return;
                    }
                    if (parsed.shells && Array.isArray(parsed.shells)) {
                        // term.ready — shells disponíveis + console pronto
                        readyCallbacksRef.current.forEach(cb => cb(parsed as TerminalReadyInfo));
                    }
                } catch {
                    outputCallbacksRef.current.forEach(cb => cb(payload));
                }
            };

            const handleSessionEvent = (payload: string) => {
                try {
                    const ev = JSON.parse(payload);
                    if (!ev || typeof ev !== 'object') return;
                    if (ev.eventType === 'error') {
                        // .event era publicado pelo agente SEM nenhum assinante:
                        // falha de start/erro de sessão ficava invisível.
                        errorCallbacksRef.current.forEach(cb => cb({
                            code: String((ev.data && ev.data.code) || 'session_error'),
                            reason: String((ev.data && ev.data.error) ?? 'erro na sessão remota'),
                        }));
                    } else if (ev.eventType === 'closed') {
                        exitCallbacksRef.current.forEach(cb => cb(String((ev.data && ev.data.reason) ?? 'sessão encerrada')));
                    }
                } catch { /* payload de evento inválido — ignora */ }
            };

            const handleStats = (payload: string) => {
                try {
                    const parsed = JSON.parse(payload);
                    if (!parsed || typeof parsed !== 'object') return;
                    statsCallbacksRef.current.forEach(cb => cb(parsed as TerminalStatsInfo));
                } catch { /* stats inválido — ignora (telemetria é best-effort) */ }
            };

            const handleCompletionRes = (payload: string) => {
                try {
                    const parsed = JSON.parse(payload);
                    if (!parsed || typeof parsed !== 'object') return;
                    if (typeof parsed.reqId !== 'string') return;
                    const res: CompletionResponse = {
                        reqId: parsed.reqId,
                        ok: Boolean(parsed.ok),
                        error: typeof parsed.error === 'string' ? parsed.error : undefined,
                        replacementIndex: Number.isFinite(parsed.replacementIndex) ? Number(parsed.replacementIndex) : 0,
                        replacementLength: Number.isFinite(parsed.replacementLength) ? Number(parsed.replacementLength) : 0,
                        matches: Array.isArray(parsed.matches)
                            ? parsed.matches.filter((m: unknown) => !!m && typeof m === 'object')
                            : [],
                        totalCount: Number.isFinite(parsed.totalCount) ? Number(parsed.totalCount) : 0,
                        page: Number.isFinite(parsed.page) ? Number(parsed.page) : 0,
                        pageSize: Number.isFinite(parsed.pageSize) ? Number(parsed.pageSize) : 0,
                        hasMore: Boolean(parsed.hasMore),
                    };
                    completionCallbacksRef.current.forEach(cb => cb(res));
                } catch { /* completion.res inválido — ignora */ }
            };

            const decoder = protoDecoder;

            // consumePending conclui o corpo de uma MSG já cabeçalhada. Devolve
            // false quando ainda faltam bytes — sem re-parsear o header nem
            // revarrer o buffer a cada chunk (era o custo O(n²) do payload
            // grande que chega fatiado em várias mensagens do WebSocket).
            const consumePending = (): boolean => {
                if (pendingMsg === null) return true;
                if (protocolBuffer.length < pendingMsg.end) return false;
                const subject = pendingMsg.subject;
                const payload = decoder.decode(protocolBuffer.slice(0, pendingMsg.end - 2));
                protocolBuffer = protocolBuffer.slice(pendingMsg.end);
                pendingMsg = null;
                scanFrom = 0;
                if (subject.endsWith('.event')) {
                    handleSessionEvent(payload);
                } else if (subject.endsWith('.stats')) {
                    handleStats(payload);
                } else if (subject.endsWith('.completion.res')) {
                    handleCompletionRes(payload);
                } else {
                    // .term.out / .term.ready (saída, ready, erro, reset, exit)
                    handleTermOut(payload);
                }
                return true;
            };

            const processProtocol = () => {
                if (!consumePending()) return;

                while (mountedRef.current) {
                    const lineEnd = findCrlf(protocolBuffer, scanFrom);
                    if (lineEnd < 0) {
                        // Sem CRLF: a próxima busca recomeça no fim (um CRLF pode
                        // começar no último byte) em vez de revarrer o buffer.
                        scanFrom = protocolBuffer.length > 0 ? protocolBuffer.length - 1 : 0;
                        return;
                    }

                    const line = decoder.decode(protocolBuffer.slice(0, lineEnd));
                    const tokens = line.trim().split(/\s+/);

                    if (tokens[0] === 'MSG') {
                        const plI = tokens.length === 5 ? 4 : 3;
                        const plN = Number.parseInt(tokens[plI] ?? '0', 10);
                        if (!Number.isInteger(plN) || plN < 0) {
                            setError(`NATS protocolo inválido: ${line}`);
                            ws?.close(4000, 'Invalid MSG');
                            return;
                        }
                        // Consome só o HEADER; o corpo (plN + CRLF) fica pendente.
                        protocolBuffer = protocolBuffer.slice(lineEnd + 2);
                        scanFrom = 0;
                        pendingMsg = { subject: tokens[1] ?? '', end: plN + 2 };
                        if (!consumePending()) return;
                        continue;
                    }

                    protocolBuffer = protocolBuffer.slice(lineEnd + 2);
                    scanFrom = 0;

                    if (tokens[0] === 'INFO') {
                        sendProtocol(`CONNECT ${JSON.stringify({
                            lang: 'discovery-web',
                            version: '1.0',
                            protocol: 1,
                            headers: true,
                            verbose: true,
                            auth_token: jwtRef.current,
                        })}`);
                        connectSent = true;
                        continue;
                    }

                    if (tokens[0] === '+OK') {
                        if (connectSent && !authenticated) {
                            authenticated = true;
                            authenticatedRef.current = true;
                            reconnectAttemptsRef.current = 0;
                            setIsConnected(true);
                            setError(null);
                            sendProtocol(`SUB ${outSubject} 1`);
                            sendProtocol(`SUB ${readySubject} 2`);
                            sendProtocol(`SUB ${eventSubject} 3`);
                            // Contrato v3 (B/D): assina telemetria e respostas de
                            // completions no MESMO WebSocket NATS.
                            sendProtocol(`SUB ${statsSubject} 4`);
                            sendProtocol(`SUB ${completionResSubject} 5`);
                            // Handshake: o ready do agente é publicado UMA vez no
                            // start da sessão; sem o hello, um viewer que assinou
                            // depois (ou reconectou) ficava sem shells/dimensões.
                            // lastSeq faz o agente reenviar o que se perdeu.
                            const hello: Record<string, unknown> = {
                                hello: true,
                                lastSeq: lastSeqRef.current,
                            };
                            if (lastDimsRef.current) {
                                hello.cols = lastDimsRef.current.cols;
                                hello.rows = lastDimsRef.current.rows;
                            }
                            ws?.send(buildPub(inSubject, JSON.stringify(hello)));
                            // Drena o resize pendente e a fila de input.
                            if (pendingResizeRef.current) {
                                ws?.send(pendingResizeRef.current);
                                pendingResizeRef.current = null;
                            }
                            const pending = pendingInputRef.current;
                            pendingInputRef.current = [];
                            pendingInputBytesRef.current = 0;
                            for (const msg of pending) ws?.send(msg);
                        }
                        continue;
                    }

                    if (tokens[0] === 'PING') { sendProtocol('PONG'); continue; }
                    if (tokens[0] === '-ERR') {
                        const reason = line.replace(/^-ERR\s*/i, '').replace(/^['"]|['"]$/g, '');
                        setError(`NATS: ${reason}`);
                        reportError({ code: 'nats_error', reason });
                        ws?.close(4000, 'NATS protocol error');
                        return;
                    }
                }
            };

            ws.onopen = () => { /* aguarda INFO */ };

            // Guarda de socket OBSoLETO: em StrictMode (e ao trocar natsUrl/
            // subj) a conexão anterior é fechada e uma nova é criada; os
            // eventos da anterior chegam DEPOIS e derrubavam a nova
            // (isConnected=false, authenticatedRef=false e um reconnect extra).
            const isStale = () => wsRef.current !== ws;

            ws.onmessage = (event) => {
                if (!mountedRef.current || isStale()) return;
                // Aceita string, ArrayBuffer e views (Uint8Array): alguns
                // ambientes entregam a view binária em vez do ArrayBuffer cru,
                // e `instanceof ArrayBuffer` falha entre realms. ArrayBuffer.isView
                // é independente de realm.
                const bytes = typeof event.data === 'string'
                    ? new Uint8Array(new TextEncoder().encode(event.data))
                    : event.data instanceof ArrayBuffer
                        ? new Uint8Array(event.data)
                        : ArrayBuffer.isView(event.data)
                            ? new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
                            : new Uint8Array();
                if (bytes.length === 0) return;
                protocolBuffer = appendBytes(protocolBuffer, bytes);
                if (protocolBuffer.length > MAX_PROTOCOL_BUFFER_BYTES) {
                    setError('Resposta NATS excessiva — conexão encerrada.');
                    reportError({
                        code: 'protocol_overflow',
                        reason: 'Buffer do protocolo NATS acima do limite.',
                    });
                    ws?.close(4000, 'Protocol buffer overflow');
                    return;
                }
                processProtocol();
            };

            ws.onerror = () => { /* tratado no onclose */ };
            ws.onclose = () => {
                if (!mountedRef.current || isStale()) return;
                authenticatedRef.current = false;
                setIsConnected(false);
                if (reconnectAttemptsRef.current < maxReconnect) {
                    const delay = delays[reconnectAttemptsRef.current] ?? delays[delays.length - 1];
                    reconnectTimerRef.current = setTimeout(async () => {
                        reconnectAttemptsRef.current++;
                        // Credencial nova ANTES de reconectar: o JWT do viewer
                        // tem TTL próprio e reusar o antigo caía em -ERR até
                        // esgotar as tentativas.
                        const refresh = freshCredsRef.current;
                        if (refresh) {
                            try {
                                const next = await refresh();
                                if (next) jwtRef.current = next;
                            } catch { /* melhor esforço: tenta com o JWT atual */ }
                        }
                        connect();
                    }, delay);
                } else {
                    setError('Conexão NATS perdida — verifique o servidor.');
                }
            };
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao conectar');
            reconnectTimerRef.current = setTimeout(() => connect(), 5000);
        }
    }, [natsUrl, subj, inSubject, outSubject, readySubject, eventSubject, statsSubject, completionResSubject, reportError]);

    useEffect(() => {
        mountedRef.current = true;
        reconnectAttemptsRef.current = 0;
        connect();
        return () => {
            mountedRef.current = false;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (wsRef.current) wsRef.current.close();
        };
    }, [connect]);

    // Reconexão IMPERATIVA (botão "Reconectar"): sem remontar o componente, para
    // não perder o buffer do xterm nem o lastSeq. O socket atual é descartado
    // como "obsoleto" (wsRef=null antes do close) para a guarda de socket
    // obsoleto ignorar o onclose dele e não agendar um reconnect duplicado.
    const reconnectTokenRef = useRef(reconnectToken);
    useEffect(() => {
        if (reconnectTokenRef.current === reconnectToken) return;
        reconnectTokenRef.current = reconnectToken;
        if (!mountedRef.current) return;
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        const old = wsRef.current;
        wsRef.current = null;
        authenticatedRef.current = false;
        setIsConnected(false);
        try { old?.close(); } catch { /* socket já fechado */ }
        reconnectAttemptsRef.current = 0;
        connect();
    }, [reconnectToken, connect]);

    const sendData = useCallback((data: string) => {
        const ws = wsRef.current;
        const open = !!ws && ws.readyState === WebSocket.OPEN && authenticatedRef.current;
        // Paste grande é fatiado: cada PUB fica abaixo do limite do agente.
        const frames = chunkUtf8(data).map(
            (part) => buildPub(inSubject, JSON.stringify({ data: toBase64(part) })),
        );
        if (open) {
            for (const frame of frames) ws!.send(frame);
            return;
        }
        // Offline: ou o input INTEIRO cabe na fila, ou nada é enviado — um
        // paste parcial executaria metade do comando no shell (pior que não
        // enviar). O descarte é sempre reportado.
        const bytes = frames.reduce((acc, frame) => acc + frame.length, 0);
        if (
            pendingInputRef.current.length + frames.length > MAX_PENDING_INPUT ||
            pendingInputBytesRef.current + bytes > MAX_PENDING_INPUT_BYTES
        ) {
            reportError({
                code: 'input_queue_full',
                reason: 'Muitas teclas pendentes durante a reconexão — o input não foi enviado.',
            });
            return;
        }
        pendingInputRef.current.push(...frames);
        pendingInputBytesRef.current += bytes;
    }, [inSubject, reportError]);

    // Envia com fila: se a conexão ainda não autenticou (ou está reconectando),
    // guarda o ÚLTIMO resize para ser drenado no +OK — evita perder o fit.
    const sendResize = useCallback((cols: number, rows: number) => {
        // Aba inativa/container oculto reporta 0x0: não é um resize válido e
        // envenenaria o ConPTY e as dimensões do hello (lastDimsRef).
        if (cols <= 0 || rows <= 0) return;
        lastDimsRef.current = { cols, rows };
        const msg = buildPub(inSubject, JSON.stringify({ cols, rows }));
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN && authenticatedRef.current) {
            ws.send(msg);
        } else {
            pendingResizeRef.current = msg;
        }
    }, [inSubject]);

    // Publica 'completion.req' (C). Sem socket autenticado não há resposta
    // possível: descarta em silêncio (o popup simplesmente não abre).
    const sendCompletionRequest = useCallback((req: CompletionRequest) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || !authenticatedRef.current) return;
        ws.send(buildPub(completionReqSubject, JSON.stringify(req)));
    }, [completionReqSubject]);

    const onOutput = useCallback((callback: (data: string) => void) => {
        outputCallbacksRef.current.add(callback);
        return () => { outputCallbacksRef.current.delete(callback); };
    }, []);

    const onExit = useCallback((callback: (reason: string) => void) => {
        exitCallbacksRef.current.add(callback);
        return () => { exitCallbacksRef.current.delete(callback); };
    }, []);

    const onReady = useCallback((callback: (info: TerminalReadyInfo) => void) => {
        readyCallbacksRef.current.add(callback);
        return () => { readyCallbacksRef.current.delete(callback); };
    }, []);

    const onError = useCallback((callback: (info: TerminalErrorInfo) => void) => {
        errorCallbacksRef.current.add(callback);
        return () => { errorCallbacksRef.current.delete(callback); };
    }, []);

    const onReset = useCallback((callback: () => void) => {
        resetCallbacksRef.current.add(callback);
        return () => { resetCallbacksRef.current.delete(callback); };
    }, []);

    const onStats = useCallback((callback: (info: TerminalStatsInfo) => void) => {
        statsCallbacksRef.current.add(callback);
        return () => { statsCallbacksRef.current.delete(callback); };
    }, []);

    const onCompletion = useCallback((callback: (res: CompletionResponse) => void) => {
        completionCallbacksRef.current.add(callback);
        return () => { completionCallbacksRef.current.delete(callback); };
    }, []);

    return {
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
    };
}
