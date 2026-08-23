import { useRef, useEffect, useState, useCallback } from 'react';

interface UseProcessesStreamOptions {
    natsSubject: string;
    natsUrl: string;
    jwt: string;
}

export interface ProcessInfo {
    pid: number;
    parentPid: number;
    name: string;
    threads: number;
    priorityBase: number;
}

export interface ServiceInfo {
    name: string;
    displayName: string;
    state: string;      // running, stopped, paused, ...
    startType?: string; // auto, demand, disabled, ...
    binaryPath?: string;
    pid?: number;
}

export interface ProcResponse {
    success: boolean;
    error?: string;
    requestId?: string;
    status?: string;
    processes?: ProcessInfo[];
    services?: ServiceInfo[];
}

export interface UseProcessesStreamReturn {
    isConnected: boolean;
    isReady: boolean;
    error: string | null;
    onReady: (callback: () => void) => () => void;
    send: (action: string, extra?: Record<string, unknown>) => Promise<ProcResponse>;
}

const CRLF = new Uint8Array([13, 10]);
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

let _seq = 0;
function nextReqId() { return `p${++_seq}`; }

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

export function useProcessesStream({ natsSubject, natsUrl, jwt }: UseProcessesStreamOptions): UseProcessesStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const pendingRef = useRef<Map<string, { resolve: (r: ProcResponse) => void; reject: (e: Error) => void }>>(new Map());
    const readyCallbacksRef = useRef<Set<() => void>>(new Set());
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    // Normaliza UUIDs (remove hífens) para bater com o Agent (stripHyphens)
    const subj = natsSubject.replace(/-/g, '');
    const reqSubject = `${subj}.proc.req`;
    const respSubject = `${subj}.proc.resp`;
    const readySubject = `${subj}.proc.ready`;

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
                            const parsed = JSON.parse(payload) as ProcResponse;
                            // proc.ready — o agente notifica que o subscribe em proc.req
                            // está ativo (evita a race em que o primeiro request chega antes).
                            if (parsed && typeof parsed === 'object' && parsed.status === 'ready' && !('requestId' in parsed)) {
                                setIsReady(true);
                                readyCallbacksRef.current.forEach(cb => cb());
                                continue;
                            }
                            const rid = parsed.requestId;
                            if (rid && pendingRef.current.has(rid)) {
                                const pend = pendingRef.current.get(rid)!;
                                pendingRef.current.delete(rid);
                                pend.resolve(parsed);
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
                setIsReady(false);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [natsSubject, natsUrl, jwt]);

    useEffect(() => {
        mountedRef.current = true;
        reconnectAttemptsRef.current = 0;
        connect();
        return () => {
            mountedRef.current = false;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (wsRef.current) wsRef.current.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connect]);

    const send = useCallback((action: string, extra?: Record<string, unknown>): Promise<ProcResponse> => {
        return new Promise((resolve, reject) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) { reject(new Error('WebSocket offline')); return; }
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
            const bytes = new TextEncoder().encode(pl);
            wsRef.current.send(`PUB ${reqSubject} ${bytes.length}\r\n${pl}\r\n`);
        });
    }, [reqSubject]);

    const onReady = useCallback((callback: () => void) => {
        readyCallbacksRef.current.add(callback);
        return () => { readyCallbacksRef.current.delete(callback); };
    }, []);

    return { isConnected, isReady, error, onReady, send };
}