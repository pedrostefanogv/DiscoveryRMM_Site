import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ticketAlertRulesApi } from "@/api/ticket-alert-rules";
import type { UpsertTicketAlertRuleRequest } from "@/api";

const KEYS = {
  all: ["ticket-alert-rules"] as const,
  list: () => [...KEYS.all, "list"] as const,
  byWorkflowState: (workflowStateId: string) =>
    [...KEYS.all, "by-workflow-state", workflowStateId] as const,
};

export function useTicketAlertRules(enabled = true) {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: () => ticketAlertRulesApi.list(),
    enabled,
  });
}

export function useTicketAlertRulesByWorkflowState(
  workflowStateId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: KEYS.byWorkflowState(workflowStateId),
    queryFn: () => ticketAlertRulesApi.listByWorkflowState(workflowStateId),
    enabled: enabled && !!workflowStateId,
  });
}

export function useCreateTicketAlertRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpsertTicketAlertRuleRequest) =>
      ticketAlertRulesApi.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useUpdateTicketAlertRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpsertTicketAlertRuleRequest;
    }) => ticketAlertRulesApi.update(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useToggleTicketAlertRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketAlertRulesApi.toggle(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useDeleteTicketAlertRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketAlertRulesApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}