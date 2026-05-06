import { useSyncExternalStore } from "react";
import {
  getRealtimeConnectionSnapshot,
  subscribeRealtimeConnectionState,
} from "@/utils/realtimeConnectionState";

export interface RealtimeConnectionStatus {
  natsConnected: boolean;
  natsState:
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "auth_error";
  checkedAtUtc: string;
  provider: string;
  natsLastErrorType: "auth" | "network" | null;
  natsLastErrorMessage: string | null;
  natsLastErrorAtUtc: string | null;
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
