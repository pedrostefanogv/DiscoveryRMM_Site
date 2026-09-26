import { api } from "./client";
import {
  normalizeCustomFieldDataType,
  type CustomFieldDataType,
} from "./custom-fields";

const BASE = "/api/v1/custom-field-templates";

export interface CustomFieldTemplateDto {
  id: string;
  clientId: string | null;
  departmentId: string | null;
  name: string;
  label: string;
  description: string | null;
  dataType: CustomFieldDataType;
  options: string[];
  validationRegex: string | null;
  inputMask: string | null;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  defaultIsRequired: boolean;
  isBuiltIn: boolean;
  isActive: boolean;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCustomFieldTemplateRequest {
  clientId: string | null;
  departmentId: string | null;
  name: string;
  label: string;
  description: string | null;
  dataType: CustomFieldDataType;
  options: string[];
  validationRegex: string | null;
  inputMask: string | null;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  defaultIsRequired: boolean;
  isActive: boolean;
  sortOrder: number;
}

function normalizeOptions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
      }
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

export function normalizeCustomFieldTemplate(
  raw: Record<string, unknown>,
): CustomFieldTemplateDto {
  return {
    id: String(raw.id ?? raw.Id ?? ""),
    clientId:
      raw.clientId === null || raw.ClientId === null
        ? null
        : String(raw.clientId ?? raw.ClientId ?? "") || null,
    departmentId:
      raw.departmentId === null || raw.DepartmentId === null
        ? null
        : String(raw.departmentId ?? raw.DepartmentId ?? "") || null,
    name: String(raw.name ?? raw.Name ?? ""),
    label: String(raw.label ?? raw.Label ?? raw.name ?? ""),
    description:
      raw.description === null || raw.description === undefined
        ? null
        : String(raw.description ?? raw.Description),
    dataType: normalizeCustomFieldDataType(raw.dataType ?? raw.DataType),
    options: normalizeOptions(raw.options ?? raw.Options ?? raw.optionsJson),
    validationRegex:
      raw.validationRegex === null || raw.validationRegex === undefined
        ? null
        : String(raw.validationRegex ?? raw.ValidationRegex) || null,
    inputMask:
      raw.inputMask === null || raw.inputMask === undefined
        ? null
        : String(raw.inputMask ?? raw.InputMask) || null,
    minLength: normalizeNullableNumber(raw.minLength ?? raw.MinLength),
    maxLength: normalizeNullableNumber(raw.maxLength ?? raw.MaxLength),
    minValue: normalizeNullableNumber(raw.minValue ?? raw.MinValue),
    maxValue: normalizeNullableNumber(raw.maxValue ?? raw.MaxValue),
    defaultIsRequired: Boolean(
      raw.defaultIsRequired ?? raw.DefaultIsRequired ?? false,
    ),
    isBuiltIn: Boolean(raw.isBuiltIn ?? raw.IsBuiltIn ?? false),
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? true),
    sortOrder: Number(raw.sortOrder ?? raw.SortOrder ?? 0) || 0,
    createdBy:
      raw.createdBy === null || raw.createdBy === undefined
        ? null
        : String(raw.createdBy ?? raw.CreatedBy) || null,
    createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.UpdatedAt ?? ""),
  };
}

async function normalizeList(raw: unknown): Promise<CustomFieldTemplateDto[]> {
  if (Array.isArray(raw)) {
    return (raw as Array<Record<string, unknown>>).map(normalizeCustomFieldTemplate);
  }
  const record = raw as Record<string, unknown> | null;
  if (record && Array.isArray(record.items)) {
    return (record.items as Array<Record<string, unknown>>).map(normalizeCustomFieldTemplate);
  }
  return [];
}

export const customFieldTemplatesApi = {
  async list(
    params: {
      clientId?: string;
      departmentId?: string;
      includeGlobal?: boolean;
      includeInactive?: boolean;
      allScopes?: boolean;
    } = {},
  ): Promise<CustomFieldTemplateDto[]> {
    const raw = await api.get<unknown>(BASE, params as Record<string, unknown>);
    return normalizeList(raw);
  },

  async create(
    data: UpsertCustomFieldTemplateRequest,
  ): Promise<CustomFieldTemplateDto> {
    const raw = await api.post<Record<string, unknown>>(BASE, data);
    return normalizeCustomFieldTemplate(raw);
  },

  async update(
    id: string,
    data: UpsertCustomFieldTemplateRequest,
  ): Promise<CustomFieldTemplateDto> {
    const raw = await api.put<Record<string, unknown>>(`${BASE}/${id}`, data);
    return normalizeCustomFieldTemplate(raw);
  },

  remove: (id: string) => api.del<void>(`${BASE}/${id}`),
};
