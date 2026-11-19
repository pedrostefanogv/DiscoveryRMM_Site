import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createNatsService,
  jwtExpiresAtUtc,
  type NatsConnectionState,
  type NatsCredentialsResponse,
  type NatsService,
} from '@/api/nats';
import { apiFetchResponse } from '@/api/client';
import { remoteSessionsApi } from '@/api/remote-sessions';
import { parseTunnelControl, type TunnelControlMsg } from '@/modules/remote-proxy/proxyFrame';
import {
  connectIronRdp,
  describeIronError,
  preloadIronRdp,
  type IronRdpSessionHandle,
  type IronRdpStatus,
} from './ironRdpClient';

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

/** Dimensões iniciais do desktop remoto. */
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;

/**
 * Status de preflight devolvido pelo agent (espelha remotesession.RDPStatus).
 *
 * O agent envia um OBJETO, não uma string. O código anterior comparava com
 * strings ('ok'/'ready'/'enabled'), então o preflight nunca reportava estado
 * real — o campo era convertido a null e toda a informação era descartada.
 */
interface RdpPreflightStatus {
  ready?: boolean;
  termServiceState?: string;
  termServiceStart?: string;
  rdpEnabled?: boolean;
  port?: number;
  listening?: boolean;
  issues?: string[];
  hints?: string[];
}

/** Extrai o RDPStatus do payload de controle, aceitando objeto ou string legada. */
function parseRdpPreflight(raw: unknown): { status: RdpPreflightStatus | null; legacy: string | null } {
  if (raw == null) return { status: null, legacy: null };
  if (typeof raw === 'string') return { status: null, legacy: raw };
  if (typeof raw === 'object') return { status: raw as RdpPreflightStatus, legacy: null };
  return { status: null, legacy: null };
}

/** Traduz o preflight em uma mensagem acionável (ou null quando está tudo certo). */
function describePreflight(st: RdpPreflightStatus): string | null {
  if (st.ready === true) return null;
  const parts: string[] = [];
  if (st.termServiceState && st.termServiceState !== 'running') {
    parts.push(`serviço TermService está "${st.termServiceState}"`);
  }
  if (st.rdpEnabled === false) {
    parts.push('Área de Trabalho Remota desabilitada no registro (fDenyTSConnections)');
  }
  if (st.listening === false) {
    parts.push(`porta ${st.port ?? 3389} não está escutando`);
  }
  if (parts.length === 0 && Array.isArray(st.issues) && st.issues.length > 0) {
    parts.push(st.issues.join(', '));
  }
  if (parts.length === 0) return null;
  const hints = Array.isArray(st.hints) && st.hints.length > 0 ? ` ${st.hints.join(' ')}` : '';
  return `Área de Trabalho Remota indisponível no agent: ${parts.join('; ')}.${hints}`;
}

/**
 * WebRDP (F22/R2): renderiza o desktop remoto NO NAVEGADOR via IronRDP WASM
 * sobre RDCleanPath.
 *
 * Fluxo:
 *   1. Assina .rdp.cleanpath.out (subject DEDICADO, separado de .tunnel.out);
 *   2. Pede o preflight RDP ao agent pelo canal de controle do túnel;
 *   3. Abre a sessão WebSocket do RDCleanPath pela API (/tunnel/ws);
 *   4. O IronRDP WASM (chunk lazy de ~5 MiB) desenha no <canvas>.
 *
 * O agent faz o handshake X.224 + TLS com o TermService e impõe o destino
 * fail-closed 127.0.0.1:3389 — o browser nunca abre socket TCP.
 *
 * A conexão NUNCA embute ?access_token= na URL: a credencial vai no CONNECT do NATS.
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
  const [preflight, setPreflight] = useState<RdpPreflightStatus | null>(null);
  // Gate do preflight: só bloqueia a conexão quando o AGENT afirma que o RDP
  // está indisponível. Erros de conexão NÃO entram aqui — senão o erro viraria
  // uma dependência do efeito e re-executaria a guarda, impedindo qualquer retry.
  const [rdpUnavailable, setRdpUnavailable] = useState(false);
  // Contador de tentativas: cada retry consome um ticket novo (uso único).
  const [connectAttempt, setConnectAttempt] = useState(0);
  const [streamOpen, setStreamOpen] = useState(false);
  const [ironStatus, setIronStatus] = useState<IronRdpStatus>('idle');
  const [ironDetail, setIronDetail] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const serviceRef = useRef<NatsService | null>(null);
  const sessionHandleRef = useRef<IronRdpSessionHandle | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const jwtRef = useRef(jwt);
  const freshCredsRef = useRef(getFreshCredentials);
  freshCredsRef.current = getFreshCredentials;

  const subj = useMemo(() => natsSubject.replace(/-/g, ''), [natsSubject]);
  const tunnelInSubject = `${subj}.tunnel.in`;
  const tunnelOutSubject = `${subj}.tunnel.out`;

  // Subject DEDICADO do RDCleanPath. NÃO usar .tunnel.out: no site, o
  // RemoteProxy deriva o subject do mesmo natsSubject e os dois parsers
  // descartariam os bytes um do outro silenciosamente (ver decisão 3b).
  const cleanpathOutSubject = `${subj}.rdp.cleanpath.out`;

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
      // A porta local do .rdp só existe se o operador estiver rodando o
      // forwarder (discovery-agent.exe --rdp-tunnel) na própria máquina. Sem
      // isso o mstsc falha com "não foi possível conectar". Avisamos em vez de
      // entregar um link morto silenciosamente.
      setDownloadError(
        `Arquivo .rdp baixado apontando para 127.0.0.1:${rdpLocalPort}. Para o mstsc conectar, ` +
        'o forwarder precisa estar ativo nesta máquina: discovery-agent.exe --rdp-tunnel ' +
        `--api-url=<api> --agent-id=${agentId} --session-id=${sessionId}`,
      );
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

  // ── Conexão NATS do túnel RDP (apenas preflight/controle) ──
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
    // Credenciais ANTES de qualquer subscribe: subscribeRaw com
    // connectIfNeeded:false retorna false (sem assinar) quando a credencial
    // ainda não está disponível, perdendo a assinatura em silêncio.
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
      const ctrl = parseTunnelControl(raw);
      if (!ctrl) return;
      if (ctrl.op === 'preflight') {
        const { status: st, legacy } = parseRdpPreflight(ctrl.rdpStatus);
        if (st) {
          setPreflight(st);
          const msg = describePreflight(st);
          setPreflightError(msg);
          // unavailable só quando o agent de fato reporta o RDP fora do ar.
          setRdpUnavailable(st.ready === false);
        } else if (legacy) {
          // Compatibilidade com agent antigo que mandava string.
          if (legacy !== 'ok' && legacy !== 'ready' && legacy !== 'enabled') {
            setPreflightError(ctrl.error ?? `Área de Trabalho Remota indisponível no agent (status: ${legacy}).`);
          } else {
            setPreflightError(null);
          }
        } else if (ctrl.error) {
          // ctrl.error vem de JSON do agent e pode ser objeto; nunca renderizar cru.
          setPreflightError(typeof ctrl.error === 'string' ? ctrl.error : String(ctrl.error));
        }
        ctrlCallbacks.forEach((cb) => cb(ctrl));
        return;
      }
      if (ctrl.op === 'opened') {
        setStreamOpen(true);
        setPreflightError(null);
        setRdpUnavailable(false);
      } else if (ctrl.op === 'close') {
        setStreamOpen(false);
      } else if (ctrl.op === 'error') {
        setPreflightError(
          typeof ctrl.error === 'string' && ctrl.error ? ctrl.error : 'Erro no túnel RDP do agent.',
        );
        // Erro de túnel pode indicar RDP indisponível no agent.
        setRdpUnavailable(true);
      }
      ctrlCallbacks.forEach((cb) => cb(ctrl));
    };

    type RawCapable = { subscribeRaw?: (s: string, cb: (d: Uint8Array) => void, o?: { connectIfNeeded?: boolean }) => Promise<boolean>; unsubscribeRaw?: (s: string, cb: (d: Uint8Array) => void) => void };
    const rawService = service as unknown as RawCapable;
    const hasRaw = typeof rawService.subscribeRaw === 'function' && !!rawService.subscribeRaw;

    void (async () => {
      setStatus((prev) => (prev === 'idle' ? 'connecting' : prev));
      const ok = await service.connect();
      if (!mounted) return;
      if (ok) {
        // Assina DEPOIS do connect(): a credencial já está aplicada e o SUB é
        // registrado de fato (antes, com connectIfNeeded:false, a assinatura
        // era abortada e os frames nunca chegavam).
        if (hasRaw && rawService.subscribeRaw) {
          await rawService.subscribeRaw(tunnelOutSubject, handleTunnelOut, { connectIfNeeded: false });
        } else {
          await service.subscribe(tunnelOutSubject, (() => { /* fallback sem raw */ }) as never, { connectIfNeeded: false });
        }
        if (!mounted) return;
        // Pede o preflight RDP ao agent pelo canal de controle do túnel.
        void service.publish(tunnelInSubject, { op: 'preflight', protocol: 'rdp' }).catch(() => { /* best-effort */ });
      } else {
        setStatus((prev) => (prev === 'connected' ? prev : 'error'));
        setError((prev) => prev ?? 'Conexão NATS do túnel RDP falhou.');
      }
    })();

    return () => {
      mounted = false;
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

  // ── Sessão IronRDP WASM (renderização no canvas) ──
  useEffect(() => {
    if (!sessionId || !jwt || !natsUrl) return;
    if (!canvasRef.current) return;
    // Só NÃO conecta quando o agent afirmou que o RDP está indisponível.
    // Erros de conexão ficam em estado separado para permitir retry.
    if (rdpUnavailable) return;

    let cancelled = false;
    let handle: IronRdpSessionHandle | null = null;

    void (async () => {
      try {
        // Pré-carrega o WASM (~4,89 MB) ANTES de pedir o ticket: o ticket tem
        // TTL de 60s e é de uso único, então em primeiro acesso (ou rede lenta)
        // ele expiraria durante o download e o WebSocket tomaria 401.
        setIronStatus('loading');
        await preloadIronRdp();
        if (cancelled) return;
        // Re-lê o canvas APÓS os awaits: o nó capturado no início do efeito pode
        // ter sido desmontado (troca de aba/reconexão) e desenhar num canvas
        // destacado deixaria a tela preta.
        const liveCanvas = canvasRef.current;
        if (!liveCanvas) return;

        // O /tunnel/ws exige ticket efêmero de uso único: a URL do WebSocket não
        // carrega headers e o endpoint recusa ?access_token= na query string.
        // Pedido o MAIS TARDE possível, imediatamente antes de conectar.
        const ticket = await remoteSessionsApi.issueTunnelTicket(agentId, sessionId);
        if (cancelled) return;
        const proxyUrl = buildProxyUrl(natsUrl, agentId, sessionId, ticket.ticket);
        const h = await connectIronRdp({
          canvas: liveCanvas,
          proxyUrl,
          destination: `127.0.0.1:3389`,
          username: '',
          password: '',
          width: liveCanvas.width || DEFAULT_WIDTH,
          height: liveCanvas.height || DEFAULT_HEIGHT,
          enableCredssp: true,
          // proxy_auth do RDCleanPath. O agent é fail-closed: sem isto ele
          // responde Error PDU 401 e o canvas fica preto. Reutilizamos o ticket
          // efêmero já emitido — ele é de uso único, mas esta é a MESMA conexão
          // (a API o consome no upgrade e o agent valida presença/formato).
          authToken: ticket.ticket,
          callbacks: {
            onStatus: (s, detail) => {
              if (cancelled) return;
              setIronStatus(s);
              if (detail) setIronDetail(detail);
            },
            onError: (msg) => {
              if (cancelled) return;
              // Erro de CONEXÃO: mostra, mas NÃO bloqueia retry.
              setConnectError(msg);
            },
          },
        });
        if (cancelled) {
          h.dispose();
          return;
        }
        handle = h;
        sessionHandleRef.current = h;
        setConnectError(null);
      } catch (err) {
        if (cancelled) return;
        const info = describeIronError(err);
        setConnectError(info.message);
      }
    })();

    return () => {
      cancelled = true;
      if (handle) handle.dispose();
      if (sessionHandleRef.current === handle) sessionHandleRef.current = null;
    };
    // NÃO incluir preflightError/connectError aqui: eles são ESCRITOS por este
    // efeito e, como dependências, causariam re-execução e dead-end (o erro
    // viraria o próprio bloqueio da retentativa).
  }, [sessionId, jwt, natsUrl, agentId, rdpUnavailable, connectAttempt, cleanpathOutSubject]);

  const tone = status === 'connected'
    ? 'bg-success/20 text-success'
    : status === 'error'
      ? 'bg-danger/20 text-danger'
      : 'bg-warning/20 text-warning';

  const ironTone = ironStatus === 'connected'
    ? 'bg-success/20 text-success'
    : ironStatus === 'error'
      ? 'bg-danger/20 text-danger'
      : 'bg-warning/20 text-warning';

  const IRON_LABEL: Record<IronRdpStatus, string> = {
    idle: 'RDP inativo',
    loading: 'Carregando WASM…',
    connecting: 'Negociando RDP…',
    connected: 'RDP conectado',
    closed: 'RDP encerrado',
    error: 'Erro no RDP',
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-surface border-b border-border text-xs">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium ${tone}`}>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" aria-hidden />
          {STATUS_LABEL[status]}
        </span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium ${ironTone}`}>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" aria-hidden />
          {IRON_LABEL[ironStatus]}
        </span>
        {streamOpen && <span className="text-success">stream ativo</span>}
        <span className="flex-1" />
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
          onClick={() => { void handleDownloadRdp(); }}
          disabled={downloading || !sessionId || !agentId}
          title="Baixa o arquivo .rdp (mstsc). Requer o discovery-agent.exe --rdp-tunnel rodando na sua máquina apontando para esta sessão."
        >
          ⬇ Baixar arquivo .rdp
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-2 bg-black/40">
        {!sessionId || !jwt ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <div className="text-4xl mb-3">🖥</div>
            <p className="text-sm mb-1">Sessão RDP não iniciada</p>
            <p className="text-muted-foreground">Conecte a sessão para abrir o WebRDP.</p>
          </div>
        ) : (
          <div className="flex flex-col h-full gap-2">
            {preflightError && (
              <div className="rounded border border-danger/40 bg-danger/20 p-2 text-danger text-xs" role="alert">
                ⛔ {preflightError}
              </div>
            )}
            {connectError && (
              <div className="flex items-center gap-2 rounded border border-danger/40 bg-danger/20 p-2 text-danger text-xs" role="alert">
                <span>⛔ {connectError}</span>
                <span className="flex-1" />
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-danger/30 hover:bg-danger/50 transition-colors"
                  onClick={() => {
                    // Cada tentativa consome um ticket NOVO (uso único).
                    setConnectError(null);
                    setConnectAttempt((n) => n + 1);
                  }}
                >
                  Tentar novamente
                </button>
              </div>
            )}
            {preflight && preflight.ready && !preflightError && (
              <div className="rounded border border-success/40 bg-success/10 p-2 text-success text-xs">
                RDP pronto no agent (TermService: {preflight.termServiceState ?? '—'}, porta {preflight.port ?? 3389}).
              </div>
            )}
            {ironDetail && !preflightError && (
              <div className="text-muted-foreground text-xs">{ironDetail}</div>
            )}
            <canvas
              ref={canvasRef}
              width={DEFAULT_WIDTH}
              height={DEFAULT_HEIGHT}
              className="flex-1 min-h-0 w-full bg-black rounded border border-border"
              aria-label="Área de trabalho remota"
            />
            {error && (
              <div className="rounded border border-danger/40 bg-danger/20 p-2 text-danger text-xs" role="alert">
                ⛔ {error}
              </div>
            )}
            {downloadError && (
              <div className="rounded border border-warning/40 bg-warning/20 p-2 text-warning text-xs">
                {downloadError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Monta a URL WebSocket do proxy RDCleanPath.
 *
 * Deriva de natsUrl apenas para descobrir o host base; o caminho é o endpoint
 * /tunnel/ws da API, que faz a ponte WebSocket <-> NATS. O JWT NUNCA vai na
 * query string — a autenticação usa o ticket efêmero do endpoint dedicado.
 */
export function buildProxyUrl(natsUrl: string, agentId: string, sessionId: string, ticket?: string): string {
  const base = deriveHttpBase(natsUrl);
  const url = `${base}/api/v1/remote-sessions/${encodeURIComponent(agentId)}/${encodeURIComponent(sessionId)}/tunnel/ws`;
  // O ticket vai na query string (a URL do WebSocket não aceita headers).
  // NUNCA usar ?access_token= aqui: o backend rejeita explicitamente.
  return ticket ? `${url}?ticket=${encodeURIComponent(ticket)}` : url;
}

/** Converte a URL do NATS (ws/wss) na base HTTP(S) correspondente. */
function deriveHttpBase(natsUrl: string): string {
  try {
    const u = new URL(natsUrl);
    const proto = u.protocol === 'wss:' ? 'https:' : u.protocol === 'ws:' ? 'http:' : u.protocol;
    return `${proto}//${u.host}`;
  } catch {
    // Sem URL válida: usa a origem atual (mesma origem da API do site).
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return '';
  }
}
