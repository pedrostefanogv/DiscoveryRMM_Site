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
  /** Código de erro de socket do Windows (WSA), quando aplicável. */
  wsaErrorCode?: number;
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
  const info: IronRdpErrorInfo = { kind: 'unknown', message: 'Erro desconhecido no cliente RDP.' };
  if (err == null) return info;

  // Erro lançado como string simples.
  if (typeof err === 'string') {
    info.message = err;
    return info;
  }
  if (typeof err !== 'object') {
    info.message = String(err);
    return info;
  }

  const anyErr = err as Record<string, unknown>;

  // Mensagem crua do erro/objeto (NUNCA usar String(objeto): vira "[object Object]").
  const rawMessage = extractMessage(anyErr);

  try {
    if (typeof anyErr.kind === 'function') {
      const k = (anyErr.kind as () => unknown)();
      // IronErrorKind é um enum numérico; converte para nome legível.
      info.kind = kindName(k);
    }
  } catch { /* best-effort */ }

  // O IronError do wasm-bindgen expõe backtrace()/message como MÉTODOS. Quando
  // não há mensagem legível, o backtrace (que traz a causa do lado Rust) é a
  // única fonte útil — sem ele sobraria apenas o handle __wbg_ptr.
  //
  // O backtrace é MAIS ESPECÍFICO que explainByKind (genérico por kind), então
  // tem precedência sobre ele. Guardamos em wasmDetail para decidir no final.
  const wasmDetail = rawMessage ? null : extractWasmDetail(anyErr);

  try {
    if (typeof anyErr.rdcleanpathDetails === 'function') {
      const d = (anyErr.rdcleanpathDetails as () => Record<string, unknown> | undefined)();
      if (d && typeof d === 'object') {
        if (typeof d.errorCode === 'number') info.rdcleanpathCode = d.errorCode;
        if (typeof d.httpStatusCode === 'number') info.httpStatusCode = d.httpStatusCode;
        if (typeof d.tlsAlertCode === 'number') info.tlsAlertCode = d.tlsAlertCode;
        if (typeof d.wsaErrorCode === 'number') info.wsaErrorCode = d.wsaErrorCode;
      }
    }
  } catch { /* best-effort */ }

  const code = info.rdcleanpathCode;
  if (code !== undefined) {
    info.message = describeRdcCleanPathCode(code, info);
    return info;
  }

  // Precedência da mensagem, do mais específico ao mais genérico:
  //  1. message do próprio erro;
  //  2. backtrace do WASM (causa do lado Rust);
  //  3. explicação genérica pelo kind.
  if (rawMessage) {
    info.message = rawMessage;
    return info;
  }
  if (wasmDetail) {
    info.message = wasmDetail;
    return info;
  }
  info.message = explainByKind(info);
  return info;
}

/**
 * Extrai uma mensagem legível de um erro sem nunca produzir "[object Object]".
 *
 * Erros do wasm-bindgen são objetos simples (não instâncias de Error), então
 * String(err) devolveria "[object Object]" — que era exatamente o que a UI
 * mostrava, escondendo a causa real da falha.
 */
function extractMessage(obj: Record<string, unknown>): string | null {
  // 1. Error nativo ou qualquer objeto com message string.
  if (typeof obj.message === 'string' && obj.message.trim()) {
    return obj.message;
  }
  // 2. Erro do wasm-bindgen às vezes traz a descrição em campos próprios.
  for (const key of ['error', 'reason', 'description', 'detail', 'backtrace']) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  // 3. Objetos aninhados de erro.
  const cause = obj.cause;
  if (cause && typeof cause === 'object') {
    const nested = extractMessage(cause as Record<string, unknown>);
    if (nested) return nested;
  }
  // 4. Último recurso: serializa APENAS campos com conteúdo útil. Sem este
  // filtro, um objeto como {message: ""} viraria '{"message":""}' — tecnicamente
  // não é "[object Object]", mas continua inútil para diagnosticar a falha.
  //
  // CUIDADO: objetos do wasm-bindgen têm a propriedade interna __wbg_ptr (um
  // ponteiro linear-memory). Serializá-la produzia exatamente
  // '{"__wbg_ptr":2100144}' na tela — vazamento de detalhe interno do WASM e
  // zero informação útil ao operador.
  try {
    const useful: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'stack' || k === '__wbg_ptr') continue;
      if (v == null) continue;
      if (typeof v === 'string' && !v.trim()) continue;
      if (typeof v === 'object') continue;
      useful[k] = v;
      if (++count >= 8) break;
    }
    if (count > 0) {
      const json = JSON.stringify(useful);
      if (json && json !== '{}') return json;
    }
  } catch { /* circular */ }
  return null;
}

/**
 * Extrai detalhe dos MÉTODOS de um IronError do wasm-bindgen.
 *
 * Esses objetos expõem os dados por protótipo (kind/rdcleanpathDetails/
 * backtrace), não como propriedades próprias — daí um Object.entries só enxergar
 * __wbg_ptr. O backtrace é a última fonte útil: traz a cadeia de erro do Rust.
 */
function extractWasmDetail(obj: Record<string, unknown>): string | null {
  // O backtrace pode vir como método (wasm-bindgen) ou campo.
  try {
    if (typeof obj.backtrace === 'function') {
      const bt = (obj.backtrace as () => unknown)();
      if (typeof bt === 'string' && bt.trim()) return tidyBacktrace(bt);
    }
  } catch { /* best-effort */ }
  if (typeof obj.backtrace === 'string' && obj.backtrace.trim()) {
    return tidyBacktrace(obj.backtrace);
  }
  return null;
}

/** Reduz o backtrace do Rust a algo exibível (sem poluir a UI com ruído). */
function tidyBacktrace(bt: string): string {
  const lines = bt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return bt;
  // A primeira linha costuma ser a causa real; o resto é cadeia de chamadas.
  const first = lines[0];
  return lines.length > 1 ? `${first}` : first;
}

/** Converte IronErrorKind (enum numérico do WASM) em nome legível. */
function kindName(k: unknown): string {
  if (typeof k === 'string') return k;
  // IronErrorKind: 0 General, 1 WrongPassword, 2 LogonFailure, 3 AccessDenied,
  // 4 RDCleanPath, 5 ProxyConnect, 6 NegotiationFailure.
  const map: Record<number, string> = {
    0: 'General',
    1: 'WrongPassword',
    2: 'LogonFailure',
    3: 'AccessDenied',
    4: 'RDCleanPath',
    5: 'ProxyConnect',
    6: 'NegotiationFailure',
  };
  if (typeof k === 'number' && map[k]) return map[k];
  return 'unknown';
}

/** Explica a falha quando não há mensagem nem código disponíveis. */
function explainByKind(info: IronRdpErrorInfo): string {
  switch (info.kind) {
    case 'ProxyConnect':
      return 'Não foi possível conectar ao proxy RDCleanPath (WebSocket /tunnel/ws). Verifique se o agent está atualizado e se a rede permite WebSocket.';
    case 'NegotiationFailure':
      return 'Falha na negociação RDP com a máquina remota.';
    case 'AccessDenied':
      return 'Acesso negado pelo servidor RDP.';
    case 'WrongPassword':
      return 'Usuário ou senha RDP incorretos.';
    case 'LogonFailure':
      return 'Não foi possível efetuar logon na máquina remota.';
    case 'RDCleanPath':
      return 'Erro no handshake RDCleanPath com o agent.';
    default:
      return 'Falha ao iniciar o cliente RDP (sem detalhes do erro). Verifique o console do navegador.';
  }
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

/** Cache do modulo: o init() do wasm-bindgen deve rodar UMA vez por pagina. */
let ironRdpModulePromise: Promise<IronRdpModule> | null = null;

/**
 * Importa o modulo WASM de forma dinamica (chunk separado).
 *
 * O resultado e MEMOIZADO: chamar init() duas vezes no mesmo modulo e
 * desperdicio, e chamadas concorrentes poderiam instanciar o WASM em duplicata.
 */
export async function loadIronRdpModule(): Promise<IronRdpModule> {
  if (!ironRdpModulePromise) {
    ironRdpModulePromise = (async () => {
      const mod = await import('ironrdp-wasm');
      await mod.default();
      if (typeof mod.setup === 'function') {
        try { mod.setup('warn'); } catch { /* logging opcional */ }
      }
      return mod as unknown as IronRdpModule;
    })().catch((err) => {
      // Falha no download/init nao deve envenenar o cache para sempre.
      ironRdpModulePromise = null;
      throw err;
    });
  }
  return ironRdpModulePromise;
}

/**
 * Pre-carrega o modulo WASM sem conectar.
 *
 * Chamado ANTES de pedir o ticket do /tunnel/ws: o ticket e de uso unico com
 * TTL de 60s, e o binario tem ~4,89 MB. Baixar o WASM depois de emitir o
 * ticket fazia o ticket expirar no primeiro acesso em rede lenta.
 */
export async function preloadIronRdp(): Promise<void> {
  await loadIronRdpModule();
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
