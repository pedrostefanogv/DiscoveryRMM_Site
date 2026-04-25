import { api } from "./client";
import {
  CustomFieldScopeType,
  normalizeCustomFieldScopeType,
  type CustomFieldValueItem,
} from "./custom-fields";

function normalizeTicketCustomFieldValue(
  raw: Record<string, unknown>,
  ticketId: string,
  fallbackDefinitionId?: string,
): CustomFieldValueItem {
  return {
    definitionId: String(
      raw.definitionId ?? raw.DefinitionId ?? fallbackDefinitionId ?? "",
    ),
    entityId:
      raw.entityId === null || raw.EntityId === null
        ? null
        : String(raw.entityId ?? raw.EntityId ?? ticketId) || null,
    scopeType: normalizeCustomFieldScopeType(
      raw.scopeType ?? raw.ScopeType ?? CustomFieldScopeType.Ticket,
    ),
    value: raw.value ?? raw.Value ?? null,
    isSecret: Boolean(raw.isSecret ?? raw.IsSecret ?? false),
    updatedAt:
      raw.updatedAt === null || raw.UpdatedAt === null
        ? null
        : String(raw.updatedAt ?? raw.UpdatedAt ?? "") || null,
  };
}

function normalizeTicketCustomFieldValues(
  raw: unknown,
  ticketId: string,
): CustomFieldValueItem[] {
  if (Array.isArray(raw)) {
    return raw.map((item) =>
      normalizeTicketCustomFieldValue(item as Record<string, unknown>, ticketId),
    );
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;

    if (Array.isArray(record.items)) {
      return record.items.map((item) =>
        normalizeTicketCustomFieldValue(
          item as Record<string, unknown>,
          ticketId,
        ),
      );
    }

    return Object.entries(record).map(([definitionId, value]) => ({
      definitionId,
      entityId: ticketId,
      scopeType: CustomFieldScopeType.Ticket,
      value,
      isSecret: false,
      updatedAt: null,
    }));
  }

  return [];
}

export const ticketCustomFieldsApi = {
  async list(ticketId: string): Promise<CustomFieldValueItem[]> {
    const raw = await api.get<unknown>(`/api/tickets/${ticketId}/custom-fields`);
    return normalizeTicketCustomFieldValues(raw, ticketId);
  },

  async upsert(
    ticketId: string,
    definitionId: string,
    value: unknown,
  ): Promise<CustomFieldValueItem> {
    const raw = await api.put<Record<string, unknown>>(
      `/api/tickets/${ticketId}/custom-fields/${definitionId}`,
      value,
    );

    return normalizeTicketCustomFieldValue(raw, ticketId, definitionId);
  },
};