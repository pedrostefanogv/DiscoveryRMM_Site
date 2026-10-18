import type { RemoteConsentMode, RemoteConsentTimeoutAction } from "@/api/remote-consent";

/**
 * Constantes e helpers da seção "Autorização de Acesso Remoto".
 *
 * A UI do console precisa mostrar o efeito real da política (texto que o usuário
 * do computador acessado vai ver, tempo de contagem e ação automática). Em vez de
 * duplicar a regra em cada tela, ela fica aqui — espelhando os defaults do
 * backend (ServerConfiguration.cs) e os limites validados em
 * ConfigurationService.cs (10..600 segundos).
 */

export const REMOTE_CONSENT_TIMEOUT_MIN_SECONDS = 10;
export const REMOTE_CONSENT_TIMEOUT_MAX_SECONDS = 600;
export const REMOTE_CONSENT_TIMEOUT_DEFAULT_SECONDS = 60;
export const REMOTE_CONSENT_TEXT_MAX_LENGTH = 500;

/** Default de ServerConfiguration.RemoteConsentMessage (backend). */
export const DEFAULT_REMOTE_CONSENT_MESSAGE =
  "{operator} solicita acesso remoto ao seu computador. Você autoriza?";

/** Default de ServerConfiguration.RemoteConsentBannerText (backend). */
export const DEFAULT_REMOTE_CONSENT_BANNER_TEXT =
  "Sessão remota em andamento: {operator}";

export interface RemoteConsentPlaceholder {
  token: string;
  label: string;
  sample: string;
}

/** Placeholders aceitos pelo backend nos textos de prompt e banner. */
export const REMOTE_CONSENT_PLACEHOLDERS: RemoteConsentPlaceholder[] = [
  { token: "{operator}", label: "Operador", sample: "Maria Souza (Suporte)" },
  { token: "{client}", label: "Cliente", sample: "Cliente Exemplo" },
  { token: "{site}", label: "Site", sample: "Matriz" },
  { token: "{agent}", label: "Computador", sample: "PC-RECEPCAO-01" },
];

export interface RemoteConsentPreviewContext {
  operator?: string | null;
  client?: string | null;
  site?: string | null;
  agent?: string | null;
}

type RemoteConsentPlaceholderKey = "operator" | "client" | "site" | "agent";

function contextValue(
  context: RemoteConsentPreviewContext | undefined,
  key: RemoteConsentPlaceholderKey,
): string {
  const fallback = REMOTE_CONSENT_PLACEHOLDERS.find(
    (placeholder) => placeholder.token === "{" + key + "}",
  )?.sample;
  const informed = context?.[key];
  const trimmed = typeof informed === "string" ? informed.trim() : "";
  return trimmed.length > 0 ? trimmed : (fallback ?? "");
}

/** Substitui os placeholders conhecidos pelas amostras informadas. */
export function applyRemoteConsentPlaceholders(
  template: string,
  context?: RemoteConsentPreviewContext,
): string {
  let result = template ?? "";
  for (const key of ["operator", "client", "site", "agent"] as const) {
    result = result.split(`{${key}}`).join(contextValue(context, key));
  }
  return result;
}

/** Texto final do prompt (cai no default do backend quando o campo está vazio). */
export function resolveRemoteConsentMessage(
  value: string | null | undefined,
  context?: RemoteConsentPreviewContext,
): string {
  const template = (value ?? "").trim() || DEFAULT_REMOTE_CONSENT_MESSAGE;
  return applyRemoteConsentPlaceholders(template, context);
}

/** Texto final do banner (cai no default do backend quando o campo está vazio). */
export function resolveRemoteConsentBannerText(
  value: string | null | undefined,
  context?: RemoteConsentPreviewContext,
): string {
  const template = (value ?? "").trim() || DEFAULT_REMOTE_CONSENT_BANNER_TEXT;
  return applyRemoteConsentPlaceholders(template, context);
}

/** Normaliza o modo vindo da API (enum numérico, nome ou string vazia). */
export function normalizeRemoteConsentMode(value: unknown): RemoteConsentMode {
  if (typeof value === "number") {
    return (["Off", "NotifyOnly", "Prompt"] as RemoteConsentMode[])[value] ?? "Prompt";
  }

  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "Off" || raw === "0") return "Off";
  if (raw === "NotifyOnly" || raw === "1") return "NotifyOnly";
  return "Prompt";
}

/** Normaliza a ação ao fim da contagem (enum numérico, nome ou vazio). */
export function normalizeRemoteConsentTimeoutAction(
  value: unknown,
): RemoteConsentTimeoutAction {
  if (typeof value === "number") {
    return value === 1 ? "Approve" : "Deny";
  }

  const raw = typeof value === "string" ? value.trim() : "";
  return raw === "Approve" || raw === "1" ? "Approve" : "Deny";
}

/**
 * Ajusta a contagem regressiva para a faixa aceita pelo backend. Valores
 * inválidos/vazios caem no default (60s), evitando que a prévia mostre algo que
 * o servidor vai recusar.
 */
export function clampRemoteConsentTimeout(value: string | number | null | undefined): number {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim();
  const numeric = Number(raw);
  if (raw.length === 0 || !Number.isFinite(numeric)) {
    return REMOTE_CONSENT_TIMEOUT_DEFAULT_SECONDS;
  }

  return Math.min(
    REMOTE_CONSENT_TIMEOUT_MAX_SECONDS,
    Math.max(REMOTE_CONSENT_TIMEOUT_MIN_SECONDS, Math.round(numeric)),
  );
}

export function isRemoteConsentTimeoutValid(value: string | number | null | undefined): boolean {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim();
  const numeric = Number(raw);
  return (
    raw.length > 0 &&
    Number.isFinite(numeric) &&
    // A API deserializa o campo como int?: valor fracionário é recusado com 400.
    Number.isInteger(numeric) &&
    numeric >= REMOTE_CONSENT_TIMEOUT_MIN_SECONDS &&
    numeric <= REMOTE_CONSENT_TIMEOUT_MAX_SECONDS
  );
}

export interface RemoteConsentFlowInput {
  mode: RemoteConsentMode;
  timeoutSeconds: number;
  timeoutAction: RemoteConsentTimeoutAction;
  showBanner: boolean;
}

/**
 * Frase curta que explica o que acontece na próxima sessão de desktop — usada no
 * resumo da seção e na prévia.
 */
export function describeRemoteConsentFlow(flow: RemoteConsentFlowInput): string {
  if (flow.mode === "Off") {
    return "O acesso é liberado direto: o usuário não vê aviso, prompt nem banner.";
  }

  if (flow.mode === "NotifyOnly") {
    // O agent só avisa o usuário pelo banner/ícone da bandeja — que são criados
    // junto (bannerEnabled = mode != Off && ShowBanner). Sem banner, ninguém vê nada.
    return flow.showBanner
      ? "O usuário é avisado pelo banner/ícone da bandeja, sem precisar aprovar."
      : "Nenhum aviso é exibido: sem prompt e sem banner, a sessão conecta sem o usuário ver nada.";
  }

  const verdict = flow.timeoutAction === "Approve" ? "aprovada" : "negada";

  return `O usuário precisa autorizar. Sem resposta em ${flow.timeoutSeconds}s, a sessão é ${verdict} automaticamente.`;
}

/** Rótulo curto da ação automática, para chips e resumo. */
export function describeTimeoutAction(action: RemoteConsentTimeoutAction): string {
  return action === "Approve" ? "Aprova sozinho" : "Nega sozinho";
}

/**
 * Frase de ação padrão exibida no prompt nativo do agent
 * ("Se você não responder, o acesso será NEGADO automaticamente.").
 */
export function describeConsentDefaultAction(
  action: RemoteConsentTimeoutAction,
): string {
  return action === "Approve"
    ? "Se você não responder, o acesso será PERMITIDO automaticamente."
    : "Se você não responder, o acesso será NEGADO automaticamente.";
}

/**
 * O agent anexa " — {operador}" ao texto do banner quando ele ainda não cita o
 * operador (session_banner_windows.go: primaryText). A prévia precisa fazer o
 * mesmo, senão mostra um texto que nunca aparece na tela do usuário.
 */
export function applyRemoteConsentBannerOperatorSuffix(
  text: string,
  operator: string | null | undefined,
): string {
  const base = (text ?? "").trim() || "Sessão remota em andamento";
  const name = (operator ?? "").trim();
  if (name.length === 0) {
    return base;
  }
  if (base.toLowerCase().includes(name.toLowerCase())) {
    return base;
  }
  return base + " — " + name;
}

/**
 * Texto vazio em cliente/site significa "herdar" (null) no contrato da API.
 * O resolvedor do backend trata string em branco como ausente
 * (ResolveStringValue), mas gravar "" deixa lixo no override — normalizamos
 * para null antes de enviar.
 */
export function normalizeRemoteConsentTextPayload(value: string): string | null {
  return value.trim().length > 0 ? value : null;
}

/**
 * Tempo decorrido de amostra usado na prévia do banner: o banner exibe o tempo
 * da SESSÃO (mm:ss desde o start), não o timeout do prompt.
 */
export const REMOTE_CONSENT_BANNER_ELAPSED_SAMPLE_SECONDS = 42;

/** mm:ss usado no prompt/banner (mesmo formato do agent). */
export function formatRemoteConsentCountdown(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/**
 * Insere um placeholder no fim do texto atual, respeitando o limite de 500
 * caracteres do backend e evitando emendar palavras.
 */
export function appendRemoteConsentPlaceholder(
  currentText: string,
  token: string,
  maxLength: number = REMOTE_CONSENT_TEXT_MAX_LENGTH,
): string {
  const current = currentText ?? "";
  const needsSpace = current.length > 0 && !/\s$/.test(current);
  const next = `${current}${needsSpace ? " " : ""}${token}`;
  return next.slice(0, maxLength);
}

/** Estado do contador de caracteres (limite e aviso de proximidade do teto). */
export function remoteConsentTextCounter(value: string): {
  length: number;
  max: number;
  tone: "neutral" | "warning" | "danger";
} {
  const length = (value ?? "").length;
  const max = REMOTE_CONSENT_TEXT_MAX_LENGTH;
  if (length > max) return { length, max, tone: "danger" };
  if (length >= max * 0.9) return { length, max, tone: "warning" };
  return { length, max, tone: "neutral" };
}