import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  departmentMembersApi,
  notificationChannelsApi,
  ticketCsatApi,
  ticketMacrosApi,
  ticketTemplatesApi,
  type UpsertNotificationChannelRequest,
  type UpsertTicketMacroRequest,
  type UpsertTicketTemplateRequest,
} from "@/api/support-productivity";

const KEYS = {
  macros: (params: Record<string, unknown>) => ["ticket-macros", params] as const,
  templates: (params: Record<string, unknown>) => ["ticket-templates", params] as const,
  channels: ["notification-channels"] as const,
  members: (departmentId: string) => ["department-members", departmentId] as const,
  csat: (params: Record<string, unknown>) => ["ticket-csat", params] as const,
};

export function useTicketMacros(params: { clientId?: string; departmentId?: string; includeGlobal?: boolean } = {}) {
  return useQuery({ queryKey: KEYS.macros(params), queryFn: () => ticketMacrosApi.list(params) });
}

export function useCreateTicketMacro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertTicketMacroRequest) => ticketMacrosApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket-macros"] }),
  });
}

export function useUpdateTicketMacro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpsertTicketMacroRequest }) => ticketMacrosApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket-macros"] }),
  });
}

export function useDeleteTicketMacro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ticketMacrosApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket-macros"] }),
  });
}

export function useTicketTemplates(params: { clientId?: string; departmentId?: string; includeGlobal?: boolean } = {}) {
  return useQuery({ queryKey: KEYS.templates(params), queryFn: () => ticketTemplatesApi.list(params) });
}

export function useCreateTicketTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertTicketTemplateRequest) => ticketTemplatesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket-templates"] }),
  });
}

export function useUpdateTicketTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpsertTicketTemplateRequest }) => ticketTemplatesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket-templates"] }),
  });
}

export function useDeleteTicketTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ticketTemplatesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket-templates"] }),
  });
}

export function useNotificationChannels() {
  return useQuery({ queryKey: KEYS.channels, queryFn: () => notificationChannelsApi.list() });
}

export function useCreateNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertNotificationChannelRequest) => notificationChannelsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.channels }),
  });
}

export function useUpdateNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpsertNotificationChannelRequest }) => notificationChannelsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.channels }),
  });
}

export function useDeleteNotificationChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationChannelsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.channels }),
  });
}

export function useDepartmentMembers(departmentId: string) {
  return useQuery({
    queryKey: KEYS.members(departmentId),
    queryFn: () => departmentMembersApi.list(departmentId),
    enabled: !!departmentId,
  });
}

export function useAddDepartmentMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, userId }: { departmentId: string; userId: string }) => departmentMembersApi.add(departmentId, userId),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: KEYS.members(v.departmentId) }),
  });
}

export function useRemoveDepartmentMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ departmentId, userId }: { departmentId: string; userId: string }) => departmentMembersApi.remove(departmentId, userId),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: KEYS.members(v.departmentId) }),
  });
}

export function useTicketCsat(params: { from?: string; to?: string; clientId?: string; departmentId?: string } = {}) {
  return useQuery({ queryKey: KEYS.csat(params), queryFn: () => ticketCsatApi.summary(params) });
}
