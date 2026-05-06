import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getNatsService, type DashboardEvent } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";
import type { Agent, AgentHeartbeat } from "@/api";
import { heartbeatStore, extractHeartbeatMetrics } from "@/stores/heartbeatStore";
import {
  setNatsConnectionDiagnostics,
  setNatsConnectionState,
  setServerPongState,
} from "@/utils/realtimeConnectionState";
import {
  buildDashboardNatsSubjects,
  type DashboardNatsScope,
} from "@/utils/natsSubjects";

type AgentRealtimeStatus = "Online" | "Offline";

export type AgentRealtimeScope =
  | { level: "global" }
  | { level: "client"; clientId: string }
  | { level: "site"; clientId: string; siteId: string }
  | { level: "agent"; agentId: string; clientId?: string; siteId?: string };

const GLOBAL_SCOPE: AgentRealtimeScope = { level: "global" };

function normalizeEventType(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHeartbeatType(normalizedType: string): boolean {
  return normalizedType === "agentheartbeat";
}

function isStatusChangedType(normalizedType: string): boolean {
  return normalizedType === "agentstatuschanged";
}

function isCommandCompletedType(normalizedType: string): boolean {
  return normalizedType === "commandcompleted";
}

function isPongType(normalizedType: string): boolean {
  return normalizedType === "pong";
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

function parseNullableBoolean(
  value: unknown,
): boolean | null | undefined {
  if (typeof value === "boolean") return value;
  if (value === null) return null;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    if (normalized === "null") return null;
  }

  return undefined;
}

function toDashboardScope(scope: AgentRealtimeScope): DashboardNatsScope {
  if (scope.level === "site") {
    return {
      level: "site",
      clientId: scope.clientId,
      siteId: scope.siteId,
    };
  }

  if (scope.level === "client") {
    return {
      level: "client",
      clientId: scope.clientId,
    };
  }

  if (scope.level === "agent") {
    if (scope.clientId && scope.siteId) {
      return {
        level: "site",
        clientId: scope.clientId,
        siteId: scope.siteId,
      };
    }

    if (scope.clientId) {
      return {
        level: "client",
        clientId: scope.clientId,
      };
    }
  }

  return { level: "global" };
}

function describeScope(scope: AgentRealtimeScope): string {
  if (scope.level === "site") {
    return `site:${scope.clientId}:${scope.siteId}`;
  }

  if (scope.level === "client") {
    return `client:${scope.clientId}`;
  }

  if (scope.level === "agent") {
    return `agent:${scope.agentId}:${scope.clientId ?? "?"}:${scope.siteId ?? "?"}`;
  }

  return "global";
}

function parsePongMessage(message: Record<string, unknown>) {
  const eventType = normalizeEventType(getStringField(message, ["eventType"]));
  const payload = isRecord(message.data) ? message.data : message;

  const overloaded =
    parseNullableBoolean(payload.serverOverloaded) ??
    parseNullableBoolean(message.serverOverloaded);

  if (overloaded === undefined && !isPongType(eventType)) {
    return null;
  }

  const observedAtUtc =
    getStringField(payload, ["serverTimeUtc", "timestampUtc"]) ??
    getStringField(message, ["serverTimeUtc", "timestampUtc"]) ??
    new Date().toISOString();

  return {
    overloaded: overloaded ?? null,
    observedAtUtc,
  };
}

const NATS_URL = realtimeConfig.natsUrl;
const NATS_ENABLED = realtimeConfig.useNats && realtimeConfig.natsEnabled;
const GLOBAL_PONG_SUBJECT =
  (import.meta.env.VITE_NATS_GLOBAL_PONG_SUBJECT ?? "tenant.global.pong").trim();
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
    normalizedType === "agentstatuschanged";

  if (isHeartbeatLike) {
    invalidateThrottled(["dashboard"], DASHBOARD_INVALIDATE_MIN_INTERVAL_MS);
    invalidateThrottled(["realtime", "stats"]);
    return;
  }

  if (normalizedType === "commandcompleted") {
    invalidateThrottled(["agents"]);
    invalidateThrottled(["logs"]);
    invalidateThrottled(["realtime", "stats"]);
    return;
  }

  if (
    normalizedType === "agenthardwarereported" ||
    normalizedType === "agentconnected" ||
    normalizedType === "agentdisconnected"
  ) {
    invalidateThrottled(["dashboard"], DASHBOARD_INVALIDATE_MIN_INTERVAL_MS);
    invalidateThrottled(["realtime", "stats"]);
    return;
  }

  // Stats are aggregate numbers and should reflect every backend event.
  invalidateThrottled(["realtime", "stats"]);
}

function toHeartbeatPayload(
  data: Record<string, unknown>,
): AgentHeartbeat | null {
  const agentId = getStringField(data, ["agentId"]);
  if (!agentId) return null;

  const status = getStringField(data, ["status"]);
  if (status && normalizeEventType(status) !== "online") {
    return null;
  }

  const ipAddress = getStringField(data, ["ipAddress"]);

  return {
    agentId,
    status: "Online",
    clientId: getStringField(data, ["clientId"]) ?? undefined,
    siteId: getStringField(data, ["siteId"]) ?? undefined,
    ipAddress: ipAddress ?? undefined,
    hostname: getStringField(data, ["hostname"]) ?? undefined,
    agentVersion: getStringField(data, ["agentVersion"]) ?? undefined,
    cpuPercent: getNumberField(data, ["cpuPercent"]),
    memoryPercent: getNumberField(data, ["memoryPercent"]),
    diskPercent: getNumberField(data, ["diskPercent"]),
    memoryTotalGb: getNumberField(data, ["memoryTotalGb"]),
    memoryUsedGb: getNumberField(data, ["memoryUsedGb"]),
    diskTotalGb: getNumberField(data, ["diskTotalGb"]),
    diskUsedGb: getNumberField(data, ["diskUsedGb"]),
    p2pPeers: getNumberField(data, ["p2pPeers"]),
    uptimeSeconds: getNumberField(data, ["uptimeSeconds"]),
    processCount: getNumberField(data, ["processCount"]),
    timestampUtc: getStringField(data, ["timestampUtc"]) ?? undefined,
  };
}

function toStatusChangedPayload(
  data: Record<string, unknown>,
): { agentId: string; status: AgentRealtimeStatus } | null {
  const agentId = getStringField(data, ["agentId"]);
  if (!agentId) return null;

  const rawStatus = getStringField(data, ["status"]);
  const normalizedStatus = normalizeEventType(rawStatus);
  if (normalizedStatus === "online") {
    return { agentId, status: "Online" };
  }
  if (normalizedStatus === "offline") {
    return { agentId, status: "Offline" };
  }

  return null;
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

export function useAgentStatusNats(
  enabled = true,
  scope: AgentRealtimeScope = GLOBAL_SCOPE,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !NATS_ENABLED) {
      setNatsConnectionState("disconnected");
      setNatsConnectionDiagnostics(null, null, null);
      setServerPongState(null, null);
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

    const handleDashboardEvent = (event: DashboardEvent) => {
      if (disposed) return;

      if (!isRecord(event)) return;

      const pong = parsePongMessage(event);
      if (pong) {
        setServerPongState(pong.overloaded, pong.observedAtUtc);
        return;
      }

      const eventEnvelope = event;
      const eventType = getStringField(eventEnvelope, ["eventType"]);
      const normalizedType = normalizeEventType(eventType);

      const eventData = eventEnvelope.data;
      const safeData = isRecord(eventData) ? eventData : null;

      console.log("[NATS][dashboard.events]", {
        eventType,
        normalizedType,
        hasData: Boolean(safeData),
      });

      if (isHeartbeatType(normalizedType)) {
        if (!safeData) return;
        const heartbeatData = toHeartbeatPayload(safeData);
        if (!heartbeatData) return;
        applyHeartbeat(heartbeatData);
        return;
      }

      if (isStatusChangedType(normalizedType)) {
        if (!safeData) return;

        const statusPayload = toStatusChangedPayload(safeData);
        if (!statusPayload) return;

        const { agentId, status } = statusPayload;

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
        invalidateDashboardQueries(normalizedType, invalidateThrottled);
        return;
      }

      if (isCommandCompletedType(normalizedType)) {
        if (safeData) {
          const resultAgentId = getStringField(safeData, ["agentId"]);
          if (resultAgentId) {
            invalidateThrottled(["agents", "detail", resultAgentId], 500);
          }
        }

        invalidateDashboardQueries(normalizedType, invalidateThrottled);
        return;
      }

      if (!normalizedType) return;
      invalidateDashboardQueries(normalizedType, invalidateThrottled);
    };

    const handleGlobalPong = (message: DashboardEvent) => {
      if (disposed) return;
      if (!isRecord(message)) return;

      const pong = parsePongMessage(message);
      if (!pong) return;

      console.log("[NATS][global.pong]", pong);
      setServerPongState(pong.overloaded, pong.observedAtUtc);
    };

    const dashboardScope = toDashboardScope(scope);
    const dashboardSubjects = buildDashboardNatsSubjects(dashboardScope, {
      includeScopedFallbacks: true,
      includeSiteWildcardForClientScope: true,
      includeGlobalWildcardSubjects: true,
    });

    const subscriptions = new Map<string, (event: DashboardEvent) => void>();
    dashboardSubjects.forEach((subject) => {
      subscriptions.set(subject, handleDashboardEvent);
    });

    if (GLOBAL_PONG_SUBJECT) {
      subscriptions.set(GLOBAL_PONG_SUBJECT, handleGlobalPong);
    }

    const telemetryContext = {
      source: "frontend.nats.bootstrap",
      scope: describeScope(scope),
      subjectsRequested: subscriptions.size,
      atUtc: new Date().toISOString(),
    };

    console.info("[NATS][telemetry]", {
      event: "bootstrap_start",
      ...telemetryContext,
    });

    console.log("[NATS] Configurando serviço NATS:", {
      url: NATS_URL,
      enabled: NATS_ENABLED,
      scope: describeScope(scope),
    });
    const natsService = getNatsService({
      url: NATS_URL,
      enabled: NATS_ENABLED,
      clientId:
        dashboardScope.level !== "global" ? dashboardScope.clientId : undefined,
      siteId:
        dashboardScope.level === "site" ? dashboardScope.siteId : undefined,
      scopeMode: "replace",
    });

    const unsubscribeConnectionState = natsService.onConnectionStateChange(
      (state) => {
        if (disposed) return;
        console.log("[NATS] Estado da conexão mudou:", state);
        setNatsConnectionState(state);
        const diagnostics = natsService.getConnectionDiagnostics();
        setNatsConnectionDiagnostics(
          diagnostics.lastErrorType,
          diagnostics.lastErrorMessage,
          diagnostics.lastErrorAtUtc,
        );
      },
    );

    void (async () => {
      const connected = await natsService.connect();
      if (disposed) return;

      const diagnostics = natsService.getConnectionDiagnostics();
      setNatsConnectionDiagnostics(
        diagnostics.lastErrorType,
        diagnostics.lastErrorMessage,
        diagnostics.lastErrorAtUtc,
      );

      if (!connected) {
        console.warn(
          "[NATS] Conexão não estabelecida. Bootstrap de subscriptions abortado.",
          diagnostics,
        );
        console.warn("[NATS][telemetry]", {
          event: "bootstrap_connect_failed",
          ...telemetryContext,
          diagnostics,
        });
        return;
      }

      console.log("[NATS] Conectado. Inscrevendo subjects...");

      const activeSubjects: string[] = [];
      const blockedSubjects: string[] = [];
      const failedSubjects: string[] = [];
      for (const [subject, handler] of subscriptions) {
        if (!natsService.canSubscribeToSubject(subject)) {
          console.debug(
            "[NATS] Subject fora da allow-list do token, ignorando:",
            subject,
          );
          blockedSubjects.push(subject);
          continue;
        }

        const subscribed = await natsService.subscribe(subject, handler, {
          connectIfNeeded: false,
        });
        if (subscribed) {
          activeSubjects.push(subject);
        } else {
          failedSubjects.push(subject);
        }
      }

      console.log("[NATS] Subscriptions ativas:", activeSubjects);
      console.info("[NATS][telemetry]", {
        event: "bootstrap_subscriptions_result",
        ...telemetryContext,
        connected,
        activeCount: activeSubjects.length,
        blockedCount: blockedSubjects.length,
        failedCount: failedSubjects.length,
        activeSubjects,
        blockedSubjects,
        failedSubjects,
      });
    })();

    return () => {
      disposed = true;
      console.log("[NATS] Cleanup: removendo subscriptions.");
      unsubscribeConnectionState();
      subscriptions.forEach((handler, subject) => {
        natsService.unsubscribe(subject, handler);
      });
      setNatsConnectionState("disconnected");
      setNatsConnectionDiagnostics(null, null, null);
      setServerPongState(null, null);
      console.info("[NATS][telemetry]", {
        event: "bootstrap_cleanup",
        ...telemetryContext,
      });
      console.log("[NATS] Cleanup concluído.");
    };
  }, [enabled, queryClient, scope]);
}
