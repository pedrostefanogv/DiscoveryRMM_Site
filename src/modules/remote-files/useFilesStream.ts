import { useRef, useEffect, useState, useCallback } from 'react';

interface UseFilesStreamOptions {
    natsSubject: string;
    natsUrl: string;
    jwt: string;
}

interface UseFilesStreamReturn {
    isConnected: boolean;
    sendRequest: (action: string, path: string, data?: Uint8Array) => Promise<FilesResponse>;
    error: string | null;
}

interface FilesResponse {
    success: boolean;
    error?: string;
    entries?: { name: string; path: string; isDir: boolean; size: number; modTime: string }[];
    data?: number[];
    size?: number;
}

let _seq = 0;
function nextReqId() { return `f${++_seq}`; }

export function useFilesStream({ natsSubject, natsUrl, jwt }: UseFilesStreamOptions): UseFilesStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const pendingRef = useRef<Map<string, { resolve: (r: FilesResponse) => void; reject: (e: Error) => void }>>(new Map());
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);
    const subIdRef = useRef(1);

    const connect = useCallback(() => {
        if (!mountedRef.current || !natsSubject || !natsUrl || !jwt) return;
        try {
            const ws = new WebSocket(`${natsUrl}?access_token=${encodeURIComponent(jwt)}`);
            ws.binaryType = 'arraybuffer';
            wsRef.current = ws;

            let protocolBuf = new Uint8Array();
            let connectSent = false;
            let authenticated = false;
            const CR = 13, LF = 10;

            const send = (cmd: string) => ws.send(new TextEncoder().encode(`${cmd}\r\n`));

            const processProto = () => {
                const dec = new TextDecoder();
                while (true) {
                    let lf = -1;
                    for (let i = 0; i < protocolBuf.length - 1; i++) {
                        if (protocolBuf[i] === CR && protocolBuf[i + 1] === LF) { lf = i; break; }
                    }
                    if (lf < 0) return;
                    const line = dec.decode(protocolBuf.slice(0, lf));
                    const toks = line.trim().split(/\s+/);
                    if (toks[0] === 'MSG') {
                        const plI = toks.length === 5 ? 4 : 3;
                        const plN = Number.parseInt(toks[plI] ?? '0', 10);
                        if (!Number.isInteger(plN) || plN < 0) return;
                        const ps = lf + 2; const pe = ps + plN;
                        if (protocolBuf.length < pe + 2) return;
                        const p = dec.decode(protocolBuf.slice(ps, pe));
                        protocolBuf = protocolBuf.slice(pe + 2);
                        try {
                            const r: FilesResponse = JSON.parse(p);
                            const rid = toks.length >= 3 ? toks[2] : '';
                            const pend = pendingRef.current.get(rid);
                            if (pend) { pend.resolve(r); pendingRef.current.delete(rid); }
                        } catch { /* ignore */ }
                        continue;
                    }
                    protocolBuf = protocolBuf.slice(lf + 2);
                    if (toks[0] === 'INFO') { send(`CONNECT ${JSON.stringify({ lang: 'discovery-web', version: '1.0', protocol: 1, headers: true, verbose: true, auth_token: jwt })}`); connectSent = true; continue; }
                    if (toks[0] === '+OK') {
                        if (connectSent && !authenticated) { authenticated = true; setIsConnected(true); setError(null); subIdRef.current++; send(`SUB ${natsSubject}.files.resp ${subIdRef.current}`); }
                        continue;
                    }
                    if (toks[0] === 'PING') { send('PONG'); continue; }
                    if (toks[0] === '-ERR') { setError(`NATS: ${line.replace(/^-ERR\s*/i, '')}`); ws.close(1008); return; }
                }
            };

            ws.onopen = () => { };
            ws.onmessage = (ev) => {
                if (!mountedRef.current) return;
                const b = typeof ev.data === 'string' ? new Uint8Array(new TextEncoder().encode(ev.data)) : ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : new Uint8Array();
                const n = new Uint8Array(protocolBuf.length + b.length); n.set(protocolBuf); n.set(b, protocolBuf.length);
                protocolBuf = n; processProto();
            };
            ws.onclose = () => { if (!mountedRef.current) return; setIsConnected(false); reconnectRef.current = setTimeout(connect, 3000); };
        } catch (err) { setError(err instanceof Error ? err.message : 'Falha'); reconnectRef.current = setTimeout(connect, 5000); }
    }, [natsUrl, jwt, natsSubject]);

    useEffect(() => {
        mountedRef.current = true; connect();
        return () => { mountedRef.current = false; if (reconnectRef.current) clearTimeout(reconnectRef.current); wsRef.current?.close(); };
    }, [connect]);

    const sendRequest = useCallback((action: string, path: string, data?: Uint8Array): Promise<FilesResponse> => {
        return new Promise((resolve, reject) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) { reject(new Error('WebSocket offline')); return; }
            const rid = nextReqId();
            pendingRef.current.set(rid, { resolve, reject });
            const pl = JSON.stringify({ version: 1, requestId: rid, action, path, data: data ? Array.from(data) : undefined });
            wsRef.current.send(`PUB ${natsSubject}.files.req ${new TextEncoder().encode(pl).length}\r\n${pl}\r\n`);
            setTimeout(() => { if (pendingRef.current.has(rid)) { pendingRef.current.delete(rid); reject(new Error('Timeout')); } }, 30000);
        });
    }, [natsSubject]);

    return { isConnected, sendRequest, error };
}
