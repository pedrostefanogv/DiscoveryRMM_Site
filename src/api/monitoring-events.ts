import { api } from "./client";
import type {
  CreateMonitoringEventRequest,
  MonitoringAutoTicketDecision,
  MonitoringEvent,
} from "./types";

const BASE = "/api/monitoring-events";

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

function normalizeOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => normalizeNullableString(item))
    .filter((item): item is string => Boolean(item));

  return normalized.length > 0 ? normalized : [];
}

function normalizeMonitoringEvent(raw: Record<string, unknown>): MonitoringEvent {
  return {
    id: String(raw.id ?? raw.monitoringEventId ?? raw.Id ?? ""),
    clientId: normalizeNullableString(raw.clientId ?? raw.ClientId),
    siteId: normalizeNullableString(raw.siteId ?? raw.SiteId),
    agentId: normalizeNullableString(raw.agentId ?? raw.AgentId),
    alertCode: normalizeNullableString(raw.alertCode ?? raw.AlertCode),
    severity: normalizeOptionalNumber(raw.severity ?? raw.Severity),
    title: normalizeNullableString(raw.title ?? raw.Title),
    message: normalizeNullableString(raw.message ?? raw.Message),
    metricKey: normalizeNullableString(raw.metricKey ?? raw.MetricKey),
    metricValue: normalizeOptionalNumber(raw.metricValue ?? raw.MetricValue),
    payloadJson: normalizeNullableString(raw.payloadJson ?? raw.PayloadJson),
    labels: normalizeStringArray(raw.labels ?? raw.Labels),
    source: normalizeOptionalNumber(raw.source ?? raw.Source),
    sourceRefId: normalizeNullableString(raw.sourceRefId ?? raw.SourceRefId),
    correlationId: normalizeNullableString(raw.correlationId ?? raw.CorrelationId),
    occurredAt: normalizeNullableString(raw.occurredAt ?? raw.OccurredAt),
    createdAt: normalizeNullableString(raw.createdAt ?? raw.CreatedAt),
    updatedAt: normalizeNullableString(raw.updatedAt ?? raw.UpdatedAt),
  };
}

function normalizeMonitoringAutoTicketDecision(
  raw: Record<string, unknown>,
  monitoringEventId: string,
): MonitoringAutoTicketDecision {
  return {
    id: normalizeNullableString(raw.id ?? raw.Id),
    monitoringEventId:
      normalizeNullableString(
        raw.monitoringEventId ?? raw.MonitoringEventId,
      ) ?? monitoringEventId,
    ruleId: normalizeNullableString(raw.ruleId ?? raw.RuleId),
    ticketId: normalizeNullableString(raw.ticketId ?? raw.TicketId),
    decision: normalizeNullableString(
      raw.decision ?? raw.Decision ?? raw.action ?? raw.Action,
    ),
    reason: normalizeNullableString(
      raw.reason ?? raw.Reason ?? raw.message ?? raw.Message,
    ),
    note: normalizeNullableString(raw.note ?? raw.Note),
    createdAt: normalizeNullableString(raw.createdAt ?? raw.CreatedAt),
    matched: normalizeOptionalBoolean(raw.matched ?? raw.Matched),
  };
}

function normalizeMonitoringAutoTicketDecisions(
  raw: unknown,
  monitoringEventId: string,
): MonitoringAutoTicketDecision[] {
  if (Array.isArray(raw)) {
    return raw.map((item) =>
      normalizeMonitoringAutoTicketDecision(
        item as Record<string, unknown>,
        monitoringEventId,
      ),
    );
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const collection = Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.data)
        ? record.data
        : Array.isArray(record.decisions)
          ? record.decisions
          : [];

    return collection.map((item) =>
      normalizeMonitoringAutoTicketDecision(
        item as Record<string, unknown>,
        monitoringEventId,
      ),
    );
  }

  return [];
}

export const monitoringEventsApi = {
  async create(data: CreateMonitoringEventRequest): Promise<MonitoringEvent> {
    const raw = await api.post<Record<string, unknown>>(BASE, data);
    return normalizeMonitoringEvent(raw);
  },

  async evaluate(id: string): Promise<MonitoringAutoTicketDecision[]> {
    const raw = await api.post<unknown>(`${BASE}/${id}/evaluate`);
    return normalizeMonitoringAutoTicketDecisions(raw, id);
  },

  async getAutoTicketDecisions(
    id: string,
  ): Promise<MonitoringAutoTicketDecision[]> {
    const raw = await api.get<unknown>(`${BASE}/${id}/auto-ticket-decisions`);
    return normalizeMonitoringAutoTicketDecisions(raw, id);
  },
};
