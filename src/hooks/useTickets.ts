import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketsApi } from "@/api";
import type {
  CreateTicketRequest,
  UpdateTicketRequest,
  UpdateWorkflowStateRequest,
  AddCommentRequest,
  TicketsQuery,
  PresignedUploadRequest,
  CompleteUploadRequest,
} from "@/api";

const KEYS = {
  all: ["tickets"] as const,
  list: (params: TicketsQuery) => [...KEYS.all, "list", params] as const,
  byClient: (clientId: string) => [...KEYS.all, "byClient", clientId] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  comments: (id: string) => [...KEYS.all, "comments", id] as const,
  timeline: (id: string) => [...KEYS.all, "timeline", id] as const,
  attachments: (id: string) => [...KEYS.all, "attachments", id] as const,
  slaStatus: (id: string) => [...KEYS.all, "sla-status", id] as const,
  slaDetails: (id: string) => [...KEYS.all, "sla-details", id] as const,
};

export function useTickets(params: TicketsQuery = {}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => ticketsApi.list(params),
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

export function useTicketComments(id: string) {
  return useQuery({
    queryKey: KEYS.comments(id),
    queryFn: () => ticketsApi.listComments(id),
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

export function useSlaStatus(id: string) {
  return useQuery({
    queryKey: KEYS.slaStatus(id),
    queryFn: () => ticketsApi.getSlaStatus(id),
    enabled: !!id,
    refetchInterval: 60_000,
  });
}

export function useSlaDetails(id: string) {
  return useQuery({
    queryKey: KEYS.slaDetails(id),
    queryFn: () => ticketsApi.getSlaDetails(id),
    enabled: !!id,
    refetchInterval: 60_000,
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

export function useTicketAttachments(ticketId: string) {
  return useQuery({
    queryKey: KEYS.attachments(ticketId),
    queryFn: () => ticketsApi.listAttachments(ticketId),
    enabled: !!ticketId,
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
