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
  /** Sincronizacao de area de transferencia (bidirecional). */
  onClipboard?: (event: IronRdpClipboardEvent) => void;
  /** Nova resolucao aplicada ao desktop remoto (acompanha a janela). */
  onDesktopResize?: (width: number, height: number) => void;
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
  /**
   * Resolucao MINIMA do desktop remoto. A resolucao acompanha a janela, mas
   * nunca fica abaixo disto. Default: HD (1280x720).
   */
  minDesktopWidth?: number;
  minDesktopHeight?: number;
  callbacks?: IronRdpCallbacks;
}

/** Notificacao de sincronizacao de area de transferencia. */
export interface IronRdpClipboardEvent {
  /** toLocal = Windows remoto -> navegador; toRemote = navegador -> Windows. */
  direction: 'toLocal' | 'toRemote';
  ok: boolean;
  /** Motivo da falha (ex.: permissao negada, documento sem foco). */
  reason?: string;
}

/** Handle da sessao ativa. */
export interface IronRdpSessionHandle {
  /** Encerra a sessao e libera recursos WASM. */
  dispose: () => void;
  /** Redimensiona o desktop remoto. */
  resize: (width: number, height: number) => void;
  /**
   * Envia um texto ao clipboard remoto (usado depois de o operador liberar a
   * permissao, para o conteudo local ja valer sem esperar novo paste).
   */
  pasteClipboard: (text: string) => Promise<void>;
  /**
   * Envia uma tecla especial pelo ID canonico (ex.: 'ctrl+alt+del').
   *
   * Necessario porque combinacoes como Ctrl+Alt+Del, Win e Alt+Tab sao
   * interceptadas pelo SO do OPERADOR antes de chegarem ao navegador; precisam
   * de injecao pelo canal RDP.
   *
   * IDs desconhecidos sao ignorados (o menu so oferece os validos).
   */
  sendSpecialKeys: (comboId: string) => void;
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
    // Erros crus e em inglês do Windows/CredSSP: traduz para algo acionável em
    // vez de expor o texto do protocolo ao operador.
    info.message =
      describeCredentialFailure(rawMessage)
      ?? describeProtocolError(rawMessage)
      ?? rawMessage;
    return info;
  }
  if (wasmDetail) {
    info.message = describeProtocolError(wasmDetail) ?? wasmDetail;
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

/**
 * Traduz erros de PROTOCOLO do RDP que não são de credencial nem de proxy.
 *
 * O caso mais comum em operação é a sessão ser derrubada por outra conexão com
 * a MESMA conta: o Windows permite apenas uma sessão RDP por usuário, então a
 * segunda conexão encerra a primeira.
 */
export function describeProtocolError(message: string): string | null {
  const m = (message || '').toLowerCase();
  if (m.includes('another user connected')) {
    return 'Outra conexão com esta máquina usando a mesma conta encerrou esta sessão. '
      + 'O Windows permite apenas UMA sessão remota por usuário: feche a outra janela '
      + '(ou a sessão no console dessa conta) e conecte novamente.';
  }
  if (m.includes('protocol independent error') && m.includes('disconnect')) {
    return 'A sessão remota foi encerrada pelo servidor. Reconecte para continuar.';
  }
  if (m.includes('session') && m.includes('taken over')) {
    return 'Esta sessão foi assumida por outra conexão. Reconecte para continuar.';
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
  /** Conteudo de area de transferencia enviado ao remoto (CLIPRDR). */
  ClipboardData: new () => { addText: (mimeType: string, text: string) => void };
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
  /** Entrega o conteudo do clipboard local ao Windows remoto (CLIPRDR). */
  onClipboardPaste: (content: unknown) => Promise<void>;
  /** Envia um texto do clipboard local ao remoto (usado ao liberar permissao). */
  pasteText: (text: string) => Promise<void>;
  /**
   * Resolucao ATUAL da area de trabalho remota, lida do proprio IronRDP.
   * E a fonte da verdade do resize: nunca assumir que o pedido foi aplicado.
   */
  desktopSize: () => { width: number; height: number };
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

/**
 * Libera explicitamente um objeto wasm-bindgen.
 *
 * A memoria desses objetos vive no HEAP DO WASM, nao no heap do JS: o
 * wasm-bindgen depende de `free()` (ou do FinalizationRegistry, quando o objeto
 * JS e coletado) para devolve-la. Como criamos uma transacao a CADA evento de
 * mouse, depender so do GC acumulava memoria durante a sessao.
 *
 * Best-effort: liberar duas vezes nao pode derrubar a sessao.
 */
function freeWasm(obj: unknown): void {
  try {
    (obj as { free?: () => void } | null | undefined)?.free?.();
  } catch { /* ja liberado */ }
}

/**
 * Converte um ponto da area do canvas para coordenadas da tela remota.
 *
 * O canvas e exibido com `object-fit: contain`: ele ocupa TODA a area util e a
 * imagem e escalada mantendo a proporcao, o que cria faixas (letterbox) quando
 * a proporcao da janela difere da resolucao remota.
 *
 * E preciso descontar a ESCALA e o DESLOCAMENTO das faixas. Usar apenas
 * `larguraRemota / larguraExibida` (erro comum) desloca o clique exatamente nas
 * faixas, e o erro cresce conforme a diferenca de proporcao.
 *
 * Devolve null quando o ponto cai FORA da imagem (na faixa preta) — nao ha o
 * que enviar ao Windows nesse caso.
 *
 * @param offsetX posicao do ponteiro relativa ao canto do canvas
 * @param offsetY idem, vertical
 * @param displayW largura exibida do canvas (CSS px)
 * @param displayH altura exibida do canvas (CSS px)
 * @param remoteW resolucao remota (buffer do canvas)
 * @param remoteH idem, vertical
 */
export function mapPointerToRemote(
  offsetX: number,
  offsetY: number,
  displayW: number,
  displayH: number,
  remoteW: number,
  remoteH: number,
): { x: number; y: number } | null {
  if (displayW <= 0 || displayH <= 0 || remoteW <= 0 || remoteH <= 0) return null;
  const scale = Math.min(displayW / remoteW, displayH / remoteH);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const padX = (displayW - remoteW * scale) / 2;
  const padY = (displayH - remoteH * scale) / 2;
  const x = Math.round((offsetX - padX) / scale);
  const y = Math.round((offsetY - padY) / scale);
  if (x < 0 || y < 0 || x >= remoteW || y >= remoteH) return null;
  return { x, y };
}

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
    // applyInputs processa a transacao de forma sincrona; devolver a memoria
    // evita acumular um objeto por evento de mouse/teclado.
    freeWasm(tx);
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

  /**
   * Converte a posicao do ponteiro para as coordenadas da tela remota.
   *
   * O canvas e exibido com `object-fit: contain`: ele ocupa toda a area util e a
   * IMAGEM e escalada mantendo a proporcao, deixando faixas (letterbox) quando a
   * proporcao da janela difere da resolucao remota.
   *
   * Sem descontar escala E deslocamento das faixas, o clique sai deslocado do
   * ponto apontado — erro classico de clientes que so usam `width/rect.width`.
   */
  const toRemoteCoords = (e: MouseEvent): { x: number; y: number } | null => {
    const rect = canvas.getBoundingClientRect();
    return mapPointerToRemote(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      canvas.width,
      canvas.height,
    );
  };

  const onMouseMove = (e: MouseEvent) => {
    try {
      const p = toRemoteCoords(e);
      if (!p) return;
      send(DeviceEvent.mouseMove(p.x, p.y));
    } catch { /* sessao encerrada */ }
  };

  const onMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    // Foca o canvas para que o teclado passe a ser capturado.
    canvas.focus();
    try {
      // Move ANTES de pressionar: garante que o Windows clique na posicao
      // apontada, mesmo se o mousemove anterior foi descartado por estar na
      // faixa de letterbox.
      const p = toRemoteCoords(e);
      if (p) send(DeviceEvent.mouseMove(p.x, p.y));
      send(DeviceEvent.mouseButtonPressed(e.button));
    } catch { /* sessao encerrada */ }
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
 * Sequencias de scancodes PS/2 Set 1 das teclas especiais, indexadas pelos IDs
 * CANONICOS de `remote-screen/specialKeys.ts`.
 *
 * REAPROVEITAMENTO DELIBERADO: os IDs vem da allow-list fechada que o AGENT ja
 * usa no canal `.input` do screen sharing. Manter uma lista propria de rotulos
 * aqui criaria duas fontes de verdade que divergem com o tempo (rotulo, hint e
 * agrupamento ja existem la). Este mapa so acrescenta o que faltava para o
 * caminho RDP: a sequencia de scancodes.
 *
 * Modificadores vem PRIMEIRO na sequencia (ver sendSpecialKeys, que solta na
 * ordem inversa).
 *
 * Ctrl+Alt+Del: o TermService reconhece a sequencia vinda do canal RDP como
 * Secure Attention Sequence — e o mesmo caminho do "Enviar Ctrl+Alt+Del" do
 * mstsc, com injecao privilegiada no servidor.
 */
export const RDP_SPECIAL_KEY_SEQUENCES: Record<string, number[]> = {
  // Segurança
  'ctrl+alt+del': [0x1d, 0x38, 0xe053],
  'win+l': [0xe05b, 0x26],
  // Gerenciamento
  'ctrl+shift+esc': [0x1d, 0x2a, 0x01],
  'ctrl+esc': [0x1d, 0x01],
  'alt+tab': [0x38, 0x0f],
  'alt+shift+tab': [0x38, 0x2a, 0x0f],
  'alt+f4': [0x38, 0x3e],
  // Windows
  'win': [0xe05b],
  'win+d': [0xe05b, 0x20],
  'win+e': [0xe05b, 0x12],
  'win+r': [0xe05b, 0x13],
  'win+x': [0xe05b, 0x2d],
  'win+tab': [0xe05b, 0x0f],
  // Captura de tela
  'printscreen': [0xe037],
  'alt+printscreen': [0x38, 0xe037],
};

/**
 * Anexa a sincronizacao BIDIRECIONAL de area de transferencia.
 *
 * Direcao 1 — remoto -> navegador: o CLIPRDR do RDP avisa quando o clipboard
 *   do Windows muda; escrevemos o texto no clipboard do navegador.
 * Direcao 2 — navegador -> remoto: quando o usuario cola no Windows remoto, o
 *   IronRDP pede o clipboard local; lemos e enviamos via onClipboardPaste().
 *
 * LIMITES DO NAVEGADOR (nao do RDP):
 *  - writeText() exige contexto seguro (HTTPS) e documento com foco;
 *  - readText() pode exigir PERMISSAO explicita (no Firefox, 'clipboard-read')
 *    e costuma falhar se a aba nao estiver em foco.
 * Nenhuma das duas pode derrubar a sessao: qualquer falha e reportada ao
 * callback e o RDP segue funcionando.
 */
function attachClipboardHandlers(
  builder: IronSessionBuilder,
  mod: IronRdpModule,
  sessionRef: { current: IronSession | null },
  notify?: (direction: 'toLocal' | 'toRemote', ok: boolean, reason?: string) => void,
): void {
  // ── Direcao 1: clipboard do Windows remoto -> clipboard do navegador ──
  builder.remoteClipboardChangedCallback((data: unknown) => {
    void (async () => {
      try {
        const cd = data as { isEmpty?: () => boolean; items?: () => Array<{ mimeType: () => string; value: () => unknown }> };
        if (!cd || typeof cd.items !== 'function') return;
        if (typeof cd.isEmpty === 'function' && cd.isEmpty()) return;

        const items = cd.items();
        // CLIPRDR manda texto como 'text/plain' (as vezes com charset).
        const textItem = items.find((i) => (i.mimeType() || '').toLowerCase().startsWith('text/'));
        if (!textItem) return; // imagens/arquivos nao sao suportados aqui

        const value = textItem.value();
        const text = typeof value === 'string' ? value : String(value ?? '');
        if (!text) return;

        if (!navigator.clipboard?.writeText) {
          notify?.('toLocal', false, 'Clipboard API indisponivel (exige HTTPS).');
          return;
        }
        await navigator.clipboard.writeText(text);
        notify?.('toLocal', true);
      } catch (err) {
        // Documento sem foco e a causa mais comum; nao e erro fatal.
        notify?.('toLocal', false, err instanceof Error ? err.message : String(err));
      }
    })();
  });

  // ── Direcao 2: clipboard do navegador -> clipboard do Windows remoto ──
  builder.forceClipboardUpdateCallback(() => {
    void (async () => {
      const session = sessionRef.current;
      if (!session) return;
      const send = async (text: string) => {
        const data = new mod.ClipboardData();
        if (text) data.addText('text/plain', text);
        await session.onClipboardPaste(data);
        freeWasm(data);
      };
      try {
        if (!navigator.clipboard?.readText) {
          // Sem permissao de leitura enviamos vazio: isso sinaliza ao remoto
          // que o clipboard local esta vazio, em vez de travar o canal.
          await send('');
          notify?.('toRemote', false, 'Clipboard API indisponivel (exige HTTPS).');
          return;
        }
        const text = await navigator.clipboard.readText();
        await send(text ?? '');
        notify?.('toRemote', true);
      } catch (err) {
        try { await send(''); } catch { /* canal ja encerrado */ }
        notify?.('toRemote', false, err instanceof Error ? err.message : String(err));
      }
    })();
  });
}

/** Tamanhos mínimos suportados para o desktop remoto. */
export const MIN_DESKTOP_HD = { width: 1280, height: 720 } as const;
export const MIN_DESKTOP_FHD = { width: 1920, height: 1080 } as const;

/**
 * Calcula a resolução do desktop remoto a partir do tamanho exibido do canvas.
 *
 * Regra: a resolução ACOMPANHA a janela (1:1) e nunca fica abaixo do mínimo.
 * Quando a janela é menor que o mínimo, a escala é UNIFORME (mesma proporção do
 * container) em vez de forçar cada eixo independentemente.
 *
 * Por que uniforme: se forçássemos largura e altura separadamente, o desktop
 * remoto teria uma proporção diferente da janela e o navegador ESTICARIA a
 * imagem — texto e janelas do Windows ficariam distorcidos. Com escala uniforme
 * o navegador apenas REDUZ a imagem, sem deformar.
 */
export function computeDesktopSize(
  cssWidth: number,
  cssHeight: number,
  minWidth: number,
  minHeight: number,
): { width: number; height: number } {
  const w = Math.max(1, Math.floor(cssWidth));
  const h = Math.max(1, Math.floor(cssHeight));
  const scale = Math.max(1, minWidth / w, minHeight / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** Handle do controle de redimensionamento (remove o observer). */
export interface IronRdpResizeHandle {
  detach: () => void;
}

/**
 * Mantém a resolução do Windows remoto acompanhando o tamanho do canvas.
 *
 * Usa o canal oficial de Display Control do RDP (MS-RDPEDISP): o IronRDP envia
 * um DisplayControlPdu e o Windows REMAPEIA a área de trabalho — não é só
 * esticar a imagem no navegador.
 *
 * Exige Windows 8.1+ no alvo (suporte a atualização dinâmica de resolução).
 */
/** Quantas vezes reenviar um resize antes de desistir. */
const RESIZE_MAX_ATTEMPTS = 8;

export function attachResizeHandlers(
  canvas: HTMLCanvasElement,
  session: IronSession,
  minWidth: number,
  minHeight: number,
  onResized?: (width: number, height: number) => void,
): IronRdpResizeHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Tamanho alvo pendente (ainda não confirmado pelo servidor). */
  let pending: { width: number; height: number } | null = null;
  let attempt = 0;
  let stopped = false;

  /** Lê do IronRDP a resolução REAL da área de trabalho remota. */
  const currentDesktop = (): { width: number; height: number } | null => {
    try {
      const ds = session.desktopSize();
      if (ds && ds.width > 0 && ds.height > 0) {
        return { width: ds.width, height: ds.height };
      }
    } catch { /* sessao encerrada */ }
    return null;
  };

  /**
   * Envia o resize pendente e CONFIRMA pelo desktopSize().
   *
   * Por que confirmar/retentar: o Display Control (MS-RDPEDISP) só fica
   * disponível algum tempo DEPOIS da conexão — o WASM registra literalmente
   * "Could not encode a resize: Display Control capabilities have not been
   * received" se pedirmos cedo demais. O primeiro resize era enviado
   * imediatamente após o connect e descartado em silêncio; como o tamanho da
   * janela não mudava depois, nunca havia nova tentativa e o desktop remoto
   * ficava na resolução antiga (imagem pequena num canvas grande).
   */
  const attemptResize = () => {
    if (stopped || !pending) return;
    const target = pending;

    const cur = currentDesktop();
    // Só confiamos no desktopSize() DEPOIS de já termos enviado um resize neste
    // ciclo. Se ele refletir o valor PEDIDO (e não o aplicado pelo servidor),
    // confiar logo na primeira checagem faria desistir sem nunca ter pedido
    // nada — e era exatamente esse o caso quando o canvas media a si mesmo.
    if (attempt > 0 && cur && cur.width === target.width && cur.height === target.height) {
      // Aplicado: nada a fazer.
      pending = null;
      attempt = 0;
      onResized?.(cur.width, cur.height);
      return;
    }

    try {
      session.resize(target.width, target.height);
    } catch { /* sessao encerrada */ }

    // Reporta o que VALEMOS agora; a UI mostra a resolução real, não a pedida.
    const now = currentDesktop();
    if (now) onResized?.(now.width, now.height);

    attempt += 1;
    if (attempt <= RESIZE_MAX_ATTEMPTS) {
      // Backoff: dá tempo ao servidor de abrir o canal de Display Control.
      retryTimer = setTimeout(() => {
        retryTimer = null;
        attemptResize();
      }, Math.min(250 * attempt, 2000));
      return;
    }

    // Esgotou as tentativas (o servidor pode não abrir o Display Control).
    // LIBERA o alvo: sem isso ele ficava preso, o apply() retornava cedo para
    // sempre (mesmo tamanho) e um resize posterior NUNCA era tentado — o
    // viewer desistia em definitivo após a primeira falha.
    pending = null;
    attempt = 0;
  };

  const scheduleResize = (width: number, height: number) => {
    pending = { width, height };
    attempt = 0;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    attemptResize();
  };

  const apply = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const { width, height } = computeDesktopSize(rect.width, rect.height, minWidth, minHeight);
    if (pending && pending.width === width && pending.height === height) return;
    scheduleResize(width, height);
  };

  // Redimensionar dispara dezenas de eventos por segundo. O servidor não
  // precisa de cada pixel: agrupa em uma única atualização.
  const onResize = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(apply, 150);
  };

  let observer: ResizeObserver | null = null;
  try {
    observer = new ResizeObserver(onResize);
    // Observa o canvas: o ResizeObserver mede o tamanho CSS.
    observer.observe(canvas);
  } catch { /* ambiente sem ResizeObserver */ }

  // O tamanho INICIAL é enviado já; o retry cuida de reaplicar quando o
  // Display Control ficar pronto.
  apply();

  let detached = false;
  return {
    detach: () => {
      if (detached) return;
      detached = true;
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      if (retryTimer !== null) clearTimeout(retryTimer);
      observer?.disconnect();
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
    enableCredssp = true, authToken,
    minDesktopWidth = MIN_DESKTOP_HD.width,
    minDesktopHeight = MIN_DESKTOP_HD.height,
    callbacks = {},
  } = opts;

  const setStatus = (s: IronRdpStatus, d?: string) => callbacks.onStatus?.(s, d);

  if (!canvas) throw new Error('Canvas obrigatorio para o WebRDP.');
  if (!proxyUrl) throw new Error('URL do proxy RDCleanPath obrigatoria.');

  setStatus('loading', 'Carregando cliente RDP (WASM)…');
  const mod = await loadIronRdpModule();

  setStatus('connecting', 'Conectando ao túnel RDP…');

  // A resolucao INICIAL vem do tamanho real do canvas (nao de um valor fixo):
  // assim a sessao ja abre no tamanho da janela, sem um primeiro resize.
  const initial = (() => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return computeDesktopSize(rect.width, rect.height, minDesktopWidth, minDesktopHeight);
    }
    // Sem layout ainda (canvas oculto): usa o minimo, ou o valor informado.
    return {
      width: Math.max(minDesktopWidth, width || minDesktopWidth),
      height: Math.max(minDesktopHeight, height || minDesktopHeight),
    };
  })();

  const builder = new mod.SessionBuilder();
  builder.destination(destination);
  builder.proxyAddress(proxyUrl);
  builder.desktopSize(new mod.DesktopSize(initial.width, initial.height));
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

  // Os callbacks de clipboard sao registrados no BUILDER (antes do connect),
  // mas precisam da sessao para enviar dados. O ref e preenchido logo apos.
  const sessionRef: { current: IronSession | null } = { current: null };
  attachClipboardHandlers(builder, mod, sessionRef, (direction, ok, reason) => {
    callbacks.onClipboard?.({ direction, ok, reason });
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

  // Disponibiliza a sessao para os callbacks de clipboard registrados acima.
  sessionRef.current = session;

  // Resolucao ACOMPANHA a janela (via Display Control do RDP), respeitando o
  // minimo configurado. Sem isto o desktop remoto fica com a resolucao do
  // momento da conexao e o navegador so estica/reduz a imagem.
  const resize = attachResizeHandlers(
    canvas, session, minDesktopWidth, minDesktopHeight,
    (w, h) => callbacks.onDesktopResize?.(w, h),
  );

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
      sessionRef.current = null;
      resize.detach();
      input.detach();
      try { session.shutdown(); } catch { /* ja encerrada */ }
      try { session.free(); } catch { /* liberado */ }
    },
    resize: (w: number, h: number) => {
      if (disposed) return;
      try { session.resize(w, h); } catch { /* sessao encerrada */ }
    },
    pasteClipboard: async (text: string) => {
      if (disposed) return;
      const data = new mod.ClipboardData();
      if (text) data.addText('text/plain', text);
      try {
        await session.onClipboardPaste(data);
      } finally {
        freeWasm(data);
      }
    },
    sendSpecialKeys: (comboId: string) => {
      if (disposed) return;
      const seq = RDP_SPECIAL_KEY_SEQUENCES[comboId];
      if (!seq) return;
      try {
        const tx = new mod.InputTransaction();
        // Pressiona os modificadores e a tecla, depois SOLTA na ordem inversa
        // (soltar o modificador antes da tecla deixaria a tecla "presa").
        for (const sc of seq) tx.addEvent(mod.DeviceEvent.keyPressed(sc));
        for (const sc of [...seq].reverse()) tx.addEvent(mod.DeviceEvent.keyReleased(sc));
        session.applyInputs(tx);
        freeWasm(tx);
      } catch { /* sessao encerrada */ }
    },
  };
}
