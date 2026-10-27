import { useRef, useEffect, useState, useCallback } from 'react';
import {
    createNatsService,
    type NatsCredentialsResponse,
    type NatsService,
} from '@/api/nats';

interface UseFilesStreamOptions {
    natsSubject: string;
    natsUrl: string;
    jwt: string;
    /** Seed NKey do viewer (credencial escopada da sessão). */
    nkeySeed?: string;
}

interface UseFilesStreamReturn {
    isConnected: boolean;
    sendRequest: (action: string, path: string, data?: Uint8Array, extra?: Record<string, unknown>) => Promise<FilesResponse>;
    /** Callback disparado quando o agente publica files.ready (ex.: rootPath efetivo). */
    onReady: (callback: (info: FilesReadyInfo) => void) => () => void;
    /** Callback disparado quando o agente publica files.progress (copy/move/zip/unzip). */
    onProgress: (callback: (info: FilesProgressInfo) => void) => () => void;
    error: string | null;
}

export interface FilesReadyInfo {
    rootPath?: string;
    status?: string;
    /** Unidades lógicas do host remoto (C:, D:, ...). Ausente/null quando a
     *  sessão tem sandbox restrito a uma subpasta (sem troca de disco). */
    drives?: DriveInfo[] | null;
}

/** Unidade lógica devolvida pelo agent na ação "drives"/files.ready. */
export interface DriveInfo {
    /** Letra da unidade, ex.: "C:". */
    name: string;
    /** Raiz navegável, ex.: "C:\\". */
    root: string;
    label?: string;
    fileSystem?: string;
    /** fixed | removable | network | cdrom | ramdisk | unknown */
    type?: string;
    totalBytes?: number;
    freeBytes?: number;
    /** false para unidades sem mídia (ex.: leitor de CD vazio). */
    ready?: boolean;
}

export interface FilesProgressInfo {
    requestId?: string;
    loaded?: number;
    total?: number;
}

export interface FilesResponse {
    success: boolean;
    error?: string;
    entries?: { name: string; path: string; isDir: boolean; size: number; modTime: string; isLink?: boolean; linkTarget?: string; isHidden?: boolean }[];
    /** Presente na resposta da ação "drives". */
    drives?: DriveInfo[];
    /** Dados binários do chunk. O agent Go serializa []byte como base64 string;
     *  mantém number[] como fallback para compatibilidade legada. */
    data?: string | number[];
    size?: number;
    totalChunks?: number;
    chunkIndex?: number;
    requestId?: string;
}

/** Decodifica o payload binário da resposta (base64 string do Go ou number[] legado). */
export function decodeFileData(data: string | number[] | undefined): Uint8Array {
    if (!data) return new Uint8Array(0);
    if (typeof data === 'string') {
        try {
            const binary = atob(data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return bytes;
        } catch {
            return new Uint8Array(0);
        }
    }
    return new Uint8Array(data);
}

/** Converte bytes em base64 (o agent Go decodifica base64 → []byte). */
function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000; // evita stack overflow com spread em buffers grandes
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

let _seq = 0;
function nextReqId() { return `f${++_seq}`; }

export function useFilesStream({ natsSubject, natsUrl, jwt, nkeySeed = '' }: UseFilesStreamOptions): UseFilesStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pendingRef = useRef<Map<string, { resolve: (r: FilesResponse) => void; reject: (e: Error) => void }>>(new Map());
    const readyCallbacksRef = useRef<Set<(info: FilesReadyInfo) => void>>(new Set());
    const progressCallbacksRef = useRef<Set<(info: FilesProgressInfo) => void>>(new Set());
    const mountedRef = useRef(true);
    // Waiters resolvidos quando o handshake NATS completa (+OK): permite
    // enfileirar envios feitos antes do socket estar pronto em vez de falhar
    // com "WebSocket offline" (a lista nunca carregava).
    const readyWaitersRef = useRef<Array<{ resolve: () => void; reject: (e: Error) => void }>>([]);

    // Transporte nats.js (NatsService): o mesmo cliente comprovado no trace
    // do servidor (Cloudflare → túnel → auth callout → entrega).
    const serviceRef = useRef<NatsService | null>(null);
    const jwtRef = useRef(jwt);
    const subj = natsSubject.replace(/-/g, '');
    const reqSubject = `${subj}.files.req`;
    const respSubject = `${subj}.files.resp`;
    const readySubject = `${subj}.files.ready`;
    const progressSubject = `${subj}.files.progress`;

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

    useEffect(() => { jwtRef.current = jwt; }, [jwt]);

    // ── Transporte NatsService ──
    useEffect(() => {
        const subjectAllowList = [respSubject, readySubject, progressSubject];
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
                const lost = readyWaitersRef.current;
                readyWaitersRef.current = [];
                lost.forEach((w) => w.reject(new Error('Autenticação NATS falhou')));
            } else if (state === 'disconnected') {
                setIsConnected(false);
            }
        });

        const handleResp = (parsed: Record<string, unknown>) => {
            const r = parsed as unknown as FilesResponse;
            const rid = r.requestId;
            if (rid && pendingRef.current.has(rid)) {
                const pend = pendingRef.current.get(rid)!;
                pendingRef.current.delete(rid);
                pend.resolve(r);
            }
        };
        const handleReady = (parsed: Record<string, unknown>) => {
            readyCallbacksRef.current.forEach(cb => cb(parsed as unknown as FilesReadyInfo));
        };
        const handleProgress = (parsed: Record<string, unknown>) => {
            progressCallbacksRef.current.forEach(cb => cb(parsed as unknown as FilesProgressInfo));
        };

        void (async () => {
            await service.connect();
            if (!mountedRef.current) return;
            await service.subscribe(respSubject, handleResp as never);
            await service.subscribe(readySubject, handleReady as never);
            await service.subscribe(progressSubject, handleProgress as never);
        })();

        return () => {
            offState();
            if (serviceRef.current === service) serviceRef.current = null;
            void service.dispose().catch(() => { /* teardown best-effort */ });
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [natsUrl, jwt, nkeySeed, subj, reqSubject, respSubject, readySubject, progressSubject]);



    const sendRequest = useCallback(async (action: string, path: string, data?: Uint8Array, extra?: Record<string, unknown>): Promise<FilesResponse> => {
        // Aguarda o handshake NATS em vez de falhar quando o service ainda
        // não conectou (load disparado no mount).
        if (!serviceRef.current || !serviceRef.current.isConnected()) {
            await waitForReady();
        }
        return new Promise((resolve, reject) => {
            const service = serviceRef.current;
            if (!service || !service.isConnected()) { reject(new Error('NATS offline')); return; }
            const rid = nextReqId();
            // Timeout por request: o timer é limpo ao resolver/rejeitar, evitando
            // acúmulo de timers órfãos em transferências com milhares de chunks.
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
                path,
                // Envia como base64 string — o agent Go decodifica para []byte.
                // Array de números estouraria o payload NATS (2MB) para chunks grandes.
                ...(data && data.length > 0 ? { data: bytesToBase64(data) } : {}),
                ...(extra ?? {}),
            });
            void service.publish(reqSubject, JSON.parse(pl)).catch((e: Error) => {
                pendingRef.current.delete(rid);
                reject(e);
            });
        });
    }, [reqSubject, waitForReady]);

    const onReady = useCallback((callback: (info: FilesReadyInfo) => void) => {
        readyCallbacksRef.current.add(callback);
        return () => { readyCallbacksRef.current.delete(callback); };
    }, []);

    const onProgress = useCallback((callback: (info: FilesProgressInfo) => void) => {
        progressCallbacksRef.current.add(callback);
        return () => { progressCallbacksRef.current.delete(callback); };
    }, []);

    return { isConnected, sendRequest, onReady, onProgress, error };
}