import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFieldsApi,
  type CustomFieldValueQueryParams,
  CustomFieldScopeType,
  type CreateCustomFieldDefinitionRequest,
  type UpdateCustomFieldDefinitionRequest,
  type UpsertCustomFieldValueRequest,
  type CustomFieldDefinition,
  type CustomFieldSchemaItem,
  type CustomFieldValueItem,
} from "@/api/custom-fields";
import type { CursorPageDto } from "@/api";

const KEYS = {
  all: ["customFields"] as const,
  definitions: (params?: {
    scopeType?: CustomFieldScopeType;
    includeInactive?: boolean;
    taskId?: string;
    scriptId?: string;
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

function normalizeArray<T>(data: CursorPageDto<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return (data as CursorPageDto<T>).items ?? [];
}

export function useCustomFieldDefinitions(params?: {
  scopeType?: CustomFieldScopeType;
  includeInactive?: boolean;
  /** Visão reversa: só os campos vinculados a esta tarefa. */
  taskId?: string;
  /** Visão reversa: só os campos vinculados a este script. */
  scriptId?: string;
}) {
  return useQuery({
    queryKey: KEYS.definitions(params),
    queryFn: () => customFieldsApi.listDefinitions(params),
    select: (data) =>
      normalizeArray(
        data as CursorPageDto<CustomFieldDefinition> | CustomFieldDefinition[],
      ),
  });
}

/**
 * Visão reversa: quais campos customizados esta tarefa/script pode ler/gravar.
 * Usada dentro da página da tarefa/script. Silenciosa em 403 (quem não tem
 * permissão de configuração não vê o painel).
 */
export function useCustomFieldsBoundToExecution(params: {
  taskId?: string;
  scriptId?: string;
  enabled?: boolean;
}) {
  const hasTarget = Boolean(params.taskId || params.scriptId);
  return useQuery({
    queryKey: KEYS.definitions({
      taskId: params.taskId,
      scriptId: params.scriptId,
    }),
    queryFn: () =>
      customFieldsApi.listDefinitions({
        taskId: params.taskId,
        scriptId: params.scriptId,
      }),
    enabled: hasTarget && (params.enabled ?? true),
    retry: false,
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
    select: (data) =>
      normalizeArray(
        data as CursorPageDto<CustomFieldValueItem> | CustomFieldValueItem[],
      ),
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

// ── Cards de detalhe (agente, cliente, site): schema + edição pelo portal ──

const ENTITY_SCHEMA_KEYS = {
  all: ["customFields", "entitySchema"] as const,
  entity: (scopeType: CustomFieldScopeType, entityId?: string, clientId?: string) =>
    [...ENTITY_SCHEMA_KEYS.all, scopeType, entityId ?? null, clientId ?? null] as const,
};

export interface EntityCustomFieldTarget {
  entityId?: string;
  clientId?: string;
}

/**
 * Schema dos campos de uma entidade para o card do detalhe. Só campos com
 * visibilidade no portal; segredos voltam mascarados por padrão.
 */
export function useEntityCustomFieldSchema(
  scopeType: CustomFieldScopeType,
  target: EntityCustomFieldTarget,
  enabled = true,
) {
  return useQuery({
    queryKey: ENTITY_SCHEMA_KEYS.entity(scopeType, target.entityId, target.clientId),
    queryFn: () => customFieldsApi.getEntitySchema(scopeType, target),
    enabled: Boolean(target.entityId) && enabled,
  });
}

/** Grava o valor de um campo da entidade pelo portal e recarrega o schema. */
export function useUpsertEntityCustomFieldValue(
  scopeType: CustomFieldScopeType,
  target: EntityCustomFieldTarget,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      definitionId,
      value,
    }: {
      definitionId: string;
      value: unknown;
    }) =>
      customFieldsApi.upsertScopedValue(
        definitionId,
        { scopeType, entityId: target.entityId ?? null, value },
        { clientId: target.clientId },
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ENTITY_SCHEMA_KEYS.entity(scopeType, target.entityId, target.clientId),
      });
      // A tela de Configurações usa outra chave; mantém as duas coerentes.
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/** Card da aba Info do agente. */
export function useAgentCustomFieldSchema(agentId: string, enabled = true) {
  return useEntityCustomFieldSchema(CustomFieldScopeType.Agent, { entityId: agentId }, enabled);
}

/** Grava um valor de campo do agente pelo portal. */
export function useUpsertAgentCustomFieldValue(agentId: string) {
  return useUpsertEntityCustomFieldValue(CustomFieldScopeType.Agent, { entityId: agentId });
}

export type { CustomFieldSchemaItem };
