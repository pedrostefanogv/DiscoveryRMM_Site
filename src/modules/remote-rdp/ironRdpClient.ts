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
  /**
   * true quando a falha é de CREDENCIAL (usuário/senha ausente ou rejeitada).
   * A UI usa isto para exibir o formulário de credenciais em vez de um erro
   * terminal — o IronRDP recusa connect() com "username missing" quando o
   * builder não recebeu usuário.
   */
  needsCredentials?: boolean;
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

  // Sinaliza falha de credencial ANTES de qualquer return: um erro pode ser de
  // credencial E trazer mensagem/código, e sem isto a UI nunca ofereceria o
  // formulário (o return antecipado pularia a marcação).
  info.needsCredentials = isCredentialError({
    ...info,
    message: rawMessage ?? wasmDetail ?? info.message,
  });

  const code = info.rdcleanpathCode;
  if (code !== undefined) {
    // Códigos RDCleanPath descrevem falha de PROXY/alvo, não de credencial do
    // Windows: não devem abrir o formulário de credenciais.
    info.needsCredentials = false;
    info.message = describeRdcCleanPathCode(code, info);
    return info;
  }

  // Precedência da mensagem, do mais específico ao mais genérico:
  //  1. message do próprio erro;
  //  2. backtrace do WASM (causa do lado Rust);
  //  3. explicação genérica pelo kind.
  if (rawMessage) {
    // Falha de credencial do Windows: traduz para algo acionável em vez de
    // expor o texto cru do CredSSP.
    const friendly = describeCredentialFailure(rawMessage);
    info.message = friendly ?? rawMessage;
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

/**
 * Informa se o erro é de credencial (ausente ou rejeitada).
 *
 * Cobre tanto o kind sancionado pelo WASM (WrongPassword/LogonFailure/
 * AccessDenied) quanto as mensagens textuais que o IronRDP emite antes de
 * abrir a conexão (ex.: "username missing", "password missing", "credentials
 * required") — nesses casos o WebSocket nem chega a ser aberto.
 */
export function isCredentialError(info: IronRdpErrorInfo): boolean {
  if (info.kind === 'WrongPassword' || info.kind === 'LogonFailure' || info.kind === 'AccessDenied') {
    return true;
  }
  const msg = (info.message || '').toLowerCase();
  return (
    msg.includes('username missing') ||
    msg.includes('password missing') ||
    msg.includes('credentials missing') ||
    msg.includes('credentials required') ||
    msg.includes('missing username') ||
    msg.includes('missing password') ||
    // CredSSP/NLA rejeitou as credenciais no servidor Windows:
    //   STATUS_LOGON_FAILURE (0xc000006d) = usuario ou senha incorretos
    //   STATUS_NO_SUCH_USER  (0xc0000064) = usuario inexistente
    //   STATUS_ACCOUNT_DISABLED / LOCKED / EXPIRED
    msg.includes('status_logon_failure') ||
    msg.includes('0xc000006d') ||
    msg.includes('status_no_such_user') ||
    msg.includes('0xc0000064') ||
    msg.includes('status_account_disabled') ||
    msg.includes('status_account_locked_out') ||
    msg.includes('status_password_expired') ||
    msg.includes('logon_failure') ||
    msg.includes('logonfailure')
  );
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

/**
 * Traduz falhas de credencial do Windows (CredSSP/NLA) para texto acionável.
 *
 * O erro cru do IronRDP é longo e em inglês:
 *   "[CredSSP] CredSSP: InvalidToken: CredSSP server returned an error status;
 *    status is STATUS_LOGON_FAILURE [0xc000006d]"
 */
export function describeCredentialFailure(message: string): string | null {
  const m = (message || '').toLowerCase();
  if (m.includes('0xc000006d') || m.includes('status_logon_failure')) {
    return 'Usuário ou senha incorretos. Confira o usuário, a senha e o domínio (deixe o domínio vazio para conta local).';
  }
  if (m.includes('0xc0000064') || m.includes('status_no_such_user')) {
    return 'Esse usuário não existe nesta máquina. Verifique o nome ou informe o domínio correto.';
  }
  if (m.includes('0xc0000234') || m.includes('status_account_locked_out')) {
    return 'A conta está bloqueada por tentativas incorretas. Desbloqueie no Windows e tente de novo.';
  }
  if (m.includes('0xc0000072') || m.includes('status_account_disabled')) {
    return 'A conta está desabilitada no Windows.';
  }
  if (m.includes('0xc0000071') || m.includes('status_password_expired')) {
    return 'A senha dessa conta expirou. Redefina no Windows.';
  }
  if (m.includes('logon_failure') || m.includes('invalidtoken')) {
    return 'O Windows recusou o logon. Verifique usuário, senha e domínio.';
  }
  return null;
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
  /** Fabrica de eventos de entrada (mouse/teclado/roda). */
  DeviceEvent: {
    keyPressed: (scancode: number) => unknown;
    keyReleased: (scancode: number) => unknown;
    mouseButtonPressed: (button: number) => unknown;
    mouseButtonReleased: (button: number) => unknown;
    mouseMove: (x: number, y: number) => unknown;
    wheelRotations: (vertical: boolean, amount: number, unit: number) => unknown;
  };
  /** Transacao que agrupa eventos de entrada. */
  InputTransaction: new () => { addEvent: (e: unknown) => void };
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
  /**
   * OBRIGATÓRIO junto com setCursorStyleCallbackContext. O WASM valida os dois
   * em connect(); faltar qualquer um aborta com "set_cursor_style_callback
   * missing" / "set_cursor_style_callback_context missing".
   */
  setCursorStyleCallback: (cb: (style: string) => void) => IronSessionBuilder;
  /** OBRIGATÓRIO junto com setCursorStyleCallback (ver acima). */
  setCursorStyleCallbackContext: (context: unknown) => IronSessionBuilder;
  remoteClipboardChangedCallback: (cb: (data: unknown) => void) => IronSessionBuilder;
  forceClipboardUpdateCallback: (cb: () => void) => IronSessionBuilder;
  connect: () => Promise<IronSession>;
}

interface IronSession {
  run: () => Promise<{ reason: () => string }>;
  resize: (w: number, h: number, scale?: number | null, pw?: number | null, ph?: number | null) => void;
  shutdown: () => void;
  free: () => void;
  /** Envia um lote de eventos de mouse/teclado ao desktop remoto. */
  applyInputs: (transaction: unknown) => void;
}


/**
 * Mapa de scancodes PS/2 Set 1 (KeyboardEvent.code -> scancode do RDP).
 *
 * Teclas estendidas levam o prefixo 0xE0 (ex.: setas, Home/End, Ctrl direito).
 * Este mapa e o contrato do IronRDP: enviar o scancode ERRADO faz a tecla sair
 * trocada no desktop remoto, por isso ele fica aqui, explicito e completo.
 */
const SCANCODE_MAP: Record<string, number> = {
  Escape: 0x01, Digit1: 0x02, Digit2: 0x03, Digit3: 0x04,
  Digit4: 0x05, Digit5: 0x06, Digit6: 0x07, Digit7: 0x08,
  Digit8: 0x09, Digit9: 0x0a, Digit0: 0x0b, Minus: 0x0c,
  Equal: 0x0d, Backspace: 0x0e, Tab: 0x0f,
  KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12, KeyR: 0x13,
  KeyT: 0x14, KeyY: 0x15, KeyU: 0x16, KeyI: 0x17,
  KeyO: 0x18, KeyP: 0x19, BracketLeft: 0x1a, BracketRight: 0x1b,
  Enter: 0x1c, ControlLeft: 0x1d,
  KeyA: 0x1e, KeyS: 0x1f, KeyD: 0x20, KeyF: 0x21,
  KeyG: 0x22, KeyH: 0x23, KeyJ: 0x24, KeyK: 0x25,
  KeyL: 0x26, Semicolon: 0x27, Quote: 0x28, Backquote: 0x29,
  ShiftLeft: 0x2a, Backslash: 0x2b,
  KeyZ: 0x2c, KeyX: 0x2d, KeyC: 0x2e, KeyV: 0x2f,
  KeyB: 0x30, KeyN: 0x31, KeyM: 0x32, Comma: 0x33,
  Period: 0x34, Slash: 0x35, ShiftRight: 0x36,
  NumpadMultiply: 0x37, AltLeft: 0x38, Space: 0x39,
  CapsLock: 0x3a,
  F1: 0x3b, F2: 0x3c, F3: 0x3d, F4: 0x3e,
  F5: 0x3f, F6: 0x40, F7: 0x41, F8: 0x42,
  F9: 0x43, F10: 0x44,
  NumLock: 0x45, ScrollLock: 0x46,
  Numpad7: 0x47, Numpad8: 0x48, Numpad9: 0x49,
  NumpadSubtract: 0x4a, Numpad4: 0x4b, Numpad5: 0x4c,
  Numpad6: 0x4d, NumpadAdd: 0x4e, Numpad1: 0x4f,
  Numpad2: 0x50, Numpad3: 0x51, Numpad0: 0x52,
  NumpadDecimal: 0x53,
  F11: 0x57, F12: 0x58,
  NumpadEnter: 0xe01c, ControlRight: 0xe01d,
  NumpadDivide: 0xe035, PrintScreen: 0xe037,
  AltRight: 0xe038, Home: 0xe047, ArrowUp: 0xe048,
  PageUp: 0xe049, ArrowLeft: 0xe04b, ArrowRight: 0xe04d,
  End: 0xe04f, ArrowDown: 0xe050, PageDown: 0xe051,
  Insert: 0xe052, Delete: 0xe053,
  MetaLeft: 0xe05b, MetaRight: 0xe05c, ContextMenu: 0xe05d,
  Pause: 0xe11d45,
};

/** RotationUnit.Line do IronRDP (roda do mouse em "linhas", nao pixels). */
const WHEEL_ROTATION_UNIT_LINE = 1;

/** Handle dos handlers de input anexados ao canvas. */
export interface IronRdpInputHandle {
  /** Remove todos os listeners. Idempotente. */
  detach: () => void;
}

/**
 * Anexa a captura de mouse/teclado/roda ao canvas e envia os eventos ao RDP.
 *
 * POR QUE ISTO E NECESSARIO: renderCanvas() apenas DESENHA a tela remota. Ele
 * nao captura entrada. Sem estes handlers, o desktop remoto aparece mas nao
 * aceita clique nem digitacao — e o navegador trata o clique direito como
 * menu de contexto proprio em vez de enviar ao Windows remoto.
 *
 * O mapeamento de scancodes e o contrato do IronRDP: um scancode errado faz a
 * tecla sair trocada no destino.
 */
export function attachInputHandlers(
  canvas: HTMLCanvasElement,
  session: IronSession,
  mod: IronRdpModule,
): IronRdpInputHandle {
  const { DeviceEvent, InputTransaction } = mod;
  const send = (event: unknown) => {
    const tx = new (InputTransaction as unknown as new () => { addEvent: (e: unknown) => void })();
    tx.addEvent(event);
    session.applyInputs(tx);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // preventDefault impede o navegador de tratar a tecla (ex.: Ctrl+W, F5).
    e.preventDefault();
    e.stopPropagation();
    const sc = SCANCODE_MAP[e.code];
    if (sc === undefined) return;
    try { send(DeviceEvent.keyPressed(sc)); } catch { /* sessao encerrada */ }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sc = SCANCODE_MAP[e.code];
    if (sc === undefined) return;
    try { send(DeviceEvent.keyReleased(sc)); } catch { /* sessao encerrada */ }
  };

  const onMouseMove = (e: MouseEvent) => {
    try {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // A tela remota tem resolucao propria (canvas.width/height), que pode
      // diferir do tamanho exibido: sem escalar, o cursor fica deslocado.
      const x = Math.round((e.clientX - rect.left) * (canvas.width / rect.width));
      const y = Math.round((e.clientY - rect.top) * (canvas.height / rect.height));
      send(DeviceEvent.mouseMove(x, y));
    } catch { /* sessao encerrada */ }
  };

  const onMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    // Foca o canvas para que o teclado passe a ser capturado.
    canvas.focus();
    try { send(DeviceEvent.mouseButtonPressed(e.button)); } catch { /* sessao encerrada */ }
  };

  const onMouseUp = (e: MouseEvent) => {
    e.preventDefault();
    try { send(DeviceEvent.mouseButtonReleased(e.button)); } catch { /* sessao encerrada */ }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    try {
      if (e.deltaY !== 0) {
        send(DeviceEvent.wheelRotations(true, e.deltaY > 0 ? -1 : 1, WHEEL_ROTATION_UNIT_LINE));
      }
      if (e.deltaX !== 0) {
        send(DeviceEvent.wheelRotations(false, e.deltaX > 0 ? -1 : 1, WHEEL_ROTATION_UNIT_LINE));
      }
    } catch { /* sessao encerrada */ }
  };

  // ESTE e o handler que resolve o sintoma relatado: sem ele, o clique direito
  // abre o menu de contexto do NAVEGADOR em vez de ir para o Windows remoto.
  const onContextMenu = (e: Event) => e.preventDefault();

  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  let detached = false;
  return {
    detach: () => {
      if (detached) return;
      detached = true;
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
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

  // ATENÇÃO: o connect() do WASM VALIDA a presença destes campos e aborta com
  // "username missing" / "password missing" / "auth_token missing". Por isso são
  // definidos SEMPRE (mesmo vazios) — omitir a chamada é pior que passar "".
  //
  // Consequência prática: o formulário de credenciais é obrigatório, porque sem
  // usuário o IronRDP não inicia a conexão.
  builder.username(username ?? '');
  builder.password(password ?? '');
  builder.authToken(authToken ?? '');
  if (domain) builder.serverDomain(domain);

  // CredSSP/NLA. Necessario em Windows moderno que exige NLA no TermService.
  if (enableCredssp) {
    builder.extension(new mod.Extension('enable_credssp', true));
  }

  // Cursor: o WASM EXIGE os DOIS setters antes de connect(). A lista de
  // validação do binário é literal:
  //   username / destination / password / proxy_address / auth_token /
  //   render_canvas / set_cursor_style_callback / set_cursor_style_callback_context
  // Faltar qualquer um aborta o connect() ANTES de abrir o WebSocket — foi o que
  // produziu "set_cursor_style_callback_context missing" e, depois de eu remover
  // o callback, "set_cursor_style_callback missing" (o outro lado do mesmo par).
  //
  // O contexto é o objeto entregue ao callback quando o estilo muda; usamos o
  // próprio canvas para aplicar o cursor via CSS.
  const cursorContext = { canvas };
  builder.setCursorStyleCallbackContext(cursorContext);
  builder.setCursorStyleCallback((style: string) => {
    // 'default' é o valor neutro; os demais são nomes de cursor CSS.
    const css = !style || style === 'default' ? 'default' : style;
    try {
      canvas.style.cursor = css;
    } catch { /* estilo inválido — mantém o padrão */ }
  });

  let session: IronSession;
  try {
    session = await builder.connect();
  } catch (err) {
    const info = describeIronError(err);
    setStatus('error', info.message);
    callbacks.onError?.(info.message);
    throw Object.assign(new Error(info.message), { ironRdp: info });
  }

  // Captura de entrada: sem isto o desktop aparece mas NAO aceita clique nem
  // digitacao (e o clique direito abre o menu do NAVEGADOR).
  const input = attachInputHandlers(canvas, session, mod);
  // O canvas precisa receber foco para capturar teclado.
  try { canvas.tabIndex = 0; } catch { /* atributo opcional */ }

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
      input.detach();
      try { session.shutdown(); } catch { /* ja encerrada */ }
      try { session.free(); } catch { /* liberado */ }
    },
    resize: (w: number, h: number) => {
      if (disposed) return;
      try { session.resize(w, h); } catch { /* sessao encerrada */ }
    },
  };
}
