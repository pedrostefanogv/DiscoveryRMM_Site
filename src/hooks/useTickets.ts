import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketsApi } from "@/api";
import type {
  CreateTicketRequest,
  UpdateTicketRequest,
  UpdateWorkflowStateRequest,
  AddCommentRequest,
  AddTicketWatcherRequest,
  EndTicketRemoteSessionRequest,
  TicketsQuery,
  PresignedUploadRequest,
  CompleteUploadRequest,
  StartTicketRemoteSessionRequest,
  ReopenTicketRequest,
  RateTicketRequest,
  CreateTicketRelationRequest,
} from "@/api";

const KEYS = {
  all: ["tickets"] as const,
  list: (params: TicketsQuery) => [...KEYS.all, "list", params] as const,
  byClient: (clientId: string) => [...KEYS.all, "byClient", clientId] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  comments: (id: string) => [...KEYS.all, "comments", id] as const,
  watchers: (id: string) => [...KEYS.all, "watchers", id] as const,
  remoteSessions: (id: string) => [...KEYS.all, "remote-sessions", id] as const,
  timeline: (id: string) => [...KEYS.all, "timeline", id] as const,
  attachments: (id: string) => [...KEYS.all, "attachments", id] as const,
  slaDetails: (id: string) => [...KEYS.all, "sla-details", id] as const,
  relations: (id: string) => [...KEYS.all, "relations", id] as const,
};

export function useTickets(params: TicketsQuery = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => ticketsApi.list(params),
    placeholderData: (prev) => prev,
    enabled: options?.enabled ?? true,
  });
}

export function useTicketsByClient(clientId: string, workflowStateId?: string) {
  return useQuery({
    queryKey: KEYS.byClient(clientId),
    queryFn: () => ticketsApi.listByClient(clientId, workflowStateId),
    enabled: !!clientId,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => ticketsApi.get(id),
    enabled: !!id,
  });
}

export function useTicketComments(
  id: string,
  params?: { cursor?: string; limit?: number },
) {
  return useQuery({
    queryKey: [...KEYS.comments(id), params],
    queryFn: () => ticketsApi.listComments(id, params),
    enabled: !!id,
  });
}

export function useTicketWatchers(id: string) {
  return useQuery({
    queryKey: KEYS.watchers(id),
    queryFn: () => ticketsApi.listWatchers(id),
    enabled: !!id,
  });
}

export function useTicketRemoteSessions(id: string) {
  return useQuery({
    queryKey: KEYS.remoteSessions(id),
    queryFn: () => ticketsApi.listRemoteSessions(id),
    enabled: !!id,
  });
}

export function useTicketTimeline(id: string) {
  return useQuery({
    queryKey: KEYS.timeline(id),
    queryFn: () => ticketsApi.getTimeline(id),
    enabled: !!id,
  });
}

export function useSlaDetails(id: string) {
  return useQuery({
    queryKey: KEYS.slaDetails(id),
    queryFn: () => ticketsApi.getSlaDetails(id),
    enabled: !!id,
    refetchInterval: 300_000,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTicketRequest) => ticketsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTicketRequest }) =>
      ticketsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateTicketWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateWorkflowStateRequest;
    }) => ticketsApi.updateWorkflowState(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AddCommentRequest }) =>
      ticketsApi.addComment(id, data),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.comments(vars.id) }),
  });
}

export function useAddTicketWatcher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ticketId,
      data,
    }: {
      ticketId: string;
      data: AddTicketWatcherRequest;
    }) => ticketsApi.addWatcher(ticketId, data),
    onSuccess: (_result, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.watchers(vars.ticketId) }),
  });
}

export function useRemoveTicketWatcher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, userId }: { ticketId: string; userId: string }) =>
      ticketsApi.removeWatcher(ticketId, userId),
    onSuccess: (_result, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.watchers(vars.ticketId) }),
  });
}

export function useStartTicketRemoteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ticketId,
      data,
    }: {
      ticketId: string;
      data: StartTicketRemoteSessionRequest;
    }) => ticketsApi.startRemoteSession(ticketId, data),
    onSuccess: (_result, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.remoteSessions(vars.ticketId) }),
  });
}

export function useEndTicketRemoteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ticketId,
      sessionId,
      data,
    }: {
      ticketId: string;
      sessionId: string;
      data: EndTicketRemoteSessionRequest;
    }) => ticketsApi.endRemoteSession(ticketId, sessionId, data),
    onSuccess: (_result, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.remoteSessions(vars.ticketId) }),
  });
}

export function useTicketAttachments(ticketId: string) {
  return useQuery({
    queryKey: KEYS.attachments(ticketId),
    queryFn: () => ticketsApi.listAttachments(ticketId),
    enabled: !!ticketId,
    select: (data) => ({
      items: Array.isArray(data?.items) ? data.items : [],
      nextCursor: data?.nextCursor ?? null,
      hasMore: data?.hasMore ?? false,
    }),
  });
}

export function usePrepareTicketUpload() {
  return useMutation({
    mutationFn: ({
      ticketId,
      data,
    }: {
      ticketId: string;
      data: PresignedUploadRequest;
    }) => ticketsApi.prepareUpload(ticketId, data),
  });
}

export function useCompleteTicketUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ticketId,
      data,
    }: {
      ticketId: string;
      data: CompleteUploadRequest;
    }) => ticketsApi.completeUpload(ticketId, data),
    onSuccess: (_result, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.attachments(vars.ticketId) }),
  });
}

export function useReopenTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReopenTicketRequest }) =>
      ticketsApi.reopen(id, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useRateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RateTicketRequest }) =>
      ticketsApi.rate(id, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useTicketRelations(id: string) {
  return useQuery({
    queryKey: KEYS.relations(id),
    queryFn: () => ticketsApi.listRelations(id),
    enabled: !!id,
  });
}

export function useCreateTicketRelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateTicketRelationRequest }) =>
      ticketsApi.createRelation(id, data),
    onSuccess: (_result, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.relations(vars.id) }),
  });
}

export function useDeleteTicketRelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, relationId }: { id: string; relationId: string }) =>
      ticketsApi.removeRelation(id, relationId),
    onSuccess: (_result, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.relations(vars.id) }),
  });
}

