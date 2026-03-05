const DEFAULT_AGENT_OFFLINE_FALLBACK_MS = 90 * 1000;

function parseFallbackMs(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_AGENT_OFFLINE_FALLBACK_MS;
  }
  return parsed;
}

export const AGENT_OFFLINE_FALLBACK_MS = parseFallbackMs(
  import.meta.env.VITE_AGENT_OFFLINE_FALLBACK_MS,
);

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

  if (lastSeen) {
    const lastSeenMs = new Date(lastSeen).getTime();
    if (Number.isFinite(lastSeenMs)) {
      return now - lastSeenMs <= AGENT_OFFLINE_FALLBACK_MS;
    }
  }

  if (agent.status) {
    return agent.status === "Online";
  }

  if (typeof agent.isOnline === "boolean") {
    return agent.isOnline;
  }

  return false;
}
