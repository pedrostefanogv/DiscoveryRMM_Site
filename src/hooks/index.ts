import { useEffect, useState } from "react";
import { useAgentStatusRealtime } from "./useAgentStatusRealtime";
import { useAgentStatusNats } from "./useAgentStatusNats";
import { getNatsService } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";

const NATS_FALLBACK_GRACE_MS = 4_000;
const NATS_HEALTHCHECK_INTERVAL_MS = 5_000;

/**
 * Unified realtime hook that supports both SignalR and NATS
 * Allows gradual migration from SignalR to NATS or running both in parallel
 */
export function useAgentStatusRealtime_Combined(enabled = true) {
  const natsEnabled =
    enabled && realtimeConfig.useNats && realtimeConfig.natsEnabled;
  const signalrConfigured = enabled && realtimeConfig.useSignalR;

  // Prioridade: NATS primeiro. SignalR sobe apenas como fallback.
  const [signalrFallbackEnabled, setSignalrFallbackEnabled] =
    useState(!natsEnabled);

  useAgentStatusNats(natsEnabled);

  useEffect(() => {
    if (!enabled) {
      setSignalrFallbackEnabled(false);
      return;
    }

    if (!signalrConfigured) {
      setSignalrFallbackEnabled(false);
      return;
    }

    if (!natsEnabled) {
      setSignalrFallbackEnabled(true);
      return;
    }

    // Aguarda um pequeno periodo para NATS conectar antes de ativar fallback.
    setSignalrFallbackEnabled(false);

    const evaluateFallback = () => {
      const natsConnected = getNatsService().isConnected();
      setSignalrFallbackEnabled(!natsConnected);
    };

    const graceTimer = window.setTimeout(
      evaluateFallback,
      NATS_FALLBACK_GRACE_MS,
    );
    const healthTimer = window.setInterval(
      evaluateFallback,
      NATS_HEALTHCHECK_INTERVAL_MS,
    );

    return () => {
      window.clearTimeout(graceTimer);
      window.clearInterval(healthTimer);
    };
  }, [enabled, natsEnabled, signalrConfigured]);

  useAgentStatusRealtime(enabled && signalrFallbackEnabled);
}

/**
 * Export for backward compatibility - apps using the original hook continue to work
 */
export { useAgentStatusRealtime } from "./useAgentStatusRealtime";

// Core entities
export * from "./useClients";
export * from "./useSites";
export * from "./useAgents";

// Reports
export * from "./useReportDatasets";
export * from "./useReportTemplates";
export * from "./useReportExecutions";
export * from "./useReportFavorites";
export * from "./useReportTemplateHistory";
export * from "./useReportNotifications";
export * from "./useReportDownload";
export * from "./useReportLayoutSchema";
export * from "./useReportPreview";
export * from "./useReportAutocomplete";
export * from "./useKnowledge";
export * from "./useAutomation";
export * from "./useCustomFields";
export * from "./useAuthSecurity";
export * from "./useIdentity";
export * from "./useNowTick";
export { useDashboardSummary } from "./useDashboardSummary";
export { useDashboardRealtime } from "./useDashboardRealtime";
export type { DashboardRealtimeScope } from "./useDashboardRealtime";
export { useP2POverview } from "./useP2POverview";
export { useP2PTimeseries } from "./useP2PTimeseries";
export { useP2PArtifactsDistribution } from "./useP2PArtifactsDistribution";
export { useP2PAgentsRanking } from "./useP2PAgentsRanking";
export { useP2PSeedPlan } from "./useP2PSeedPlan";
