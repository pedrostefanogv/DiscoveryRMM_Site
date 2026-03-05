import { useAgentStatusRealtime } from "./useAgentStatusRealtime";
import { useAgentStatusNats } from "./useAgentStatusNats";
import { realtimeConfig } from "@/config/realtime";

/**
 * Unified realtime hook that supports both SignalR and NATS
 * Allows gradual migration from SignalR to NATS or running both in parallel
 */
export function useAgentStatusRealtime_Combined(enabled = true) {
  // Use configured providers
  if (realtimeConfig.useSignalR && realtimeConfig.useNats) {
    // Both providers enabled - use redundancy
    useAgentStatusRealtime(enabled);
    useAgentStatusNats(enabled);
  } else if (realtimeConfig.useNats) {
    // NATS only
    useAgentStatusNats(enabled);
  } else {
    // SignalR only (default)
    useAgentStatusRealtime(enabled);
  }
}

/**
 * Export for backward compatibility - apps using the original hook continue to work
 */
export { useAgentStatusRealtime } from "./useAgentStatusRealtime";
