import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { departmentsApi } from "@/api";
import type { CreateDepartmentRequest, UpdateDepartmentRequest } from "@/api";

const KEYS = {
  all: ["departments"] as const,
  list: (params: {
    clientId?: string;
    includeGlobal?: boolean;
    activeOnly?: boolean;
  }) => [...KEYS.all, "list", params] as const,
  global: [...["departments"], "global"] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
};

export function useDepartments(
  params: {
    clientId?: string;
    includeGlobal?: boolean;
    activeOnly?: boolean;
  } = {},
) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => departmentsApi.list(params),
  });
}

export function useGlobalDepartments() {
  return useQuery({
    queryKey: KEYS.global,
    queryFn: () => departmentsApi.listGlobal(),
  });
}

export function useDepartment(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => departmentsApi.get(id),
    enabled: !!id,
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDepartmentRequest) => departmentsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDepartmentRequest }) =>
      departmentsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => departmentsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
