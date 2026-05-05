import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as signalR from "@microsoft/signalr";
import { API_BASE_URL } from "@/api/client";
import type { DashboardWindow } from "@/api/dashboard";
import { useAuth } from "@/auth/AuthContext";
import { normalizeDashboardEvent } from "@/utils/dashboardEvents";
import {
  clearSignalrConnectionState,
  setSignalrConnectionState,
} from "@/utils/realtimeConnectionState";

type GlobalScope = "global";
type ClientScope = { clientId: string };
type SiteScope = { clientId: string; siteId: string };
export type DashboardRealtimeScope = GlobalScope | ClientScope | SiteScope;

const RECONNECT_DELAYS = [0, 2_000, 5_000, 10_000, 30_000];

function buildQueryKey(
  scope: DashboardRealtimeScope,
  window: DashboardWindow,
): unknown[] {
  if (scope === "global") return ["dashboard", "global", window];
  if ("siteId" in scope)
    return ["dashboard", "site", scope.clientId, scope.siteId, window];
  return ["dashboard", "client", scope.clientId, window];
}

function toScopeKey(scope: DashboardRealtimeScope): string {
  if (scope === "global") return "global";
  if ("siteId" in scope) return `site:${scope.clientId}:${scope.siteId}`;
  return `client:${scope.clientId}`;
}

async function joinGroup(
  connection: signalR.HubConnection,
  scope: DashboardRealtimeScope,
): Promise<void> {
  if (scope === "global") {
    await connection.invoke("JoinDashboard");
  } else if ("siteId" in scope) {
    await connection.invoke("JoinSiteDashboard", scope.clientId, scope.siteId);
  } else {
    await connection.invoke("JoinClientDashboard", scope.clientId);
  }
}

/**
 * Subscribes to DashboardEvent for a specific scope (global / client / site).
 * On each event, invalidates the matching React Query cache entry so
 * useDashboardSummary re-fetches only that summary.
 *
 * Usage (in ClientDetail):
 *   useDashboardRealtime({ clientId: id! }, '24h', !!id)
 *
 * The global scope is already covered by useAgentStatusRealtime; calling
 * this hook with 'global' is optional but safe (separate connection).
 */
export function useDashboardRealtime(
  scope: DashboardRealtimeScope,
  window: DashboardWindow,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const { refreshSession, session } = useAuth();
  // Serialize scope to a stable string to avoid infinite effect re-runs when
  // caller passes a new object literal on every render.
  const scopeKey = toScopeKey(scope);
  const signalrSource = `dashboard-hub:${scopeKey}:${window}`;

  useEffect(() => {
    if (!enabled || !session.accessToken) {
      clearSignalrConnectionState(signalrSource);
      return;
    }

    let disposed = false;
    const queryKey = buildQueryKey(scope, window);

    const hubUrl = `${API_BASE_URL}/hubs/agent`;
    console.log("[dashboard] Iniciando conexão SignalR - escopo:", scopeKey, "janela:", window, "hub:", hubUrl);
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: async () => {
          if (session.accessToken) return session.accessToken;
          const refreshed = await refreshSession();
          return refreshed ?? "";
        },
      })
      .withAutomaticReconnect(RECONNECT_DELAYS)
      .withKeepAliveInterval(15_000)
      .withServerTimeout(60_000)
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    console.log("[dashboard] Conexão configurada:", {
      signalrSource,
      scopeKey,
      window,
      queryKey,
      reconnectDelays: RECONNECT_DELAYS,
    });

    setSignalrConnectionState(signalrSource, "connecting");

    const onDashboardEvent = (...args: unknown[]) => {
      const normalizedEvent = normalizeDashboardEvent(args, "signalr");
      if (!normalizedEvent) return;

      // Debug trace for dashboard realtime events.
      console.log("[dashboard][DashboardEvent]", {
        scope: scopeKey,
        window,
        signalrSource,
        eventType: normalizedEvent.eventType,
        timestampUtc: normalizedEvent.timestampUtc,
      });
      void queryClient.invalidateQueries({ queryKey });
    };

    connection.on("DashboardEvent", onDashboardEvent);
    connection.onreconnecting(() => {
      console.log("[dashboard] SignalR reconectando (escopo:", scopeKey, "janela:", window, ")");
      setSignalrConnectionState(signalrSource, "reconnecting");
    });
    connection.onreconnected(() => {
      console.log("[dashboard] SignalR reconectado (escopo:", scopeKey, "janela:", window, ")");
      setSignalrConnectionState(signalrSource, "connected");
      const groupPromise = joinGroup(connection, scope);
      groupPromise
        .then(() => console.log("[dashboard] Grupo re-ingressado após reconexão:", scopeKey))
        .catch(() => {});
      return groupPromise;
    });
    connection.onclose(() => {
      if (disposed) return;
      console.log("[dashboard] SignalR desconectado (escopo:", scopeKey, "janela:", window, ")");
      setSignalrConnectionState(signalrSource, "disconnected");
    });

    const startPromise = connection
      .start()
      .then(async () => {
        if (disposed) return;
        setSignalrConnectionState(signalrSource, "connected");
        console.log("[dashboard] SignalR conectado (escopo:", scopeKey, "janela:", window, ")");
        await joinGroup(connection, scope);
        console.log("[dashboard] Ingressou no grupo:", scopeKey);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        if (
          error instanceof Error &&
          error.message.includes("before stop() was called")
        ) {
          return;
        }

        console.warn("[dashboard] Falha ao conectar SignalR:", { scope: scopeKey, window, error });
        setSignalrConnectionState(signalrSource, "disconnected");
      });

    return () => {
      disposed = true;
      console.log("[dashboard] Cleanup: removendo handlers (escopo:", scopeKey, "janela:", window, ")");
      clearSignalrConnectionState(signalrSource);
      connection.off("DashboardEvent", onDashboardEvent);
      void startPromise.finally(async () => {
        if (connection.state !== signalR.HubConnectionState.Disconnected) {
          console.log("[dashboard] Parando conexão (escopo:", scopeKey, ")");
          await connection.stop();
        }
      });
    };
    // scopeKey + window fully capture the scope identity without object identity issues.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    queryClient,
    refreshSession,
    scopeKey,
    session.accessToken,
    signalrSource,
    window,
  ]);
}
