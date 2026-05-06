import { useSyncExternalStore } from "react";
import {
  getRealtimeConnectionSnapshot,
  subscribeRealtimeConnectionState,
} from "@/utils/realtimeConnectionState";

export interface RealtimeConnectionStatus {
  natsConnected: boolean;
  natsState: "disconnected" | "connecting" | "connected" | "reconnecting";
  checkedAtUtc: string;
  provider: string;
}

/**
 * Hook to monitor realtime connection status
 * Checks NATS connection state
 */
export function useRealtimeStatus() {
  return useSyncExternalStore(
    subscribeRealtimeConnectionState,
    getRealtimeConnectionSnapshot,
    getRealtimeConnectionSnapshot,
  );
}
