import { useRef, useEffect, useState, useCallback } from 'react';
import {
    createNatsService,
    jwtExpiresAtUtc,
    type NatsCredentialsResponse,
    type NatsService,
} from '@/api/nats';
import type { RemoteSessionResponse } from '@/api/remote-sessions';
import { RemoteWebRtcPeer } from '@/modules/remote-shared/webrtcPeer';

interface UseProcessesStreamOptions {
    natsSubject: string;
    natsUrl: string;
    jwt: string;
    /** Seed NKey do viewer (credencial escopada da sessão). */
    nkeySeed?: string;
    /** Renova o JWT NATS escopado antes/após expiração (sessões longas). */
    getFreshCredentials?: () => Promise<string>;
    /**
     * Bloco WebRTC da sessão (nulo quando a política não autorizou este kind).
     *
     * Preenchido, o request/response passa a preferir o data channel; o NATS
     * continua ativo como fallback — nunca é desligado.
     */
    webrtc?: RemoteSessionResponse['webrtc'];
}

export interface ProcessInfo {
    pid: number;
    parentPid: number;
    name: string;
    threads: number;
    priorityBase: number;
    cpuPercent: number;
    memoryBytes: number;
    ioReadBps: number;   // taxa de leitura (bytes/s)
    ioWriteBps: number;  // taxa de escrita (bytes/s)
    connections: number;
}

export interface ServiceInfo {
    name: string;
    displayName: string;
    state: string;      // running, stopped, paused, ...
    startType?: string; // auto, demand, disabled, ...
    binaryPath?: string;
    pid?: number;
    cpuPercent?: number;
    memoryBytes?: number;
    ioReadBps?: number;   // taxa de leitura (bytes/s)
    ioWriteBps?: number;
    connections?: number;
}

export interface SystemInfo {
    totalMemoryBytes: number;
    usedMemoryBytes: number;
    memoryPercent: number;
    cpuPercent: number;
}

export interface ProcResponse {
    success: boolean;
    error?: string;
    requestId?: string;
    status?: string;
    processes?: ProcessInfo[];
    services?: ServiceInfo[];
    system?: SystemInfo;
}

export interface UseProcessesStreamReturn {
    isConnected: boolean;
    isReady: boolean;
    error: string | null;
    onReady: (callback: () => void) => () => void;
    send: (action: string, extra?: Record<string, unknown>) => Promise<ProcResponse>;
}

let _seq = 0;
function nextReqId() { return `p${++_seq}`; }

export function useProcessesStream({ natsSubject, natsUrl, jwt, nkeySeed = '', getFreshCredentials, webrtc }: UseProcessesStreamOptions): UseProcessesStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pendingRef = useRef<Map<string, { resolve: (r: ProcResponse) => void; reject: (e: Error) => void }>>(new Map());
    const readyCallbacksRef = useRef<Set<() => void>>(new Set());
    const mountedRef = useRef(true);
    // Waiters resolvidos quando o handshake NATS completa (+OK). Permite
    // enfileirar envios disparados antes do socket estar pronto, em vez de
    // falhar com "WebSocket offline" (era a causa de a lista nunca carregar).
    const readyWaitersRef = useRef<Array<{ resolve: () => void; reject: (e: Error) => void }>>([]);

    const waitForReady = useCallback((timeoutMs = 10000) => new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            readyWaitersRef.current = readyWaitersRef.current.filter((w) => w.resolve !== resolve);
            reject(new Error('Timeout aguardando conexão NATS'));
        }, timeoutMs);
        readyWaitersRef.current.push({
            resolve: () => { clearTimeout(timer); resolve(); },
            reject: (e: Error) => { clearTimeout(timer); reject(e); },
        });
    }), []);

    // ── Transporte NatsService ──
    const serviceRef = useRef<NatsService | null>(null);
    // Peer connection do console. Só existe quando a política autorizou ESTE kind.
    const webRtcPeerRef = useRef<RemoteWebRtcPeer | null>(null);
    const webrtcRef = useRef(webrtc);
    // proc.ready recebido? O data channel só é usado DEPOIS disso.
    //
    // Sem o gate, a PRIMEIRA requisição poderia chegar antes de o agente
    // registrar o handler do canal: ela cairia no vazio e o viewer ficaria
    // 60 s esperando o timeout. O gate troca uma corrida por um atraso de um
    // round-trip NATS — e a partir daí todo o resto vai por P2P.
    const readyRef = useRef(false);
    webrtcRef.current = webrtc;
    const jwtRef = useRef(jwt);
    const freshCredsRef = useRef(getFreshCredentials);
    freshCredsRef.current = getFreshCredentials;
    const subj = natsSubject.replace(/-/g, '');
    const reqSubject = `${subj}.proc.req`;
    const respSubject = `${subj}.proc.resp`;
    const readySubject = `${subj}.proc.ready`;
    // Subjects DEDICADOS de sinalização WebRTC. O SDP não cabe no .proc.* (que é
    // contrato de domínio) nem no .control (teto de 512 B).
    const webrtcInSubject = `${subj}.webrtc.in`;
    const webrtcOutSubject = `${subj}.webrtc.out`;

    useEffect(() => { jwtRef.current = jwt; }, [jwt]);

    useEffect(() => {
        let mounted = true;
        mountedRef.current = true;
        const subjectAllowList = [respSubject, readySubject, webrtcOutSubject];
        const buildCreds = (token: string): NatsCredentialsResponse => ({
            jwt: token,
            nkeySeed,
            publicKey: '',
            // O JWT escopado da sessão tem TTL próprio: usa o claim exp do
            // próprio token (fallback 60 min quando ilegível).
            expiresAtUtc: jwtExpiresAtUtc(token),
            publishSubjects: [reqSubject, webrtcInSubject],
            subscribeSubjects: subjectAllowList,
        });
        const service = createNatsService({
            url: natsUrl,
            enabled: true,
            authMode: 'jwt_credentials',
            credentialsProvider: async () => {
                // Reconexão automática busca JWT FRESCO em vez de reusar o
                // expirado (mesmo padrão do useFilesStream).
                const refresh = freshCredsRef.current;
                const token = refresh ? await refresh() : jwtRef.current;
                jwtRef.current = token;
                return buildCreds(token);
            },
            scopeMode: 'preserve',
        });
        serviceRef.current = service;
        service.setPreSuppliedCredentials(buildCreds(jwt));

        const offState = service.onConnectionStateChange((state) => {
            if (!mounted || !mountedRef.current) return;
            if (state === 'connected') {
                setIsConnected(true);
                setError(null);
                const waiters = readyWaitersRef.current;
                readyWaitersRef.current = [];
                waiters.forEach((w) => w.resolve());
            } else if (state === 'auth_error') {
                setError('Autenticação NATS expirada ou recusada.');
                setIsConnected(false);
                setIsReady(false);
                const lost = readyWaitersRef.current;
                readyWaitersRef.current = [];
                lost.forEach((w) => w.reject(new Error('Autenticação NATS falhou')));
            } else if (state === 'disconnected') {
                setIsConnected(false);
                setIsReady(false);
            }
        });

        const handleMsg = (parsed: Record<string, unknown>) => {
            // proc.ready — o agente notifica que o subscribe em proc.req
            // está ativo (evita a race em que o primeiro request chega antes).
            if (parsed.status === 'ready' && !('requestId' in parsed)) {
                setIsReady(true);
                readyRef.current = true;
                readyCallbacksRef.current.forEach(cb => cb());
                return;
            }
            const rid = parsed.requestId;
            if (typeof rid === 'string' && pendingRef.current.has(rid)) {
                const pend = pendingRef.current.get(rid)!;
                pendingRef.current.delete(rid);
                pend.resolve(parsed as unknown as ProcResponse);
            }
        };

        // Falha de auth (JWT NATS expirado no meio da sessão): busca credencial
        // fresca e reconecta — em vez de auth_error terminal (mesmo padrão do
        // useFilesStream).
        let refreshing = false;
        const offAuth = typeof service.onAuthError === 'function'
            ? service.onAuthError(async () => {
                if (!mounted || !freshCredsRef.current || refreshing) return;
                refreshing = true;
                try {
                    const freshToken = await freshCredsRef.current!();
                    if (!mounted) return;
                    jwtRef.current = freshToken;
                    service.setPreSuppliedCredentials(buildCreds(freshToken));
                    await service.forceReconnect();
                } catch {
                    // onConnectionStateChange já reporta auth_error
                } finally {
                    refreshing = false;
                }
            })
            : () => {};

        // ── Caminho WebRTC: request/response pelo data channel ──
        //
        // O data channel é orientado a MENSAGEM, então cada requisição e cada resposta
        // inteira é uma mensagem — o mesmo contrato do .proc.req/.proc.resp, e o
        // pareamento continua sendo por requestId. O NATS NÃO é desligado: é o fallback
        // quando o canal não está utilizável.
        if (webrtcRef.current?.enabled) {
            webRtcPeerRef.current?.close();
            webRtcPeerRef.current = new RemoteWebRtcPeer({
                    config: webrtcRef.current,
                    channels: ['processes'],
                    sendSignal: (frame) => {
                        void service
                                .publish(webrtcInSubject, frame as unknown as Record<string, unknown>)
                                .catch(() => { /* best-effort */ });
                    },
                    onMessage: (label, buf) => {
                        if (label !== 'processes' || !mounted) return;
                        try {
                                // Mesma porta de entrada do .proc.resp: o pending é resolvido pelo
                                // requestId, então não importa por qual transporte a resposta veio.
                                handleMsg(JSON.parse(new TextDecoder().decode(buf)) as Record<string, unknown>);
                        } catch { /* frame inválido não pode derrubar a lista */ }
                    },
            });
            void service.subscribe(
                    webrtcOutSubject,
                    ((parsed: Record<string, unknown>) => {
                        if (!mounted) return;
                        void webRtcPeerRef.current?.handleSignal(JSON.stringify(parsed));
                    }) as never,
                    { connectIfNeeded: false },
            );
        }

        // Subscrições registradas ANTES do connect(): o connect() restaura os
        // SUBs a partir dos listeners e só depois emite 'connected' — nenhuma
        // resposta inicial (proc.ready/proc.resp) é perdida na corrida do mount.
        void service.subscribe(respSubject, handleMsg as never, { connectIfNeeded: false });
        void service.subscribe(readySubject, handleMsg as never, { connectIfNeeded: false });

        void (async () => {
            const ok = await service.connect();
            if (!mounted) return;
            if (!ok && mountedRef.current) {
                setIsConnected(false);
            }
        })();

        return () => {
            mounted = false;
            mountedRef.current = false;
            offState();
            offAuth();
            // Fecha o peer antes de derrubar o service: sem isto o data channel
            // sobreviveria ao unmount e seguraria a conexão ICE.
            webRtcPeerRef.current?.close();
            webRtcPeerRef.current = null;
            readyRef.current = false;
            try {
                service.unsubscribe(respSubject, handleMsg as never);
                service.unsubscribe(readySubject, handleMsg as never);
            } catch { /* teardown best-effort */ }

            // Rejeita waiters/pedidos pendentes: os timers são limpos agora
            // (clearTimeout) em vez de sobreviverem ao unmount.
            const waiters = readyWaitersRef.current;
            readyWaitersRef.current = [];
            waiters.forEach((w) => w.reject(new Error('Stream de processos desmontado')));

            const pending = Array.from(pendingRef.current.values());
            pendingRef.current.clear();
            pending.forEach((p) => p.reject(new Error('Stream de processos desmontado')));

            if (serviceRef.current === service) serviceRef.current = null;
            void service.dispose().catch(() => { /* teardown best-effort */ });
        };
    }, [natsUrl, jwt, nkeySeed, subj, reqSubject, respSubject, readySubject]);


    const send = useCallback(async (action: string, extra?: Record<string, unknown>): Promise<ProcResponse> => {
        // Se o service ainda não conectou (mount antes do handshake), espera em
        // vez de falhar — era isso que fazia a lista nunca carregar.
        if (!serviceRef.current || !serviceRef.current.isConnected()) {
            await waitForReady();
        }
        return new Promise((resolve, reject) => {
            const service = serviceRef.current;
            if (!service || !service.isConnected()) { reject(new Error('NATS offline')); return; }
            const rid = nextReqId();
            const timer = setTimeout(() => {
                if (pendingRef.current.has(rid)) {
                    pendingRef.current.delete(rid);
                    reject(new Error('Timeout'));
                }
            }, 60000);
            pendingRef.current.set(rid, {
                resolve: (r) => { clearTimeout(timer); resolve(r); },
                reject: (e) => { clearTimeout(timer); reject(e); },
            });
            const pl = JSON.stringify({
                version: 1,
                requestId: rid,
                action,
                ...(extra ?? {}),
            });
            // Data channel PRIMEIRO; NATS como fallback. O pending já está registrado,
            // então qualquer um dos dois resolve o MESMO pedido pelo requestId — não há
            // estado novo de correlação para manter.
            const peer = webRtcPeerRef.current;
            if (readyRef.current && peer && peer.isChannelOpen('processes') && peer.send('processes', pl)) {
                return;
            }
            void service.publish(reqSubject, JSON.parse(pl)).catch((e: Error) => {
                pendingRef.current.delete(rid);
                reject(e);
            });
        });
    }, [reqSubject, waitForReady]);

    const onReady = useCallback((callback: () => void) => {
        readyCallbacksRef.current.add(callback);
        return () => { readyCallbacksRef.current.delete(callback); };
    }, []);

    return { isConnected, isReady, error, onReady, send };
}