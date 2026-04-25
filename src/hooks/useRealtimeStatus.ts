import { useSyncExternalStore } from "react";
import {
  getRealtimeConnectionSnapshot,
  subscribeRealtimeConnectionState,
} from "@/utils/realtimeConnectionState";

export interface RealtimeConnectionStatus {
  natsConnected: boolean;
  natsState: "disconnected" | "connecting" | "connected" | "reconnecting";
  signalrConnected: boolean;
  signalrState:
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting";
  checkedAtUtc: string;
  provider: string;
}

/**
 * Hook to monitor realtime connection status
 * Checks both NATS and SignalR connections
 */
export function useRealtimeStatus() {
  return useSyncExternalStore(
    subscribeRealtimeConnectionState,
    getRealtimeConnectionSnapshot,
    getRealtimeConnectionSnapshot,
  );
}
