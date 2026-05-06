import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getNatsService, type DashboardEvent } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";
import type { DashboardWindow } from "@/api/dashboard";
import {
  buildDashboardNatsSubjects,
  type DashboardNatsScope,
} from "@/utils/natsSubjects";

type GlobalScope = "global";
type ClientScope = { clientId: string };
type SiteScope = { clientId: string; siteId: string };
export type DashboardRealtimeScope = GlobalScope | ClientScope | SiteScope;

const NATS_ENABLED = realtimeConfig.useNats && realtimeConfig.natsEnabled;

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

function toDashboardNatsScope(scope: DashboardRealtimeScope): DashboardNatsScope {
  if (scope === "global") {
    return { level: "global" };
  }

  if ("siteId" in scope) {
    return {
      level: "site",
      clientId: scope.clientId,
      siteId: scope.siteId,
    };
  }

  return {
    level: "client",
    clientId: scope.clientId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOptionalString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function getScopeFieldsFromEvent(event: Record<string, unknown>) {
  const payload = isRecord(event.data) ? event.data : event;

  const clientId =
    readOptionalString(event, "clientId") ??
    readOptionalString(payload, "clientId");
  const siteId =
    readOptionalString(event, "siteId") ?? readOptionalString(payload, "siteId");

  return { clientId, siteId };
}

function eventMatchesScope(
  event: DashboardEvent | Record<string, unknown>,
  scope: DashboardRealtimeScope,
): boolean {
  if (scope === "global") return true;
  if (!isRecord(event)) return true;

  const { clientId, siteId } = getScopeFieldsFromEvent(event);

  // If scope info is absent in the event, prefer invalidating to avoid stale UI.
  if (!clientId) return true;

  if ("siteId" in scope) {
    if (!siteId) return true;
    return clientId === scope.clientId && siteId === scope.siteId;
  }

  return clientId === scope.clientId;
}

/**
 * Subscribes to dashboard realtime events via NATS and invalidates
 * the scoped dashboard query when matching events arrive.
 */
export function useDashboardRealtime(
  scope: DashboardRealtimeScope,
  window: DashboardWindow,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const scopeKey = toScopeKey(scope);
  const stableScope = useMemo<DashboardRealtimeScope>(() => scope, [scopeKey]);

  useEffect(() => {
    if (!enabled || !NATS_ENABLED || !realtimeConfig.natsUrl) {
      return;
    }

    let disposed = false;
    const queryKey = buildQueryKey(stableScope, window);
    const dashboardSubjects = buildDashboardNatsSubjects(
      toDashboardNatsScope(stableScope),
      {
        includeLegacySubject: true,
        includeScopedFallbacks: true,
        includeSiteWildcardForClientScope: true,
        includeGlobalWildcardSubjects: true,
      },
    );

    const natsService = getNatsService({
      url: realtimeConfig.natsUrl,
      enabled: NATS_ENABLED,
    });

    const onDashboardEvent = (event: DashboardEvent | Record<string, unknown>) => {
      if (disposed) return;
      if (!eventMatchesScope(event, stableScope)) return;
      void queryClient.invalidateQueries({ queryKey });
    };

    void natsService.connect().then(() => {
      if (disposed) return;

      dashboardSubjects.forEach((subject) => {
        if (!natsService.canSubscribeToSubject(subject)) {
          console.debug(
            "[NATS][dashboard] Subject fora da allow-list do token, ignorando:",
            subject,
          );
          return;
        }

        void natsService.subscribe(subject, onDashboardEvent);
      });
    });

    return () => {
      disposed = true;
      dashboardSubjects.forEach((subject) => {
        natsService.unsubscribe(subject, onDashboardEvent);
      });
    };
  }, [enabled, queryClient, stableScope, window]);
}
