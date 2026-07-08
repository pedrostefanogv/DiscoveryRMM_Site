import { api } from "./client";
import { AgentAlertScopeType } from "./types";
import type {
  AgentAlert,
  AgentAlertsQuery,
  AgentAlertScopeOptionsResponse,
  AgentAlertTestDispatchRequest,
  AgentAlertTestDispatchResponse,
  CreateAgentAlertRequest,
  CursorPageDto,
} from "./types";

const BASE = "/api/v1/agent-alerts";

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeScopeType(value: unknown): AgentAlertScopeType {
  const normalized = normalizeOptionalNumber(value);
  return (normalized ?? AgentAlertScopeType.Agent) as AgentAlertScopeType;
}

function normalizeAgentAlert(raw: Record<string, unknown>): AgentAlert {
  return {
    id: String(raw.id ?? raw.Id ?? ""),
    title: String(raw.title ?? raw.Title ?? ""),
    message: String(raw.message ?? raw.Message ?? ""),
    alertType: normalizeOptionalNumber(raw.alertType ?? raw.AlertType) ?? 0,
    timeoutSeconds: normalizeOptionalNumber(
      raw.timeoutSeconds ?? raw.TimeoutSeconds,
    ),
    actionsJson: normalizeNullableString(raw.actionsJson ?? raw.ActionsJson),
    defaultAction: normalizeNullableString(
      raw.defaultAction ?? raw.DefaultAction,
    ),
    icon: normalizeNullableString(raw.icon ?? raw.Icon),
    scopeType: normalizeScopeType(raw.scopeType ?? raw.ScopeType),
    scopeAgentId: normalizeNullableString(raw.scopeAgentId ?? raw.ScopeAgentId),
    scopeSiteId: normalizeNullableString(raw.scopeSiteId ?? raw.ScopeSiteId),
    scopeClientId: normalizeNullableString(
      raw.scopeClientId ?? raw.ScopeClientId,
    ),
    scopeLabelName: normalizeNullableString(
      raw.scopeLabelName ?? raw.ScopeLabelName,
    ),
    scheduledAt: normalizeNullableString(raw.scheduledAt ?? raw.ScheduledAt),
    expiresAt: normalizeNullableString(raw.expiresAt ?? raw.ExpiresAt),
    ticketId: normalizeNullableString(raw.ticketId ?? raw.TicketId),
    createdBy: normalizeNullableString(raw.createdBy ?? raw.CreatedBy),
    createdAt: normalizeNullableString(raw.createdAt ?? raw.CreatedAt),
    updatedAt: normalizeNullableString(raw.updatedAt ?? raw.UpdatedAt),
    status: normalizeOptionalNumber(raw.status ?? raw.Status),
  };
}

export const agentAlertsApi = {
  /** @deprecated Endpoint base removido. Use listPage() */
  async list(params: AgentAlertsQuery = {}): Promise<AgentAlert[]> {
    const raw = await api.get<unknown>(BASE, params as Record<string, unknown>);

    if (Array.isArray(raw)) {
      return raw.map((item) =>
        normalizeAgentAlert(item as Record<string, unknown>),
      );
    }

    if (raw && typeof raw === "object") {
      const record = raw as Record<string, unknown>;
      const collection = Array.isArray(record.items)
        ? record.items
        : Array.isArray(record.data)
          ? record.data
          : [];

      return collection.map((item) =>
        normalizeAgentAlert(item as Record<string, unknown>),
      );
    }

    return [];
  },

  listPage: async (
    params: AgentAlertsQuery & { cursor?: string; limit?: number } = {},
  ): Promise<CursorPageDto<AgentAlert>> => {
    const raw = await api.get<Record<string, unknown>>(
      `${BASE}/page`,
      params as Record<string, unknown>,
    );
    const items = Array.isArray(raw.items)
      ? raw.items.map((item) =>
          normalizeAgentAlert(item as Record<string, unknown>),
        )
      : [];
    return {
      items,
      returnedItems:
        typeof raw.returnedItems === "number"
          ? raw.returnedItems
          : items.length,
      cursor: typeof raw.cursor === "string" ? raw.cursor : null,
      nextCursor: typeof raw.nextCursor === "string" ? raw.nextCursor : null,
      hasMore: Boolean(raw.hasMore),
      limit: typeof raw.limit === "number" ? raw.limit : 100,
    };
  },

  async create(data: CreateAgentAlertRequest): Promise<AgentAlert> {
    const raw = await api.post<Record<string, unknown>>(BASE, data);
    return normalizeAgentAlert(raw);
  },

  getScopeOptions: () =>
    api.get<AgentAlertScopeOptionsResponse>(`${BASE}/scope-options`),

  getById: async (id: string): Promise<AgentAlert> => {
    const raw = await api.get<Record<string, unknown>>(`${BASE}/${id}`);
    return normalizeAgentAlert(raw);
  },

  dispatch: (id: string) =>
    api.post<Record<string, unknown>>(`${BASE}/${id}/dispatch`),

  createTicket: (id: string) =>
    api.post<Record<string, unknown>>(`${BASE}/${id}/create-ticket`),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),

  testDispatch: (data: AgentAlertTestDispatchRequest) =>
    api.post<AgentAlertTestDispatchResponse>(`${BASE}/test-dispatch`, data),
};
