/**
 * Cliente WebRDP via IronRDP WASM (RDCleanPath).
 *
 * Por que este modulo existe separado: o binario `rdp_client_bg.wasm` tem ~5 MiB.
 * Ele NUNCA pode entrar no bundle principal — por isso o import do pacote e
 * DINAMICO (`await import('ironrdp-wasm')`), de forma que o Vite o coloque em um
 * chunk proprio, baixado apenas quando o operador abre a aba RDP.
 *
 * Arquitetura (Fase 3b do backend):
 *   browser (IronRDP WASM) --WebSocket/NATS--> agent (RDCleanPath proxy)
 *                                                   |
 *                                           127.0.0.1:3389 (TermService)
 *
 * O agent faz o handshake X.224 + TLS e devolve a cadeia de certificados; o
 * browser nunca abre socket TCP. Ver Discovery/src/app/core/remotesession/rdcleanpath.
 */

/** Estado de conexao exposto ao componente React. */
export type IronRdpStatus = 'idle' | 'loading' | 'connecting' | 'connected' | 'closed' | 'error';

/** Callbacks de observacao da sessao. */
export interface IronRdpCallbacks {
  onStatus?: (status: IronRdpStatus, detail?: string) => void;
  onError?: (message: string) => void;
  onTerminated?: (reason: string) => void;
}

/** Opcoes de conexao. */
export interface IronRdpConnectOptions {
  /** Canvas onde o desktop remoto e renderizado. */
  canvas: HTMLCanvasElement;
  /** URL WebSocket do proxy RDCleanPath (endpoint /tunnel/ws da API). */
  proxyUrl: string;
  /** Destino. O AGENT ignora este valor (fail-closed 127.0.0.1:<port>); mantido
   *  por compatibilidade de protocolo. */
  destination?: string;
  username: string;
  password: string;
  domain?: string;
  width: number;
  height: number;
  /** Habilita CredSSP/NLA. Necessario quando o TermService exige NLA. */
  enableCredssp?: boolean;
  /** Token de autorizacao do proxy (proxy_auth do RDCleanPath). */
  authToken?: string;
  callbacks?: IronRdpCallbacks;
}

/** Handle da sessao ativa. */
export interface IronRdpSessionHandle {
  /** Encerra a sessao e libera recursos WASM. */
  dispose: () => void;
  /** Redimensiona o desktop remoto. */
  resize: (width: number, height: number) => void;
}

/** Erro tipado vindo do IronRDP, com detalhes do RDCleanPath. */
export interface IronRdpErrorInfo {
  kind: string;
  message: string;
  rdcleanpathCode?: number;
  httpStatusCode?: number;
  tlsAlertCode?: number;
}

/**
 * Traduz o `IronError` do WASM para uma mensagem legivel em portugues.
 *
 * Os codigos espelham os que o agent Go emite (rdcleanpath/pdu.go):
 *   1 general, 2 negotiation, 100 expirado, 101 ainda nao valido, 102 revogado,
 *   103 alvo inalcancavel, 104 falha de DNS, 105 falha de TLS.
 *   16384..32767 = implementation-specific.
 */
export function describeIronError(err: unknown): IronRdpErrorInfo {
  const info: IronRdpErrorInfo = { kind: 'unknown', message: String(err) };
  if (!err || typeof err !== 'object') return info;

  const anyErr = err as Record<string, unknown>;

  try {
    if (typeof anyErr.kind === 'function') {
      const k = (anyErr.kind as () => unknown)();
      info.kind = String(k);
    }
  } catch { /* best-effort */ }

  try {
    if (typeof anyErr.rdcleanpathDetails === 'function') {
      const d = (anyErr.rdcleanpathDetails as () => Record<string, unknown> | undefined)();
      if (d && typeof d === 'object') {
        if (typeof d.errorCode === 'number') info.rdcleanpathCode = d.errorCode;
        if (typeof d.httpStatusCode === 'number') info.httpStatusCode = d.httpStatusCode;
        if (typeof d.tlsAlertCode === 'number') info.tlsAlertCode = d.tlsAlertCode;
      }
    }
  } catch { /* best-effort */ }

  const code = info.rdcleanpathCode;
  if (code !== undefined) {
    info.message = describeRdcCleanPathCode(code, info);
    return info;
  }

  // Sem codigo RDCleanPath: usa a mensagem do proprio erro.
  if (typeof anyErr.message === 'string' && anyErr.message) {
    info.message = anyErr.message;
  }
  return info;
}

/** Mensagem legivel para um codigo de erro RDCleanPath. */
function describeRdcCleanPathCode(code: number, info: IronRdpErrorInfo): string {
  switch (code) {
    case 1:
      return 'Erro geral no proxy RDCleanPath' + (info.httpStatusCode ? ` (HTTP ${info.httpStatusCode})` : '') + '.';
    case 2:
      return 'Falha de negociacao RDP com a maquina remota.';
    case 100:
      return 'Credencial do proxy expirada. Reconecte a sessao.';
    case 101:
      return 'Credencial do proxy ainda nao e valida.';
    case 102:
      return 'Credencial do proxy foi revogada.';
    case 103:
      return 'Alvo inalcancavel: o agent nao conseguiu abrir conexao com o TermService em 127.0.0.1:3389. Verifique se a Area de Trabalho Remota esta habilitada.';
    case 104:
      return 'Falha ao resolver o nome do alvo no agent.';
    case 105:
      return 'Falha no handshake TLS com o servidor RDP.';
    default:
      if (code >= 16384 && code <= 32767) {
        return `Erro especifico do proxy (codigo ${code}).`;
      }
      return `Erro RDCleanPath (codigo ${code}).`;
  }
}

/**
 * Importa o modulo WASM de forma dinamica (chunk separado).
 * Exportado para permitir mock nos testes sem carregar 5 MiB.
 */
export async function loadIronRdpModule(): Promise<IronRdpModule> {
  const mod = await import('ironrdp-wasm');
  // O init() carrega o .wasm; chamadas repetidas sao baratas (idempotente no glue).
  await mod.default();
  if (typeof mod.setup === 'function') {
    try { mod.setup('warn'); } catch { /* logging opcional */ }
  }
  return mod as unknown as IronRdpModule;
}

/** Superficie minima do modulo WASM que realmente usamos. */
export interface IronRdpModule {
  default: (input?: unknown) => Promise<unknown>;
  setup?: (level: string) => void;
  SessionBuilder: new () => IronSessionBuilder;
  DesktopSize: new (width: number, height: number) => unknown;
  Extension: new (ident: string, value: unknown) => unknown;
}

interface IronSessionBuilder {
  username: (v: string) => IronSessionBuilder;
  password: (v: string) => IronSessionBuilder;
  destination: (v: string) => IronSessionBuilder;
  proxyAddress: (v: string) => IronSessionBuilder;
  serverDomain: (v: string) => IronSessionBuilder;
  authToken: (v: string) => IronSessionBuilder;
  desktopSize: (v: unknown) => IronSessionBuilder;
  renderCanvas: (c: HTMLCanvasElement) => IronSessionBuilder;
  extension: (e: unknown) => IronSessionBuilder;
  setCursorStyleCallback: (cb: (style: string) => void) => IronSessionBuilder;
  remoteClipboardChangedCallback: (cb: (data: unknown) => void) => IronSessionBuilder;
  forceClipboardUpdateCallback: (cb: () => void) => IronSessionBuilder;
  connect: () => Promise<IronSession>;
}

interface IronSession {
  run: () => Promise<{ reason: () => string }>;
  resize: (w: number, h: number, scale?: number | null, pw?: number | null, ph?: number | null) => void;
  shutdown: () => void;
  free: () => void;
}

/**
 * Conecta ao WebRDP. Devolve um handle para encerrar/redimensionar.
 *
 * O destino e o proxy sao resolvidos pelo agent: o `destination` aqui e apenas
 * informativo no protocolo e NAO autoriza outro host.
 */
export async function connectIronRdp(opts: IronRdpConnectOptions): Promise<IronRdpSessionHandle> {
  const {
    canvas, proxyUrl, destination = '127.0.0.1:3389',
    username, password, domain, width, height,
    enableCredssp = true, authToken, callbacks = {},
  } = opts;

  const setStatus = (s: IronRdpStatus, d?: string) => callbacks.onStatus?.(s, d);

  if (!canvas) throw new Error('Canvas obrigatorio para o WebRDP.');
  if (!proxyUrl) throw new Error('URL do proxy RDCleanPath obrigatoria.');

  setStatus('loading', 'Carregando cliente RDP (WASM)…');
  const mod = await loadIronRdpModule();

  setStatus('connecting', 'Conectando ao túnel RDP…');

  const builder = new mod.SessionBuilder();
  builder.destination(destination);
  builder.proxyAddress(proxyUrl);
  builder.desktopSize(new mod.DesktopSize(width, height));
  builder.renderCanvas(canvas);

  // Credenciais RDP. Vazias sao permitidas: o server pode usar credenciais
  // salvas ou o operador pode ser promptado pelo proprio RDP.
  if (username) builder.username(username);
  if (password) builder.password(password);
  if (domain) builder.serverDomain(domain);
  if (authToken) builder.authToken(authToken);

  // CredSSP/NLA. Necessario em Windows moderno que exige NLA no TermService.
  if (enableCredssp) {
    builder.extension(new mod.Extension('enable_credssp', true));
  }

  // Callbacks opcionais de clipboard/cursor (best-effort).
  builder.setCursorStyleCallback(() => { /* estilo padrao */ });

  let session: IronSession;
  try {
    session = await builder.connect();
  } catch (err) {
    const info = describeIronError(err);
    setStatus('error', info.message);
    callbacks.onError?.(info.message);
    throw Object.assign(new Error(info.message), { ironRdp: info });
  }

  setStatus('connected', 'Sessão RDP ativa');

  // run() bloqueia ate a sessao terminar; nao aguardamos aqui para o componente
  // seguir responsivo. O encerramento e reportado via callback.
  void session.run()
    .then((term) => {
      const reason = typeof term?.reason === 'function' ? term.reason() : 'encerrada';
      setStatus('closed', reason);
      callbacks.onTerminated?.(reason);
    })
    .catch((err: unknown) => {
      const info = describeIronError(err);
      setStatus('error', info.message);
      callbacks.onError?.(info.message);
    });

  let disposed = false;
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try { session.shutdown(); } catch { /* ja encerrada */ }
      try { session.free(); } catch { /* liberado */ }
    },
    resize: (w: number, h: number) => {
      if (disposed) return;
      try { session.resize(w, h); } catch { /* sessao encerrada */ }
    },
  };
}
