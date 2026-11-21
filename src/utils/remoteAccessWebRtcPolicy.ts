/**
 * Lógica da política de WebRTC do acesso remoto (espelha
 * RemoteAccessWebRtcPolicy do backend, em
 * Discovery.Core.Configuration.RemoteAccessWebRtcPolicy.cs).
 *
 * Fica separada da tela de propósito: a validação de URL de STUN/TURN e a regra
 * de "relayOnly exige TURN" precisam de teste unitário, e a tela só as consome.
 * Manter as duas em sincronia é o que evita o backend recusar (TryParseStrict)
 * um JSON que a UI deixou salvar.
 */

/** STUN público do Google — default de convergência (MeshCentral e Breeze). */
export const DEFAULT_STUN_GOOGLE = "stun:stun.l.google.com:19302";

/** STUN público da Cloudflare — segundo default de convergência. */
export const DEFAULT_STUN_CLOUDFLARE = "stun:stun.cloudflare.com:3478";

/**
 * Kinds que PODEM usar WebRTC. Precisa espelhar AllowedKinds do backend.
 *
 * Excluídos, com o motivo (é decisão MEDIDA, não esquecimento):
 *   - Terminal: gargalo é 1 round-trip + coalescimento local de 16 ms, volume de
 *     poucos KB/s. WebRTC adicionaria handshake ICE sem ganho perceptível.
 *   - Registry: a resposta já é paginada em 500 itens porque estouraria o limite
 *     do NATS — o gargalo é o tamanho da página, não o transporte.
 *   - Processos/Serviços: request/response por clique, volume pequeno.
 *
 * Proxy ENTRA: usa o mesmo SessionTunnel do RDP no agente, e o destino
 * (Proxmox, iDRAC, switch) costuma estar em outra rede — onde o P2P mais ajuda.
 */
export const WEBRTC_KINDS = ["screen", "rdp", "files", "proxy"] as const;
export type WebRtcKind = (typeof WEBRTC_KINDS)[number];

export const WEBRTC_KIND_LABELS: Record<WebRtcKind, string> = {
  screen: "Tela remota",
  rdp: "Túnel RDP / TCP",
  files: "Transferência de arquivos",
  proxy: "Proxy LAN / túnel de rede",
};

export interface WebRtcIceOptions {
  stunUrls: string[];
  turnUrls: string[];
  turnUsername: string;
  turnCredential: string;
  /** Sinalizador emitido apenas pelo GET quando há credencial salva (redigida). */
  turnCredentialConfigured?: boolean;
  turnCredentialTtlMinutes: number;
  relayOnly: boolean;
  disconnectedTimeoutSeconds: number;
  failedTimeoutSeconds: number;
  keepAliveIntervalSeconds: number;
}

export interface RemoteAccessWebRtcPolicy {
  enabled: boolean;
  kinds: string[];
  ice: WebRtcIceOptions;
  fallbackToNats: boolean;
  /**
   * H.264 permanece desativado (patente AVC). O campo existe no contrato para
   * tornar a decisão explícita; a UI nunca o liga e o backend recusa true.
   */
  h264Enabled: boolean;
}

/**
 * Política vazia usada quando o escopo não define nada.
 *
 * Nasce DESLIGADA: o caminho NATS é o caminho validado em produção, e o WebRTC
 * é aditivo. Os defaults de STUN já vêm preenchidos para o operador não precisar
 * digitar os endereços públicos ao ligar a feature.
 */
export const EMPTY_POLICY: RemoteAccessWebRtcPolicy = {
  enabled: false,
  kinds: ["screen", "rdp"],
  ice: {
    stunUrls: [DEFAULT_STUN_GOOGLE, DEFAULT_STUN_CLOUDFLARE],
    turnUrls: [],
    turnUsername: "",
    turnCredential: "",
    turnCredentialTtlMinutes: 60,
    relayOnly: false,
    disconnectedTimeoutSeconds: 5,
    failedTimeoutSeconds: 15,
    keepAliveIntervalSeconds: 2,
  },
  fallbackToNats: true,
  h264Enabled: false,
};

const STUN_PREFIX = "stun:";
const TURN_PREFIXES = ["turn:", "turns:"];

/** URL de STUN válida (esquema obrigatório). */
export function isValidStunUrl(value: string): boolean {
  const raw = value.trim();
  if (!raw.toLowerCase().startsWith(STUN_PREFIX)) return false;
  // Exige host após o esquema — "stun:" sozinho não é endereço.
  return raw.slice(STUN_PREFIX.length).trim().length > 0;
}

/** URL de TURN válida (turn: ou turns:). */
export function isValidTurnUrl(value: string): boolean {
  const raw = value.trim().toLowerCase();
  const prefix = TURN_PREFIXES.find((p) => raw.startsWith(p));
  if (!prefix) return false;
  return raw.slice(prefix.length).trim().length > 0;
}

/** Kind aceito pela política. */
export function isValidKind(value: string): value is WebRtcKind {
  return (WEBRTC_KINDS as readonly string[]).includes(value);
}

/** Converte uma lista de URLs em linhas não vazias e únicas, preservando a ordem. */
export function parseUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

/**
 * Leitura TOLERANTE do JSON persistido (mesmo contrato de
 * RemoteAccessWebRtcPolicy.Parse no backend).
 *
 * JSON vazio, inválido ou com tipo errado cai na política DESLIGADA — nunca em
 * ligada. Preserva os campos conhecidos e descarta o resto.
 */
export function parsePolicy(json: string | null | undefined): RemoteAccessWebRtcPolicy {
  if (!json || !json.trim() || json.trim() === "{}") return { ...EMPTY_POLICY, ice: { ...EMPTY_POLICY.ice } };

  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...EMPTY_POLICY, ice: { ...EMPTY_POLICY.ice } };
    }
    obj = parsed as Record<string, unknown>;
  } catch {
    return { ...EMPTY_POLICY, ice: { ...EMPTY_POLICY.ice } };
  }

  const rawIce = (obj.ice && typeof obj.ice === "object" && !Array.isArray(obj.ice))
    ? (obj.ice as Record<string, unknown>)
    : {};

  const kinds = Array.isArray(obj.kinds)
    ? parseUrlList(obj.kinds).filter(isValidKind)
    : [...EMPTY_POLICY.kinds];

  const stunUrls = parseUrlList(rawIce.stunUrls).filter(isValidStunUrl);
  const turnUrls = parseUrlList(rawIce.turnUrls).filter(isValidTurnUrl);

  const ttl = numOr(rawIce.turnCredentialTtlMinutes, EMPTY_POLICY.ice.turnCredentialTtlMinutes);

  return {
    enabled: obj.enabled === true,
    kinds,
    ice: {
      // Lista vazia é válida (LAN sem STUN); só cai no default quando o campo
      // está AUSENTE, não quando o operador esvaziou de propósito.
      stunUrls: Array.isArray(rawIce.stunUrls) ? stunUrls : [...EMPTY_POLICY.ice.stunUrls],
      turnUrls,
      turnUsername: typeof rawIce.turnUsername === "string" ? rawIce.turnUsername.trim() : "",
      turnCredential: typeof rawIce.turnCredential === "string" ? rawIce.turnCredential : "",
      turnCredentialConfigured: rawIce.turnCredentialConfigured === true,
      turnCredentialTtlMinutes: clamp(ttl, 1, 1440, EMPTY_POLICY.ice.turnCredentialTtlMinutes),
      relayOnly: rawIce.relayOnly === true,
      disconnectedTimeoutSeconds: clamp(
        numOr(rawIce.disconnectedTimeoutSeconds, 5), 1, 120, 5),
      failedTimeoutSeconds: clamp(
        numOr(rawIce.failedTimeoutSeconds, 15), 1, 120, 15),
      keepAliveIntervalSeconds: clamp(
        numOr(rawIce.keepAliveIntervalSeconds, 2), 1, 120, 2),
    },
    fallbackToNats: obj.fallbackToNats !== false,
    // Sempre false: a UI nunca liga H.264 (patente AVC).
    h264Enabled: false,
  };
}

/** Serializa para persistência, omitindo o que for default (JSON enxuto e auditável). */
export function serializePolicy(policy: RemoteAccessWebRtcPolicy): string {
  const payload: Record<string, unknown> = { enabled: policy.enabled };

  const kinds = policy.kinds.filter(isValidKind);
  if (kinds.length) payload.kinds = kinds;

  const ice: Record<string, unknown> = {};
  const stun = policy.ice.stunUrls.filter(isValidStunUrl);
  const turn = policy.ice.turnUrls.filter(isValidTurnUrl);

  // Sempre grava stunUrls/turnUrls (mesmo vazios): a ausência do campo significa
  // "usar o default", e o operador pode ter esvaziado a lista de propósito.
  ice.stunUrls = stun;
  ice.turnUrls = turn;

  if (turn.length) {
    if (policy.ice.turnUsername.trim()) ice.turnUsername = policy.ice.turnUsername.trim();
    if (policy.ice.turnCredential) ice.turnCredential = policy.ice.turnCredential;
    if (policy.ice.turnCredentialTtlMinutes !== 60) {
      ice.turnCredentialTtlMinutes = policy.ice.turnCredentialTtlMinutes;
    }
  }

  if (policy.ice.relayOnly) ice.relayOnly = true;

  if (policy.ice.disconnectedTimeoutSeconds !== 5) {
    ice.disconnectedTimeoutSeconds = policy.ice.disconnectedTimeoutSeconds;
  }
  if (policy.ice.failedTimeoutSeconds !== 15) {
    ice.failedTimeoutSeconds = policy.ice.failedTimeoutSeconds;
  }
  if (policy.ice.keepAliveIntervalSeconds !== 2) {
    ice.keepAliveIntervalSeconds = policy.ice.keepAliveIntervalSeconds;
  }

  payload.ice = ice;

  // Gravado só quando FALSE (o default é true): um "true" explícito é ruído.
  if (!policy.fallbackToNats) payload.fallbackToNats = false;

  return JSON.stringify(payload);
}

export interface WebRtcPolicyValidationIssue {
  /** Campo com problema (para a UI ancorar a mensagem). */
  field: string;
  message: string;
}

/**
 * Valida a política inteira antes de salvar. Devolve TODOS os problemas (não só
 * o primeiro) para o operador corrigir de uma vez.
 *
 * Espelha RemoteAccessWebRtcPolicy.TryParseStrict: o que passar aqui não pode
 * ser recusado pelo backend, senão o operador salva e recebe erro sem contexto.
 */
export function validatePolicy(policy: RemoteAccessWebRtcPolicy): WebRtcPolicyValidationIssue[] {
  const issues: WebRtcPolicyValidationIssue[] = [];

  const stun = policy.ice.stunUrls.filter((u) => u.trim());
  const turn = policy.ice.turnUrls.filter((u) => u.trim());

  stun.forEach((url) => {
    if (!isValidStunUrl(url)) {
      issues.push({
        field: "stunUrls",
        message: `"${url}" não é um STUN válido. Use o esquema stun:. Ex.: stun:stun.l.google.com:19302`,
      });
    }
  });

  turn.forEach((url) => {
    if (!isValidTurnUrl(url)) {
      issues.push({
        field: "turnUrls",
        message: `"${url}" não é um TURN válido. Use turn: ou turns:. Ex.: turn:turn.exemplo.com:3478`,
      });
    }
  });

  // A armadilha central: relayOnly sem TURN produz uma sessão que NUNCA
  // conecta (não há candidato relay e o ICE falha em 15 s). Recusar aqui
  // evita o operador ver "conectando..." sem causa.
  if (policy.ice.relayOnly && turn.length === 0) {
    issues.push({
      field: "relayOnly",
      message:
        "Forçar relay (relayOnly) exige ao menos um servidor TURN. Sem TURN a sessão nunca estabelece — configure um TURN ou desligue esta opção.",
    });
  }

  if (policy.enabled && policy.kinds.filter(isValidKind).length === 0) {
    issues.push({
      field: "kinds",
      message: "Com o WebRTC ligado, selecione ao menos um tipo de sessão.",
    });
  }

  const timeouts: [string, number, string][] = [
    ["disconnectedTimeoutSeconds", policy.ice.disconnectedTimeoutSeconds, "Desconexão"],
    ["failedTimeoutSeconds", policy.ice.failedTimeoutSeconds, "Falha"],
    ["keepAliveIntervalSeconds", policy.ice.keepAliveIntervalSeconds, "Keep-alive"],
  ];
  for (const [field, value, label] of timeouts) {
    if (!Number.isFinite(value) || value < 1 || value > 120) {
      issues.push({ field, message: `${label}: use um valor entre 1 e 120 segundos.` });
    }
  }

  const ttl = policy.ice.turnCredentialTtlMinutes;
  if (!Number.isFinite(ttl) || ttl < 1 || ttl > 1440) {
    issues.push({
      field: "turnCredentialTtlMinutes",
      message: "Validade da credencial TURN: use um valor entre 1 e 1440 minutos.",
    });
  }

  return issues;
}

/** True quando a política difere da que foi carregada (para o decideSaveAction). */
export function isPolicyDirty(
  current: RemoteAccessWebRtcPolicy,
  loadedJson: string,
): boolean {
  return serializePolicy(current) !== serializePolicy(parsePolicy(loadedJson));
}

/**
 * Decide o que gravar ao salvar num escopo cliente/site.
 *
 * Mesma regra (e mesmas armadilhas) de decideSaveAction do proxy:
 *  1. "herdar" sem edição não pode criar uma linha vazia só para gravar null;
 *  2. edição real precisa persistir MESMO com "herdar" marcado, senão mexer só
 *     num timeout seria descartado em silêncio.
 */
export function decideSaveAction(params: {
  ownsPolicy: boolean;
  hasOwnPolicy: boolean;
  isPolicyDirty: boolean;
}): "skip" | "persist" | "clear" {
  const { ownsPolicy, hasOwnPolicy, isPolicyDirty } = params;

  if (ownsPolicy || isPolicyDirty) return "persist";
  if (hasOwnPolicy) return "clear";
  return "skip";
}

/** Presets de TURN oferecidos como atalho (porta padrão 3478). */
export const TURN_PORT_PRESETS: { label: string; port: number }[] = [
  { label: "TURN padrão (3478)", port: 3478 },
  { label: "TURN sobre TLS (5349)", port: 5349 },
];

function numOr(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min || value > max) return fallback;
  return value;
}
