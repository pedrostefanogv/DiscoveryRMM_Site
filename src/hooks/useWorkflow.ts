import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workflowApi } from "@/api";
import type {
  CreateWorkflowStateRequest,
  UpdateStateRequest,
  CreateWorkflowTransitionRequest,
} from "@/api";

const KEYS = {
  states: ["workflow-states"] as const,
  transitions: ["workflow-transitions"] as const,
};

export function useWorkflowStates(clientId?: string) {
  return useQuery({
    queryKey: [...KEYS.states, clientId],
    queryFn: () => workflowApi.listStates(clientId),
  });
}

export function useWorkflowTransitions(clientId?: string) {
  return useQuery({
    queryKey: [...KEYS.transitions, clientId],
    queryFn: () => workflowApi.listTransitions(clientId),
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
