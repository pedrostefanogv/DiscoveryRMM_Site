/**
 * Realtime Configuration - Support for both SignalR and NATS
 */

export type RealtimeProvider = "signalr" | "nats" | "both";

const REALTIME_PROVIDER =
  (import.meta.env.VITE_REALTIME_PROVIDER as RealtimeProvider | undefined) ??
  "signalr";

const NATS_URL = import.meta.env.VITE_NATS_URL ?? "";
const NATS_ENABLED = import.meta.env.VITE_NATS_ENABLED === "true";

export const realtimeConfig = {
  provider: REALTIME_PROVIDER,
  useSignalR: REALTIME_PROVIDER !== "nats",
  useNats: REALTIME_PROVIDER !== "signalr",
  natsUrl: NATS_URL,
  natsEnabled: NATS_ENABLED,
} as const;
