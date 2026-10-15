/**
 * Realtime Configuration - NATS only
 */

export type RealtimeProvider = "nats";
export type NatsAuthMode = "auth_token" | "jwt_credentials";

const NATS_URL = import.meta.env.VITE_NATS_URL ?? "";
const NATS_ENABLED = import.meta.env.VITE_NATS_ENABLED !== "false";
const RAW_NATS_AUTH_MODE =
  (import.meta.env.VITE_NATS_AUTH_MODE ?? "auth_token").toLowerCase();

const NATS_AUTH_MODE: NatsAuthMode =
  RAW_NATS_AUTH_MODE === "jwt_credentials"
    ? "jwt_credentials"
    : "auth_token";

export const realtimeConfig = {
  provider: "nats" as const,
  useNats: true,
  natsUrl: NATS_URL,
  natsEnabled: NATS_ENABLED,
  natsAuthMode: NATS_AUTH_MODE,
} as const;
/**
 * Resolve a URL WebSocket do NATS usada pelos viewers (tela, terminal, arquivos,
 * processos e console de debug).
 *
 * O servidor pode definir `nats_web_socket_external_url` (painel > Servidor NATS)
 * e a API devolve o valor como `natsWssUrl` nas credenciais da sessão. Quando o
 * campo está vazio a API devolve null e o viewer ficava SEM transporte: nada
 * renderizava e a sessão era encerrada (em debug, "o agente não respondeu ao
 * canal de controle").
 *
 * Fallback: o próprio endpoint do site/API. O mesmo nginx que serve o portal
 * publica o NATS em `/nats/` no mesmo host, então derivar de
 * `window.location` (mesma origem) dispensa configurar o campo.
 *
 * `origin` é injetável para teste/SSR.
 */
export function resolveNatsWsUrl(explicit?: string | null, origin?: string): string {
  const configured = (explicit ?? "").trim();
  if (configured) {
    // Sem query string no meio: só garante a barra final do path (o nginx
    // responde 308 em "/nats" e navegador não segue redirect em handshake WS).
    if (configured.includes("?")) return configured;
    return configured.endsWith("/") ? configured : `${configured}/`;
  }

  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (!base) return "";

  try {
    const parsed = new URL(base);
    const scheme = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${parsed.host}/nats/`;
  } catch {
    return "";
  }
}
