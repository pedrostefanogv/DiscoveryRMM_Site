import { api } from "./client";

export enum CustomFieldScopeType {
  Server = 0,
  Client = 1,
  Site = 2,
  Agent = 3,
  Ticket = 4,
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

export interface CustomFieldDefinition {
  id: string;
  name: string;
  label: string;
  description: string | null;
  scopeType: CustomFieldScopeType;
  dataType: CustomFieldDataType;
  isActive: boolean;
  options: string[];
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
}

export interface UpdateCustomFieldDefinitionRequest {
  name: string;
  label: string;
  description?: string | null;
  scopeType: CustomFieldScopeType;
  dataType: CustomFieldDataType;
  options?: string[];
  isActive?: boolean;
}

export interface CustomFieldValueItem {
  definitionId: string;
  entityId: string | null;
  scopeType: CustomFieldScopeType;
  value: unknown;
  isSecret: boolean;
  updatedAt: string | null;
}

export interface UpsertCustomFieldValueRequest {
  scopeType: CustomFieldScopeType;
  entityId?: string | null;
  value: unknown;
}

const BASE = "/api/custom-fields";

export const customFieldsApi = {
  async listDefinitions(params?: {
    scopeType?: CustomFieldScopeType;
    includeInactive?: boolean;
  }): Promise<CustomFieldDefinition[]> {
    const raw = await api.get<Array<Record<string, unknown>>>(`${BASE}/definitions`, params ?? {});
    return raw.map(normalizeDefinition);
  },

  async getDefinition(id: string): Promise<CustomFieldDefinition> {
    const raw = await api.get<Record<string, unknown>>(`${BASE}/definitions/${id}`);
    return normalizeDefinition(raw);
  },

  async createDefinition(
    payload: CreateCustomFieldDefinitionRequest,
  ): Promise<CustomFieldDefinition> {
    const raw = await api.post<Record<string, unknown>>(`${BASE}/definitions`, payload);
    return normalizeDefinition(raw);
  },

  async updateDefinition(
    id: string,
    payload: UpdateCustomFieldDefinitionRequest,
  ): Promise<CustomFieldDefinition> {
    const raw = await api.put<Record<string, unknown>>(`${BASE}/definitions/${id}`, payload);
    return normalizeDefinition(raw);
  },

  async deleteDefinition(id: string): Promise<void> {
    await api.del<void>(`${BASE}/definitions/${id}`);
  },

  async getValues(
    scopeType: CustomFieldScopeType,
    params?: { entityId?: string; includeSecrets?: boolean },
  ): Promise<CustomFieldValueItem[]> {
    const raw = await api.get<unknown>(`${BASE}/values/${scopeType}`, params ?? {});
    return normalizeValues(raw, scopeType, params?.entityId ?? null);
  },

  async upsertValue(
    definitionId: string,
    payload: UpsertCustomFieldValueRequest,
  ): Promise<CustomFieldValueItem> {
    const raw = await api.put<Record<string, unknown>>(`${BASE}/values/${definitionId}`, payload);
    return normalizeValueItem(raw, payload.scopeType, payload.entityId ?? null, definitionId);
  },
};

export function normalizeCustomFieldScopeType(value: unknown): CustomFieldScopeType {
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
  }
  return CustomFieldScopeType.Agent;
}

export function normalizeCustomFieldDataType(value: unknown): CustomFieldDataType {
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
    default:
      return String(value);
  }
}

export function getCustomFieldDataTypeLabel(value: CustomFieldDataType): string {
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
    case CustomFieldDataType.Dropdown:
      return "Dropdown";
    case CustomFieldDataType.ListBox:
      return "ListBox";
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
  switch (dataType) {
    case CustomFieldDataType.Integer:
      return trimmed ? Number.parseInt(trimmed, 10) : null;
    case CustomFieldDataType.Decimal:
      return trimmed ? Number(trimmed) : null;
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

function normalizeDefinition(raw: Record<string, unknown>): CustomFieldDefinition {
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
    options: normalizeOptions(raw.options ?? raw.Options ?? raw.allowedValues ?? raw.AllowedValues),
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
        normalizeValueItem(item as Record<string, unknown>, scopeType, entityId),
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
    definitionId: String(raw.definitionId ?? raw.DefinitionId ?? fallbackDefinitionId ?? ""),
    entityId:
      raw.entityId === null || raw.EntityId === null
        ? null
        : String(raw.entityId ?? raw.EntityId ?? entityId ?? "") || null,
    scopeType: normalizeCustomFieldScopeType(raw.scopeType ?? raw.ScopeType ?? scopeType),
    value: raw.value ?? raw.Value ?? null,
    isSecret: Boolean(raw.isSecret ?? raw.IsSecret ?? false),
    updatedAt:
      raw.updatedAt === null || raw.UpdatedAt === null
        ? null
        : String(raw.updatedAt ?? raw.UpdatedAt ?? "") || null,
  };
}