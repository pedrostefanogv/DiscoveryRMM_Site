import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteClientConfig,
  deleteSiteConfig,
  getAgentMeEffectiveConfig,
  getAuditByUser,
  getAuditReport,
  getClientConfig,
  getClientEffectiveConfig,
  getEntityAudit,
  getFieldAudit,
  getRecentAudit,
  getServerConfig,
  getSiteConfig,
  getSiteEffectiveConfig,
  patchClientConfig,
  patchServerConfig,
  patchSiteConfig,
  resetClientProperty,
  resetServerConfig,
  resetSiteProperty,
  updateServerConfig,
  upsertClientConfig,
  upsertSiteConfig,
  type ClientConfigurationPayload,
  type ConfigurationEntityType,
  type ServerConfigurationPayload,
  type SiteConfigurationPayload,
} from "@/services/configurationApi";

export const configurationQueryKeys = {
  server: ["config", "server"] as const,
  client: (clientId: string) => ["config", "client", clientId] as const,
  clientEffective: (clientId: string) =>
    ["config", "client-effective", clientId] as const,
  site: (siteId: string) => ["config", "site", siteId] as const,
  siteEffective: (siteId: string) =>
    ["config", "site-effective", siteId] as const,
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

export function useUpdateServerConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ServerConfigurationPayload) =>
      updateServerConfig(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: configurationQueryKeys.server,
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
      invalidateRecentAudit(queryClient);
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
