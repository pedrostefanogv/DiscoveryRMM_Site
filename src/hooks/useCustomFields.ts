import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFieldsApi,
  CustomFieldScopeType,
  type CreateCustomFieldDefinitionRequest,
  type UpdateCustomFieldDefinitionRequest,
  type UpsertCustomFieldValueRequest,
} from "@/api/custom-fields";

const KEYS = {
  all: ["customFields"] as const,
  definitions: (params?: { scopeType?: CustomFieldScopeType; includeInactive?: boolean }) =>
    [...KEYS.all, "definitions", params ?? {}] as const,
  definition: (id: string) => [...KEYS.all, "definition", id] as const,
  values: (scopeType: CustomFieldScopeType, entityId?: string, includeSecrets?: boolean) =>
    [...KEYS.all, "values", scopeType, entityId ?? null, Boolean(includeSecrets)] as const,
};

export function useCustomFieldDefinitions(params?: {
  scopeType?: CustomFieldScopeType;
  includeInactive?: boolean;
}) {
  return useQuery({
    queryKey: KEYS.definitions(params),
    queryFn: () => customFieldsApi.listDefinitions(params),
  });
}

export function useCustomFieldDefinition(id: string) {
  return useQuery({
    queryKey: KEYS.definition(id),
    queryFn: () => customFieldsApi.getDefinition(id),
    enabled: !!id,
  });
}

export function useCreateCustomFieldDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCustomFieldDefinitionRequest) =>
      customFieldsApi.createDefinition(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateCustomFieldDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCustomFieldDefinitionRequest }) =>
      customFieldsApi.updateDefinition(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeleteCustomFieldDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customFieldsApi.deleteDefinition(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useCustomFieldValues(
  scopeType: CustomFieldScopeType,
  entityId?: string,
  includeSecrets?: boolean,
  enabled = true,
) {
  return useQuery({
    queryKey: KEYS.values(scopeType, entityId, includeSecrets),
    queryFn: () => customFieldsApi.getValues(scopeType, { entityId, includeSecrets }),
    enabled,
  });
}

export function useUpsertCustomFieldValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      definitionId,
      payload,
    }: {
      definitionId: string;
      payload: UpsertCustomFieldValueRequest;
    }) => customFieldsApi.upsertValue(definitionId, payload),
    onSuccess: (result) => {
      qc.invalidateQueries({
        queryKey: KEYS.values(result.scopeType, result.entityId ?? undefined, true),
      });
      qc.invalidateQueries({
        queryKey: KEYS.values(result.scopeType, result.entityId ?? undefined, false),
      });
    },
  });
}