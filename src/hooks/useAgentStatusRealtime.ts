import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as signalR from "@microsoft/signalr";
import { API_BASE_URL } from "@/api/client";
import type { Agent } from "@/api";

type AgentRealtimeStatus = "Online" | "Offline";
type AgentStatusPayload =
  | { agentId: string; status: AgentRealtimeStatus }
  | { id: string; status: AgentRealtimeStatus };

const SIGNALR_KEEP_ALIVE_MS = 15_000;
const SIGNALR_SERVER_TIMEOUT_MS = 60_000;
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

function normalizeStatusEvent(
  arg1: string | AgentStatusPayload,
  arg2?: AgentRealtimeStatus,
): { agentId: string; status: AgentRealtimeStatus } | null {
  if (typeof arg1 === "string" && arg2) {
    return { agentId: arg1, status: arg2 };
  }

  if (arg1 && typeof arg1 === "object" && "status" in arg1) {
    const agentId = "agentId" in arg1 ? arg1.agentId : arg1.id;
    if (agentId) {
      return { agentId, status: arg1.status };
    }
  }

  return null;
}

export function useAgentStatusRealtime(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    const invalidateThrottled = createInvalidateThrottler(queryClient);

    const hubUrl = `${API_BASE_URL}/hubs/agent`;
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect([0, 2_000, 5_000, 10_000, 30_000])
      .withKeepAliveInterval(SIGNALR_KEEP_ALIVE_MS)
      .withServerTimeout(SIGNALR_SERVER_TIMEOUT_MS)
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    const onAgentStatusChanged = (
      arg1: string | AgentStatusPayload,
      arg2?: AgentRealtimeStatus,
    ) => {
      const parsed = normalizeStatusEvent(arg1, arg2);
      if (!parsed) return;
      const { agentId, status } = parsed;

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

      // Ensure any other agents queries that are currently mounted are refreshed.
      invalidateThrottled(["agents"]);
      invalidateThrottled(["realtime", "stats"]);
    };

    const onCommandCompleted = () => {
      // Keep dashboard and command-related widgets fresh without page reload.
      invalidateThrottled(["agents"]);
      invalidateThrottled(["logs"]);
      invalidateThrottled(["tickets"]);
      invalidateThrottled(["realtime", "stats"]);
    };

    connection.on("AgentStatusChanged", onAgentStatusChanged);
    connection.on("CommandCompleted", onCommandCompleted);
    connection.onreconnected(() => connection.invoke("JoinDashboard"));

    const startPromise = connection
      .start()
      .then(async () => {
        if (disposed) return;
        await connection.invoke("JoinDashboard");
      })
      .catch((error: unknown) => {
        if (disposed) return;

        // In dev StrictMode, unmount can happen while start is in-flight.
        if (
          error instanceof Error &&
          error.message.includes("before stop() was called")
        ) {
          return;
        }

        // Keep UI working with REST fallback even if realtime fails.
      });

    return () => {
      disposed = true;
      connection.off("AgentStatusChanged", onAgentStatusChanged);
      connection.off("CommandCompleted", onCommandCompleted);
      void startPromise.finally(async () => {
        if (connection.state !== signalR.HubConnectionState.Disconnected) {
          await connection.stop();
        }
      });
    };
  }, [enabled, queryClient]);
}
