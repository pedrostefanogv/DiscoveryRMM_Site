/**
 * Realtime Configuration - NATS only
 */

export type RealtimeProvider = "nats";

const NATS_URL = import.meta.env.VITE_NATS_URL ?? "";
const NATS_ENABLED = import.meta.env.VITE_NATS_ENABLED !== "false";

export const realtimeConfig = {
  provider: "nats" as const,
  useNats: true,
  natsUrl: NATS_URL,
  natsEnabled: NATS_ENABLED,
} as const;
