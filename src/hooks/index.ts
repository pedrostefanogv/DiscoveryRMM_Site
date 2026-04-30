import { useEffect, useState } from "react";
import { useAgentStatusRealtime } from "./useAgentStatusRealtime";
import { useAgentStatusNats } from "./useAgentStatusNats";
import { realtimeConfig } from "@/config/realtime";
import {
  getRealtimeConnectionSnapshot,
  subscribeRealtimeConnectionState,
} from "@/utils/realtimeConnectionState";

const SIGNALR_PRIORITY_GRACE_MS = 4_000;
const SIGNALR_HEALTHCHECK_INTERVAL_MS = 5_000;

/**
 * Unified realtime hook that supports both SignalR and NATS
 * Allows gradual migration from SignalR to NATS or running both in parallel
 */
export function useAgentStatusRealtime_Combined(enabled = true) {
  const natsConfigured =
    enabled && realtimeConfig.useNats && realtimeConfig.natsEnabled;
  const signalrConfigured = enabled && realtimeConfig.useSignalR;

  // Modo both com prioridade SignalR.
  // NATS entra como fallback automatico quando SignalR nao conecta ou cai.
  const [natsRuntimeEnabled, setNatsRuntimeEnabled] =
    useState(false);
  const [signalrRuntimeEnabled, setSignalrRuntimeEnabled] =
    useState(signalrConfigured);

  useAgentStatusNats(natsRuntimeEnabled);

  useEffect(() => {
    if (!enabled) {
      setNatsRuntimeEnabled(false);
      setSignalrRuntimeEnabled(false);
      return;
    }

    if (!natsConfigured && !signalrConfigured) {
      setNatsRuntimeEnabled(false);
      setSignalrRuntimeEnabled(false);
      return;
    }

    if (natsConfigured && !signalrConfigured) {
      setNatsRuntimeEnabled(true);
      setSignalrRuntimeEnabled(false);
      return;
    }

    if (!natsConfigured && signalrConfigured) {
      setNatsRuntimeEnabled(false);
      setSignalrRuntimeEnabled(true);
      return;
    }

    // Ambos configurados: prioriza SignalR e habilita NATS apenas em falha.
    setSignalrRuntimeEnabled(true);
    setNatsRuntimeEnabled(false);

    const startedAt = Date.now();

    const evaluateFallback = () => {
      const snapshot = getRealtimeConnectionSnapshot();
      const graceElapsed = Date.now() - startedAt >= SIGNALR_PRIORITY_GRACE_MS;

      if (snapshot.signalrConnected) {
        setNatsRuntimeEnabled(false);
        return;
      }

      if (snapshot.signalrState === "disconnected") {
        setNatsRuntimeEnabled(true);
        return;
      }

      if (snapshot.signalrState === "reconnecting") {
        setNatsRuntimeEnabled(true);
        return;
      }

      if (snapshot.signalrState === "connecting") {
        setNatsRuntimeEnabled(graceElapsed);
        return;
      }

      setNatsRuntimeEnabled(graceElapsed);
    };

    evaluateFallback();

    const unsubscribeConnectionState = subscribeRealtimeConnectionState(() => {
      evaluateFallback();
    });

    const graceTimer = window.setTimeout(
      evaluateFallback,
      SIGNALR_PRIORITY_GRACE_MS,
    );
    const healthTimer = window.setInterval(
      evaluateFallback,
      SIGNALR_HEALTHCHECK_INTERVAL_MS,
    );

    return () => {
      unsubscribeConnectionState();
      window.clearTimeout(graceTimer);
      window.clearInterval(healthTimer);
    };
  }, [enabled, natsConfigured, signalrConfigured]);

  useAgentStatusRealtime(signalrRuntimeEnabled);
}

/**
 * Export for backward compatibility - apps using the original hook continue to work
 */
export { useAgentStatusRealtime } from "./useAgentStatusRealtime";

// Core entities
export * from "./useClients";
export * from "./useSites";
export * from "./useAgents";
export * from "./useAgentAlerts";
export * from "./useWorkflow";
export * from "./useDepartments";
export * from "./useWorkflowProfiles";
export * from "./useDeployTokens";
export * from "./useApiTokens";
export * from "./useMonitoringEvents";
export * from "./useBackgroundServices";

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
export * from "./useReportSchedules";
export * from "./useNotifications";
export * from "./useTicketAlertRules";
export * from "./useSlaCalendars";
export * from "./useEscalationRules";
export * from "./useTicketSavedViews";
export * from "./useTicketKpi";
export * from "./useTicketAutomationLinks";
export * from "./useTicketCustomFields";
export * from "./useTicketAi";
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
