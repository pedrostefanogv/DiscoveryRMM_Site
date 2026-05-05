import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getNatsService, type DashboardEvent } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";
import type { Agent, AgentHeartbeat } from "@/api";
import { heartbeatStore, extractHeartbeatMetrics } from "@/stores/heartbeatStore";
import { setNatsConnectionState } from "@/utils/realtimeConnectionState";

type AgentRealtimeStatus = "Online" | "Offline";

function normalizeEventType(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHeartbeatType(normalizedType: string): boolean {
  return (
    normalizedType === "agentheartbeat" ||
    normalizedType === "heartbeat" ||
    normalizedType === "agent.heartbeat"
  );
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

function getNumberField(
  data: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

const NATS_URL = realtimeConfig.natsUrl;
const NATS_ENABLED = realtimeConfig.useNats && realtimeConfig.natsEnabled;
const DASHBOARD_EVENTS_SUBJECT = "dashboard.events";
const AGENT_HEARTBEAT_SUBJECT =
  import.meta.env.VITE_NATS_AGENT_HEARTBEAT_SUBJECT ??
  "tenant.*.site.*.agent.*.heartbeat";
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
    invalidateThrottled(["dashboard"], DASHBOARD_INVALIDATE_MIN_INTERVAL_MS);
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

function toHeartbeatPayload(
  data: Record<string, unknown>,
): AgentHeartbeat | null {
  const agentId = getStringField(data, ["agentId", "id", "agentID"]);
  if (!agentId) return null;

  const ipAddress = getStringField(data, ["ipAddress", "lastIpAddress", "ip"]);

  return {
    agentId,
    status: "Online",
    ipAddress: ipAddress ?? undefined,
    hostname:
      getStringField(data, ["hostname", "hostName", "machineName"]) ??
      undefined,
    agentVersion:
      getStringField(data, ["agentVersion", "version", "agent_version"]) ??
      undefined,
    cpuPercent: getNumberField(data, ["cpuPercent", "cpu"]),
    memoryPercent: getNumberField(data, ["memoryPercent", "memory"]),
    diskPercent: getNumberField(data, ["diskPercent", "disk"]),
    memoryTotalGb: getNumberField(data, ["memoryTotalGb", "memoryTotal"]),
    memoryUsedGb: getNumberField(data, ["memoryUsedGb", "memoryUsed"]),
    diskTotalGb: getNumberField(data, ["diskTotalGb", "diskTotal"]),
    diskUsedGb: getNumberField(data, ["diskUsedGb", "diskUsed"]),
    p2pPeers: getNumberField(data, ["p2pPeers", "p2pPeersCount"]),
    uptimeSeconds: getNumberField(data, ["uptimeSeconds", "uptime"]),
    processCount: getNumberField(data, ["processCount", "processes"]),
    timestampUtc:
      getStringField(data, ["timestampUtc", "timestamp", "timeStamp"]) ??
      undefined,
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

export function useAgentStatusNats(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !NATS_ENABLED) {
      setNatsConnectionState("disconnected");
      return;
    }

    let disposed = false;
    const invalidateThrottled = createInvalidateThrottler(queryClient);

    const applyHeartbeat = (heartbeatData: AgentHeartbeat) => {
      const heartbeatAgentId = heartbeatData.agentId;
      const heartbeatIp = heartbeatData.ipAddress ?? null;

      heartbeatStore.setHeartbeat(heartbeatAgentId, heartbeatData);

      const metrics = extractHeartbeatMetrics(heartbeatData);

      const applyToCollection = (agent: Agent) => {
        if (agent.id !== heartbeatAgentId) return agent;
        const nowIso = new Date().toISOString();
        return {
          ...agent,
          status: "Online" as const,
          isOnline: true,
          lastSeenAt: nowIso,
          lastSeen: nowIso,
          updatedAt: nowIso,
          lastIpAddress: heartbeatIp ?? agent.lastIpAddress,
          heartbeatMetrics: metrics,
        };
      };

      queryClient.setQueryData<Agent | undefined>(
        ["agents", "detail", heartbeatAgentId],
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
            heartbeatMetrics: metrics,
          };
          if (heartbeatIp && !updated.lastIpAddress) {
            updated.lastIpAddress = heartbeatIp;
          }
          return updated;
        },
      );

      queryClient.setQueriesData<Agent[]>(
        { queryKey: ["agents", "byClient"] },
        (current) => current?.map(applyToCollection),
      );

      queryClient.setQueriesData<Agent[]>(
        { queryKey: ["agents", "bySite"] },
        (current) => current?.map(applyToCollection),
      );

      invalidateThrottled(["agents"]);
      invalidateDashboardQueries("agentheartbeat", invalidateThrottled);
    };

    const handleDashboardEvent = (event: DashboardEvent | Record<string, unknown>) => {
      if (disposed) return;

      const eventEnvelope = isRecord(event) ? event : {};
      const eventType = getStringField(eventEnvelope, ["eventType", "type"]);
      const normalizedType = normalizeEventType(eventType);

      const eventData = eventEnvelope.data;
      const safeData =
        isRecord(eventData)
          ? eventData
          : eventEnvelope;

      const heartbeatData = toHeartbeatPayload(safeData);

      let classifiedAs = "outro";
      if (isHeartbeatType(normalizedType) || (!normalizedType && heartbeatData)) {
        classifiedAs = "heartbeat";
      } else if (
        normalizedType === "agentcommandresult" ||
        normalizedType === "commandresult" ||
        normalizedType === "agent.result"
      ) {
        classifiedAs = "command-result";
      } else if (
        normalizedType === "agentoffline" ||
        normalizedType === "offline" ||
        normalizedType === "agent.offline"
      ) {
        classifiedAs = "offline";
      }

      console.log("[NATS][dashboard.events]", {
        eventType,
        normalizedType,
        classifiedAs,
        agentId: heartbeatData?.agentId ?? getStringField(safeData, ["agentId", "id", "agentID"]) ?? null,
        heartbeatAgentId: heartbeatData?.agentId ?? null,
      });

      if (isHeartbeatType(normalizedType) || (!normalizedType && heartbeatData)) {
        if (!heartbeatData) return;
        applyHeartbeat(heartbeatData);
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

        // Remove heartbeat metrics when agent goes offline
        heartbeatStore.removeHeartbeat(agentId);

        invalidateThrottled(["agents"]);
        invalidateDashboardQueries(normalizedType, invalidateThrottled);
      } else {
        if (!normalizedType) return;
        invalidateDashboardQueries(normalizedType, invalidateThrottled);
      }
    };

    const handleAgentHeartbeatSubject = (
      message: DashboardEvent | Record<string, unknown>,
    ) => {
      if (disposed) return;
      if (!isRecord(message)) return;

      const heartbeatData = toHeartbeatPayload(message);
      if (!heartbeatData) {
        console.log("[NATS][heartbeat] Payload inválido (sem agentId)", message);
        return;
      }

      console.log("[NATS][heartbeat]", {
        agentId: heartbeatData.agentId,
        cpu: heartbeatData.cpuPercent,
        memory: heartbeatData.memoryPercent,
        disk: heartbeatData.diskPercent,
        hostname: heartbeatData.hostname,
      });

      applyHeartbeat(heartbeatData);
    };

    console.log("[NATS] Configurando serviço NATS:", { url: NATS_URL, enabled: NATS_ENABLED });
    const natsService = getNatsService({
      url: NATS_URL,
      enabled: NATS_ENABLED,
    });

    const unsubscribeConnectionState = natsService.onConnectionStateChange(
      (state) => {
        if (disposed) return;
        console.log("[NATS] Estado da conexão mudou:", state);
        setNatsConnectionState(state);
      },
    );

    void natsService.connect().then(() => {
      if (disposed) return;
      console.log("[NATS] Conectado. Inscrevendo subjects...");
      console.log("[NATS] Subscrevendo em:", DASHBOARD_EVENTS_SUBJECT);
      void natsService.subscribe(DASHBOARD_EVENTS_SUBJECT, handleDashboardEvent);
      if (AGENT_HEARTBEAT_SUBJECT !== DASHBOARD_EVENTS_SUBJECT) {
        console.log("[NATS] Subscrevendo em:", AGENT_HEARTBEAT_SUBJECT);
        void natsService.subscribe(
          AGENT_HEARTBEAT_SUBJECT,
          handleAgentHeartbeatSubject,
        );
      }
      console.log("[NATS] Subscriptions ativas:", [DASHBOARD_EVENTS_SUBJECT, ...(AGENT_HEARTBEAT_SUBJECT !== DASHBOARD_EVENTS_SUBJECT ? [AGENT_HEARTBEAT_SUBJECT] : [])]);
    });

    return () => {
      disposed = true;
      console.log("[NATS] Cleanup: removendo subscriptions.");
      unsubscribeConnectionState();
      natsService.unsubscribe(DASHBOARD_EVENTS_SUBJECT, handleDashboardEvent);
      if (AGENT_HEARTBEAT_SUBJECT !== DASHBOARD_EVENTS_SUBJECT) {
        natsService.unsubscribe(
          AGENT_HEARTBEAT_SUBJECT,
          handleAgentHeartbeatSubject,
        );
      }
      setNatsConnectionState("disconnected");
      console.log("[NATS] Cleanup concluído.");
    };
  }, [enabled, queryClient]);
}
