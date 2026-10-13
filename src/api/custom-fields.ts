import { api } from "./client";
import { normalizeNumericDraft } from "@/utils/fieldMask";

export enum CustomFieldScopeType {
  Server = 0,
  Client = 1,
  Site = 2,
  Agent = 3,
  Ticket = 4,
  Department = 5,
}

export enum CustomFieldDataType {
  Text = 0,
  Integer = 1,
  Decimal = 2,
  Boolean = 3,
  Date = 4,
  DateTime = 5,
  Dropdown = 6,
  ListBox = 7,
}

/** Espelha Discovery.Core.Enums.CustomFieldRuntimeAccessMode. */
export enum CustomFieldRuntimeAccessMode {
  Disabled = 0,
  Public = 1,
  RestrictedTaskScript = 2,
}

/**
 * Vínculo de execução (tarefa ou script) que libera leitura/escrita do campo
 * quando o modo de acesso é "Restrito a tarefas e scripts".
 */
export interface CustomFieldAccessBinding {
  taskId: string | null;
  scriptId: string | null;
  canRead: boolean;
  canWrite: boolean;
}


export interface CustomFieldDefinition {
  id: string;
  name: string;
  label: string;
  description: string | null;
  scopeType: CustomFieldScopeType;
  dataType: CustomFieldDataType;
  isActive: boolean;
  isSecret: boolean;
  options: string[];
  /** Capacidades de automação (lido/gravado pelo agente e modo de execução). */
  allowRuntimeRead: boolean;
  allowAgentWrite: boolean;
  runtimeAccessMode: CustomFieldRuntimeAccessMode;
  accessBindings: CustomFieldAccessBinding[];
  /** Portal/suporte enxerga o valor no card do detalhe. */
  allowWebRead: boolean;
  /** Portal/suporte pode editar o valor (exige allowWebRead). */
  allowWebEdit: boolean;
  /**
   * Destaque no card "Informações" do detalhe. Sem a opção, o campo não aparece
   * nesse resumo — fica somente na aba/lista completa de campos customizados.
   */
  isPinned: boolean;
  /** Valor padrão em JSON (usado quando a entidade ainda não tem valor). */
  defaultValueJson: string | null;
  /** Departamento vinculado (apenas escopo Departamento). null = todos. */
  departmentId: string | null;
  /** Nome do departamento resolvido pela API (evita depender de outra listagem). */
  departmentName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateCustomFieldDefinitionRequest {
  name: string;
  label: string;
  description?: string | null;
  scopeType: CustomFieldScopeType;
  dataType: CustomFieldDataType;
  options?: string[];
  allowRuntimeRead?: boolean;
  allowAgentWrite?: boolean;
  runtimeAccessMode?: CustomFieldRuntimeAccessMode;
  accessBindings?: CustomFieldAccessBinding[];
  allowWebRead?: boolean;
  allowWebEdit?: boolean;
  isPinned?: boolean;
  defaultValueJson?: string | null;
}

/**
 * Item de schema devolvido por GET /Agents/{id}/custom-fields/schema — traz o
 * tipo, as opções, as capacidades e o valor atual (segredo mascarado por padrão).
 */
export interface CustomFieldSchemaItem {
  definitionId: string;
  name: string;
  label: string;
  description: string | null;
  scopeType: CustomFieldScopeType;
  dataType: CustomFieldDataType;
  isRequired: boolean;
  isActive: boolean;
  isSecret: boolean;
  options: string[];
  inputMask: string | null;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  allowRuntimeRead: boolean;
  allowAgentWrite: boolean;
  runtimeAccessMode: CustomFieldRuntimeAccessMode;
  accessBindings: CustomFieldAccessBinding[];
  allowWebRead: boolean;
  allowWebEdit: boolean;
  isPinned: boolean;
  entityId: string | null;
  /** Valor atual em JSON serializado (a API devolve string). */
  valueJson: string;
  valueUpdatedAt: string | null;
  valueUpdatedBy: string | null;
}

// ── Department-scoped custom field types ──────────────

export interface DepartmentCustomFieldDefinition {
  id: string;
  name: string;
  label: string;
  description: string | null;
  scopeType: CustomFieldScopeType;
  dataType: CustomFieldDataType;
  isRequired: boolean;
  isActive: boolean;
  isSecret: boolean;
  isInternal: boolean;
  departmentId: string;
  optionsJson: string | null;
  validationRegex: string | null;
  inputMask: string | null;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  allowRuntimeRead: boolean;
  allowAgentWrite: boolean;
  runtimeAccessMode: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDepartmentCustomFieldRequest {
  name: string;
  label: string;
  description?: string | null;
  dataType: CustomFieldDataType;
  isRequired?: boolean;
  isInternal?: boolean;
  isActive?: boolean;
  options?: string[];
  validationRegex?: string | null;
  inputMask?: string | null;
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
}

export interface UpdateDepartmentCustomFieldRequest {
  name: string;
  label: string;
  description?: string | null;
  dataType: CustomFieldDataType;
  isRequired?: boolean;
  isInternal?: boolean;
  isActive?: boolean;
  options?: string[];
  validationRegex?: string | null;
  inputMask?: string | null;
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
}

export interface TicketSchemaField {
  definitionId: string;
  name: string;
  label: string;
  description: string | null;
  dataType: CustomFieldDataType;
  isRequired: boolean;
  isInternal: boolean;
  isActive: boolean;
  options: string[];
  validationRegex: string | null;
  inputMask: string | null;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  currentValueJson: string | null;
}

export interface UpdateCustomFieldDefinitionRequest {
  name: string;
  label: string;
  description?: string | null;
  scopeType: CustomFieldScopeType;
  dataType: CustomFieldDataType;
  options?: string[];
  isActive?: boolean;
  allowRuntimeRead?: boolean;
  allowAgentWrite?: boolean;
  runtimeAccessMode?: CustomFieldRuntimeAccessMode;
  /** [] remove todos os vínculos; undefined preserva os atuais. */
  accessBindings?: CustomFieldAccessBinding[];
  allowWebRead?: boolean;
  allowWebEdit?: boolean;
  isPinned?: boolean;
  /** null/undefined preserva; string vazia limpa. */
  defaultValueJson?: string | null;
}

export interface CustomFieldValueItem {
  definitionId: string;
  entityId: string | null;
  scopeType: CustomFieldScopeType;
  value: unknown;
  isSecret: boolean;
  updatedAt: string | null;
  /** Nome técnico e rótulo da definição (a API devolve resolvido). */
  name?: string;
  label?: string;
}

export interface UpsertCustomFieldValueRequest {
  scopeType: CustomFieldScopeType;
  entityId?: string | null;
  value: unknown;
}

export interface CustomFieldValueQueryParams {
  entityId?: string;
  clientId?: string;
  includeSecrets?: boolean;
  /** Só a gestão (Configurações) vê campos com webRead=false. */
  includeHidden?: boolean;
}

const BASE = "/api/v1/custom-fields";

async function listEntityValues(
  path: string,
  scopeType: CustomFieldScopeType,
  entityId: string,
  params?: { includeSecrets?: boolean; includeHidden?: boolean },
): Promise<CustomFieldValueItem[]> {
  const raw = await api.get<unknown>(path, {
    includeSecrets: params?.includeSecrets,
    includeHidden: params?.includeHidden,
  });
  return normalizeValues(raw, scopeType, entityId);
}

async function upsertEntityValue(
  path: string,
  scopeType: CustomFieldScopeType,
  entityId: string,
  definitionId: string,
  body: Record<string, unknown>,
): Promise<CustomFieldValueItem> {
  const raw = await api.put<Record<string, unknown>>(path, body);
  return normalizeValueItem(raw, scopeType, entityId, definitionId);
}

/**
 * A API não é uniforme no corpo do PUT de valor:
 * - Clients/Sites/Tickets aceitam { value };
 * - Agents e o endpoint genérico (/custom-fields/values/{id}) exigem { valueJson }
 *   (string JSON), senão o valor chega nulo e a gravação falha.
 */
function valueBody(scopeType: CustomFieldScopeType, value: unknown): Record<string, unknown> {
  return scopeType === CustomFieldScopeType.Agent
    ? { valueJson: JSON.stringify(value ?? null) }
    : { value };
}

export interface AgentCustomFieldMapDefinition {
  definitionId: string;
  name: string;
  label: string;
  dataType: CustomFieldDataType;
  /** Só campos com gravação pelo agente podem ser destino de uma tarefa coletora. */
  allowAgentWrite: boolean;
}

export interface AgentCustomFieldMapValue {
  definitionId: string;
  agentId: string;
  valueJson: string;
}

/** Campos de agente visíveis no portal + valores por agente (lista de agentes). */
export interface AgentCustomFieldMap {
  definitions: AgentCustomFieldMapDefinition[];
  values: AgentCustomFieldMapValue[];
}

export const customFieldsApi = {
  async listDefinitions(params?: {
    scopeType?: CustomFieldScopeType;
    includeInactive?: boolean;
    /** Visão reversa: só os campos vinculados a esta tarefa. */
    taskId?: string;
    /** Visão reversa: só os campos vinculados a este script. */
    scriptId?: string;
  }): Promise<CustomFieldDefinition[]> {
    const raw = await api.get<unknown>(`${BASE}`, params ?? {});
    if (Array.isArray(raw))
      return (raw as Array<Record<string, unknown>>).map(normalizeDefinition);
    if (
      raw &&
      typeof raw === "object" &&
      Array.isArray((raw as Record<string, unknown>).items)
    ) {
      return (
        (raw as Record<string, unknown>).items as Array<Record<string, unknown>>
      ).map(normalizeDefinition);
    }
    return [];
  },

  async getDefinition(id: string): Promise<CustomFieldDefinition> {
    const raw = await api.get<Record<string, unknown>>(`${BASE}/${id}`);
    return normalizeDefinition(raw);
  },

  async createDefinition(
    payload: CreateCustomFieldDefinitionRequest,
  ): Promise<CustomFieldDefinition> {
    const raw = await api.post<Record<string, unknown>>(`${BASE}`, payload);
    return normalizeDefinition(raw);
  },

  async updateDefinition(
    id: string,
    payload: UpdateCustomFieldDefinitionRequest,
  ): Promise<CustomFieldDefinition> {
    const raw = await api.put<Record<string, unknown>>(
      `${BASE}/${id}`,
      payload,
    );
    return normalizeDefinition(raw);
  },

  async deleteDefinition(id: string): Promise<void> {
    await api.del<void>(`${BASE}/${id}`);
  },

  /**
   * Schema dos campos do agente para o card do detalhe (tipo, opções,
   * capacidades, destaque e valor atual). Só campos visíveis no portal e,
   * por padrão, com segredos mascarados.
   */
  /**
   * Schema de uma entidade (Agente, Cliente ou Site) para o card do detalhe.
   * Cada escopo tem a sua rota; o filtro de visibilidade no portal é do servidor.
   */
  async getEntitySchema(
    scopeType: CustomFieldScopeType,
    params: { entityId?: string; clientId?: string; includeSecrets?: boolean },
  ): Promise<CustomFieldSchemaItem[]> {
    const includeSecrets = params.includeSecrets ?? false;
    let path: string;

    switch (scopeType) {
      case CustomFieldScopeType.Agent:
        if (!params.entityId) return [];
        path = `/api/v1/Agents/${params.entityId}/custom-fields/schema`;
        break;
      case CustomFieldScopeType.Client:
        if (!params.entityId) return [];
        path = `/api/v1/Clients/${params.entityId}/custom-fields/schema`;
        break;
      case CustomFieldScopeType.Site:
        if (!params.entityId || !params.clientId) return [];
        path = `/api/v1/clients/${params.clientId}/Sites/${params.entityId}/custom-fields/schema`;
        break;
      default:
        return [];
    }

    const raw = await api.get<unknown>(path, { includeSecrets });
    if (!Array.isArray(raw)) return [];
    return (raw as Array<Record<string, unknown>>).map(normalizeSchemaItem);
  },

  /**
   * Mapa dos campos de agente visíveis no portal (webRead, não secretos) com os
   * valores por agente — alimenta a coluna/filtro da lista de agentes.
   */
  /**
   * Visão reversa (campos vinculados a uma tarefa/script). Usa os endpoints de
   * automação: quem tem permissão de automação não precisa de ServerConfig.
   */
  async listCustomFieldsBoundToExecution(params: {
    taskId?: string;
    scriptId?: string;
  }): Promise<CustomFieldDefinition[]> {
    const path = params.taskId
      ? `/api/v1/automation/tasks/${params.taskId}/custom-fields`
      : params.scriptId
        ? `/api/v1/automation/scripts/${params.scriptId}/custom-fields`
        : '';
    if (!path) return [];

    const raw = await api.get<unknown>(path);
    if (Array.isArray(raw)) {
      return (raw as Array<Record<string, unknown>>).map(normalizeDefinition);
    }
    if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).items)) {
      return ((raw as Record<string, unknown>).items as Array<Record<string, unknown>>).map(normalizeDefinition);
    }
    return [];
  },

  async getAgentFieldMap(includeInactive = false): Promise<AgentCustomFieldMap> {
    const raw = await api.get<Record<string, unknown>>(
      `/api/v1/agents/custom-fields/map`,
      { includeInactive },
    );

    const definitions = Array.isArray(raw?.definitions)
      ? (raw.definitions as Array<Record<string, unknown>>).map(definition => ({
          definitionId: String(definition.definitionId ?? ''),
          name: String(definition.name ?? ''),
          label: String(definition.label ?? definition.name ?? ''),
          dataType: normalizeCustomFieldDataType(definition.dataType),
          allowAgentWrite: Boolean(definition.allowAgentWrite ?? definition.AllowAgentWrite ?? false),
        }))
      : [];

    const values = Array.isArray(raw?.values)
      ? (raw.values as Array<Record<string, unknown>>).map(value => ({
          definitionId: String(value.definitionId ?? ''),
          agentId: String(value.agentId ?? ''),
          valueJson: typeof value.valueJson === 'string' ? value.valueJson : String(value.valueJson ?? 'null'),
        }))
      : [];

    return { definitions, values };
  },

  async getAgentSchema(
    agentId: string,
    includeSecrets = false,
  ): Promise<CustomFieldSchemaItem[]> {
    return customFieldsApi.getEntitySchema(CustomFieldScopeType.Agent, {
      entityId: agentId,
      includeSecrets,
    });
  },

  /** Grava o valor de um campo do agente pelo portal (body esperado: valueJson). */
  async upsertAgentValue(
    agentId: string,
    definitionId: string,
    value: unknown,
  ): Promise<void> {
    await api.put<unknown>(
      `/api/v1/Agents/${agentId}/custom-fields/${definitionId}`,
      { valueJson: JSON.stringify(value ?? null) },
    );
  },

  async getValues(
    scopeType: CustomFieldScopeType,
    params?: { entityId?: string; includeSecrets?: boolean },
  ): Promise<CustomFieldValueItem[]> {
    const raw = await api.get<unknown>(
      `${BASE}/values/${scopeType}`,
      params ?? {},
    );
    return normalizeValues(raw, scopeType, params?.entityId ?? null);
  },

  async upsertValue(
    definitionId: string,
    payload: UpsertCustomFieldValueRequest,
  ): Promise<CustomFieldValueItem> {
    // O endpoint genérico (escopo Servidor) também espera { valueJson }.
    const raw = await api.put<Record<string, unknown>>(
      `${BASE}/values/${definitionId}`,
      {
        scopeType: payload.scopeType,
        entityId: payload.entityId ?? null,
        valueJson: JSON.stringify(payload.value ?? null),
      },
    );
    return normalizeValueItem(
      raw,
      payload.scopeType,
      payload.entityId ?? null,
      definitionId,
    );
  },

  async getScopedValues(
    scopeType: CustomFieldScopeType,
    params: CustomFieldValueQueryParams = {},
  ): Promise<CustomFieldValueItem[]> {
    switch (scopeType) {
      case CustomFieldScopeType.Client:
        if (!params.entityId) return [];
        return listEntityValues(
          `/api/v1/Clients/${params.entityId}/custom-fields`,
          scopeType,
          params.entityId,
          params,
        );
      case CustomFieldScopeType.Site:
        if (!params.entityId || !params.clientId) return [];
        return listEntityValues(
          `/api/v1/clients/${params.clientId}/Sites/${params.entityId}/custom-fields`,
          scopeType,
          params.entityId,
          params,
        );
      case CustomFieldScopeType.Agent:
        if (!params.entityId) return [];
        return listEntityValues(
          `/api/v1/Agents/${params.entityId}/custom-fields`,
          scopeType,
          params.entityId,
          params,
        );
      case CustomFieldScopeType.Ticket:
        if (!params.entityId) return [];
        return listEntityValues(
          `/api/v1/Tickets/${params.entityId}/custom-fields`,
          scopeType,
          params.entityId,
          params,
        );
      default:
        return customFieldsApi.getValues(scopeType, {
          entityId: params.entityId,
          includeSecrets: params.includeSecrets,
        });
    }
  },

  async upsertScopedValue(
    definitionId: string,
    payload: UpsertCustomFieldValueRequest,
    params?: { clientId?: string },
  ): Promise<CustomFieldValueItem> {
    switch (payload.scopeType) {
      case CustomFieldScopeType.Client:
        if (!payload.entityId) {
          throw new Error("Client entityId is required.");
        }
        return upsertEntityValue(
          `/api/v1/Clients/${payload.entityId}/custom-fields/${definitionId}`,
          payload.scopeType,
          payload.entityId,
          definitionId,
          valueBody(payload.scopeType, payload.value),
        );
      case CustomFieldScopeType.Site:
        if (!payload.entityId || !params?.clientId) {
          throw new Error("Site clientId and entityId are required.");
        }
        return upsertEntityValue(
          `/api/v1/clients/${params.clientId}/Sites/${payload.entityId}/custom-fields/${definitionId}`,
          payload.scopeType,
          payload.entityId,
          definitionId,
          valueBody(payload.scopeType, payload.value),
        );
      case CustomFieldScopeType.Agent:
        if (!payload.entityId) {
          throw new Error("Agent entityId is required.");
        }
        return upsertEntityValue(
          `/api/v1/Agents/${payload.entityId}/custom-fields/${definitionId}`,
          payload.scopeType,
          payload.entityId,
          definitionId,
          valueBody(payload.scopeType, payload.value),
        );
      case CustomFieldScopeType.Ticket:
        if (!payload.entityId) {
          throw new Error("Ticket entityId is required.");
        }
        return upsertEntityValue(
          `/api/v1/Tickets/${payload.entityId}/custom-fields/${definitionId}`,
          payload.scopeType,
          payload.entityId,
          definitionId,
          valueBody(payload.scopeType, payload.value),
        );
      default:
        return customFieldsApi.upsertValue(definitionId, payload);
    }
  },
};

export function normalizeCustomFieldScopeType(
  value: unknown,
): CustomFieldScopeType {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value as CustomFieldScopeType;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric as CustomFieldScopeType;
    }
    if (value === "Server") return CustomFieldScopeType.Server;
    if (value === "Client") return CustomFieldScopeType.Client;
    if (value === "Site") return CustomFieldScopeType.Site;
    if (value === "Agent") return CustomFieldScopeType.Agent;
    if (value === "Ticket") return CustomFieldScopeType.Ticket;
    if (value === "Department") return CustomFieldScopeType.Department;
  }
  return CustomFieldScopeType.Agent;
}

export function normalizeCustomFieldDataType(
  value: unknown,
): CustomFieldDataType {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value as CustomFieldDataType;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric as CustomFieldDataType;
    }
    switch (value) {
      case "Integer":
        return CustomFieldDataType.Integer;
      case "Decimal":
        return CustomFieldDataType.Decimal;
      case "Boolean":
        return CustomFieldDataType.Boolean;
      case "Date":
        return CustomFieldDataType.Date;
      case "DateTime":
        return CustomFieldDataType.DateTime;
      case "Dropdown":
        return CustomFieldDataType.Dropdown;
      case "ListBox":
        return CustomFieldDataType.ListBox;
      default:
        return CustomFieldDataType.Text;
    }
  }
  return CustomFieldDataType.Text;
}

export function getCustomFieldScopeLabel(value: CustomFieldScopeType): string {
  switch (value) {
    case CustomFieldScopeType.Server:
      return "Servidor";
    case CustomFieldScopeType.Client:
      return "Cliente";
    case CustomFieldScopeType.Site:
      return "Site";
    case CustomFieldScopeType.Agent:
      return "Agente";
    case CustomFieldScopeType.Ticket:
      return "Chamado";
    case CustomFieldScopeType.Department:
      return "Departamento";
    default:
      return String(value);
  }
}

export function getCustomFieldDataTypeLabel(
  value: CustomFieldDataType,
): string {
  switch (value) {
    case CustomFieldDataType.Integer:
      return "Inteiro";
    case CustomFieldDataType.Decimal:
      return "Decimal";
    case CustomFieldDataType.Boolean:
      return "Booleano";
    case CustomFieldDataType.Date:
      return "Data";
    case CustomFieldDataType.DateTime:
      return "Data/Hora";
    // Rótulos em português: "Dropdown"/"ListBox" confundiam na tela de templates.
    case CustomFieldDataType.Dropdown:
      return "Seleção única";
    case CustomFieldDataType.ListBox:
      return "Múltipla escolha";
    default:
      return "Texto";
  }
}

export function formatCustomFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "")).join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function parseCustomFieldValue(
  dataType: CustomFieldDataType,
  input: string,
): unknown {
  const trimmed = input.trim();
  // Valores numéricos podem chegar mascarados ("R$ 1.234,56"): normaliza antes
  // de converter, protegendo qualquer consumidor (o Number() não entende
  // separador de milhar nem vírgula decimal).
  const numeric =
    dataType === CustomFieldDataType.Integer || dataType === CustomFieldDataType.Decimal
      ? normalizeNumericDraft(trimmed)
      : trimmed;
  switch (dataType) {
    case CustomFieldDataType.Integer:
      return numeric ? Number.parseInt(numeric, 10) : null;
    case CustomFieldDataType.Decimal:
      return numeric ? Number(numeric) : null;
    case CustomFieldDataType.Boolean:
      return trimmed.toLowerCase() === "true" || trimmed === "1";
    case CustomFieldDataType.ListBox:
      return trimmed
        ? trimmed
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    case CustomFieldDataType.Date:
    case CustomFieldDataType.DateTime:
    case CustomFieldDataType.Dropdown:
    case CustomFieldDataType.Text:
    default:
      return trimmed || null;
  }
}

function normalizeDefinition(
  raw: Record<string, unknown>,
): CustomFieldDefinition {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    label: String(raw.label ?? raw.name ?? ""),
    description:
      raw.description === null || raw.description === undefined
        ? null
        : String(raw.description),
    scopeType: normalizeCustomFieldScopeType(raw.scopeType ?? raw.ScopeType),
    dataType: normalizeCustomFieldDataType(raw.dataType ?? raw.DataType),
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? true),
    isSecret: Boolean(raw.isSecret ?? raw.IsSecret ?? false),
    options: normalizeOptions(
      raw.options ?? raw.Options ?? raw.allowedValues ?? raw.AllowedValues,
    ),
    allowRuntimeRead: Boolean(raw.allowRuntimeRead ?? raw.AllowRuntimeRead ?? false),
    allowAgentWrite: Boolean(raw.allowAgentWrite ?? raw.AllowAgentWrite ?? false),
    runtimeAccessMode: normalizeRuntimeAccessMode(
      raw.runtimeAccessMode ?? raw.RuntimeAccessMode,
    ),
    accessBindings: normalizeAccessBindings(
      raw.accessBindings ?? raw.AccessBindings,
    ),
    allowWebRead: Boolean(raw.allowWebRead ?? raw.AllowWebRead ?? true),
    allowWebEdit: Boolean(raw.allowWebEdit ?? raw.AllowWebEdit ?? true),
    isPinned: Boolean(raw.isPinned ?? raw.IsPinned ?? false),
    defaultValueJson: normalizeNullableText(raw.defaultValueJson ?? raw.DefaultValueJson),
    departmentId: normalizeNullableId(
      raw.departmentId ?? raw.DepartmentId,
    ),
    departmentName: normalizeNullableText(
      raw.departmentName ?? raw.DepartmentName,
    ),
    createdAt:
      raw.createdAt === null || raw.createdAt === undefined
        ? null
        : String(raw.createdAt),
    updatedAt:
      raw.updatedAt === null || raw.updatedAt === undefined
        ? null
        : String(raw.updatedAt),
  };
}

export function normalizeRuntimeAccessMode(
  value: unknown,
): CustomFieldRuntimeAccessMode {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value as CustomFieldRuntimeAccessMode;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric as CustomFieldRuntimeAccessMode;
    }
    if (value === "Public") return CustomFieldRuntimeAccessMode.Public;
    if (value === "RestrictedTaskScript")
      return CustomFieldRuntimeAccessMode.RestrictedTaskScript;
  }
  return CustomFieldRuntimeAccessMode.Disabled;
}

function normalizeAccessBindings(value: unknown): CustomFieldAccessBinding[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map(item => ({
      taskId: normalizeNullableId(item.taskId ?? item.TaskId),
      scriptId: normalizeNullableId(item.scriptId ?? item.ScriptId),
      canRead: Boolean(item.canRead ?? item.CanRead ?? false),
      canWrite: Boolean(item.canWrite ?? item.CanWrite ?? false),
    }))
    .filter(binding => Boolean(binding.taskId || binding.scriptId));
}

export function getCustomFieldRuntimeAccessModeLabel(
  value: CustomFieldRuntimeAccessMode,
): string {
  switch (value) {
    case CustomFieldRuntimeAccessMode.Public:
      return "Público (qualquer execução)";
    case CustomFieldRuntimeAccessMode.RestrictedTaskScript:
      return "Restrito a tarefas e scripts";
    default:
      return "Desabilitado";
  }
}

function normalizeSchemaItem(raw: Record<string, unknown>): CustomFieldSchemaItem {
  return {
    definitionId: String(raw.definitionId ?? raw.DefinitionId ?? ""),
    name: String(raw.name ?? raw.Name ?? ""),
    label: String(raw.label ?? raw.Label ?? raw.name ?? ""),
    description: normalizeNullableText(raw.description ?? raw.Description),
    scopeType: normalizeCustomFieldScopeType(raw.scopeType ?? raw.ScopeType),
    dataType: normalizeCustomFieldDataType(raw.dataType ?? raw.DataType),
    isRequired: Boolean(raw.isRequired ?? raw.IsRequired ?? false),
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? true),
    isSecret: Boolean(raw.isSecret ?? raw.IsSecret ?? false),
    options: normalizeOptions(raw.options ?? raw.Options),
    inputMask: normalizeNullableText(raw.inputMask ?? raw.InputMask),
    minLength: normalizeNullableNumber(raw.minLength ?? raw.MinLength),
    maxLength: normalizeNullableNumber(raw.maxLength ?? raw.MaxLength),
    minValue: normalizeNullableNumber(raw.minValue ?? raw.MinValue),
    maxValue: normalizeNullableNumber(raw.maxValue ?? raw.MaxValue),
    allowRuntimeRead: Boolean(raw.allowRuntimeRead ?? raw.AllowRuntimeRead ?? false),
    allowAgentWrite: Boolean(raw.allowAgentWrite ?? raw.AllowAgentWrite ?? false),
    runtimeAccessMode: normalizeRuntimeAccessMode(raw.runtimeAccessMode ?? raw.RuntimeAccessMode),
    accessBindings: normalizeAccessBindings(raw.accessBindings ?? raw.AccessBindings),
    allowWebRead: Boolean(raw.allowWebRead ?? raw.AllowWebRead ?? true),
    allowWebEdit: Boolean(raw.allowWebEdit ?? raw.AllowWebEdit ?? true),
    isPinned: Boolean(raw.isPinned ?? raw.IsPinned ?? false),
    entityId: normalizeNullableId(raw.entityId ?? raw.EntityId),
    valueJson: typeof raw.valueJson === "string" ? raw.valueJson : String(raw.valueJson ?? raw.ValueJson ?? "null"),
    valueUpdatedAt:
      raw.valueUpdatedAt === null || raw.valueUpdatedAt === undefined
        ? null
        : String(raw.valueUpdatedAt ?? raw.ValueUpdatedAt),
    valueUpdatedBy: normalizeNullableText(raw.valueUpdatedBy ?? raw.ValueUpdatedBy),
  };
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeNullableId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value);
  return id ? id : null;
}

function normalizeNullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeOptions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeValues(
  raw: unknown,
  scopeType: CustomFieldScopeType,
  entityId: string | null,
): CustomFieldValueItem[] {
  if (Array.isArray(raw)) {
    return raw.map((item) =>
      normalizeValueItem(item as Record<string, unknown>, scopeType, entityId),
    );
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.items)) {
      return record.items.map((item) =>
        normalizeValueItem(
          item as Record<string, unknown>,
          scopeType,
          entityId,
        ),
      );
    }

    return Object.entries(record).map(([definitionId, value]) => ({
      definitionId,
      entityId,
      scopeType,
      value,
      isSecret: false,
      updatedAt: null,
    }));
  }

  return [];
}

function normalizeValueItem(
  raw: Record<string, unknown>,
  scopeType: CustomFieldScopeType,
  entityId: string | null,
  fallbackDefinitionId?: string,
): CustomFieldValueItem {
  return {
    definitionId: String(
      raw.definitionId ?? raw.DefinitionId ?? fallbackDefinitionId ?? "",
    ),
    entityId:
      raw.entityId === null || raw.EntityId === null
        ? null
        : String(raw.entityId ?? raw.EntityId ?? entityId ?? "") || null,
    scopeType: normalizeCustomFieldScopeType(
      raw.scopeType ?? raw.ScopeType ?? scopeType,
    ),
    // A API devolve "valueJson" (JSON serializado); ler só "value" deixava os
    // valores salvos em branco na tela de Configurações.
    value: parseValueJson(raw.value ?? raw.Value, raw.valueJson ?? raw.ValueJson),
    name:
      raw.name === undefined && raw.Name === undefined
        ? undefined
        : String(raw.name ?? raw.Name),
    label:
      raw.label === undefined && raw.Label === undefined
        ? undefined
        : String(raw.label ?? raw.Label),
    isSecret: Boolean(raw.isSecret ?? raw.IsSecret ?? false),
    updatedAt:
      raw.updatedAt === null || raw.UpdatedAt === null
        ? null
        : String(raw.updatedAt ?? raw.UpdatedAt ?? "") || null,
  };
}

/** Converte "valueJson" da API no valor utilizável pelo formulário. */
function parseValueJson(rawValue: unknown, rawJson: unknown): unknown {
  if (rawValue !== undefined && rawValue !== null) return rawValue;
  if (typeof rawJson !== "string") return rawJson ?? null;
  const text = rawJson.trim();
  if (!text || text === "null") return null;
  try {
    return JSON.parse(text);
  } catch {
    return rawJson;
  }
}
