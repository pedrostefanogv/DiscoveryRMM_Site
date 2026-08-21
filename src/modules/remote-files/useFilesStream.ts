import { useRef, useEffect, useState, useCallback } from 'react';

interface UseFilesStreamOptions {
    natsSubject: string;
    natsUrl: string;
    jwt: string;
}

interface UseFilesStreamReturn {
    isConnected: boolean;
    sendRequest: (action: string, path: string, data?: Uint8Array, extra?: Record<string, unknown>) => Promise<FilesResponse>;
    /** Callback disparado quando o agente publica files.ready (ex.: rootPath efetivo). */
    onReady: (callback: (info: FilesReadyInfo) => void) => () => void;
    error: string | null;
}

export interface FilesReadyInfo {
    rootPath?: string;
    status?: string;
}

export interface FilesResponse {
    success: boolean;
    error?: string;
    entries?: { name: string; path: string; isDir: boolean; size: number; modTime: string }[];
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

const CRLF = new Uint8Array([13, 10]);

function appendBytes(left: Uint8Array<ArrayBufferLike>, right: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
    const result = new Uint8Array(left.length + right.length);
    result.set(left);
    result.set(right, left.length);
    return result;
}

function findCrlf(data: Uint8Array<ArrayBufferLike>): number {
    for (let i = 0; i <= data.length - CRLF.length; i++) {
        if (data[i] === CRLF[0] && data[i + 1] === CRLF[1]) return i;
    }
    return -1;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

export function useFilesStream({ natsSubject, natsUrl, jwt }: UseFilesStreamOptions): UseFilesStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const pendingRef = useRef<Map<string, { resolve: (r: FilesResponse) => void; reject: (e: Error) => void }>>(new Map());
    const readyCallbacksRef = useRef<Set<(info: FilesReadyInfo) => void>>(new Set());
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    // Normaliza UUIDs (remove hífens) para bater com o Agent (stripHyphens)
    const subj = natsSubject.replace(/-/g, '');
    const reqSubject = `${subj}.files.req`;
    const respSubject = `${subj}.files.resp`;
    const readySubject = `${subj}.files.ready`;

    const connect = useCallback(() => {
        if (!mountedRef.current || !subj || !natsUrl || !jwt) return;
        try {
            const ws = new WebSocket(`${natsUrl}?access_token=${encodeURIComponent(jwt)}`);
            ws.binaryType = 'arraybuffer';
            wsRef.current = ws;

            let protocolBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array();
            let connectSent = false;
            let authenticated = false;

            const sendProtocol = (cmd: string) => ws?.send(new TextEncoder().encode(`${cmd}\r\n`));

            const processProtocol = () => {
                const decoder = new TextDecoder();
                while (mountedRef.current) {
                    const lineEnd = findCrlf(protocolBuffer);
                    if (lineEnd < 0) return;

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
                        const ps = lineEnd + 2;
                        const pe = ps + plN;
                        if (protocolBuffer.length < pe + 2) return;

                        const payload = decoder.decode(protocolBuffer.slice(ps, pe));
                        protocolBuffer = protocolBuffer.slice(pe + 2);

                        try {
                            const parsed = JSON.parse(payload) as Record<string, unknown>;
                            // files.ready — o agente notifica que o subscribe em files.req
                            // está ativo (evita a race em que o primeiro list chega antes).
                            if (parsed && typeof parsed === 'object' && 'status' in parsed && !('requestId' in parsed)) {
                                readyCallbacksRef.current.forEach(cb => cb(parsed as unknown as FilesReadyInfo));
                                continue;
                            }
                            const r = parsed as unknown as FilesResponse;
                            // O requestId está no PAYLOAD JSON (não no header MSG).
                            const rid = r.requestId;
                            if (rid && pendingRef.current.has(rid)) {
                                const pend = pendingRef.current.get(rid)!;
                                pendingRef.current.delete(rid);
                                pend.resolve(r);
                            }
                        } catch { /* payload não-JSON — ignora */ }
                        continue;
                    }

                    protocolBuffer = protocolBuffer.slice(lineEnd + 2);

                    if (tokens[0] === 'INFO') {
                        sendProtocol(`CONNECT ${JSON.stringify({ lang: 'discovery-web', version: '1.0', protocol: 1, headers: true, verbose: true, auth_token: jwt })}`);
                        connectSent = true;
                        continue;
                    }

                    if (tokens[0] === '+OK') {
                        if (connectSent && !authenticated) {
                            authenticated = true;
                            reconnectAttemptsRef.current = 0;
                            setIsConnected(true);
                            setError(null);
                            sendProtocol(`SUB ${respSubject} 1`);
                            sendProtocol(`SUB ${readySubject} 2`);
                        }
                        continue;
                    }

                    if (tokens[0] === 'PING') { sendProtocol('PONG'); continue; }
                    if (tokens[0] === '-ERR') {
                        setError(`NATS: ${line.replace(/^-ERR\s*/i, '').replace(/^['"]|['"]$/g, '')}`);
                        ws?.close(4000, 'NATS protocol error');
                        return;
                    }
                }
            };

            ws.onopen = () => { /* aguarda INFO */ };

            ws.onmessage = (event) => {
                if (!mountedRef.current) return;
                const bytes = typeof event.data === 'string'
                    ? new Uint8Array(new TextEncoder().encode(event.data))
                    : event.data instanceof ArrayBuffer
                        ? new Uint8Array(event.data)
                        : new Uint8Array();
                if (bytes.length === 0) return;
                protocolBuffer = appendBytes(protocolBuffer, bytes);
                processProtocol();
            };

            ws.onerror = () => { /* tratado no onclose */ };

            ws.onclose = () => {
                if (!mountedRef.current) return;
                setIsConnected(false);
                // Rejeita pendentes para não deixar promises presas
                pendingRef.current.forEach((pend) => pend.reject(new Error('Conexão NATS perdida')));
                pendingRef.current.clear();
                if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                    const delay = RECONNECT_DELAYS[reconnectAttemptsRef.current] ?? RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1];
                    reconnectTimerRef.current = setTimeout(() => {
                        reconnectAttemptsRef.current++;
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
    }, [natsUrl, jwt, subj, respSubject, readySubject]);

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

    const sendRequest = useCallback((action: string, path: string, data?: Uint8Array, extra?: Record<string, unknown>): Promise<FilesResponse> => {
        return new Promise((resolve, reject) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) { reject(new Error('WebSocket offline')); return; }
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
            const bytes = new TextEncoder().encode(pl);
            wsRef.current.send(`PUB ${reqSubject} ${bytes.length}\r\n${pl}\r\n`);
        });
    }, [reqSubject]);

    const onReady = useCallback((callback: (info: FilesReadyInfo) => void) => {
        readyCallbacksRef.current.add(callback);
        return () => { readyCallbacksRef.current.delete(callback); };
    }, []);

    return { isConnected, sendRequest, onReady, error };
}
