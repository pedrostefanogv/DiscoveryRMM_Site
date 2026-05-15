import { api } from "./client";
import {
  CustomFieldScopeType,
  normalizeCustomFieldDataType,
  normalizeCustomFieldScopeType,
  type DepartmentCustomFieldDefinition,
  type CreateDepartmentCustomFieldRequest,
  type UpdateDepartmentCustomFieldRequest,
  type TicketSchemaField,
} from "./custom-fields";

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

function normalizeDepartmentCustomField(
  raw: Record<string, unknown>,
): DepartmentCustomFieldDefinition {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    label: String(raw.label ?? raw.name ?? ""),
    description:
      raw.description === null || raw.description === undefined
        ? null
        : String(raw.description),
    scopeType: normalizeCustomFieldScopeType(
      raw.scopeType ?? raw.ScopeType ?? CustomFieldScopeType.Department,
    ),
    dataType: normalizeCustomFieldDataType(raw.dataType ?? raw.DataType),
    isRequired: Boolean(raw.isRequired ?? raw.IsRequired ?? false),
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? true),
    isSecret: Boolean(raw.isSecret ?? raw.IsSecret ?? false),
    isInternal: Boolean(raw.isInternal ?? raw.IsInternal ?? false),
    departmentId: String(raw.departmentId ?? raw.DepartmentId ?? ""),
    optionsJson:
      raw.optionsJson === null || raw.optionsJson === undefined
        ? null
        : String(raw.optionsJson),
    validationRegex:
      raw.validationRegex === null || raw.validationRegex === undefined
        ? null
        : String(raw.validationRegex),
    minLength:
      raw.minLength === null || raw.minLength === undefined
        ? null
        : Number(raw.minLength),
    maxLength:
      raw.maxLength === null || raw.maxLength === undefined
        ? null
        : Number(raw.maxLength),
    minValue:
      raw.minValue === null || raw.minValue === undefined
        ? null
        : Number(raw.minValue),
    maxValue:
      raw.maxValue === null || raw.maxValue === undefined
        ? null
        : Number(raw.maxValue),
    allowRuntimeRead: Boolean(raw.allowRuntimeRead ?? raw.AllowRuntimeRead ?? false),
    allowAgentWrite: Boolean(raw.allowAgentWrite ?? raw.AllowAgentWrite ?? false),
    runtimeAccessMode: Number(raw.runtimeAccessMode ?? raw.RuntimeAccessMode ?? 0),
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.UpdatedAt ?? ""),
  };
}

function normalizeTicketSchemaField(
  raw: Record<string, unknown>,
): TicketSchemaField {
  return {
    definitionId: String(raw.definitionId ?? raw.DefinitionId ?? raw.id ?? ""),
    name: String(raw.name ?? ""),
    label: String(raw.label ?? raw.name ?? ""),
    description:
      raw.description === null || raw.description === undefined
        ? null
        : String(raw.description),
    dataType: normalizeCustomFieldDataType(raw.dataType ?? raw.DataType),
    isRequired: Boolean(raw.isRequired ?? raw.IsRequired ?? false),
    isInternal: Boolean(raw.isInternal ?? raw.IsInternal ?? false),
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? true),
    options: normalizeOptions(raw.options ?? raw.Options),
    validationRegex:
      raw.validationRegex === null || raw.validationRegex === undefined
        ? null
        : String(raw.validationRegex),
    minLength:
      raw.minLength === null || raw.minLength === undefined
        ? null
        : Number(raw.minLength),
    maxLength:
      raw.maxLength === null || raw.maxLength === undefined
        ? null
        : Number(raw.maxLength),
    minValue:
      raw.minValue === null || raw.minValue === undefined
        ? null
        : Number(raw.minValue),
    maxValue:
      raw.maxValue === null || raw.maxValue === undefined
        ? null
        : Number(raw.maxValue),
    currentValueJson:
      raw.currentValueJson === null || raw.currentValueJson === undefined
        ? null
        : String(raw.currentValueJson),
  };
}

export const departmentCustomFieldsApi = {
  async list(departmentId: string): Promise<DepartmentCustomFieldDefinition[]> {
    const raw = await api.get<Array<Record<string, unknown>>>(
      `/api/v1/departments/${departmentId}/custom-fields`,
    );
    return raw.map(normalizeDepartmentCustomField);
  },

  async create(
    departmentId: string,
    data: CreateDepartmentCustomFieldRequest,
  ): Promise<DepartmentCustomFieldDefinition> {
    const raw = await api.post<Record<string, unknown>>(
      `/api/v1/departments/${departmentId}/custom-fields`,
      data,
    );
    return normalizeDepartmentCustomField(raw);
  },

  async update(
    departmentId: string,
    fieldId: string,
    data: UpdateDepartmentCustomFieldRequest,
  ): Promise<DepartmentCustomFieldDefinition> {
    const raw = await api.put<Record<string, unknown>>(
      `/api/v1/departments/${departmentId}/custom-fields/${fieldId}`,
      data,
    );
    return normalizeDepartmentCustomField(raw);
  },

  async delete(departmentId: string, fieldId: string): Promise<void> {
    await api.del<void>(
      `/api/v1/departments/${departmentId}/custom-fields/${fieldId}`,
    );
  },

  async getTicketSchema(departmentId: string): Promise<TicketSchemaField[]> {
    const raw = await api.get<Array<Record<string, unknown>>>(
      `/api/v1/departments/${departmentId}/ticket-schema`,
    );
    return raw.map(normalizeTicketSchemaField);
  },
};
