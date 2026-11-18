import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createNatsService,
  jwtExpiresAtUtc,
  type NatsConnectionState,
  type NatsCredentialsResponse,
  type NatsService,
} from '@/api/nats';
import {
  decodeTunnelFrame,
  parseTunnelControl,
  type TunnelControlMsg,
} from './proxyFrame';

// O codec de frames do túnel vive em proxyFrame.ts; reexportado aqui porque o
// hook é o ponto de entrada do contrato do Proxy LAN/WebRDP no site.
export {
  TUNNEL_FRAME_VERSION,
  TUNNEL_OP_DATA,
  TUNNEL_OP_CLOSE,
  TUNNEL_BINARY_HEADER_LEN,
  encodeTunnelFrame,
  decodeTunnelFrame,
  isTunnelControlPayload,
  parseTunnelControl,
  bytesFromBase64,
  base64FromBytes,
} from './proxyFrame';
export type { TunnelFrame, TunnelControlMsg } from './proxyFrame';

export type ProxyStreamStatus = 'connecting' | 'connected' | 'error';

interface UseProxyStreamOptions {
  natsSubject: string;
  natsUrl: string;
  jwt: string;
  /** Seed NKey do viewer (credencial escopada da sessão). */
  nkeySeed?: string;
  /** Renova o JWT NATS escopado após expiração (sessões longas). */
  getFreshCredentials?: () => Promise<string>;
}

/** Requisição HTTP/HTTPS bridgada pelo agent na rede local. */
export interface ProxyHttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  bodyBase64?: string;
  timeoutMs?: number;
}

/** Resposta do agent para .proxy.req (espelha netproxy.ProxyResponse). */
export interface ProxyHttpResponse {
  requestId: string;
  success: boolean;
  error?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  bodyBase64?: string;
  contentType?: string;
  finalUrl?: string;
  truncated?: boolean;
}

/** Abertura de stream TCP/SSH/RDP no túnel multiplexado do agent. */
export interface TunnelOpenOptions {
  /** Id do stream; quando omitido, o hook aloca o próximo livre. */
  streamId?: number;
  targetHost: string;
  targetPort: number;
  /** tcp | ssh | rdp (default tcp). */
  protocol?: string;
  /** Aliases aceitos para compatibilidade com chamadores legados. */
  host?: string;
  port?: number;
}

export interface UseProxyStreamReturn {
  /** Estado da conexão NATS com o agent. */
  status: ProxyStreamStatus;
  isConnected: boolean;
  error: string | null;
  /**
   * Envia uma requisição HTTP/HTTPS via .proxy.req e aguarda a resposta
   * correlacionada por requestId em .proxy.resp. Respostas com requestId
   * desconhecido (stale) são ignoradas.
   */
  httpRequest: (req: ProxyHttpRequest) => Promise<ProxyHttpResponse>;
  /** Abre um stream no túnel multiplexado (publica op "open" em .tunnel.in). */
  openTunnel: (opts: TunnelOpenOptions) => Promise<number>;
  /** Encerra um stream (publica op "close" em .tunnel.in). */
  closeTunnel: (streamId: number) => void;
  /** Dados de saída do túnel (agent -> viewer, frames binários 0x01). */
  onTunnelData: (cb: (streamId: number, data: Uint8Array) => void) => () => void;
  /** Encerramento de stream reportado pelo agent (frame CLOSE ou controle). */
  onTunnelClose: (cb: (streamId: number, reason: string) => void) => () => void;
  /** Mensagens de controle do túnel (opened/error/preflight). */
  onTunnelControl: (cb: (msg: TunnelControlMsg) => void) => () => void;
}

let _proxySeq = 0;
function nextReqId() { return `px${++_proxySeq}`; }

interface RawCapableNatsService {
  subscribeRaw?: (
    subject: string,
    callback: (data: Uint8Array) => void,
    options?: { connectIfNeeded?: boolean },
  ) => Promise<boolean>;
  unsubscribeRaw?: (subject: string, callback: (data: Uint8Array) => void) => void;
}

export function useProxyStream({
  natsSubject,
  natsUrl,
  jwt,
  nkeySeed = '',
  getFreshCredentials,
}: UseProxyStreamOptions): UseProxyStreamReturn {
  const [status, setStatus] = useState<ProxyStreamStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const serviceRef = useRef<NatsService | null>(null);
  const pendingRef = useRef<Map<string, { resolve: (r: ProxyHttpResponse) => void; reject: (e: Error) => void }>>(new Map());
  const dataCallbacksRef = useRef<Set<(streamId: number, data: Uint8Array) => void>>(new Set());
  const closeCallbacksRef = useRef<Set<(streamId: number, reason: string) => void>>(new Set());
  const controlCallbacksRef = useRef<Set<(msg: TunnelControlMsg) => void>>(new Set());
  const mountedRef = useRef(true);
  const connectedOnceRef = useRef(false);
  const nextStreamIdRef = useRef(1);
  const readyWaitersRef = useRef<Array<{ resolve: () => void; reject: (e: Error) => void }>>([]);

  const jwtRef = useRef(jwt);
  const freshCredsRef = useRef(getFreshCredentials);
  freshCredsRef.current = getFreshCredentials;

  // Normaliza UUIDs (remove hífens) para bater com o Agent.
  const subj = natsSubject.replace(/-/g, '');
  const reqSubject = `${subj}.proxy.req`;
  const respSubject = `${subj}.proxy.resp`;
  const tunnelInSubject = `${subj}.tunnel.in`;
  const tunnelOutSubject = `${subj}.tunnel.out`;

  useEffect(() => { jwtRef.current = jwt; }, [jwt]);

  const waitForReady = useCallback((timeoutMs = 10000) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      readyWaitersRef.current = readyWaitersRef.current.filter((w) => w.resolve !== resolve);
      reject(new Error('Timeout aguardando conexão NATS do proxy'));
    }, timeoutMs);
    readyWaitersRef.current.push({
      resolve: () => { clearTimeout(timer); resolve(); },
      reject: (e: Error) => { clearTimeout(timer); reject(e); },
    });
  }), []);

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    connectedOnceRef.current = false;

    if (!natsSubject || !natsUrl) {
      setStatus('error');
      setError('Sessão do proxy sem subject/URL NATS.');
      return () => { mounted = false; mountedRef.current = false; };
    }

    const buildCreds = (token: string): NatsCredentialsResponse => ({
      jwt: token,
      nkeySeed,
      publicKey: '',
      expiresAtUtc: jwtExpiresAtUtc(token),
      // O agent aplica a allowlist/SSRF; o site apenas publica pedidos.
      publishSubjects: [reqSubject, tunnelInSubject],
      subscribeSubjects: [respSubject, tunnelOutSubject],
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

    const offState = service.onConnectionStateChange((state: NatsConnectionState) => {
      if (!mounted || !mountedRef.current) return;
      if (state === 'connected') {
        connectedOnceRef.current = true;
        setStatus('connected');
        setError(null);
        const waiters = readyWaitersRef.current;
        readyWaitersRef.current = [];
        waiters.forEach((w) => w.resolve());
      } else if (state === 'auth_error') {
        setStatus('error');
        setError('Autenticação NATS expirada ou recusada.');
        const lost = readyWaitersRef.current;
        readyWaitersRef.current = [];
        lost.forEach((w) => w.reject(new Error('Autenticação NATS falhou')));
      } else if (state === 'disconnected' && connectedOnceRef.current) {
        setStatus('error');
      }
      // 'connecting'/'reconnecting' mantêm o status 'connecting' corrente.
    });

    // Sessões longas: JWT NATS expira → busca credencial fresca e reconecta.
    const offAuth = service.onAuthError(() => {
      if (!mounted || !freshCredsRef.current) return;
      void (async () => {
        try {
          const refresh = freshCredsRef.current;
          if (!refresh) return;
          const token = await refresh();
          if (!mounted) return;
          jwtRef.current = token;
          service.setPreSuppliedCredentials(buildCreds(token));
          await service.forceReconnect();
        } catch {
          // onConnectionStateChange já reporta auth_error
        }
      })();
    });

    // ── Frames de saída do túnel (binários 0x01) + controle JSON ──
    const handleTunnelOut = (raw: Uint8Array) => {
      if (!mounted || !mountedRef.current) return;
      if (raw.length === 0) return;
      if (raw[0] === 0x01) {
        const frame = decodeTunnelFrame(raw);
        if (!frame) return; // frame truncado/malformado — ignorado sem lançar
        dataCallbacksRef.current.forEach((cb) => cb(frame.streamId, frame.payload));
        if (frame.op === 0x02) {
          closeCallbacksRef.current.forEach((cb) => cb(frame.streamId, 'stream fechado pelo agent'));
        }
        return;
      }
      const ctrl = parseTunnelControl(raw);
      if (!ctrl) return;
      if (ctrl.op === 'close') {
        const sid = typeof ctrl.streamId === 'number' ? ctrl.streamId : -1;
        closeCallbacksRef.current.forEach((cb) => cb(sid, ctrl.error ?? 'stream fechado'));
      }
      controlCallbacksRef.current.forEach((cb) => cb(ctrl));
    };

    // ── Respostas HTTP do bridge (.proxy.resp, JSON correlacionado) ──
    const handleProxyResp = (parsed: Record<string, unknown>) => {
      if (!mounted) return;
      const rid = parsed.requestId;
      if (typeof rid === 'string' && pendingRef.current.has(rid)) {
        const pend = pendingRef.current.get(rid)!;
        pendingRef.current.delete(rid);
        pend.resolve(parsed as unknown as ProxyHttpResponse);
      }
      // requestId desconhecido (resposta stale/após timeout) → ignorada.
    };

    // Subscrições ANTES do connect(): o connect() restaura os SUBs a partir
    // dos listeners e só depois emite 'connected' — nenhum frame inicial perdido.
    const rawService = service as unknown as RawCapableNatsService;
    const hasRawSub = typeof rawService.subscribeRaw === 'function' && !!rawService.subscribeRaw;
    if (hasRawSub && rawService.subscribeRaw) {
      void rawService.subscribeRaw(tunnelOutSubject, handleTunnelOut, { connectIfNeeded: false });
    } else {
      void service.subscribe(tunnelOutSubject, (() => { /* fallback sem raw */ }) as never, { connectIfNeeded: false });
    }
    void service.subscribe(respSubject, handleProxyResp as never, { connectIfNeeded: false });

    void (async () => {
      const ok = await service.connect();
      if (!mounted || !mountedRef.current) return;
      if (!ok) {
        setStatus((prev) => (prev === 'connected' ? prev : 'error'));
        setError((prev) => prev ?? 'Conexão NATS do proxy falhou.');
      }
    })();

    return () => {
      mounted = false;
      mountedRef.current = false;
      offState();
      offAuth();
      if (hasRawSub && typeof rawService.unsubscribeRaw === 'function') {
        rawService.unsubscribeRaw(tunnelOutSubject, handleTunnelOut);
      } else {
        try { service.unsubscribe(tunnelOutSubject, (() => { /* noop */ }) as never); } catch { /* teardown */ }
      }
      service.unsubscribe(respSubject, handleProxyResp as never);

      const waiters = readyWaitersRef.current;
      readyWaitersRef.current = [];
      waiters.forEach((w) => w.reject(new Error('Proxy stream desmontado')));

      const pending = Array.from(pendingRef.current.values());
      pendingRef.current.clear();
      pending.forEach((p) => p.reject(new Error('Proxy stream desmontado')));

      if (serviceRef.current === service) serviceRef.current = null;
      void service.dispose().catch(() => { /* teardown best-effort */ });
    };
  }, [natsUrl, natsSubject, nkeySeed, subj, reqSubject, respSubject, tunnelInSubject, tunnelOutSubject]);

  const httpRequest = useCallback(async (req: ProxyHttpRequest): Promise<ProxyHttpResponse> => {
    if (!serviceRef.current || !serviceRef.current.isConnected()) {
      await waitForReady();
    }
    const service = serviceRef.current;
    if (!service || !service.isConnected()) { throw new Error('NATS offline'); }
    const requestId = nextReqId();
    return new Promise<ProxyHttpResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pendingRef.current.has(requestId)) {
          pendingRef.current.delete(requestId);
          reject(new Error(`Timeout na resposta do proxy (${req.url})`));
        }
      }, Math.max(1000, Math.min(req.timeoutMs ?? 30000, 120000)));
      pendingRef.current.set(requestId, {
        resolve: (r) => { clearTimeout(timer); resolve(r); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      void service.publish(reqSubject, {
        type: 'http',
        requestId,
        method: req.method ?? 'GET',
        url: req.url,
        ...(req.headers && Object.keys(req.headers).length > 0 ? { headers: req.headers } : {}),
        ...(req.bodyBase64 ? { bodyBase64: req.bodyBase64 } : {}),
        ...(req.timeoutMs ? { timeoutMs: req.timeoutMs } : {}),
      }).catch((e: Error) => {
        pendingRef.current.delete(requestId);
        clearTimeout(timer);
        reject(e);
      });
    });
  }, [reqSubject, waitForReady]);

  const publishTunnelControl = useCallback(async (payload: Record<string, unknown>) => {
    if (!serviceRef.current || !serviceRef.current.isConnected()) {
      await waitForReady();
    }
    const service = serviceRef.current;
    if (!service || !service.isConnected()) { throw new Error('NATS offline'); }
    await service.publish(tunnelInSubject, payload);
  }, [tunnelInSubject, waitForReady]);

  const openTunnel = useCallback(async (opts: TunnelOpenOptions): Promise<number> => {
    const streamId = typeof opts.streamId === 'number' && opts.streamId > 0
      ? opts.streamId
      : nextStreamIdRef.current++;
    if (streamId >= nextStreamIdRef.current) nextStreamIdRef.current = streamId + 1;
    await publishTunnelControl({
      op: 'open',
      streamId,
      targetHost: opts.targetHost ?? opts.host ?? '',
      targetPort: opts.targetPort ?? opts.port ?? 0,
      ...(opts.protocol ? { protocol: opts.protocol } : {}),
    });
    return streamId;
  }, [publishTunnelControl]);

  const closeTunnel = useCallback((streamId: number) => {
    const service = serviceRef.current;
    if (!service || !service.isConnected()) return;
    void service.publish(tunnelInSubject, { op: 'close', streamId }).catch(() => { /* best-effort */ });
  }, [tunnelInSubject]);

  const onTunnelData = useCallback((cb: (streamId: number, data: Uint8Array) => void) => {
    dataCallbacksRef.current.add(cb);
    return () => { dataCallbacksRef.current.delete(cb); };
  }, []);

  const onTunnelClose = useCallback((cb: (streamId: number, reason: string) => void) => {
    closeCallbacksRef.current.add(cb);
    return () => { closeCallbacksRef.current.delete(cb); };
  }, []);

  const onTunnelControl = useCallback((cb: (msg: TunnelControlMsg) => void) => {
    controlCallbacksRef.current.add(cb);
    return () => { controlCallbacksRef.current.delete(cb); };
  }, []);

  return {
    status,
    isConnected: status === 'connected',
    error,
    httpRequest,
    openTunnel,
    closeTunnel,
    onTunnelData,
    onTunnelClose,
    onTunnelControl,
  };
}
