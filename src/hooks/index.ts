import { useAgentStatusRealtime } from "./useAgentStatusRealtime";

/**
 * Backward-compatible entry point for realtime agent status updates.
 *
 * Contract v3.0.0:
 * Dashboard consumes agent events exclusively from SignalR DashboardEvent.
 */
export function useAgentStatusRealtime_Combined(enabled = true) {
  useAgentStatusRealtime(enabled);
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
