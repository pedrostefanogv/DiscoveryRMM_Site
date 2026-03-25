import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { configurationApi, extractTicketAttachmentSettingsFromEffective } from "@/api";
import type { TicketAttachmentSettings } from "@/api";
import {
  deleteClientConfig,
  deleteSiteConfig,
  getAgentMeEffectiveConfig,
  getAuditByUser,
  getAuditReport,
  getClientConfig,
  getClientEffectiveConfig,
  getClientMetadata,
  getEntityAudit,
  getFieldAudit,
  getRecentAudit,
  getServerConfig,
  getServerReportingConfig,
  getServerMetadata,
  getSiteConfig,
  getSiteEffectiveConfig,
  getSiteMetadata,
  patchClientConfig,
  patchServerConfig,
  patchSiteConfig,
  resetClientProperty,
  resetServerConfig,
  resetSiteProperty,
  updateServerConfig,
  updateServerReportingConfig,
  upsertClientConfig,
  upsertSiteConfig,
  type ClientConfigurationPayload,
  type ConfigurationEntityType,
  type ServerConfigurationPayload,
  type SiteConfigurationPayload,
} from "@/services/configurationApi";

export const configurationQueryKeys = {
  server: ["config", "server"] as const,
  serverMetadata: ["config", "server-metadata"] as const,
  serverReporting: ["config", "server-reporting"] as const,
  client: (clientId: string) => ["config", "client", clientId] as const,
  clientEffective: (clientId: string) =>
    ["config", "client-effective", clientId] as const,
  clientMetadata: (clientId: string) =>
    ["config", "client-metadata", clientId] as const,
  site: (siteId: string) => ["config", "site", siteId] as const,
  siteEffective: (siteId: string) =>
    ["config", "site-effective", siteId] as const,
  siteMetadata: (siteId: string) =>
    ["config", "site-metadata", siteId] as const,
  agentMe: ["config", "agent-auth", "me"] as const,
  auditRecent: (days = 30, limit = 200) =>
    ["config", "audit", "recent", days, limit] as const,
  auditEntity: (
    entityType: ConfigurationEntityType,
    entityId: string,
    limit?: number,
  ) =>
    [
      "config",
      "audit",
      "entity",
      entityType,
      entityId,
      limit ?? "all",
    ] as const,
  auditField: (
    entityType: ConfigurationEntityType,
    entityId: string,
    fieldName: string,
  ) => ["config", "audit", "field", entityType, entityId, fieldName] as const,
  auditByUser: (username: string, limit?: number) =>
    ["config", "audit", "user", username, limit ?? "all"] as const,
  auditReport: (startDate: string, endDate: string) =>
    ["config", "audit", "report", startDate, endDate] as const,
  ticketAttachmentSettings: ["config", "ticket-attachment-settings"] as const,
};

function invalidateRecentAudit(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: ["config", "audit"] });
}

export function useServerConfig() {
  return useQuery({
    queryKey: configurationQueryKeys.server,
    queryFn: getServerConfig,
  });
}

export function useServerMetadata() {
  return useQuery({
    queryKey: configurationQueryKeys.serverMetadata,
    queryFn: getServerMetadata,
  });
}

export function useServerReportingConfig() {
  return useQuery({
    queryKey: configurationQueryKeys.serverReporting,
    queryFn: getServerReportingConfig,
  });
}

export function useUpdateServerConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ServerConfigurationPayload) =>
      updateServerConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.server,
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.serverMetadata,
      });
      invalidateRecentAudit(queryClient);
    },
  });
}

export function usePatchServerConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ServerConfigurationPayload) =>
      patchServerConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.server,
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.serverMetadata,
      });
      invalidateRecentAudit(queryClient);
    },
  });
}

export function useResetServerConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetServerConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.server,
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.serverMetadata,
      });
      invalidateRecentAudit(queryClient);
    },
  });
}

export function useUpdateServerReportingConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateServerReportingConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.serverReporting,
      });
    },
  });
}

export function useClientConfig(clientId: string) {
  return useQuery({
    queryKey: configurationQueryKeys.client(clientId),
    queryFn: () => getClientConfig(clientId),
    enabled: !!clientId,
  });
}

export function useClientEffectiveConfig(clientId: string) {
  return useQuery({
    queryKey: configurationQueryKeys.clientEffective(clientId),
    queryFn: () => getClientEffectiveConfig(clientId),
    enabled: !!clientId,
  });
}

export function useClientMetadata(clientId: string) {
  return useQuery({
    queryKey: configurationQueryKeys.clientMetadata(clientId),
    queryFn: () => getClientMetadata(clientId),
    enabled: !!clientId,
  });
}

export function useUpsertClientConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      payload,
    }: {
      clientId: string;
      payload: ClientConfigurationPayload;
    }) => upsertClientConfig(clientId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.client(variables.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.clientEffective(variables.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.clientMetadata(variables.clientId),
      });
      invalidateRecentAudit(queryClient);
    },
  });
}

export function usePatchClientConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      payload,
    }: {
      clientId: string;
      payload: ClientConfigurationPayload;
    }) => patchClientConfig(clientId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.client(variables.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.clientEffective(variables.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.clientMetadata(variables.clientId),
      });
      invalidateRecentAudit(queryClient);
    },
  });
}

export function useDeleteClientConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => deleteClientConfig(clientId),
    onSuccess: (_, clientId) => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.client(clientId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.clientEffective(clientId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.clientMetadata(clientId),
      });
      invalidateRecentAudit(queryClient);
    },
  });
}

export function useResetClientProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      propertyName,
    }: {
      clientId: string;
      propertyName: string;
    }) => resetClientProperty(clientId, propertyName),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.client(variables.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.clientEffective(variables.clientId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.clientMetadata(variables.clientId),
      });
      invalidateRecentAudit(queryClient);
    },
  });
}

export function useSiteConfig(siteId: string) {
  return useQuery({
    queryKey: configurationQueryKeys.site(siteId),
    queryFn: () => getSiteConfig(siteId),
    enabled: !!siteId,
  });
}

export function useSiteEffectiveConfig(siteId: string) {
  return useQuery({
    queryKey: configurationQueryKeys.siteEffective(siteId),
    queryFn: () => getSiteEffectiveConfig(siteId),
    enabled: !!siteId,
  });
}

export function useSiteMetadata(siteId: string) {
  return useQuery({
    queryKey: configurationQueryKeys.siteMetadata(siteId),
    queryFn: () => getSiteMetadata(siteId),
    enabled: !!siteId,
  });
}

export function useUpsertSiteConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      siteId,
      payload,
    }: {
      siteId: string;
      payload: SiteConfigurationPayload;
    }) => upsertSiteConfig(siteId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.site(variables.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.siteEffective(variables.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.siteMetadata(variables.siteId),
      });
      invalidateRecentAudit(queryClient);
    },
  });
}

export function usePatchSiteConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      siteId,
      payload,
    }: {
      siteId: string;
      payload: SiteConfigurationPayload;
    }) => patchSiteConfig(siteId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.site(variables.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.siteEffective(variables.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.siteMetadata(variables.siteId),
      });
      invalidateRecentAudit(queryClient);
    },
  });
}

export function useDeleteSiteConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (siteId: string) => deleteSiteConfig(siteId),
    onSuccess: (_, siteId) => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.site(siteId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.siteEffective(siteId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.siteMetadata(siteId),
      });
      invalidateRecentAudit(queryClient);
    },
  });
}

export function useResetSiteProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      siteId,
      propertyName,
    }: {
      siteId: string;
      propertyName: string;
    }) => resetSiteProperty(siteId, propertyName),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.site(variables.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.siteEffective(variables.siteId),
      });
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.siteMetadata(variables.siteId),
      });
      invalidateRecentAudit(queryClient);
    },
  });
}

export function useAgentMeEffectiveConfig() {
  return useQuery({
    queryKey: configurationQueryKeys.agentMe,
    queryFn: getAgentMeEffectiveConfig,
  });
}

export function useRecentConfigurationAudit(days = 30, limit = 200) {
  return useQuery({
    queryKey: configurationQueryKeys.auditRecent(days, limit),
    queryFn: () => getRecentAudit(days, limit),
  });
}

export function useEntityConfigurationAudit(
  entityType: ConfigurationEntityType,
  entityId: string,
  limit?: number,
) {
  return useQuery({
    queryKey: configurationQueryKeys.auditEntity(entityType, entityId, limit),
    queryFn: () => getEntityAudit(entityType, entityId, limit),
    enabled: !!entityType && !!entityId,
  });
}

export function useFieldConfigurationAudit(
  entityType: ConfigurationEntityType,
  entityId: string,
  fieldName: string,
) {
  return useQuery({
    queryKey: configurationQueryKeys.auditField(
      entityType,
      entityId,
      fieldName,
    ),
    queryFn: () => getFieldAudit(entityType, entityId, fieldName),
    enabled: !!entityType && !!entityId && !!fieldName,
  });
}

export function useConfigurationAuditByUser(username: string, limit?: number) {
  return useQuery({
    queryKey: configurationQueryKeys.auditByUser(username, limit),
    queryFn: () => getAuditByUser(username, limit),
    enabled: !!username,
  });
}

export function useConfigurationAuditReport(
  startDate: string,
  endDate: string,
) {
  return useQuery({
    queryKey: configurationQueryKeys.auditReport(startDate, endDate),
    queryFn: () => getAuditReport(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

export function useTicketAttachmentSettings() {
  return useQuery({
    queryKey: configurationQueryKeys.ticketAttachmentSettings,
    queryFn: () => configurationApi.getTicketAttachmentSettings(),
  });
}

export function useUpdateTicketAttachmentSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TicketAttachmentSettings) =>
      configurationApi.putTicketAttachmentSettings(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.ticketAttachmentSettings,
      });
    },
  });
}

/**
 * Obtém a config efetiva de TicketAttachmentSettings para um site (com herança aplicada)
 */
export function useSiteTicketAttachmentSettings(siteId: string | null | undefined) {
  return useQuery({
    queryKey: [
      ...configurationQueryKeys.ticketAttachmentSettings,
      "site",
      siteId,
    ] as const,
    queryFn: async () => {
      if (!siteId) {
        // Fallback para servidor se siteId não disponível
        return configurationApi.getTicketAttachmentSettings();
      }
      const effective = await configurationApi.getSiteEffective(siteId);
      return extractTicketAttachmentSettingsFromEffective(effective);
    },
    enabled: !!siteId,
  });
}

/**
 * Obtém a config efetiva de TicketAttachmentSettings para um cliente (com herança aplicada)
 */
export function useClientTicketAttachmentSettings(
  clientId: string | null | undefined,
) {
  return useQuery({
    queryKey: [
      ...configurationQueryKeys.ticketAttachmentSettings,
      "client",
      clientId,
    ] as const,
    queryFn: async () => {
      if (!clientId) {
        // Fallback para servidor se clientId não disponível
        return configurationApi.getTicketAttachmentSettings();
      }
      const effective = await configurationApi.getClientEffective(clientId);
      return extractTicketAttachmentSettingsFromEffective(effective);
    },
    enabled: !!clientId,
  });
}


export function useTestObjectStorage() {
  return useMutation({
    mutationFn: () => configurationApi.testObjectStorage(),
  });
}

export function useTestNatsServer() {
  return useMutation({
    mutationFn: (payload: { url: string; user?: string; password?: string }) =>
      configurationApi.testNatsServer(payload),
  });
}

export function useGenerateNatsAccountKey() {
  return useMutation({
    mutationFn: () => configurationApi.generateNatsAccountKey(),
  });
}
