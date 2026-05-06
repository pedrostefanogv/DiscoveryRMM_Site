import { realtimeConfig, type RealtimeProvider } from "@/config/realtime";

export type RealtimeTransportState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface RealtimeConnectionSnapshot {
  natsConnected: boolean;
  natsState: RealtimeTransportState;
  checkedAtUtc: string;
  provider: RealtimeProvider;
  serverOverloaded: boolean | null;
  serverPongAtUtc: string | null;
}

const listeners = new Set<() => void>();

let natsState: RealtimeTransportState = "disconnected";
let checkedAtUtc = new Date().toISOString();
let serverOverloaded: boolean | null = null;
let serverPongAtUtc: string | null = null;
let snapshot: RealtimeConnectionSnapshot;

function rebuildSnapshot() {
  snapshot = {
    natsConnected: natsState === "connected",
    natsState,
    checkedAtUtc,
    provider: realtimeConfig.provider,
    serverOverloaded,
    serverPongAtUtc,
  };
}

function notify() {
  checkedAtUtc = new Date().toISOString();
  rebuildSnapshot();
  listeners.forEach((listener) => listener());
}

rebuildSnapshot();

export function getRealtimeConnectionSnapshot(): RealtimeConnectionSnapshot {
  return snapshot;
}

export function subscribeRealtimeConnectionState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setNatsConnectionState(state: RealtimeTransportState) {
  if (natsState === state) return;

  natsState = state;
  notify();
}

export function setServerPongState(
  overloaded: boolean | null,
  observedAtUtc: string | null,
) {
  if (serverOverloaded === overloaded && serverPongAtUtc === observedAtUtc) {
    return;
  }

  serverOverloaded = overloaded;
  serverPongAtUtc = observedAtUtc;
  notify();
}