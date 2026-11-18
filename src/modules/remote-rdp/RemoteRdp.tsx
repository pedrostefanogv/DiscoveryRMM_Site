import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createNatsService,
  jwtExpiresAtUtc,
  type NatsConnectionState,
  type NatsCredentialsResponse,
  type NatsService,
} from '@/api/nats';
import { apiFetchResponse } from '@/api/client';
import { parseTunnelControl, type TunnelControlMsg } from '@/modules/remote-proxy/proxyFrame';

interface RemoteRdpProps {
  sessionId: string;
  agentId: string;
  natsSubject?: string;
  /** URL WebSocket do NATS escopado da sessão (vem do start kind='rdp'). */
  natsUrl?: string;
  jwt?: string;
  nkeySeed?: string;
  getFreshCredentials?: () => Promise<string>;
  /** Porta local (máquina do operador) apontada pelo arquivo .rdp. */
  rdpLocalPort?: number;
}

type RdpStatus = 'idle' | 'connecting' | 'connected' | 'error';

const STATUS_LABEL: Record<RdpStatus, string> = {
  idle: 'Aguardando sessão',
  connecting: 'Conectando ao túnel RDP…',
  connected: 'Túnel RDP ativo',
  error: 'Falha no túnel RDP',
};

/** Porta padrão do túnel RDP no loopback (mesma da API: /rdp-file?localPort=33890). */
const DEFAULT_RDP_LOCAL_PORT = 33890;

/**
 * WebRDP (F22/R2): consome o túnel multiplexado do agent via NATS
 * (.tunnel.out binário 0x01 + controle JSON em .tunnel.in) e oferece o
 * download do arquivo .rdp para o cliente nativo (mstsc). A conexão NUNCA
 * embute ?access_token= na URL — a credencial vai apenas no CONNECT do NATS.
 */
export default function RemoteRdp({
  sessionId,
  agentId,
  natsSubject = '',
  natsUrl = '',
  jwt = '',
  nkeySeed = '',
  getFreshCredentials,
  rdpLocalPort = DEFAULT_RDP_LOCAL_PORT,
}: RemoteRdpProps) {
  const [status, setStatus] = useState<RdpStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [preflightRdpStatus, setPreflightRdpStatus] = useState<string | null>(null);
  const [streamOpen, setStreamOpen] = useState(false);
  const [receivedBytes, setReceivedBytes] = useState(0);
  const [frames, setFrames] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const serviceRef = useRef<NatsService | null>(null);
  const jwtRef = useRef(jwt);
  const freshCredsRef = useRef(getFreshCredentials);
  freshCredsRef.current = getFreshCredentials;
  // Contadores acumulados em ref (frames chegam a dezenas/s); a UI é
  // atualizada por um timer de 1s para não re-renderizar a cada frame.
  const bytesRef = useRef(0);
  const framesRef = useRef(0);

  const subj = natsSubject.replace(/-/g, '');
  const tunnelInSubject = `${subj}.tunnel.in`;
  const tunnelOutSubject = `${subj}.tunnel.out`;

  useEffect(() => { jwtRef.current = jwt; }, [jwt]);

  // ── Download do arquivo .rdp (cliente nativo mstsc) ──
  const handleDownloadRdp = useCallback(async () => {
    if (!sessionId || !agentId) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await apiFetchResponse(
        `/api/v1/remote-sessions/${encodeURIComponent(agentId)}/${encodeURIComponent(sessionId)}/rdp-file?localPort=${rdpLocalPort}`,
      );
      if (!res.ok) {
        throw new Error(`Falha ao obter o arquivo .rdp (HTTP ${res.status}).`);
      }
      const content = await res.text();
      const blob = new Blob([content], { type: 'application/x-rdp' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `sessao-rdp-${sessionId}.rdp`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoga depois de dar tempo do download iniciar.
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }, [sessionId, agentId, rdpLocalPort]);

  // ── Conexão NATS do túnel RDP ──
  useEffect(() => {
    // Guard: sem sessão/credencial não abre conexão nenhuma.
    if (!sessionId || !jwt || !natsSubject || !natsUrl) {
      setStatus('idle');
      return () => { /* nada a limpar: conexão nunca foi aberta */ };
    }

    let mounted = true;
    const ctrlCallbacks = new Set<(msg: TunnelControlMsg) => void>();

    const buildCreds = (token: string): NatsCredentialsResponse => ({
      jwt: token,
      nkeySeed,
      publicKey: '',
      expiresAtUtc: jwtExpiresAtUtc(token),
      publishSubjects: [tunnelInSubject],
      subscribeSubjects: [tunnelOutSubject],
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
      if (!mounted) return;
      if (state === 'connected') {
        setStatus('connected');
        setError(null);
      } else if (state === 'auth_error') {
        setStatus('error');
        setError('Autenticação NATS expirada ou recusada.');
      } else if (state === 'disconnected') {
        setStatus((prev) => (prev === 'connected' ? 'error' : prev));
      }
    });

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

    const handleTunnelOut = (raw: Uint8Array) => {
      if (!mounted) return;
      if (raw.length === 0) return;
      if (raw[0] === 0x01) {
        // Frame binário do WebRDP: [0x01][op][4B streamId][payload]. O payload
        // é dados RDP server->client; aqui apenas contabilizamos (o render
        // completo do protocolo RDP não faz parte do túnel do console).
        if (raw.length < 6) return; // truncado — ignorado sem lançar
        const streamId = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(2, false);
        bytesRef.current += Math.max(0, raw.length - 6);
        framesRef.current += 1;
        if (raw[1] === 0x02) setStreamOpen(false);
        void streamId;
        return;
      }
      const ctrl = parseTunnelControl(raw);
      if (!ctrl) return;
      if (ctrl.op === 'preflight') {
        const rdpStatus = typeof ctrl.rdpStatus === 'string' ? ctrl.rdpStatus : null;
        setPreflightRdpStatus(rdpStatus);
        if (rdpStatus && rdpStatus !== 'ok' && rdpStatus !== 'ready' && rdpStatus !== 'enabled') {
          setPreflightError(ctrl.error ?? `Área de Trabalho Remota indisponível no agent (status: ${rdpStatus}).`);
        } else if (ctrl.error) {
          setPreflightError(ctrl.error);
        }
        ctrlCallbacks.forEach((cb) => cb(ctrl));
        return;
      }
      if (ctrl.op === 'opened') {
        setStreamOpen(true);
        setPreflightError(null);
      } else if (ctrl.op === 'close') {
        setStreamOpen(false);
      } else if (ctrl.op === 'error') {
        setPreflightError(ctrl.error ?? 'Erro no túnel RDP do agent.');
      }
      ctrlCallbacks.forEach((cb) => cb(ctrl));
    };

    type RawCapable = { subscribeRaw?: (s: string, cb: (d: Uint8Array) => void, o?: { connectIfNeeded?: boolean }) => Promise<boolean>; unsubscribeRaw?: (s: string, cb: (d: Uint8Array) => void) => void };
    const rawService = service as unknown as RawCapable;
    const hasRaw = typeof rawService.subscribeRaw === 'function' && !!rawService.subscribeRaw;
    if (hasRaw && rawService.subscribeRaw) {
      void rawService.subscribeRaw(tunnelOutSubject, handleTunnelOut, { connectIfNeeded: false });
    } else {
      void service.subscribe(tunnelOutSubject, (() => { /* fallback sem raw */ }) as never, { connectIfNeeded: false });
    }

    void (async () => {
      setStatus((prev) => (prev === 'idle' ? 'connecting' : prev));
      const ok = await service.connect();
      if (!mounted) return;
      if (ok) {
        // Pede o preflight RDP ao agent pelo canal de controle do túnel.
        void service.publish(tunnelInSubject, { op: 'preflight', protocol: 'rdp' }).catch(() => { /* best-effort */ });
      } else {
        setStatus((prev) => (prev === 'connected' ? prev : 'error'));
        setError((prev) => prev ?? 'Conexão NATS do túnel RDP falhou.');
      }
    })();

    // Flush dos contadores (1s) — evita re-render por frame.
    const flushTimer = setInterval(() => {
      if (!mounted) return;
      setReceivedBytes((prev) => (bytesRef.current > prev ? bytesRef.current : prev));
      setFrames((prev) => (framesRef.current > prev ? framesRef.current : prev));
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(flushTimer);
      offState();
      offAuth();
      if (hasRaw && typeof rawService.unsubscribeRaw === 'function') {
        rawService.unsubscribeRaw(tunnelOutSubject, handleTunnelOut);
      } else {
        try { service.unsubscribe(tunnelOutSubject, (() => { /* noop */ }) as never); } catch { /* teardown */ }
      }
      if (serviceRef.current === service) serviceRef.current = null;
      void service.dispose().catch(() => { /* teardown best-effort */ });
    };
  }, [sessionId, jwt, natsSubject, natsUrl, nkeySeed, subj, tunnelInSubject, tunnelOutSubject]);

  const tone = status === 'connected'
    ? 'bg-success/20 text-success'
    : status === 'error'
      ? 'bg-danger/20 text-danger'
      : 'bg-warning/20 text-warning';

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-surface border-b border-border text-xs">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium ${tone}`}>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" aria-hidden />
          {STATUS_LABEL[status]}
        </span>
        {streamOpen && <span className="text-success">stream ativo</span>}
        {receivedBytes > 0 && (
          <span className="text-muted-foreground" title={`${frames} frames recebidos do túnel`}>
            {(receivedBytes / 1024).toFixed(1)} KB recebidos
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
          onClick={() => { void handleDownloadRdp(); }}
          disabled={downloading || !sessionId || !agentId}
          title="Baixa o arquivo .rdp (mstsc) apontando para o túnel local da sessão"
        >
          ⬇ Baixar arquivo .rdp
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 text-xs">
        {!sessionId || !jwt ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <div className="text-4xl mb-3">🖥</div>
            <p className="text-sm mb-1">Sessão RDP não iniciada</p>
            <p className="text-muted-foreground">Conecte a sessão para abrir o túnel WebRDP.</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-xl">
            <p className="text-foreground">
              <strong>WebRDP via túnel NATS.</strong> O agent abre o túnel multiplexado para o
              TermService da máquina remota (porta 3389) e o console recebe os frames do protocolo
              por <span className="font-mono">.tunnel.out</span> (binário 0x01) e envia eventos por{' '}
              <span className="font-mono">.tunnel.in</span> (controle JSON).
            </p>
            <p className="text-muted-foreground">
              Para a experiência nativa, baixe o arquivo <span className="font-mono">.rdp</span> — ele
              aponta para <span className="font-mono">127.0.0.1:{rdpLocalPort}</span>, a porta local do túnel
              mantida pelo agent/API.
            </p>
            {preflightRdpStatus && (
              <p className="text-muted-foreground">
                Preflight do agent: <span className="font-mono">{preflightRdpStatus}</span>
              </p>
            )}
            {(error || preflightError) && (
              <div className="rounded border border-danger/40 bg-danger/20 p-2 text-danger" role="alert">
                ⛔ {preflightError ?? error}
              </div>
            )}
            {downloadError && (
              <div className="rounded border border-warning/40 bg-warning/20 p-2 text-warning">
                {downloadError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
