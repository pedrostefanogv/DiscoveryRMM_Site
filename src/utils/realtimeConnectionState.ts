import { realtimeConfig, type RealtimeProvider } from "@/config/realtime";

export type RealtimeTransportState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "auth_error";

export type RealtimeTransportErrorType = "auth" | "network" | null;

export interface RealtimeConnectionSnapshot {
  natsConnected: boolean;
  natsState: RealtimeTransportState;
  checkedAtUtc: string;
  provider: RealtimeProvider;
  serverOverloaded: boolean | null;
  serverPongAtUtc: string | null;
  natsLastErrorType: RealtimeTransportErrorType;
  natsLastErrorMessage: string | null;
  natsLastErrorAtUtc: string | null;
}

const listeners = new Set<() => void>();

let natsState: RealtimeTransportState = "disconnected";
let checkedAtUtc = new Date().toISOString();
let serverOverloaded: boolean | null = null;
let serverPongAtUtc: string | null = null;
let natsLastErrorType: RealtimeTransportErrorType = null;
let natsLastErrorMessage: string | null = null;
let natsLastErrorAtUtc: string | null = null;
let snapshot: RealtimeConnectionSnapshot;

function rebuildSnapshot() {
  snapshot = {
    natsConnected: natsState === "connected",
    natsState,
    checkedAtUtc,
    provider: realtimeConfig.provider,
    serverOverloaded,
    serverPongAtUtc,
    natsLastErrorType,
    natsLastErrorMessage,
    natsLastErrorAtUtc,
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

  if (state === "connected") {
    natsLastErrorType = null;
    natsLastErrorMessage = null;
    natsLastErrorAtUtc = null;
  }

  notify();
}

export function setNatsConnectionDiagnostics(
  type: RealtimeTransportErrorType,
  message: string | null,
  observedAtUtc: string | null,
) {
  if (
    natsLastErrorType === type &&
    natsLastErrorMessage === message &&
    natsLastErrorAtUtc === observedAtUtc
  ) {
    return;
  }

  natsLastErrorType = type;
  natsLastErrorMessage = message;
  natsLastErrorAtUtc = observedAtUtc;
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