import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as signalR from "@microsoft/signalr";
import { API_BASE_URL } from "@/api/client";
import type { DashboardWindow } from "@/api/dashboard";

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
  // Serialize scope to a stable string to avoid infinite effect re-runs when
  // caller passes a new object literal on every render.
  const scopeKey = toScopeKey(scope);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    const queryKey = buildQueryKey(scope, window);

    const hubUrl = `${API_BASE_URL}/hubs/agent`;
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect(RECONNECT_DELAYS)
      .withKeepAliveInterval(15_000)
      .withServerTimeout(60_000)
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    const onDashboardEvent = () => {
      void queryClient.invalidateQueries({ queryKey });
    };

    connection.on("DashboardEvent", onDashboardEvent);
    connection.onreconnected(() =>
      joinGroup(connection, scope).catch(() => {}),
    );

    const startPromise = connection
      .start()
      .then(async () => {
        if (disposed) return;
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
      });

    return () => {
      disposed = true;
      connection.off("DashboardEvent", onDashboardEvent);
      void startPromise.finally(async () => {
        if (connection.state !== signalR.HubConnectionState.Disconnected) {
          await connection.stop();
        }
      });
    };
    // scopeKey + window fully capture the scope identity without object identity issues.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, queryClient, scopeKey, window]);
}
