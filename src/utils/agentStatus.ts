export const AGENT_OFFLINE_FALLBACK_MS = 15 * 1000;

export interface AgentStatusLike {
  status?: "Online" | "Offline";
  isOnline?: boolean;
  lastSeenAt?: string | null;
  lastSeen?: string | null;
}

export function getAgentLastSeen(agent: AgentStatusLike): string | null {
  return agent.lastSeenAt ?? agent.lastSeen ?? null;
}

export function isAgentOnlineNow(
  agent: AgentStatusLike,
  now = Date.now(),
): boolean {
  const lastSeen = getAgentLastSeen(agent);

  if (agent.status) {
    if (agent.status === "Offline") return false;
    if (!lastSeen) return true;
    return now - new Date(lastSeen).getTime() <= AGENT_OFFLINE_FALLBACK_MS;
  }

  if (agent.isOnline) {
    if (!lastSeen) return true;
    return now - new Date(lastSeen).getTime() <= AGENT_OFFLINE_FALLBACK_MS;
  }

  return false;
}
