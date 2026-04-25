import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getNatsService, type DashboardEvent } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";
import type { Agent } from "@/api";
import { setNatsConnectionState } from "@/utils/realtimeConnectionState";

type AgentRealtimeStatus = "Online" | "Offline";

function normalizeEventType(value: string): string {
  return value.trim().toLowerCase();
}

function getStringField(
  data: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

const NATS_URL = realtimeConfig.natsUrl;
const NATS_ENABLED = realtimeConfig.useNats && realtimeConfig.natsEnabled;
const DASHBOARD_EVENTS_SUBJECT = "dashboard.events";
const INVALIDATE_MIN_INTERVAL_MS = 1_500;

function createInvalidateThrottler(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const lastInvalidationByKey = new Map<string, number>();

  return (queryKey: string[], minIntervalMs = INVALIDATE_MIN_INTERVAL_MS) => {
    const now = Date.now();
    const key = queryKey.join("|");
    const last = lastInvalidationByKey.get(key) ?? 0;
    if (now - last < minIntervalMs) return;

    lastInvalidationByKey.set(key, now);
    void queryClient.invalidateQueries({ queryKey });
  };
}

function invalidateDashboardQueries(
  normalizedType: string,
  invalidateThrottled: (queryKey: string[], minIntervalMs?: number) => void,
) {
  const isHeartbeatLike =
    normalizedType === "agentheartbeat" ||
    normalizedType === "heartbeat" ||
    normalizedType === "agent.heartbeat" ||
    normalizedType === "agentoffline" ||
    normalizedType === "offline" ||
    normalizedType === "agent.offline";

  if (isHeartbeatLike) {
    invalidateThrottled(["realtime", "stats"]);
    return;
  }

  if (normalizedType.includes("command")) {
    invalidateThrottled(["agents"]);
    invalidateThrottled(["logs"]);
  }

  if (normalizedType.includes("ticket")) {
    invalidateThrottled(["tickets"]);
  }

  if (normalizedType.includes("log")) {
    invalidateThrottled(["logs"]);
  }

  if (normalizedType.includes("software")) {
    invalidateThrottled(["softwareInventory"]);
  }

  if (normalizedType.includes("client")) {
    invalidateThrottled(["clients"]);
  }

  // Stats are aggregate numbers and should reflect every backend event.
  invalidateThrottled(["realtime", "stats"]);
}

function applyStatusUpdate(agent: Agent, status: AgentRealtimeStatus): Agent {
  const nowIso = new Date().toISOString();
  const lastSeenAt =
    status === "Online"
      ? nowIso
      : (agent.lastSeenAt ?? agent.lastSeen ?? nowIso);

  return {
    ...agent,
    status,
    isOnline: status === "Online",
    lastSeenAt,
    lastSeen: lastSeenAt,
    updatedAt: nowIso,
  };
}

function updateAgentInCollection(
  data: Agent[] | undefined,
  agentId: string,
  status: AgentRealtimeStatus,
): Agent[] | undefined {
  if (!data) return data;
  let changed = false;
  const next = data.map((agent) => {
    if (agent.id !== agentId) return agent;
    changed = true;
    return applyStatusUpdate(agent, status);
  });
  return changed ? next : data;
}

export function useAgentStatusNats(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !NATS_ENABLED) {
      setNatsConnectionState("disconnected");
      return;
    }

    let disposed = false;
    const invalidateThrottled = createInvalidateThrottler(queryClient);

    const handleDashboardEvent = (event: DashboardEvent) => {
      if (disposed) return;

      const { eventType, data } = event;
      const normalizedType = normalizeEventType(eventType);
      const safeData =
        data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : {};

      if (
        normalizedType === "agentheartbeat" ||
        normalizedType === "heartbeat" ||
        normalizedType === "agent.heartbeat"
      ) {
        const heartbeatAgentId = getStringField(safeData, [
          "agentId",
          "id",
          "agentID",
        ]);
        if (!heartbeatAgentId) return;

        const status: AgentRealtimeStatus = "Online";

        // Update agent detail
        queryClient.setQueryData<Agent | undefined>(
          ["agents", "detail", heartbeatAgentId],
          (current) => {
            if (!current) return current;
            return applyStatusUpdate(current, status);
          },
        );

        // Update agents in collections
        queryClient.setQueriesData<Agent[]>(
          { queryKey: ["agents", "byClient"] },
          (current) =>
            updateAgentInCollection(current, heartbeatAgentId, status),
        );

        queryClient.setQueriesData<Agent[]>(
          { queryKey: ["agents", "bySite"] },
          (current) =>
            updateAgentInCollection(current, heartbeatAgentId, status),
        );

        invalidateThrottled(["agents"]);
        invalidateDashboardQueries(normalizedType, invalidateThrottled);
      } else if (
        normalizedType === "agentcommandresult" ||
        normalizedType === "commandresult" ||
        normalizedType === "agent.result"
      ) {
        const resultAgentId = getStringField(safeData, [
          "agentId",
          "id",
          "agentID",
        ]);
        if (!resultAgentId) return;

        // Invalidate related queries to fetch fresh data
        invalidateThrottled(["agents", "detail", resultAgentId], 500);
        invalidateDashboardQueries(normalizedType, invalidateThrottled);
      } else if (
        normalizedType === "agentoffline" ||
        normalizedType === "offline" ||
        normalizedType === "agent.offline"
      ) {
        const agentId = getStringField(safeData, ["agentId", "id", "agentID"]);
        if (!agentId) return;
        const status: AgentRealtimeStatus = "Offline";

        queryClient.setQueryData<Agent | undefined>(
          ["agents", "detail", agentId],
          (current) => {
            if (!current) return current;
            return applyStatusUpdate(current, status);
          },
        );

        queryClient.setQueriesData<Agent[]>(
          { queryKey: ["agents", "byClient"] },
          (current) => updateAgentInCollection(current, agentId, status),
        );

        queryClient.setQueriesData<Agent[]>(
          { queryKey: ["agents", "bySite"] },
          (current) => updateAgentInCollection(current, agentId, status),
        );

        invalidateThrottled(["agents"]);
        invalidateDashboardQueries(normalizedType, invalidateThrottled);
      } else {
        invalidateDashboardQueries(normalizedType, invalidateThrottled);
      }
    };

    const natsService = getNatsService({
      url: NATS_URL,
      enabled: NATS_ENABLED,
    });

    const unsubscribeConnectionState = natsService.onConnectionStateChange(
      (state) => {
        if (disposed) return;
        setNatsConnectionState(state);
      },
    );

    void natsService.connect().then(() => {
      if (disposed) return;
      void natsService.subscribe(DASHBOARD_EVENTS_SUBJECT, handleDashboardEvent);
    });

    return () => {
      disposed = true;
      unsubscribeConnectionState();
      natsService.unsubscribe(DASHBOARD_EVENTS_SUBJECT, handleDashboardEvent);
      setNatsConnectionState("disconnected");
    };
  }, [enabled, queryClient]);
}
