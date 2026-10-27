import { useRef, useEffect, useState, useCallback } from 'react';
import {
    createNatsService,
    type NatsCredentialsResponse,
    type NatsService,
} from '@/api/nats';

interface UseProcessesStreamOptions {
    natsSubject: string;
    natsUrl: string;
    jwt: string;
    /** Seed NKey do viewer (credencial escopada da sessão). */
    nkeySeed?: string;
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

export function useProcessesStream({ natsSubject, natsUrl, jwt, nkeySeed = '' }: UseProcessesStreamOptions): UseProcessesStreamReturn {
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
    const jwtRef = useRef(jwt);
    const subj = natsSubject.replace(/-/g, '');
    const reqSubject = `${subj}.proc.req`;
    const respSubject = `${subj}.proc.resp`;
    const readySubject = `${subj}.proc.ready`;

    useEffect(() => { jwtRef.current = jwt; }, [jwt]);

    useEffect(() => {
        const subjectAllowList = [respSubject, readySubject];
        const buildCreds = (token: string): NatsCredentialsResponse => ({
            jwt: token,
            nkeySeed,
            publicKey: '',
            expiresAtUtc: new Date(Date.now() + 60 * 60_000).toISOString(),
            publishSubjects: [reqSubject],
            subscribeSubjects: subjectAllowList,
        });
        const service = createNatsService({
            url: natsUrl,
            enabled: true,
            authMode: 'jwt_credentials',
            credentialsProvider: async () => buildCreds(jwtRef.current),
            scopeMode: 'preserve',
        });
        serviceRef.current = service;
        service.setPreSuppliedCredentials(buildCreds(jwt));

        const offState = service.onConnectionStateChange((state) => {
            if (!mountedRef.current) return;
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

        void (async () => {
            await service.connect();
            if (!mountedRef.current) return;
            await service.subscribe(respSubject, handleMsg as never);
            await service.subscribe(readySubject, handleMsg as never);
        })();

        return () => {
            offState();
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