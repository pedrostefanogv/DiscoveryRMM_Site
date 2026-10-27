import { useRef, useEffect, useState, useCallback } from 'react';
import type { CompletionRequest, CompletionResponse } from './terminalInput';
import {
    createNatsService,
    type DashboardEvent,
    type NatsConnectionState,
    type NatsCredentialsResponse,
    type NatsService,
} from '@/api/nats';

interface UseTerminalStreamOptions {
    natsSubject: string;
    natsUrl: string;
    jwt: string;
    /**
     * Renova as credenciais NATS antes de uma tentativa AUTOMÁTICA de
     * reconexão e devolve o novo JWT. Sem isto o reconnect reusa o JWT da
     * abertura (o do viewer tem TTL próprio): 5 tentativas em `-ERR` e
     * "Conexão NATS perdida". O caminho manual (botão Reconectar) refaz o
     * fetch no componente pai e passa o jwt novo via reconnect(jwt).
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
    getFreshCredentials,
    reconnectToken = 0,
}: UseTerminalStreamOptions): UseTerminalStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const serviceRef = useRef<NatsService | null>(null);
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

    // Último seq de term.out renderizado: vai no hello para o agente reenviar
    // apenas o que o viewer perdeu (-1 = nunca viu nada).
    const lastSeqRef = useRef(-1);
    // Últimas dimensões conhecidas (vão no hello, cobrindo o caso em que o
    // ResizeObserver não dispara porque o fit não mudou o tamanho).
    const lastDimsRef = useRef<{ cols: number; rows: number } | null>(null);

    // Fila de input (FIFO limitada) e último resize (coalescido). Guardamos o
    // PAYLOAD JSON: o framing PUB é responsabilidade do cliente NATS.
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

        const handleTermOut = (parsed: Record<string, unknown>) => {
            if (!parsed || typeof parsed !== 'object') return;
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
                // NAO mexe em lastSeqRef: o viewer so pode assumir
                // continuidade ate o ultimo seq que ELE recebeu. O agent
                // manda apenas `requestedFrom`; adotar outro valor pularia frame.
                resetCallbacksRef.current.forEach(cb => cb());
                return;
            }
            if (typeof parsed.data === 'string') {
                if (typeof parsed.seq === 'number') lastSeqRef.current = parsed.seq;
                try {
                    const decoded = utf8Stream.decode(base64ToBytes(parsed.data), { stream: true });
                    outputCallbacksRef.current.forEach(cb => cb(decoded));
                } catch {
                    outputCallbacksRef.current.forEach(cb => cb(String(parsed.data)));
                }
                return;
            }
            if (parsed.shells && Array.isArray(parsed.shells)) {
                // term.ready — shells disponiveis + console pronto
                readyCallbacksRef.current.forEach(cb => cb(parsed as unknown as TerminalReadyInfo));
            }
        };

        const handleSessionEvent = (parsed: Record<string, unknown>) => {
            if (!parsed || typeof parsed !== 'object') return;
            const data = (parsed.data ?? {}) as Record<string, unknown>;
            if (parsed.eventType === 'error') {
                // .event era publicado pelo agente SEM nenhum assinante:
                // falha de start/erro de sessao ficava invisivel.
                errorCallbacksRef.current.forEach(cb => cb({
                    code: String(data.code ?? 'session_error'),
                    reason: String(data.error ?? 'erro na sessao remota'),
                }));
            } else if (parsed.eventType === 'closed') {
                exitCallbacksRef.current.forEach(cb => cb(String(data.reason ?? 'sessao encerrada')));
            }
        };

        const handleStats = (parsed: Record<string, unknown>) => {
            if (!parsed || typeof parsed !== 'object') return;
            statsCallbacksRef.current.forEach(cb => cb(parsed as unknown as TerminalStatsInfo));
        };

        const handleCompletionRes = (parsed: Record<string, unknown>) => {
            if (!parsed || typeof parsed !== 'object') return;
            if (typeof parsed.reqId !== 'string') return;
            const res: CompletionResponse = {
                reqId: parsed.reqId,
                ok: Boolean(parsed.ok),
                error: typeof parsed.error === 'string' ? parsed.error : undefined,
                replacementIndex: Number.isFinite(parsed.replacementIndex) ? Number(parsed.replacementIndex) : 0,
                replacementLength: Number.isFinite(parsed.replacementLength) ? Number(parsed.replacementLength) : 0,
                matches: Array.isArray(parsed.matches) ? (parsed.matches.filter((m: unknown) => !!m && typeof m === 'object') as CompletionResponse['matches']) : [],
                totalCount: Number.isFinite(parsed.totalCount) ? Number(parsed.totalCount) : 0,
                page: Number.isFinite(parsed.page) ? Number(parsed.page) : 0,
                pageSize: Number.isFinite(parsed.pageSize) ? Number(parsed.pageSize) : 0,
                hasMore: Boolean(parsed.hasMore),
            };
            completionCallbacksRef.current.forEach(cb => cb(res));
        };

    // allow-list CLIENT-SIDE (o NatsService bloqueia subscribe fora dela; o
    // servidor aplica a propria via JWT reemitido).
    const subjectAllowList = [outSubject, readySubject, statsSubject, eventSubject, completionResSubject];

    const buildCreds = (token: string): NatsCredentialsResponse => ({
        jwt: token,
        nkeySeed: '',
        publicKey: '',
        expiresAtUtc: new Date(Date.now() + 60 * 60_000).toISOString(),
        publishSubjects: [],
        subscribeSubjects: subjectAllowList,
    });

    const service = createNatsService({
        url: natsUrl,
        enabled: true,
        authMode: 'jwt_credentials',
        credentialsProvider: async () => {
            // Reconexao automatica do service: busca JWT FRESCO (o do viewer
            // tem TTL proprio) em vez de reusar o expirado.
            const refresh = freshCredsRef.current;
            const token = refresh ? await refresh() : jwtRef.current;
            jwtRef.current = token;
            return buildCreds(token);
        },
        scopeMode: 'preserve',
    });
    serviceRef.current = service;

    // Handshake do console: hello com lastSeq (replay) + drenagem das filas
    // de input/resize. Chamado a cada 'connected' (mount e reconexoes).
    const sendHello = () => {
        const svc = serviceRef.current;
        if (!svc || !svc.isConnected()) return;
        const hello: Record<string, unknown> = {
            hello: true,
            lastSeq: lastSeqRef.current,
        };
        if (lastDimsRef.current) {
            hello.cols = lastDimsRef.current.cols;
            hello.rows = lastDimsRef.current.rows;
        }
        void svc.publish(inSubject, hello).catch(() => { /* best-effort */ });
        const resize = pendingResizeRef.current;
        if (resize) {
            pendingResizeRef.current = null;
            void svc.publish(inSubject, resize).catch(() => { /* best-effort */ });
        }
        const pending = pendingInputRef.current;
        pendingInputRef.current = [];
        pendingInputBytesRef.current = 0;
        for (const payload of pending) {
            void svc.publish(inSubject, JSON.parse(payload)).catch(() => { /* best-effort */ });
        }
    };
    // Handshake (hello + drenagem das filas) a cada 'connected' — inclusive
    // reconexoes internas do service (os SUBs sao restaurados antes do
    // 'connected' e o agente reenvia o que faltou via lastSeq).
    const onState = (state: NatsConnectionState) => {
        if (!mounted) return;
        switch (state) {
            case 'connected': {
                utf8Stream = new TextDecoder('utf-8');
                setIsConnected(true);
                setError(null);
                sendHello();
                return;
            }
            case 'auth_error': {
                setIsConnected(false);
                reportError({ code: 'nats_error', reason: 'Autenticacao NATS expirada ou recusada.' });
                return;
            }
            case 'reconnecting':
            case 'connecting':
            case 'disconnected':
                setIsConnected(false);
                return;
            default:
                return;
        }
    };
    const offState = service.onConnectionStateChange(onState);

    // Falha de auth (JWT expirado no meio da sessao): busca credencial fresca
    // e reconecta — em vez de auth_error terminal.
    const offAuth = service.onAuthError(() => {
        if (!mounted) return;
        void (async () => {
            try {
                const refresh = freshCredsRef.current;
                const token = refresh ? await refresh() : jwtRef.current;
                jwtRef.current = token;
                service.setPreSuppliedCredentials(buildCreds(token));
                await service.forceReconnect();
            } catch {
                // sem credencial fresca: o estado auth_error permanece
            }
        })();
    });

    // Assinaturas registradas ANTES do connect(): o connect() restaura as
    // NATS subscriptions a partir dos listeners e so depois emite
    // 'connected' — nenhum frame inicial e perdido.
    // Os handlers do terminal recebem o payload JÁ parseado pelo NatsService
    // (JSON.parse em api/nats.ts) — o cast alinha com a assinatura do serviço.
    type NatsHandler = (event: DashboardEvent) => void;
    const subjectHandlers: Array<[string, NatsHandler]> = [
        [outSubject, handleTermOut as unknown as NatsHandler],
        [readySubject, handleTermOut as unknown as NatsHandler],
        [eventSubject, handleSessionEvent as unknown as NatsHandler],
        [statsSubject, handleStats as unknown as NatsHandler],
        [completionResSubject, handleCompletionRes as unknown as NatsHandler],
    ];
    for (const [subject, handler] of subjectHandlers) {
        service.subscribe(subject, handler, { connectIfNeeded: false }).catch(() => {
            // o connect() subsequente restaura as assinaturas via restoreSubscriptions
        });
    }

    void (async () => {
        const ok = await service.connect();
        if (!mounted) return;
        if (!ok) {
            setIsConnected(false);
            setError('Conexao NATS perdida — verifique o servidor.');
        }
    })();

    return () => {
        mounted = false;
        offState();
        offAuth();
        for (const [subject, handler] of subjectHandlers) {
            try { service.unsubscribe(subject, handler); } catch { /* teardown best-effort */ }
        }
        if (serviceRef.current === service) serviceRef.current = null;
        void service.dispose().catch(() => { /* teardown best-effort */ });
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
        const service = serviceRef.current;
        if (!service) return;
        setIsConnected(false);
        // Busca SEMPRE credencial fresca (o JWT do viewer tem TTL próprio) e
        // reconecta: as assinaturas são restauradas pelo connect() a partir
        // dos listeners, preservando o xterm e o lastSeq do replay.
        void (async () => {
            try {
                const refresh = freshCredsRef.current;
                const token = refresh ? await refresh() : jwtRef.current;
                jwtRef.current = token;
                service.setPreSuppliedCredentials({
                    jwt: token,
                    nkeySeed: '',
                    publicKey: '',
                    expiresAtUtc: new Date(Date.now() + 60 * 60_000).toISOString(),
                    publishSubjects: [],
                    subscribeSubjects: [],
                });
                await service.forceReconnect();
            } catch {
                // sem credencial fresca: o reconnect automático segue
            }
        })();
    }, [reconnectToken]);

    const sendData = useCallback((data: string) => {
        const service = serviceRef.current;
        const open = !!service && service.isConnected();
        // Paste grande é fatiado: cada PUB fica abaixo do limite do agente.
        const payloads = chunkUtf8(data).map(
            (part) => JSON.stringify({ data: toBase64(part) }),
        );
        if (open && service) {
            for (const payload of payloads) {
                void service.publish(inSubject, JSON.parse(payload)).catch(() => { /* best-effort */ });
            }
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
        const service = serviceRef.current;
        if (service && service.isConnected()) {
            void service.publish(inSubject, { cols, rows }).catch(() => { /* best-effort */ });
        } else {
            pendingResizeRef.current = { cols, rows };
        }
    }, [inSubject]);

    // Publica 'completion.req' (C). Sem socket autenticado não há resposta
    // possível: descarta em silêncio (o popup simplesmente não abre).
    const sendCompletionRequest = useCallback((req: CompletionRequest) => {
        const service = serviceRef.current;
        if (!service || !service.isConnected()) return;
        void service.publish(completionReqSubject, { ...req }).catch(() => { /* best-effort */ });
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
