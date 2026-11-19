import { useRef, useEffect, useState, useCallback } from 'react';
import {
    createNatsService,
    jwtExpiresAtUtc,
    type NatsCredentialsResponse,
    type NatsService,
} from '@/api/nats';
import { REGISTRY_PROTOCOL_VERSION, type RegistryAction, type RegistryResponse } from './registryTypes';

// ─────────────────────────────────────────────────────────────────────────────
// STREAM NATS do editor de Registro.
//
// Espelha deliberadamente useProcessesStream (mesmo desenho, mesmas correções):
//   - SUBs registradas ANTES do connect() — nenhuma resposta inicial se perde;
//   - waiters de "pronto" para envios disparados antes do handshake;
//   - renovação de JWT no auth_error em vez de falha terminal;
//   - rejeição de pendentes no unmount (timers limpos, sem vazar).
//
// A diferença de contrato está só nos subjects (.registry.*) e no tipo da
// resposta. Duplicar o hook em vez de generalizar foi uma escolha: os outros
// módulos já seguem este padrão, e uma abstração única para 7 módulos com
// contratos diferentes seria mais frágil que a repetição.
// ─────────────────────────────────────────────────────────────────────────────

interface UseRegistryStreamOptions {
    natsSubject: string;
    natsUrl: string;
    jwt: string;
    nkeySeed?: string;
    getFreshCredentials?: () => Promise<string>;
}

export interface UseRegistryStreamReturn {
    isConnected: boolean;
    isReady: boolean;
    error: string | null;
    /** Versão do protocolo anunciada pelo agente no .registry.ready. */
    agentProtocolVersion: number | null;
    onReady: (callback: () => void) => () => void;
    /** Envia uma requisição e resolve quando a resposta correlacionada chega. */
    send: (action: RegistryAction, extra?: Record<string, unknown>) => Promise<RegistryResponse>;
}

let _seq = 0;
function nextReqId(): string {
    _seq += 1;
    return `r${Date.now().toString(36)}${_seq}`;
}

/**
 * Timeout por requisição.
 *
 * 60 s é o mesmo valor do stream de processos. Exportar uma operação grande
 * (export de subárvore) pode demorar; 60 s é folgado o bastante sem deixar a UI
 * pendurada para sempre num agente que sumiu.
 */
const REQUEST_TIMEOUT_MS = 60_000;

export function useRegistryStream({
    natsSubject,
    natsUrl,
    jwt,
    nkeySeed = '',
    getFreshCredentials,
}: UseRegistryStreamOptions): UseRegistryStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [agentProtocolVersion, setAgentProtocolVersion] = useState<number | null>(null);

    const pendingRef = useRef<Map<string, { resolve: (r: RegistryResponse) => void; reject: (e: Error) => void }>>(new Map());
    const readyCallbacksRef = useRef<Set<() => void>>(new Set());
    const mountedRef = useRef(true);
    const readyWaitersRef = useRef<Array<{ resolve: () => void; reject: (e: Error) => void }>>([]);

    const waitForReady = useCallback((timeoutMs = 10_000) => new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            readyWaitersRef.current = readyWaitersRef.current.filter((w) => w.resolve !== resolve);
            reject(new Error('Timeout aguardando conexão NATS'));
        }, timeoutMs);
        readyWaitersRef.current.push({
            resolve: () => { clearTimeout(timer); resolve(); },
            reject: (e: Error) => { clearTimeout(timer); reject(e); },
        });
    }), []);

    // O agente remove hífens do subject; o viewer precisa usar a MESMA forma ou
    // publica em um subject que ninguém assina (mesma normalização dos outros hooks).
    const subj = natsSubject.replace(/-/g, '');
    const reqSubject = `${subj}.registry.req`;
    const respSubject = `${subj}.registry.resp`;
    const readySubject = `${subj}.registry.ready`;

    const serviceRef = useRef<NatsService | null>(null);
    const jwtRef = useRef(jwt);
    const freshCredsRef = useRef(getFreshCredentials);
    freshCredsRef.current = getFreshCredentials;

    useEffect(() => { jwtRef.current = jwt; }, [jwt]);

    useEffect(() => {
        let mounted = true;
        mountedRef.current = true;
        // Captura o Map no corpo do efeito: a cleanup roda muito depois, e ler
        // pendingRef.current lá dentro pegaria o valor do ref no momento da
        // desmontagem (que pode ser outro) em vez do Map que este efeito criou.
        const pending = pendingRef.current;
        const subjectAllowList = [respSubject, readySubject];
        const buildCreds = (token: string): NatsCredentialsResponse => ({
            jwt: token,
            nkeySeed,
            publicKey: '',
            expiresAtUtc: jwtExpiresAtUtc(token),
            publishSubjects: [reqSubject],
            subscribeSubjects: subjectAllowList,
        });

        const service = createNatsService({
            url: natsUrl,
            enabled: true,
            authMode: 'jwt_credentials',
            credentialsProvider: async () => {
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
            // registry.ready — o agente avisa que o subscribe está ativo. Sem
            // esperar por isto o primeiro listKey se perde na corrida (o NATS
            // core não tem replay) e a árvore aparece vazia.
            if (parsed.status === 'ready' && !('requestId' in parsed)) {
                if (typeof parsed.version === 'number') {
                    setAgentProtocolVersion(parsed.version);
                }
                setIsReady(true);
                readyCallbacksRef.current.forEach((cb) => cb());
                return;
            }
            const rid = parsed.requestId;
            if (typeof rid === 'string' && pendingRef.current.has(rid)) {
                const pend = pendingRef.current.get(rid)!;
                pendingRef.current.delete(rid);
                pend.resolve(parsed as unknown as RegistryResponse);
            }
        };

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

        void service.subscribe(respSubject, handleMsg as never, { connectIfNeeded: false });
        void service.subscribe(readySubject, handleMsg as never, { connectIfNeeded: false });

        void (async () => {
            const ok = await service.connect();
            if (!mounted) return;
            if (!ok && mountedRef.current) setIsConnected(false);
        })();

        return () => {
            mounted = false;
            mountedRef.current = false;
            offState();
            offAuth();
            try {
                service.unsubscribe(respSubject, handleMsg as never);
                service.unsubscribe(readySubject, handleMsg as never);
            } catch { /* teardown best-effort */ }

            const waiters = readyWaitersRef.current;
            readyWaitersRef.current = [];
            waiters.forEach((w) => w.reject(new Error('Stream de registro desmontado')));

            const inFlight = Array.from(pending.values());
            pending.clear();
            inFlight.forEach((p) => p.reject(new Error('Stream de registro desmontado')));

            if (serviceRef.current === service) serviceRef.current = null;
            void service.dispose().catch(() => { /* teardown best-effort */ });
        };
    }, [natsUrl, jwt, nkeySeed, subj, reqSubject, respSubject, readySubject]);

    const send = useCallback(async (
        action: RegistryAction,
        extra?: Record<string, unknown>,
    ): Promise<RegistryResponse> => {
        if (!serviceRef.current || !serviceRef.current.isConnected()) {
            await waitForReady();
        }
        return new Promise((resolve, reject) => {
            const service = serviceRef.current;
            if (!service || !service.isConnected()) {
                reject(new Error('NATS offline'));
                return;
            }
            const rid = nextReqId();
            const timer = setTimeout(() => {
                if (pendingRef.current.has(rid)) {
                    pendingRef.current.delete(rid);
                    reject(new Error('Timeout'));
                }
            }, REQUEST_TIMEOUT_MS);
            pendingRef.current.set(rid, {
                resolve: (r) => { clearTimeout(timer); resolve(r); },
                reject: (e) => { clearTimeout(timer); reject(e); },
            });
            const payload = JSON.stringify({
                version: REGISTRY_PROTOCOL_VERSION,
                requestId: rid,
                action,
                ...(extra ?? {}),
            });
            void service.publish(reqSubject, JSON.parse(payload)).catch((e: Error) => {
                pendingRef.current.delete(rid);
                clearTimeout(timer);
                reject(e);
            });
        });
    }, [reqSubject, waitForReady]);

    const onReady = useCallback((callback: () => void) => {
        readyCallbacksRef.current.add(callback);
        return () => { readyCallbacksRef.current.delete(callback); };
    }, []);

    return { isConnected, isReady, error, agentProtocolVersion, onReady, send };
}
