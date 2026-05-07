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
