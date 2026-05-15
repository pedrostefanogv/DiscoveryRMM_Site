import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { departmentCustomFieldsApi } from "@/api/department-custom-fields";
import type {
  CreateDepartmentCustomFieldRequest,
  UpdateDepartmentCustomFieldRequest,
} from "@/api/custom-fields";

const KEYS = {
  all: ["department-custom-fields"] as const,
  list: (departmentId: string) =>
    [...KEYS.all, "list", departmentId] as const,
  schema: (departmentId: string) =>
    [...KEYS.all, "schema", departmentId] as const,
};

export function useDepartmentCustomFields(departmentId: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.list(departmentId),
    queryFn: () => departmentCustomFieldsApi.list(departmentId),
    enabled: enabled && !!departmentId,
  });
}

export function useDepartmentTicketSchema(
  departmentId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: KEYS.schema(departmentId ?? ""),
    queryFn: () => departmentCustomFieldsApi.getTicketSchema(departmentId!),
    enabled: enabled && !!departmentId,
  });
}

export function useCreateDepartmentCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      departmentId,
      data,
    }: {
      departmentId: string;
      data: CreateDepartmentCustomFieldRequest;
    }) => departmentCustomFieldsApi.create(departmentId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.list(vars.departmentId) });
      qc.invalidateQueries({ queryKey: KEYS.schema(vars.departmentId) });
    },
  });
}

export function useUpdateDepartmentCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      departmentId,
      fieldId,
      data,
    }: {
      departmentId: string;
      fieldId: string;
      data: UpdateDepartmentCustomFieldRequest;
    }) => departmentCustomFieldsApi.update(departmentId, fieldId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.list(vars.departmentId) });
      qc.invalidateQueries({ queryKey: KEYS.schema(vars.departmentId) });
    },
  });
}

export function useDeleteDepartmentCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      departmentId,
      fieldId,
    }: {
      departmentId: string;
      fieldId: string;
    }) => departmentCustomFieldsApi.delete(departmentId, fieldId),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.list(vars.departmentId) });
      qc.invalidateQueries({ queryKey: KEYS.schema(vars.departmentId) });
    },
  });
}
