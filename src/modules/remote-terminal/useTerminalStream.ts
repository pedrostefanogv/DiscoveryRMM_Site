import { useRef, useEffect, useState, useCallback } from 'react';

interface UseTerminalStreamOptions {
    natsSubject: string;
    tabId: string;
    natsUrl: string;
    jwt: string;
    nkeySeed: string;
}

interface UseTerminalStreamReturn {
    isConnected: boolean;
    sendData: (data: string) => void;
    sendResize: (cols: number, rows: number) => void;
    onOutput: (callback: (data: string) => void) => () => void;
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

export function useTerminalStream({
    natsSubject,
    tabId,
    natsUrl,
    jwt,
    nkeySeed: _nkeySeed,
}: UseTerminalStreamOptions): UseTerminalStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const outputCallbacksRef = useRef<Set<(data: string) => void>>(new Set());
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    const maxReconnect = 5;
    const delays = [1000, 2000, 4000, 8000, 16000];

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

            const sendProtocol = (cmd: string) => ws.send(new TextEncoder().encode(`${cmd}\r\n`));

            const processProtocol = () => {
                const decoder = new TextDecoder();
                for (; ;) {
                    const lineEnd = findCrlf(protocolBuffer);
                    if (lineEnd < 0) return;
                    const line = decoder.decode(protocolBuffer.slice(0, lineEnd));
                    const tokens = line.trim().split(/\s+/);

                    if (tokens[0] === 'MSG') {
                        const payloadLengthIndex = tokens.length === 5 ? 4 : 3;
                        const payloadLength = Number.parseInt(tokens[payloadLengthIndex] ?? '', 10);
                        if (!Number.isInteger(payloadLength) || payloadLength < 0) return;
                        const payloadStart = lineEnd + 2;
                        const payloadEnd = payloadStart + payloadLength;
                        if (protocolBuffer.length < payloadEnd + 2) return;

                        const payload = decoder.decode(protocolBuffer.slice(payloadStart, payloadEnd));
                        protocolBuffer = protocolBuffer.slice(payloadEnd + 2);

                        try {
                            const parsed = JSON.parse(payload);
                            if (parsed.data) {
                                try {
                                    const decoded = atob(parsed.data);
                                    outputCallbacksRef.current.forEach(cb => cb(decoded));
                                } catch {
                                    outputCallbacksRef.current.forEach(cb => cb(parsed.data));
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
                            sendProtocol(`SUB ${natsSubject}.term.${tabId}.out 1`);
                        }
                        continue;
                    }

                    if (tokens[0] === 'PING') { sendProtocol('PONG'); continue; }
                    if (tokens[0] === '-ERR') {
                        setError(`NATS: ${line.replace(/^-ERR\s*/i, '').replace(/^['"]|['"]$/g, '')}`);
                        ws?.close(1008, 'NATS protocol error');
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
    }, [natsUrl, jwt, natsSubject, tabId]);

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
        const payload = JSON.stringify({ data: btoa(data) });
        const msg = `PUB ${natsSubject}.term.${tabId}.in ${new TextEncoder().encode(payload).length}\r\n${payload}\r\n`;
        ws.send(msg);
    }, [natsSubject, tabId]);

    const sendResize = useCallback((cols: number, rows: number) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const payload = JSON.stringify({ cols, rows });
        const msg = `PUB ${natsSubject}.term.${tabId}.in ${new TextEncoder().encode(payload).length}\r\n${payload}\r\n`;
        ws.send(msg);
    }, [natsSubject, tabId]);

    const onOutput = useCallback((callback: (data: string) => void) => {
        outputCallbacksRef.current.add(callback);
        return () => { outputCallbacksRef.current.delete(callback); };
    }, []);

    return { isConnected, sendData, sendResize, onOutput, error };
}
