import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFieldTemplatesApi,
  type UpsertCustomFieldTemplateRequest,
} from "@/api/custom-field-templates";

const KEYS = {
  all: ["custom-field-templates"] as const,
  list: (params: Record<string, unknown>) =>
    [...KEYS.all, "list", params] as const,
};

export function useCustomFieldTemplates(
  params: {
    clientId?: string;
    departmentId?: string;
    includeGlobal?: boolean;
    includeInactive?: boolean;
    allScopes?: boolean;
  } = {},
) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => customFieldTemplatesApi.list(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCustomFieldTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertCustomFieldTemplateRequest) =>
      customFieldTemplatesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateCustomFieldTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpsertCustomFieldTemplateRequest;
    }) => customFieldTemplatesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeleteCustomFieldTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customFieldTemplatesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
