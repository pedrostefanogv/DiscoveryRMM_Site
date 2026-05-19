import {
  useAgentStatusRealtime,
  type AgentRealtimeScope,
} from "./useAgentStatusRealtime";

/**
 * @deprecated Desde Contract v4.0.0 — dashboard consome agent events exclusivamente via NATS.
 * Use `useAgentStatusRealtime` diretamente se necessário.
 */
export function useAgentStatusRealtime_Combined(
  enabled = true,
  scope?: AgentRealtimeScope,
) {
  useAgentStatusRealtime(enabled, scope);
}

/**
 * @deprecated Prefira `useAgentStatusRealtime` diretamente.
 */
export { useAgentStatusRealtime } from "./useAgentStatusRealtime";
export type { AgentRealtimeScope } from "./useAgentStatusRealtime";

// Core entities
export * from "./useClients";
export * from "./useSites";
export * from "./useAgents";
export * from "./useAgentTransfer";
export * from "./useAgentAlerts";
export * from "./useWorkflow";
export * from "./useDepartments";
export * from "./useWorkflowProfiles";
export * from "./useDeployTokens";

// Reports
export * from "./useReportDatasets";
export * from "./useReportTemplates";
export * from "./useReportExecutions";
export * from "./useReportFavorites";
export * from "./useReportTemplateHistory";
export * from "./useReportDownload";
export * from "./useReportLayoutSchema";
export * from "./useReportPreview";
export * from "./useReportAutocomplete";
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
export * from "./useDepartmentCustomFields";
export * from "./useAuthSecurity";
export * from "./useIdentity";
export * from "./useNowTick";
export { useSearch } from "./useSearch";
export { useDashboardSummary } from "./useDashboardSummary";
export { useDashboardRealtime } from "./useDashboardRealtime";
export type { DashboardRealtimeScope } from "./useDashboardRealtime";
export { useP2POverview } from "./useP2POverview";
