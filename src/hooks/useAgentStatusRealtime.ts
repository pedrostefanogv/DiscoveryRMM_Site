import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as signalR from "@microsoft/signalr";
import { API_BASE_URL } from "@/api/client";
import type { Agent, AgentHeartbeat } from "@/api";
import { heartbeatStore, extractHeartbeatMetrics } from "@/stores/heartbeatStore";
import { useAuth } from "@/auth/AuthContext";
import {
  normalizeDashboardEvent,
  parseAgentHeartbeatData,
  parseAgentStatusChangedData,
  parseCommandCompletedData,
} from "@/utils/dashboardEvents";
import {
  clearSignalrConnectionState,
  setSignalrConnectionState,
} from "@/utils/realtimeConnectionState";

type AgentRealtimeStatus = "Online" | "Offline";

const SIGNALR_KEEP_ALIVE_MS = 15_000;
const SIGNALR_SERVER_TIMEOUT_MS = 60_000;
const INVALIDATE_MIN_INTERVAL_MS = 1_500;
const DASHBOARD_INVALIDATE_MIN_INTERVAL_MS = 5_000;

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
  ipAddress?: string | null,
): Agent[] | undefined {
  if (!data) return data;
  let changed = false;
  const next = data.map((agent) => {
    if (agent.id !== agentId) return agent;
    changed = true;
    const updated = applyStatusUpdate(agent, status);
    if (ipAddress && !updated.lastIpAddress) {
      return { ...updated, lastIpAddress: ipAddress };
    }
    return updated;
  });
  return changed ? next : data;
}

export function useAgentStatusRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const { refreshSession, session } = useAuth();

  useEffect(() => {
    if (!enabled || !session.accessToken) {
      clearSignalrConnectionState("agent-hub");
      return;
    }

    let disposed = false;
    const invalidateThrottled = createInvalidateThrottler(queryClient);

    const hubUrl = `${API_BASE_URL}/hubs/agent`;
    console.log("[realtime] Iniciando conexão SignalR em", hubUrl);
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: async () => {
          if (session.accessToken) return session.accessToken;
          const refreshed = await refreshSession();
          return refreshed ?? "";
        },
      })
      .withAutomaticReconnect([0, 2_000, 5_000, 10_000, 30_000])
      .withKeepAliveInterval(SIGNALR_KEEP_ALIVE_MS)
      .withServerTimeout(SIGNALR_SERVER_TIMEOUT_MS)
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    console.log("[realtime] Conexão SignalR configurada:", {
      hubUrl,
      reconnectDelays: [0, 2000, 5000, 10000, 30000],
      keepAliveMs: SIGNALR_KEEP_ALIVE_MS,
      serverTimeoutMs: SIGNALR_SERVER_TIMEOUT_MS,
    });

    setSignalrConnectionState("agent-hub", "connecting");

    const applyAgentStatusChanged = (
      agentId: string,
      status: AgentRealtimeStatus,
    ) => {
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

      if (status === "Offline") {
        heartbeatStore.removeHeartbeat(agentId);
      }

      invalidateThrottled(["agents"]);
      invalidateThrottled(["realtime", "stats"]);
    };

    connection.onreconnecting((error) => {
      console.warn("[realtime] SignalR reconectando…", { error, connectionId: connection.connectionId });
      setSignalrConnectionState("agent-hub", "reconnecting");
    });
    connection.onreconnected(async (connectionId) => {
      console.info(
        "[realtime] SignalR reconectado (connectionId:",
        connectionId,
        ")",
      );
      setSignalrConnectionState("agent-hub", "connected");
      try {
        await connection.invoke("JoinDashboard");
        console.log("[realtime][JoinDashboard] grupo Dashboard global re-ingressado após reconexão.");
      } catch (error) {
        console.warn(
          "[realtime] JoinDashboard falhou após reconexão (escopo global ausente?).",
          error,
        );
      }
    });
    connection.onclose((error) => {
      if (disposed) return;
      if (error) {
        console.warn("[realtime] SignalR desconectou:", { error, connectionId: connection.connectionId });
      } else {
        console.info("[realtime] SignalR desconectado.", { connectionId: connection.connectionId });
      }
      setSignalrConnectionState("agent-hub", "disconnected");
    });

    const applyHeartbeat = (data: AgentHeartbeat) => {
      if (!data.agentId) return;

      // Store the complete heartbeat metrics for reactive consumption
      heartbeatStore.setHeartbeat(data.agentId, data);

      // Cache the metrics in reactor upgrade the cache inflight
      const heartbeatMetrics = extractHeartbeatMetrics(data);

      // Keep agent detail cache fresh with last-seen and IP
      queryClient.setQueryData<Agent | undefined>(
        ["agents", "detail", data.agentId],
        (current) => {
          if (!current) return current;
          const nowIso = new Date().toISOString();
          const updated: Agent = {
            ...current,
            status: "Online",
            isOnline: true,
            lastSeenAt: nowIso,
            lastSeen: nowIso,
            updatedAt: nowIso,
            heartbeatMetrics,
          };
          if (data.ipAddress && !updated.lastIpAddress) {
            updated.lastIpAddress = data.ipAddress;
          }
          return updated;
        },
      );

      const applyToCollection = (agent: Agent) => {
        if (agent.id !== data.agentId) return agent;
        const nowIso = new Date().toISOString();
        return {
          ...agent,
          status: "Online" as const,
          isOnline: true,
          lastSeenAt: nowIso,
          lastSeen: nowIso,
          updatedAt: nowIso,
          lastIpAddress: data.ipAddress ?? agent.lastIpAddress,
          heartbeatMetrics,
        };
      };

      queryClient.setQueriesData<Agent[]>(
        { queryKey: ["agents", "byClient"] },
        (current) => current?.map(applyToCollection),
      );

      queryClient.setQueriesData<Agent[]>(
        { queryKey: ["agents", "bySite"] },
        (current) => current?.map(applyToCollection),
      );

      invalidateThrottled(["agents"]);
      invalidateThrottled(["dashboard"], DASHBOARD_INVALIDATE_MIN_INTERVAL_MS);
      invalidateThrottled(["realtime", "stats"]);
    };

    const onDashboardEvent = (...args: unknown[]) => {
      const normalizedEvent = normalizeDashboardEvent(args, "signalr");
      if (!normalizedEvent) return;

      console.log("[realtime][DashboardEvent]", {
        eventType: normalizedEvent.eventType,
        timestampUtc: normalizedEvent.timestampUtc,
        data: normalizedEvent.data,
      });

      switch (normalizedEvent.eventType) {
        case "AgentHeartbeat": {
          const heartbeatData = parseAgentHeartbeatData(
            normalizedEvent.data,
            normalizedEvent.timestampUtc,
            "signalr",
          );
          if (!heartbeatData) return;
          applyHeartbeat(heartbeatData);
          return;
        }

        case "AgentStatusChanged": {
          const statusData = parseAgentStatusChangedData(
            normalizedEvent.data,
            "signalr",
          );
          if (!statusData) return;
          applyAgentStatusChanged(statusData.agentId, statusData.status);
          return;
        }

        case "CommandCompleted": {
          if (!parseCommandCompletedData(normalizedEvent.data, "signalr")) {
            return;
          }

          invalidateThrottled(["agents"]);
          invalidateThrottled(["logs"]);
          invalidateThrottled(["tickets"]);
          invalidateThrottled(["realtime", "stats"]);
          return;
        }

        case "AgentHardwareReported":
        case "AgentConnected":
        case "AgentDisconnected": {
          invalidateThrottled(["dashboard"], DASHBOARD_INVALIDATE_MIN_INTERVAL_MS);
          invalidateThrottled(["realtime", "stats"]);
          return;
        }

        default:
          return;
      }
    };

    connection.on("DashboardEvent", onDashboardEvent);
    console.log("[realtime] Handlers registrados no hub /hubs/agent:", [
      "DashboardEvent",
    ]);

    const startPromise = connection
      .start()
      .then(async () => {
        if (disposed) return;
        setSignalrConnectionState("agent-hub", "connected");
        console.info(
          "[realtime] SignalR conectado em",
          hubUrl,
          "(connectionId:",
          connection.connectionId,
          ")",
        );
        try {
          await connection.invoke("JoinDashboard");
          console.info("[realtime] SignalR ingressou no grupo Dashboard global.");
        } catch (error) {
          // JoinDashboard requer Dashboard.View em escopo Global. Se o usuário
          // não tiver permissão global, mantemos a conexão ativa (recebe eventos
          // direcionados/por grupo) e apenas avisamos no console.
          if (disposed) return;
          console.warn(
            "[realtime] SignalR conectado mas JoinDashboard falhou (permissão de escopo global ausente). Conexão segue ativa para grupos por escopo.",
            error,
          );
        }
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

        console.error("[realtime] Falha ao iniciar SignalR:", error);
        setSignalrConnectionState("agent-hub", "disconnected");

        // Keep UI working with REST fallback even if realtime fails.
      });

    return () => {
      disposed = true;
      console.log("[realtime] Cleanup: removendo handlers e parando conexão SignalR.");
      clearSignalrConnectionState("agent-hub");
      connection.off("DashboardEvent", onDashboardEvent);
      void startPromise.finally(async () => {
        if (connection.state !== signalR.HubConnectionState.Disconnected) {
          console.log("[realtime] Parando conexão SignalR (estado:", connection.state, ")");
          await connection.stop();
          console.log("[realtime] Conexão SignalR parada.");
        }
      });
    };
  }, [enabled, queryClient, refreshSession, session.accessToken]);
}
