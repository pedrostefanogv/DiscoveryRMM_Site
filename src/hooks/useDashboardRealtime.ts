import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as signalR from "@microsoft/signalr";
import { API_BASE_URL } from "@/api/client";
import type { DashboardWindow } from "@/api/dashboard";
import { useAuth } from "@/auth/AuthContext";
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

    setSignalrConnectionState(signalrSource, "connecting");

    const onDashboardEvent = (...args: unknown[]) => {
      // Temporary debug trace for dashboard realtime events.
      console.log("[dashboard][DashboardEvent]", {
        scope: scopeKey,
        window,
        args,
      });
      void queryClient.invalidateQueries({ queryKey });
    };

    connection.on("DashboardEvent", onDashboardEvent);
    connection.onreconnecting(() => {
      setSignalrConnectionState(signalrSource, "reconnecting");
    });
    connection.onreconnected(() => {
      setSignalrConnectionState(signalrSource, "connected");
      return joinGroup(connection, scope).catch(() => {});
    });
    connection.onclose(() => {
      if (disposed) return;
      setSignalrConnectionState(signalrSource, "disconnected");
    });

    const startPromise = connection
      .start()
      .then(async () => {
        if (disposed) return;
        setSignalrConnectionState(signalrSource, "connected");
        await joinGroup(connection, scope);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        if (
          error instanceof Error &&
          error.message.includes("before stop() was called")
        ) {
          return;
        }

        setSignalrConnectionState(signalrSource, "disconnected");
      });

    return () => {
      disposed = true;
      clearSignalrConnectionState(signalrSource);
      connection.off("DashboardEvent", onDashboardEvent);
      void startPromise.finally(async () => {
        if (connection.state !== signalR.HubConnectionState.Disconnected) {
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
