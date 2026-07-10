import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFieldsApi,
  type CustomFieldValueQueryParams,
  CustomFieldScopeType,
  type CreateCustomFieldDefinitionRequest,
  type UpdateCustomFieldDefinitionRequest,
  type UpsertCustomFieldValueRequest,
} from "@/api/custom-fields";

const KEYS = {
  all: ["customFields"] as const,
  definitions: (params?: {
    scopeType?: CustomFieldScopeType;
    includeInactive?: boolean;
  }) => [...KEYS.all, "definitions", params ?? {}] as const,
  definition: (id: string) => [...KEYS.all, "definition", id] as const,
  values: (
    scopeType: CustomFieldScopeType,
    params: CustomFieldValueQueryParams = {},
  ) =>
    [
      ...KEYS.all,
      "values",
      scopeType,
      params.entityId ?? null,
      params.clientId ?? null,
      Boolean(params.includeSecrets),
    ] as const,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.definitions() }),
  });
}

export function useUpdateCustomFieldDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateCustomFieldDefinitionRequest;
    }) => customFieldsApi.updateDefinition(id, payload),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.definition(vars.id) });
      qc.invalidateQueries({ queryKey: KEYS.definitions() });
    },
  });
}

export function useDeleteCustomFieldDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customFieldsApi.deleteDefinition(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.definitions() }),
  });
}

export function useCustomFieldValues(
  scopeType: CustomFieldScopeType,
  params: CustomFieldValueQueryParams = {},
  enabled = true,
) {
  return useQuery({
    queryKey: KEYS.values(scopeType, params),
    queryFn: () => customFieldsApi.getScopedValues(scopeType, params),
    enabled,
  });
}

export function useUpsertCustomFieldValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      definitionId,
      payload,
      clientId,
    }: {
      definitionId: string;
      payload: UpsertCustomFieldValueRequest;
      clientId?: string;
    }) =>
      customFieldsApi.upsertScopedValue(definitionId, payload, { clientId }),
    onSuccess: (result, vars) => {
      qc.invalidateQueries({
        queryKey: KEYS.values(result.scopeType, {
          entityId: result.entityId ?? undefined,
          clientId: vars.clientId,
          includeSecrets: true,
        }),
      });
      qc.invalidateQueries({
        queryKey: KEYS.values(result.scopeType, {
          entityId: result.entityId ?? undefined,
          clientId: vars.clientId,
          includeSecrets: false,
        }),
      });
    },
  });
}
