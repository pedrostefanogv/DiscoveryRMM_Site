import {
  useAgentStatusNats,
  type AgentRealtimeScope,
} from "./useAgentStatusNats";

/**
 * Backward-compatible hook name.
 * Realtime transport is now NATS-only.
 */
export function useAgentStatusRealtime(
  enabled = true,
  scope?: AgentRealtimeScope,
) {
  useAgentStatusNats(enabled, scope);
}

export type { AgentRealtimeScope } from "./useAgentStatusNats";
