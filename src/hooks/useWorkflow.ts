import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workflowApi } from "@/api";
import type {
  CreateWorkflowStateRequest,
  CursorPageDto,
  UpdateStateRequest,
  WorkflowState,
  WorkflowTransition,
  CreateWorkflowTransitionRequest,
} from "@/api";

const KEYS = {
  states: ["workflow-states"] as const,
  transitions: ["workflow-transitions"] as const,
};

function normalizeArray<T>(data: CursorPageDto<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return (data as CursorPageDto<T>).items ?? [];
}

export function useWorkflowStates(clientId?: string) {
  return useQuery({
    queryKey: [...KEYS.states, clientId],
    queryFn: () => workflowApi.listStates(clientId),
    select: (data) =>
      normalizeArray(data as CursorPageDto<WorkflowState> | WorkflowState[]),
  });
}

export function useWorkflowTransitions(clientId?: string) {
  return useQuery({
    queryKey: [...KEYS.transitions, clientId],
    queryFn: () => workflowApi.listTransitions(clientId),
    select: (data) =>
      normalizeArray(
        data as CursorPageDto<WorkflowTransition> | WorkflowTransition[],
      ),
  });
}

export function useCreateWorkflowState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWorkflowStateRequest) =>
      workflowApi.createState(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.states }),
  });
}

export function useUpdateWorkflowState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStateRequest }) =>
      workflowApi.updateState(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.states }),
  });
}

export function useDeleteWorkflowState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowApi.deleteState(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.states }),
  });
}

export function useCreateWorkflowTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWorkflowTransitionRequest) =>
      workflowApi.createTransition(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.transitions }),
  });
}

export function useDeleteWorkflowTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowApi.deleteTransition(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.transitions }),
  });
}

export function useWorkflowTransitionsFrom(
  fromStateId: string,
  clientId?: string,
) {
  return useQuery({
    queryKey: [...KEYS.transitions, "from", fromStateId, clientId],
    queryFn: () => workflowApi.listTransitionsFrom(fromStateId, clientId),
    enabled: !!fromStateId,
  });
}
