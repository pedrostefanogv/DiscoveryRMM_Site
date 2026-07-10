import {
  useAgentStatusNats,
  type AgentRealtimeScope,
} from "./useAgentStatusNats";

/** @deprecated Use useAgentStatusNats directly. This is a backward-compatible wrapper. */
export function useAgentStatusRealtime(
  enabled = true,
  scope?: AgentRealtimeScope,
) {
  useAgentStatusNats(enabled, scope);
}

export type { AgentRealtimeScope } from "./useAgentStatusNats";
