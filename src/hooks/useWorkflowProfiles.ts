import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workflowProfilesApi } from "@/api";
import type {
  CreateWorkflowProfileRequest,
  CursorPageDto,
  UpdateWorkflowProfileRequest,
  WorkflowProfile,
} from "@/api";

const KEYS = {
  all: ["workflow-profiles"] as const,
  list: (params: { clientId?: string; includeGlobal?: boolean }) =>
    [...KEYS.all, "list", params] as const,
  byDepartment: (departmentId: string) =>
    [...KEYS.all, "byDepartment", departmentId] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
};

function normalizeArray<T>(data: CursorPageDto<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return (data as CursorPageDto<T>).items ?? [];
}

export function useWorkflowProfiles(
  params: { clientId?: string; includeGlobal?: boolean } = {},
) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => workflowProfilesApi.list(params),
    select: (data) =>
      normalizeArray(
        data as CursorPageDto<WorkflowProfile> | WorkflowProfile[],
      ),
  });
}

export function useWorkflowProfilesByDepartment(departmentId: string) {
  return useQuery({
    queryKey: KEYS.byDepartment(departmentId),
    queryFn: () => workflowProfilesApi.listByDepartment(departmentId),
    enabled: !!departmentId,
  });
}

export function useCreateWorkflowProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWorkflowProfileRequest) =>
      workflowProfilesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateWorkflowProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateWorkflowProfileRequest;
    }) => workflowProfilesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeleteWorkflowProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowProfilesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
