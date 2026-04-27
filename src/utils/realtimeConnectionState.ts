import { realtimeConfig, type RealtimeProvider } from "@/config/realtime";

export type RealtimeTransportState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface RealtimeConnectionSnapshot {
  natsConnected: boolean;
  natsState: RealtimeTransportState;
  signalrConnected: boolean;
  signalrState: RealtimeTransportState;
  checkedAtUtc: string;
  provider: RealtimeProvider;
}

const signalrSources = new Map<string, RealtimeTransportState>();
const listeners = new Set<() => void>();

let natsState: RealtimeTransportState = "disconnected";
let checkedAtUtc = new Date().toISOString();
let snapshot: RealtimeConnectionSnapshot;

function aggregateSignalrState(): RealtimeTransportState {
  const states = Array.from(signalrSources.values());

  if (states.includes("connected")) return "connected";
  if (states.includes("reconnecting")) return "reconnecting";
  if (states.includes("connecting")) return "connecting";
  return "disconnected";
}

function rebuildSnapshot() {
  const signalrState = aggregateSignalrState();

  snapshot = {
    natsConnected: natsState === "connected",
    natsState,
    signalrConnected: signalrState === "connected",
    signalrState,
    checkedAtUtc,
    provider: realtimeConfig.provider,
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

export function setSignalrConnectionState(
  source: string,
  state: RealtimeTransportState,
) {
  const current = signalrSources.get(source);
  if (current === state) return;

  signalrSources.set(source, state);
  notify();
}

export function clearSignalrConnectionState(source: string) {
  if (!signalrSources.delete(source)) return;
  notify();
}

export function setNatsConnectionState(state: RealtimeTransportState) {
  if (natsState === state) return;

  natsState = state;
  notify();
}