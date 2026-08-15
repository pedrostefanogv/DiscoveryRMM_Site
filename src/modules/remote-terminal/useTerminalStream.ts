import { useRef, useEffect, useState, useCallback } from 'react';

interface UseTerminalStreamOptions {
    natsSubject: string;
    natsUrl: string;
    jwt: string;
    nkeySeed: string;
}

export interface TerminalReadyInfo {
    shells: string[];
    consoleId?: string;
    termCols?: number;
    termRows?: number;
}

interface UseTerminalStreamReturn {
    isConnected: boolean;
    sendData: (data: string) => void;
    sendResize: (cols: number, rows: number) => void;
    onOutput: (callback: (data: string) => void) => () => void;
    onExit: (callback: (reason: string) => void) => () => void;
    onReady: (callback: (info: TerminalReadyInfo) => void) => () => void;
    error: string | null;
}

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

// Codifica string UTF-8 → base64. btoa() puro falha com caracteres fora do
// Latin-1 (acentos, emoji, símbolos) com InvalidCharacterError, o que quebrava
// o envio de input do terminal remoto silenciosamente.
function toBase64(input: string): string {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

// Console único: usa subjects fixos term.out / term.in (sem tabId),
// como o MeshCentral (um terminal por sessão).
export function useTerminalStream({
    natsSubject,
    natsUrl,
    jwt,
    nkeySeed: _nkeySeed,
}: UseTerminalStreamOptions): UseTerminalStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const outputCallbacksRef = useRef<Set<(data: string) => void>>(new Set());
    const exitCallbacksRef = useRef<Set<(reason: string) => void>>(new Set());
    const readyCallbacksRef = useRef<Set<(info: TerminalReadyInfo) => void>>(new Set());
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);
    // Fila de mensagens a enviar quando a conexão abrir (resize inicial, etc.)
    const pendingQueueRef = useRef<string[]>([]);

    const maxReconnect = 5;
    const delays = [1000, 2000, 4000, 8000, 16000];

    // Normaliza UUIDs (remove hífens) para bater com o Agent
    const subj = natsSubject.replace(/-/g, '');
    const outSubject = `${subj}.term.out`;
    const inSubject = `${subj}.term.in`;
    const readySubject = `${subj}.term.ready`;

    const connect = useCallback(() => {
        if (!mountedRef.current) return;
        try {
            const wsUrl = `${natsUrl}?access_token=${encodeURIComponent(jwt)}`;
            const ws = new WebSocket(wsUrl);
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

                        // term.out — saída do console
                        try {
                            const parsed = JSON.parse(payload);
                            if (parsed && typeof parsed === 'object') {
                                if (parsed.exit) {
                                    exitCallbacksRef.current.forEach(cb => cb(String(parsed.reason ?? 'shell encerrado')));
                                } else if (typeof parsed.data === 'string') {
                                    try {
                                        const decoded = atob(parsed.data);
                                        outputCallbacksRef.current.forEach(cb => cb(decoded));
                                    } catch {
                                        outputCallbacksRef.current.forEach(cb => cb(parsed.data));
                                    }
                                } else if (parsed.shells && Array.isArray(parsed.shells)) {
                                    // term.ready — shells disponíveis + console pronto
                                    readyCallbacksRef.current.forEach(cb => cb(parsed as TerminalReadyInfo));
                                }
                            }
                        } catch {
                            outputCallbacksRef.current.forEach(cb => cb(payload));
                        }
                        continue;
                    }

                    protocolBuffer = protocolBuffer.slice(lineEnd + 2);

                    if (tokens[0] === 'INFO') {
                        sendProtocol(`CONNECT ${JSON.stringify({
                            lang: 'discovery-web',
                            version: '1.0',
                            protocol: 1,
                            headers: true,
                            verbose: true,
                            auth_token: jwt,
                        })}`);
                        connectSent = true;
                        continue;
                    }

                    if (tokens[0] === '+OK') {
                        if (connectSent && !authenticated) {
                            authenticated = true;
                            reconnectAttemptsRef.current = 0;
                            setIsConnected(true);
                            setError(null);
                            sendProtocol(`SUB ${outSubject} 1`);
                            sendProtocol(`SUB ${readySubject} 2`);
                            // Drena a fila de mensagens pendentes (ex.: resize inicial)
                            const pending = pendingQueueRef.current;
                            pendingQueueRef.current = [];
                            for (const msg of pending) {
                                ws?.send(msg);
                            }
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
                if (reconnectAttemptsRef.current < maxReconnect) {
                    const delay = delays[reconnectAttemptsRef.current] ?? delays[delays.length - 1];
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
    }, [natsUrl, jwt, subj]);

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

    const sendData = useCallback((data: string) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const payload = JSON.stringify({ data: toBase64(data) });
        const msg = `PUB ${inSubject} ${new TextEncoder().encode(payload).length}\r\n${payload}\r\n`;
        ws.send(msg);
    }, [inSubject]);

    // Envia com fila: se a conexão ainda não abriu (reconexão), enfileira a
    // mensagem para ser drenada quando autenticar — evita perder resize inicial.
    const sendResize = useCallback((cols: number, rows: number) => {
        const payload = JSON.stringify({ cols, rows });
        const msg = `PUB ${inSubject} ${new TextEncoder().encode(payload).length}\r\n${payload}\r\n`;
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(msg);
        } else {
            // Mantém apenas o último resize pendente (não acumula)
            pendingQueueRef.current = [msg];
        }
    }, [inSubject]);

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

    return { isConnected, sendData, sendResize, onOutput, onExit, onReady, error };
}
