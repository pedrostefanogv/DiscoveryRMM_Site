import { useRef, useEffect, useState, useCallback } from 'react';
import {
    createNatsService,
    jwtExpiresAtUtc,
    type NatsCredentialsResponse,
    type NatsService,
} from '@/api/nats';
import type { RemoteSessionResponse } from '@/api/remote-sessions';
import { RemoteWebRtcPeer } from '@/modules/remote-shared/webrtcPeer';
import {
    decodeBinaryFileFrame,
    encodeBinaryFileFrame,
    isBinaryFileFrame,
} from './fileFrameCodec';

export {
    decodeBinaryFileFrame,
    encodeBinaryFileFrame,
    isBinaryFileFrame,
} from './fileFrameCodec';

interface UseFilesStreamOptions {
    natsSubject: string;
    natsUrl: string;
    jwt: string;
    /** Seed NKey do viewer (credencial escopada da sessão). */
    nkeySeed?: string;
    /** Callback para renovar o JWT NATS escopado antes ou após expiração (60 min). */
    getFreshCredentials?: () => Promise<string>;
    /** Configuração WebRTC efetiva da sessão. */
    webrtc?: RemoteSessionResponse['webrtc'];
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
    /** Indica suporte do agente a frames binários 'DF'. */
    supportsBinary?: boolean;
    binaryFrames?: boolean;
    /** Indica que o agente e o JWT permitem o canal dedicado .files.data. */
    dataSubject?: boolean;
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
    /** Dados binários do chunk (Uint8Array em frames 'DF', base64 string no Go ou number[] legado). */
    data?: string | number[] | Uint8Array;
    size?: number;
    totalChunks?: number;
    chunkIndex?: number;
    requestId?: string;
}

const textDecoder = new TextDecoder();

/** Decodifica o payload binário da resposta (Uint8Array 'DF', base64 string do Go ou number[] legado). */
export function decodeFileData(data: string | number[] | Uint8Array | undefined): Uint8Array {
    if (!data) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data;
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

interface RawCapableNatsService {
    subscribeRaw?: (
        subject: string,
        callback: (data: Uint8Array) => void,
        options?: { connectIfNeeded?: boolean },
    ) => Promise<boolean>;
    unsubscribeRaw?: (subject: string, callback: (data: Uint8Array) => void) => void;
    publishRaw?: (subject: string, data: Uint8Array) => Promise<void>;
}

export function useFilesStream({
    natsSubject,
    natsUrl,
    jwt,
    nkeySeed = '',
    getFreshCredentials,
    webrtc,
}: UseFilesStreamOptions): UseFilesStreamReturn {
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
    const webRtcPeerRef = useRef<RemoteWebRtcPeer | null>(null);
    const webrtcRef = useRef(webrtc);
    webrtcRef.current = webrtc;
    const jwtRef = useRef(jwt);
    const freshCredsRef = useRef(getFreshCredentials);
    freshCredsRef.current = getFreshCredentials;
    const agentSupportsBinaryRef = useRef(false);
    const agentDataSubjectRef = useRef(false);

    const subj = natsSubject.replace(/-/g, '');
    const reqSubject = `${subj}.files.req`;
    const respSubject = `${subj}.files.resp`;
    const dataSubject = `${subj}.files.data`;
    const readySubject = `${subj}.files.ready`;
    const progressSubject = `${subj}.files.progress`;
    const webrtcInSubject = `${subj}.webrtc.in`;
    const webrtcOutSubject = `${subj}.webrtc.out`;

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
        let mounted = true;
        mountedRef.current = true;
        agentSupportsBinaryRef.current = false;
        agentDataSubjectRef.current = false;

        const subjectAllowList = [respSubject, readySubject, progressSubject, webrtcOutSubject];
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
                if (freshCredsRef.current) {
                    const freshToken = await freshCredsRef.current();
                    jwtRef.current = freshToken;
                    return buildCreds(freshToken);
                }
                return buildCreds(jwtRef.current);
            },
            scopeMode: 'preserve',
        });
        serviceRef.current = service;
        service.setPreSuppliedCredentials(buildCreds(jwt));

        let webRtcStarted = false;
        const offState = service.onConnectionStateChange((state) => {
            if (!mounted || !mountedRef.current) return;
            if (state === 'connected') {
                setIsConnected(true);
                setError(null);
                const waiters = readyWaitersRef.current;
                readyWaitersRef.current = [];
                waiters.forEach((w) => w.resolve());
                if (!webRtcStarted && webrtcRef.current?.enabled && webRtcPeerRef.current) {
                    webRtcStarted = true;
                    void webRtcPeerRef.current.start();
                }
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

        // Sessões >60 min: JWT NATS expira e auth_error dispara renovação via callback.
        let refreshing = false;
        const offAuth = typeof service.onAuthError === 'function'
            ? service.onAuthError(async () => {
                if (!mounted || !freshCredsRef.current || refreshing) return;
                refreshing = true;
                try {
                    const freshToken = await freshCredsRef.current();
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

        const resolvePendingResponse = (r: FilesResponse) => {
            if (!mounted) return;
            const rid = r.requestId;
            if (rid && pendingRef.current.has(rid)) {
                const pend = pendingRef.current.get(rid)!;
                pendingRef.current.delete(rid);
                pend.resolve(r);
            }
        };

        const handleResp = (parsed: Record<string, unknown>) => {
            resolvePendingResponse(parsed as unknown as FilesResponse);
        };

        const handleRespRaw = (rawBytes: Uint8Array) => {
            if (!mounted) return;
            if (isBinaryFileFrame(rawBytes)) {
                const decoded = decodeBinaryFileFrame(rawBytes);
                if (!decoded) return;
                // NÃO marca suporte a PUT binário aqui: frames binários de
                // RESPOSTA (download) não são o handshake de upload — o modo
                // binário de envio é negociado apenas via files.ready
                // (supportsBinary/binaryFrames/dataSubject).
                const resp: FilesResponse = {
                    ...(decoded.header as unknown as FilesResponse),
                    data: decoded.data,
                };
                resolvePendingResponse(resp);
                return;
            }
            try {
                const parsed = JSON.parse(textDecoder.decode(rawBytes)) as FilesResponse;
                resolvePendingResponse(parsed);
            } catch {
                // ignora frame malformado
            }
        };

        const rawService = service as unknown as RawCapableNatsService;
        const hasRawSub = typeof rawService.subscribeRaw === 'function';
        let dataSubActive = false;

        const handleReady = (parsed: Record<string, unknown>) => {
            if (!mounted) return;
            const info = parsed as unknown as FilesReadyInfo;
            if (info.supportsBinary === true || info.binaryFrames === true) {
                agentSupportsBinaryRef.current = true;
            }
            if (info.dataSubject === true && !dataSubActive && hasRawSub && rawService.subscribeRaw) {
                agentDataSubjectRef.current = true;
                dataSubActive = true;
                if (!subjectAllowList.includes(dataSubject)) {
                    subjectAllowList.push(dataSubject);
                }
                void rawService.subscribeRaw(dataSubject, handleRespRaw, { connectIfNeeded: false });
            }
            readyCallbacksRef.current.forEach((cb) => cb(info));
        };
        const handleProgress = (parsed: Record<string, unknown>) => {
            if (!mounted) return;
            progressCallbacksRef.current.forEach((cb) => cb(parsed as unknown as FilesProgressInfo));
        };

        const handleWebRtcOutRaw = (raw: Uint8Array) => {
            if (!mounted) return;
            void webRtcPeerRef.current?.handleSignal(textDecoder.decode(raw));
        };
        const handleWebRtcOutJson = (parsed: Record<string, unknown>) => {
            if (!mounted) return;
            void webRtcPeerRef.current?.handleSignal(JSON.stringify(parsed));
        };
        if (webrtcRef.current?.enabled) {
            webRtcPeerRef.current?.close();
            webRtcPeerRef.current = new RemoteWebRtcPeer({
                config: webrtcRef.current,
                channels: ['files'],
                sendSignal: (frame) => {
                    void service.publish(webrtcInSubject, frame as unknown as Record<string, unknown>).catch(() => {});
                },
                onMessage: (label, buf) => {
                    if (label === 'files' && mounted) {
                        handleRespRaw(new Uint8Array(buf));
                    }
                },
            });
            if (hasRawSub && rawService.subscribeRaw) {
                void rawService.subscribeRaw(webrtcOutSubject, handleWebRtcOutRaw, { connectIfNeeded: false });
            } else {
                void service.subscribe(webrtcOutSubject, handleWebRtcOutJson as never, { connectIfNeeded: false });
            }
        }

        // Registra subscrições ANTES do connect() para que restoreSubscriptions()
        // ative todos os listeners antes do estado 'connected' ser emitido.
        if (hasRawSub && rawService.subscribeRaw) {
            void rawService.subscribeRaw(respSubject, handleRespRaw, { connectIfNeeded: false });
        } else {
            void service.subscribe(respSubject, handleResp as never, { connectIfNeeded: false });
        }
        void service.subscribe(readySubject, handleReady as never, { connectIfNeeded: false });
        void service.subscribe(progressSubject, handleProgress as never, { connectIfNeeded: false });

        void (async () => {
            if (!mounted) return;
            await service.connect();
        })();

        const waitersRef = readyWaitersRef;
        const pendingMapRef = pendingRef;

        return () => {
            mounted = false;
            mountedRef.current = false;
            offState();
            offAuth();
            if (hasRawSub && typeof rawService.unsubscribeRaw === 'function') {
                rawService.unsubscribeRaw(respSubject, handleRespRaw);
                if (dataSubActive) {
                    rawService.unsubscribeRaw(dataSubject, handleRespRaw);
                }
                rawService.unsubscribeRaw(webrtcOutSubject, handleWebRtcOutRaw);
            } else {
                service.unsubscribe(respSubject, handleResp as never);
                service.unsubscribe(webrtcOutSubject, handleWebRtcOutJson as never);
            }
            webRtcPeerRef.current?.close();
            webRtcPeerRef.current = null;
            service.unsubscribe(readySubject, handleReady as never);
            service.unsubscribe(progressSubject, handleProgress as never);

            const waiters = waitersRef.current;
            waitersRef.current = [];
            waiters.forEach((w) => w.reject(new Error('Stream de arquivos desmontado')));

            const pending = Array.from(pendingMapRef.current.values());
            pendingMapRef.current.clear();
            pending.forEach((p) => p.reject(new Error('Stream de arquivos desmontado')));

            if (serviceRef.current === service) serviceRef.current = null;
            void service.dispose().catch(() => { /* teardown best-effort */ });
        };
    }, [natsUrl, jwt, nkeySeed, subj, reqSubject, respSubject, dataSubject, readySubject, progressSubject]);

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

            const headerPayload: Record<string, unknown> = {
                version: 1,
                requestId: rid,
                action,
                path,
                ...(extra ?? {}),
            };
            const rawService = service as unknown as RawCapableNatsService;
            const targetPutSubject = agentDataSubjectRef.current ? dataSubject : reqSubject;

            const handlePublishError = (e: Error) => {
                const pend = pendingRef.current.get(rid);
                if (pend) {
                    pendingRef.current.delete(rid);
                    pend.reject(e);
                } else {
                    clearTimeout(timer);
                    reject(e);
                }
            };

            if (
                action === 'put' &&
                agentSupportsBinaryRef.current &&
                typeof rawService.publishRaw === 'function'
            ) {
                const frame = encodeBinaryFileFrame(headerPayload, data);
                if (webRtcPeerRef.current?.send('files', frame)) {
                    return;
                }
                void rawService.publishRaw(targetPutSubject, frame).catch(handlePublishError);
                return;
            }

            const jsonPayload: Record<string, unknown> = {
                ...headerPayload,
                // Envia como base64 string — o agent Go decodifica para []byte.
                // Array de números estouraria o payload NATS (2MB) para chunks grandes.
                ...(data && data.length > 0 ? { data: bytesToBase64(data) } : {}),
            };
            if (webRtcPeerRef.current?.send('files', JSON.stringify(jsonPayload))) {
                return;
            }
            void service.publish(reqSubject, jsonPayload).catch(handlePublishError);
        });
    }, [dataSubject, reqSubject, waitForReady]);

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