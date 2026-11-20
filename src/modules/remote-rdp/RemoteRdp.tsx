import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  createNatsService,
  jwtExpiresAtUtc,
  type NatsConnectionState,
  type NatsCredentialsResponse,
  type NatsService,
} from '@/api/nats';
import { remoteSessionsApi } from '@/api/remote-sessions';
import { parseTunnelControl, type TunnelControlMsg } from '@/modules/remote-proxy/proxyFrame';
import {
  connectIronRdp,
  describeIronError,
  preloadIronRdp,
  type IronRdpSessionHandle,
  type IronRdpStatus,
  type SpecialKeyCombo,
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

}

type RdpStatus = 'idle' | 'connecting' | 'connected' | 'error';

const STATUS_LABEL: Record<RdpStatus, string> = {
  idle: 'Aguardando sessão',
  connecting: 'Conectando ao túnel RDP…',
  connected: 'Túnel RDP ativo',
  error: 'Falha no túnel RDP',
};

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
  // Campos do formulário de credenciais RDP. Ficam apenas em memória — nunca
  // em localStorage.
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('');
  // SNAPSHOT das credenciais SUBMETIDAS (no clique de "Conectar").
  //
  // A conexão usa ESTE valor, nunca o campo em digitação. Motivo (bug real,
  // confirmado no log do Windows com "user=p"): ao depender do campo, o efeito
  // de conexão disparava na PRIMEIRA TECLA — quando o usuário digitava "p" de
  // "pedro", o IronRDP já conectava com o valor parcial "p" e o servidor
  // respondia STATUS_NO_SUCH_USER (0xc0000064).
  const [submitted, setSubmitted] = useState<{ username: string; password: string; domain: string } | null>(null);
  const [needsCredentials, setNeedsCredentials] = useState(false);
  const [streamOpen, setStreamOpen] = useState(false);
  const [ironStatus, setIronStatus] = useState<IronRdpStatus>('idle');

  const [connectError, setConnectError] = useState<string | null>(null);
  // Aviso de area de transferencia: o navegador pode BLOQUEAR a leitura/escrita
  // do clipboard (permissao ou aba sem foco). Sem avisar, o operador conclui
  // que o recurso nao existe em vez de ajustar a permissao.
  const [clipboardNote, setClipboardNote] = useState<string | null>(null);

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

    // CREDENCIAIS SÃO OBRIGATÓRIAS PARA RDP: o IronRDP valida presença de
    // usuário e, sem ele, ou aborta com "username missing" ou entra num
    // handshake NLA fadado a falhar. Pedimos as credenciais ANTES — o
    // comportamento esperado pelo operador.
    //
    // IMPORTANTE: o gate olha o SNAPSHOT `submitted`, não os campos do
    // formulário. Se olhasse os campos, o efeito dispararia na primeira tecla
    // e conectaria com o usuário PARCIAL (bug real: "pedro" virava "p" e o
    // servidor respondia STATUS_NO_SUCH_USER).
    if (!submitted) {
      setNeedsCredentials(true);
      setIronStatus('idle');
      return;
    }

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
          // Credenciais do SNAPSHOT (submetidas no clique), nunca o campo vivo.
          username: submitted.username,
          password: submitted.password,
          domain: submitted.domain,
          width: liveCanvas.width || DEFAULT_WIDTH,
          height: liveCanvas.height || DEFAULT_HEIGHT,
          enableCredssp: true,
          // proxy_auth do RDCleanPath. O agent é fail-closed: sem isto ele
          // responde Error PDU 401 e o canvas fica preto. Reutilizamos o ticket
          // efêmero já emitido — ele é de uso único, mas esta é a MESMA conexão
          // (a API o consome no upgrade e o agent valida presença/formato).
          authToken: ticket.ticket,
          callbacks: {
            onStatus: (s) => {
              if (cancelled) return;
              setIronStatus(s);
            },
            onClipboard: (ev) => {
              if (cancelled) return;
              if (ev.ok) {
                setClipboardNote(null);
                return;
              }
              setClipboardNote(
                ev.direction === 'toRemote'
                  ? 'O navegador bloqueou a LEITURA da área de transferência. Permita o acesso ao clipboard neste site para colar do seu computador no Windows remoto.'
                  : 'O navegador bloqueou a ESCRITA na área de transferência (a aba precisa estar em foco para copiar do Windows remoto).',
              );
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
        // Falha de credencial: em vez de erro terminal, pede as credenciais.
        // (O IronRDP recusa connect() sem usuário antes de abrir o WebSocket.)
        setNeedsCredentials(info.needsCredentials === true);
      }
    })();

    return () => {
      cancelled = true;
      if (handle) handle.dispose();
      if (sessionHandleRef.current === handle) sessionHandleRef.current = null;
    };
    // NÃO incluir preflightError/connectError aqui: eles são ESCRITOS por este
    // efeito e, como dependências, causariam re-execução e dead-end.
    //
    // As dependências usam o SNAPSHOT submitted, nunca os campos username/
    // password/domain. Dois bugs reais nasceram de usar os campos aqui:
    //   1. username (string) -> cada TECLA reconectava (ticket + handshake novos
    //      em loop) e a tela ficava presa em "Negociando RDP...";
    //   2. hasUsername (booleano) -> disparava na PRIMEIRA tecla e conectava com
    //      o usuário PARCIAL: "pedro" chegava como "p" no Windows, que respondia
    //      STATUS_NO_SUCH_USER (0xc0000064).
    // submitted só muda no clique de Conectar, junto de connectAttempt.
  }, [sessionId, jwt, natsUrl, agentId, rdpUnavailable, connectAttempt, submitted, cleanpathOutSubject]);

  /**
   * Envia as credenciais e tenta conectar.
   *
   * password/domain não entram em dependência alguma: o gatilho explícito da
   * conexão é este submit (via connectAttempt).
   */
  const submitCredentials = useCallback((e?: FormEvent) => {
    e?.preventDefault();
    const u = username.trim();
    if (!u) return;
    // Congela as credenciais: a conexão usa este snapshot, não os campos vivos.
    setSubmitted({ username: u, password, domain: domain.trim() });
    setConnectError(null);
    // Esconde o formulário durante a tentativa; se as credenciais forem
    // recusadas pelo Windows, o catch volta a exibi-lo para o operador corrigir.
    setNeedsCredentials(false);
    setConnectAttempt((n) => n + 1);
  }, [username, password, domain]);

  // Limpa a senha da memória ao desmontar (troca de aba/encerramento).
  useEffect(() => () => {
    setPassword('');
  }, []);

  // Chips de estado com fundo SÓLIDO e texto branco: funciona nos dois temas.
  // A versão anterior (bg-*/20 + text-*) lavava no tema claro, porque as cores
  // semânticas claras (#15803d etc.) são escuras e o fundo a 20% ficava quase branco.
  const tone = status === 'connected'
    ? 'bg-success text-white'
    : status === 'error'
      ? 'bg-danger text-white'
      : 'bg-warning text-white';

  const ironTone = ironStatus === 'connected'
    ? 'bg-success text-white'
    : ironStatus === 'error'
      ? 'bg-danger text-white'
      : ironStatus === 'idle'
        ? 'bg-muted text-white'
        : 'bg-warning text-white';

  const IRON_LABEL: Record<IronRdpStatus, string> = {
    idle: 'RDP inativo',
    loading: 'Carregando WASM…',
    connecting: 'Negociando RDP…',
    connected: 'RDP conectado',
    closed: 'RDP encerrado',
    error: 'Erro no RDP',
  };

  /**
   * Aviso exibido SOBRE o canvas quando não há sessão ativa.
   *
   * Serve a dois propósitos: (1) LIMPAR a tela — o canvas continuaria mostrando
   * o último frame da sessão encerrada, dando a impressão de que ela segue
   * viva; (2) explicar o estado, em vez de deixar um retângulo preto mudo.
   */
  const overlayState: { icon: string; title: string; detail?: string } = (() => {
    switch (ironStatus) {
      case 'loading':
        return {
          icon: '⏳',
          title: 'Carregando cliente RDP…',
          detail: 'O binário do WebRDP (~5 MB) é baixado apenas na primeira conexão.',
        };
      case 'connecting':
        return {
          icon: '🔗',
          title: 'Conectando à máquina remota…',
          detail: 'Negociando o túnel e a autenticação.',
        };
      case 'closed':
        return {
          icon: '⏹',
          title: 'Sessão remota encerrada',
          detail: 'Use Reconectar para abrir uma nova sessão.',
        };
      case 'error':
        return {
          icon: '⛔',
          title: 'Falha na sessão RDP',
          detail: 'Veja a mensagem de erro acima para o motivo.',
        };
      default:
        return {
          icon: '🖥',
          title: 'Aguardando conexão',
          // Texto DELIBERADAMENTE diferente do formulário: repetir
          // "Informe as credenciais" aqui seria redundante na tela.
          detail: 'A área de trabalho remota aparecerá aqui após a autenticação.',
        };
    }
  })();

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-surface border-b border-border text-xs">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold shadow-sm ${tone}`}>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/90" aria-hidden />
          {STATUS_LABEL[status]}
        </span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold shadow-sm ${ironTone}`}>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/90" aria-hidden />
          {IRON_LABEL[ironStatus]}
        </span>
        {streamOpen && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-success text-white font-semibold shadow-sm">
            stream ativo
          </span>
        )}
      </div>

      {/* O fundo escuro do canvas NAO fica aqui: as caixas de status usam cores
          semanticas e, sobre um backdrop preto translucido, ficavam lavadas no
          tema claro. O preto fica apenas no canvas (letterbox do desktop). */}
      <div className="flex-1 min-h-0 overflow-auto p-2 bg-background">
        {!sessionId || !jwt ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <div className="text-4xl mb-3">🖥</div>
            <p className="text-sm mb-1">Sessão RDP não iniciada</p>
            <p className="text-muted-foreground">Conecte a sessão para abrir o WebRDP.</p>
          </div>
        ) : (
          <div className="flex flex-col h-full gap-2">
            {/* Caixas de alerta com fundo SOLIDO + texto branco: legiveis nos dois
                temas. Fundo translucido dependeria do que esta atras. */}
            {preflightError && (
              <div className="rounded-md bg-danger px-3 py-2 text-white text-xs font-medium shadow-sm" role="alert">
                ⛔ {preflightError}
              </div>
            )}
            {connectError && (
              <div className="flex items-center gap-2 rounded-md bg-danger px-3 py-2 text-white text-xs font-medium shadow-sm" role="alert">
                <span>⛔ {connectError}</span>
                <span className="flex-1" />
                {/* Falha de CREDENCIAL: o caminho de retry é o FORMULÁRIO abaixo.
                    Um "Tentar novamente" cego aqui repetiria o mesmo erro em loop,
                    porque nada mudou (usuário continua ausente). */}
                {!needsCredentials && (
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-white/20 hover:bg-white/30 transition-colors font-medium"
                    onClick={() => {
                      // Cada tentativa consome um ticket NOVO (uso único).
                      setConnectError(null);
                      setConnectAttempt((n) => n + 1);
                    }}
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}
            {preflight && preflight.ready && !preflightError && (
              <div className="rounded-md bg-success px-3 py-2 text-white text-xs font-medium shadow-sm">
                ✓ RDP pronto no agent (TermService: {preflight.termServiceState ?? '—'}, porta {preflight.port ?? 3389}).
              </div>
            )}

            {needsCredentials && (
              <form
                onSubmit={submitCredentials}
                className="rounded-md border border-warning/60 bg-surface-light p-3 text-xs space-y-2 shadow-sm"
              >
                <p className="font-semibold text-foreground">
                  Informe as credenciais do Windows desta máquina para abrir a sessão RDP.
                </p>
                <p className="text-muted-foreground">
                  A sessão RDP exige um logon do Windows, por isso as credenciais são
                  necessárias antes de conectar.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Domínio (opcional)</span>
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="DOMINIO"
                      autoComplete="off"
                      className="px-2 py-1 rounded bg-surface border border-border text-foreground w-36"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Usuário *</span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="usuario ou usuario@dominio"
                      autoComplete="username"
                      required
                      className="px-2 py-1 rounded bg-surface border border-border text-foreground w-52"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Senha</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="px-2 py-1 rounded bg-surface border border-border text-foreground w-52"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!username.trim()}
                    className="px-3 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
                  >
                    Conectar
                  </button>
                </div>
                <p className="text-muted-foreground">
                  As credenciais ficam apenas nesta aba e são enviadas dentro do túnel
                  autenticado — nunca são gravadas no navegador.
                </p>
              </form>
            )}
            {/* Wrapper relativo: permite sobrepor o canvas com o aviso de estado.
                O canvas precisa continuar MONTADO (o IronRDP escreve nele), então
                não o removemos — cobrimos. */}
            <div className="relative flex-1 min-h-0 w-full">
              {/* Fundo preto SÓ no canvas: é a área do desktop remoto (letterbox). */}
              {/* tabIndex: o canvas precisa receber FOCO para capturar teclado.
                  Sem ele o mouse funciona mas a digitacao vai para a pagina.
                  outline-none evita o anel de foco padrao do navegador por cima
                  do desktop remoto. */}
              <canvas
                ref={canvasRef}
                width={DEFAULT_WIDTH}
                height={DEFAULT_HEIGHT}
                tabIndex={0}
                className="w-full h-full bg-black rounded border border-border outline-none focus:border-primary"
                aria-label="Área de trabalho remota"
              />
              {/* LIMPA A TELA ao encerrar: sem esta camada o canvas continuaria
                  exibindo o ULTIMO FRAME da sessão morta, como se ainda
                  estivesse conectado. O overlay é opaco e cobre esse resíduo. */}
              {ironStatus !== 'connected' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded bg-black text-white text-center px-4">
                  <div className="text-4xl" aria-hidden>{overlayState.icon}</div>
                  <p className="text-sm font-medium">{overlayState.title}</p>
                  {overlayState.detail && (
                    <p className="text-xs text-white/70 max-w-md">{overlayState.detail}</p>
                  )}
                </div>
              )}
            </div>
            {error && (
              <div className="rounded-md bg-danger px-3 py-2 text-white text-xs font-medium shadow-sm" role="alert">
                ⛔ {error}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Rodapé: teclas especiais que NÃO podem ser enviadas pelo teclado físico.
          Ctrl+Alt+Del, por exemplo, é interceptado pelo SO do operador antes de
          chegar ao navegador — precisa de injeção pelo canal RDP, como o
          "Send Ctrl+Alt+Del" do mstsc. */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-surface border-t border-border text-xs">
        <span className="text-muted-foreground mr-1">Teclas especiais:</span>
        {SPECIAL_KEYS.map(({ combo, label, title }) => (
          <button
            key={combo}
            type="button"
            onClick={() => sessionHandleRef.current?.sendSpecialKeys(combo)}
            disabled={ironStatus !== 'connected'}
            title={title}
            className="px-2 py-1 rounded-md border border-border-strong bg-surface-light text-foreground font-medium hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {label}
          </button>
        ))}
        <span className="flex-1" />
        {/* Estado da area de transferencia: texto discreto, so aparece quando
            ha algo a dizer (falha de permissao, area de transferencia inativa). */}
        {ironStatus === 'connected' && !clipboardNote && (
          <span className="text-muted-foreground" title="Copiar no Windows remoto e colar no seu PC, e vice-versa">
            Área de transferência sincronizada
          </span>
        )}
        {clipboardNote && (
          <span className="text-warning" role="status">
            {clipboardNote}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Teclas especiais oferecidas no rodapé.
 *
 * São combinações que o teclado físico não consegue produzir dentro do
 * navegador: o SO do operador intercepta Ctrl+Alt+Del, Win e Alt+Tab antes de a
 * página recebê-las. Por isso precisam de botão dedicado, como no mstsc.
 */
const SPECIAL_KEYS: Array<{ combo: SpecialKeyCombo; label: string; title: string }> = [
  { combo: 'ctrl-alt-del', label: 'Ctrl+Alt+Del', title: 'Envia a sequência de segurança (tela de logon / gerenciador de tarefas)' },
  { combo: 'ctrl-shift-esc', label: 'Ctrl+Shift+Esc', title: 'Abre o Gerenciador de Tarefas do Windows remoto' },
  { combo: 'alt-tab', label: 'Alt+Tab', title: 'Alterna entre as janelas do Windows remoto' },
  { combo: 'alt-f4', label: 'Alt+F4', title: 'Fecha a janela ativa no Windows remoto' },
  { combo: 'win', label: 'Win', title: 'Abre o menu Iniciar do Windows remoto' },
  { combo: 'ctrl-esc', label: 'Ctrl+Esc', title: 'Abre o menu Iniciar do Windows remoto (alternativa)' },
  { combo: 'print-screen', label: 'Print Screen', title: 'Captura a tela do Windows remoto para a área de transferência' },
];

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
