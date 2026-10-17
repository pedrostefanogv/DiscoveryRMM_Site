import { useRef, useEffect, useState, useCallback } from 'react';
import type { CompletionRequest, CompletionResponse } from './terminalInput';
import {
    acquire,
    publish,
    release,
    sub,
    type PoolErrorInfo,
    type PoolStateEvent,
    type PooledNatsSocket,
} from '../remote-nats/natsSocketPool';

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
     * Sinal imperativo de reconexão: quando muda, o hook derruba a conexão
     * atual e reconecta no MESMO componente — preservando o xterm
     * (scrollback) e o lastSeq (o agente reenvia só o que faltou, em vez de
     * reenviar o anel). Substitui a remontagem por `key` que a página fazia
     * no reconnect.
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

// Limites da fila de input pendente (WS caído/CONNECTING). Não é para acumular
// indefinidamente: o excesso é REPORTADO (não descartado em silêncio).
const MAX_PENDING_INPUT = 512;
const MAX_PENDING_INPUT_BYTES = 1 << 20; // 1 MB de payloads prontos

// Um PUB com mais que isto de UTF-8 é fatiado: o agente rejeita PUBs acima de
// 32 KB de base64 (~24 KB de texto) e antes o paste grande era engolido.
const MAX_INPUT_CHUNK_BYTES = 16 * 1024;

// Orçamento de reconexão automática: base/limite do backoff exponencial (o
// pool aplica o jitter) e o número de tentativas antes de desistir.
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 16000;
const MAX_RECONNECT_ATTEMPTS = 5;

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
// PERSISTENTE por conexão com { stream: true } — um decoder novo por mensagem
// quebraria um caractere multi-byte dividido entre mensagens (U+FFFD).
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
    const socketRef = useRef<PooledNatsSocket | null>(null);
    const outputCallbacksRef = useRef<Set<(data: string) => void>>(new Set());
    const exitCallbacksRef = useRef<Set<(reason: string) => void>>(new Set());
    const readyCallbacksRef = useRef<Set<(info: TerminalReadyInfo) => void>>(new Set());
    const errorCallbacksRef = useRef<Set<(info: TerminalErrorInfo) => void>>(new Set());
    const resetCallbacksRef = useRef<Set<() => void>>(new Set());
    const statsCallbacksRef = useRef<Set<(info: TerminalStatsInfo) => void>>(new Set());
    const completionCallbacksRef = useRef<Set<(res: CompletionResponse) => void>>(new Set());

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

    // Fila de input (FIFO limitada) e último resize (coalescido). Guardamos o
    // PAYLOAD JSON, não o frame: o framing PUB é responsabilidade do pool.
    const pendingInputRef = useRef<string[]>([]);
    const pendingInputBytesRef = useRef(0);
    const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);

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

    useEffect(() => {
        let mounted = true;
        let utf8Stream = new TextDecoder('utf-8');

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

        const applyPoolError = (info: PoolErrorInfo) => {
            switch (info.code) {
                case 'nats_error':
                    setError(`NATS: ${info.reason}`);
                    reportError({ code: 'nats_error', reason: info.reason });
                    return;
                case 'protocol_error':
                    setError(`NATS protocolo inválido: ${info.reason}`);
                    return;
                case 'protocol_overflow':
                    setError('Resposta NATS excessiva — conexão encerrada.');
                    reportError({
                        code: 'protocol_overflow',
                        reason: info.reason,
                    });
                    return;
                case 'socket_error':
                    setError(info.reason);
                    return;
                default:
                    reportError({ code: info.code, reason: info.reason });
            }
        };

        // Handshake após cada +OK (inclusive reconexão): SUBs são refeitos pelo
        // pool ANTES deste evento, então o hello pode publicar na hora.
        const sendHello = () => {
            const socket = socketRef.current;
            if (!socket || !socket.isOpen()) return;
            const hello: Record<string, unknown> = {
                hello: true,
                lastSeq: lastSeqRef.current,
            };
            if (lastDimsRef.current) {
                hello.cols = lastDimsRef.current.cols;
                hello.rows = lastDimsRef.current.rows;
            }
            publish(socket, inSubject, JSON.stringify(hello));
            // Drena o resize pendente e a fila de input.
            const resize = pendingResizeRef.current;
            if (resize) {
                pendingResizeRef.current = null;
                publish(socket, inSubject, JSON.stringify(resize));
            }
            const pending = pendingInputRef.current;
            pendingInputRef.current = [];
            pendingInputBytesRef.current = 0;
            for (const payload of pending) publish(socket, inSubject, payload);
        };

        const onPoolState = (event: PoolStateEvent) => {
            if (!mounted) return;
            switch (event.state) {
                case 'open':
                    authenticatedRef.current = true;
                    // Conexão nova (o pool pode ter reconectado): decoder UTF-8
                    // também novo, sem estado de stream da conexão anterior.
                    utf8Stream = new TextDecoder('utf-8');
                    setIsConnected(true);
                    setError(null);
                    sendHello();
                    return;
                case 'error':
                    if (event.error) applyPoolError(event.error);
                    return;
                case 'reconnecting':
                case 'connecting':
                    authenticatedRef.current = false;
                    setIsConnected(false);
                    return;
                case 'closed':
                    authenticatedRef.current = false;
                    setIsConnected(false);
                    if (event.reason === 'retries_exhausted') {
                        setError('Conexão NATS perdida — verifique o servidor.');
                    }
                    return;
                default:
                    return;
            }
        };

        const socket = acquire({
            url: natsUrl,
            jwt: jwtRef.current,
            maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
            reconnectBaseDelayMs: RECONNECT_BASE_DELAY_MS,
            reconnectMaxDelayMs: RECONNECT_MAX_DELAY_MS,
            // O pool chama isto antes de cada tentativa automática. Lemos o ref
            // (e não a prop) para não congelar o callback da primeira render.
            getFreshCredentials: async () => {
                const refresh = freshCredsRef.current;
                if (!refresh) return jwtRef.current;
                try {
                    const next = await refresh();
                    if (next) jwtRef.current = next;
                } catch {
                    // melhor esforço: tenta com o JWT atual
                }
                return jwtRef.current;
            },
        });
        socketRef.current = socket;

        const offState = socket.onState(onPoolState);

        const unsubscribers = [
            sub(socket, outSubject, handleTermOut),
            sub(socket, readySubject, handleTermOut),
            sub(socket, eventSubject, handleSessionEvent),
            sub(socket, statsSubject, handleStats),
            sub(socket, completionResSubject, handleCompletionRes),
        ];

        // Conexão JÁ aberta por outra instância (pool compartilhado): o evento
        // 'open' aconteceu antes deste subscribe, então repetimos o handshake.
        if (socket.isOpen()) onPoolState({ state: 'open' });

        return () => {
            mounted = false;
            offState();
            for (const off of unsubscribers) off();
            if (socketRef.current === socket) socketRef.current = null;
            authenticatedRef.current = false;
            release(socket);
        };
    }, [
        natsUrl,
        subj,
        inSubject,
        outSubject,
        readySubject,
        eventSubject,
        statsSubject,
        completionResSubject,
        reportError,
    ]);

    // Reconexão IMPERATIVA (botão "Reconectar"): sem remontar o componente, para
    // não perder o buffer do xterm nem o lastSeq. O pool invalida a geração
    // atual e abre outra conexão mantendo as assinaturas — o onclose da antiga
    // é ignorado pela guarda de socket obsoleto do pool.
    const reconnectTokenRef = useRef(reconnectToken);
    useEffect(() => {
        if (reconnectTokenRef.current === reconnectToken) return;
        reconnectTokenRef.current = reconnectToken;
        const socket = socketRef.current;
        if (!socket) return;
        authenticatedRef.current = false;
        setIsConnected(false);
        socket.reconnect();
        // reconnect() muda a identidade do socket no pool; o ref do hook
        // continua apontando para a MESMA instância (assinaturas preservadas).
    }, [reconnectToken]);

    const sendData = useCallback((data: string) => {
        const socket = socketRef.current;
        const open = !!socket && socket.isOpen();
        // Paste grande é fatiado: cada PUB fica abaixo do limite do agente.
        const payloads = chunkUtf8(data).map(
            (part) => JSON.stringify({ data: toBase64(part) }),
        );
        if (open && socket) {
            for (const payload of payloads) publish(socket, inSubject, payload);
            return;
        }
        // Offline: ou o input INTEIRO cabe na fila, ou nada é enviado — um
        // paste parcial executaria metade do comando no shell (pior que não
        // enviar). O descarte é sempre reportado.
        const bytes = payloads.reduce(
            (acc, payload) => acc + new TextEncoder().encode(payload).length,
            0,
        );
        if (
            pendingInputRef.current.length + payloads.length > MAX_PENDING_INPUT ||
            pendingInputBytesRef.current + bytes > MAX_PENDING_INPUT_BYTES
        ) {
            reportError({
                code: 'input_queue_full',
                reason: 'Muitas teclas pendentes durante a reconexão — o input não foi enviado.',
            });
            return;
        }
        pendingInputRef.current.push(...payloads);
        pendingInputBytesRef.current += bytes;
    }, [inSubject, reportError]);

    // Envia com fila: se a conexão ainda não autenticou (ou está reconectando),
    // guarda o ÚLTIMO resize para ser drenado no +OK — evita perder o fit.
    const sendResize = useCallback((cols: number, rows: number) => {
        // Aba inativa/container oculto reporta 0x0: não é um resize válido e
        // envenenaria o ConPTY e as dimensões do hello (lastDimsRef).
        if (cols <= 0 || rows <= 0) return;
        lastDimsRef.current = { cols, rows };
        const socket = socketRef.current;
        if (socket && socket.isOpen()) {
            publish(socket, inSubject, JSON.stringify({ cols, rows }));
        } else {
            pendingResizeRef.current = { cols, rows };
        }
    }, [inSubject]);

    // Publica 'completion.req' (C). Sem socket autenticado não há resposta
    // possível: descarta em silêncio (o popup simplesmente não abre).
    const sendCompletionRequest = useCallback((req: CompletionRequest) => {
        const socket = socketRef.current;
        if (!socket || !socket.isOpen()) return;
        publish(socket, completionReqSubject, JSON.stringify(req));
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
