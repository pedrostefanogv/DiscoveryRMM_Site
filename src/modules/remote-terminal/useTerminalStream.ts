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
    const reconnectTimeoutRef = useRef<number>(0);
    const mountedRef = useRef(true);

    const connect = useCallback(() => {
        if (!mountedRef.current) return;

        try {
            const wsUrl = `${natsUrl}?access_token=${encodeURIComponent(jwt)}`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                if (!mountedRef.current) return;
                setIsConnected(true);
                setError(null);

                // Subscribe no subject de out da tab
                const subMsg = `SUB ${natsSubject}.term.${tabId}.out 1\r\n`;
                ws.send(subMsg);
            };

            ws.onmessage = (event) => {
                if (!mountedRef.current) return;

                // NATS protocol: MSG <subject> <sid> <reply> <size>\r\n<payload>\r\n
                if (typeof event.data === 'string' && event.data.startsWith('MSG ')) {
                    const lines = event.data.split('\r\n');
                    if (lines.length >= 2) {
                        const payload = lines.slice(1).join('\r\n');
                        try {
                            const parsed = JSON.parse(payload);
                            if (parsed.data) {
                                // Decodifica base64
                                const decoded = atob(parsed.data);
                                outputCallbacksRef.current.forEach(cb => cb(decoded));
                            }
                        } catch {
                            // payload bruto (não JSON)
                            outputCallbacksRef.current.forEach(cb => cb(payload));
                        }
                    }
                } else if (event.data instanceof ArrayBuffer) {
                    // Binary frame — ignorar no terminal (esperamos JSON)
                } else if (typeof event.data === 'string') {
                    // Possível resposta do servidor NATS (+OK, -ERR, PING, INFO)
                }
            };

            ws.onclose = () => {
                if (!mountedRef.current) return;
                setIsConnected(false);
                // Reconexão com backoff
                reconnectTimeoutRef.current = setTimeout(connect, 3000);
            };

            ws.onerror = () => {
                if (!mountedRef.current) return;
                setError('WebSocket connection error');
            };
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to connect');
            reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
    }, [natsUrl, jwt, natsSubject, tabId]);

    useEffect(() => {
        mountedRef.current = true;
        connect();
        return () => {
            mountedRef.current = false;
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) wsRef.current.close();
        };
    }, [connect]);

    const sendData = useCallback((data: string) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const payload = JSON.stringify({
            data: btoa(data),
        });
        const pubMsg = `PUB ${natsSubject}.term.${tabId}.in ${payload.length}\r\n${payload}\r\n`;
        ws.send(pubMsg);
    }, [natsSubject, tabId]);

    const sendResize = useCallback((cols: number, rows: number) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const payload = JSON.stringify({ cols, rows });
        const pubMsg = `PUB ${natsSubject}.term.${tabId}.in ${payload.length}\r\n${payload}\r\n`;
        ws.send(pubMsg);
    }, [natsSubject, tabId]);

    const onOutput = useCallback((callback: (data: string) => void) => {
        outputCallbacksRef.current.add(callback);
        return () => {
            outputCallbacksRef.current.delete(callback);
        };
    }, []);

    return { isConnected, sendData, sendResize, onOutput, error };
}
