import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { escalationRulesApi } from "@/api/escalation-rules";
import type {
  CreateEscalationRuleRequest,
  CursorPageDto,
  TicketEscalationRule,
  UpdateEscalationRuleRequest,
} from "@/api";

const KEYS = {
  all: ["escalation-rules"] as const,
  list: () => [...KEYS.all, "list"] as const,
  byWorkflowProfile: (workflowProfileId: string) =>
    [...KEYS.all, "workflow-profile", workflowProfileId] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
};

function normalizeArray<T>(data: CursorPageDto<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return (data as CursorPageDto<T>).items ?? [];
}

export function useEscalationRules(enabled = true) {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: () => escalationRulesApi.list(),
    enabled,
    select: (data) =>
      normalizeArray(
        data as CursorPageDto<TicketEscalationRule> | TicketEscalationRule[],
      ),
  });
}

export function useEscalationRulesByWorkflowProfile(
  workflowProfileId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: KEYS.byWorkflowProfile(workflowProfileId),
    queryFn: () => escalationRulesApi.listByWorkflowProfile(workflowProfileId),
    enabled: enabled && !!workflowProfileId,
    select: (data) =>
      normalizeArray(
        data as CursorPageDto<TicketEscalationRule> | TicketEscalationRule[],
      ),
  });
}

export function useEscalationRule(id: string | null, enabled = true) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : [...KEYS.all, "detail", "disabled"],
    queryFn: () => escalationRulesApi.get(id as string),
    enabled: enabled && !!id,
  });
}

export function useCreateEscalationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEscalationRuleRequest) =>
      escalationRulesApi.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.list() });
    },
  });
}

export function useUpdateEscalationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateEscalationRuleRequest;
    }) => escalationRulesApi.update(id, data),
    onSuccess: (_result, vars) => {
      void queryClient.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
      void queryClient.invalidateQueries({ queryKey: KEYS.list() });
    },
  });
}

export function useDeleteEscalationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => escalationRulesApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.list() });
    },
  });
}
