/**
 * Realtime Configuration - Support for both SignalR and NATS
 */

export type RealtimeProvider = "signalr" | "nats" | "both";

const REALTIME_PROVIDER =
  (import.meta.env.VITE_REALTIME_PROVIDER as RealtimeProvider | undefined) ??
  "both";

export const realtimeConfig = {
  provider: REALTIME_PROVIDER,
  useSignalR: REALTIME_PROVIDER !== "nats",
  useNats: REALTIME_PROVIDER !== "signalr",
  natsUrl: import.meta.env.VITE_NATS_URL ?? "nats://192.168.1.137:4222",
  natsEnabled: import.meta.env.VITE_NATS_ENABLED !== "false",
} as const;
