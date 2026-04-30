import { api } from "./client";
import type { BackgroundService } from "./types";

const BASE = "/api/admin/background-services";

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
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

function normalizeBackgroundService(
  raw: Record<string, unknown>,
): BackgroundService {
  return {
    name: String(raw.name ?? raw.Name ?? ""),
    displayName: normalizeNullableString(raw.displayName ?? raw.DisplayName),
    description: normalizeNullableString(raw.description ?? raw.Description),
    jobGroup: normalizeNullableString(raw.jobGroup ?? raw.JobGroup),
    jobName: normalizeNullableString(raw.jobName ?? raw.JobName),
    status: normalizeNullableString(raw.status ?? raw.Status),
    isRunning: normalizeOptionalBoolean(raw.isRunning ?? raw.IsRunning),
    isEnabled: normalizeOptionalBoolean(raw.isEnabled ?? raw.IsEnabled),
    lastRunAt: normalizeNullableString(raw.lastRunAt ?? raw.LastRunAt),
    nextRunAt: normalizeNullableString(raw.nextRunAt ?? raw.NextRunAt),
    lastError: normalizeNullableString(raw.lastError ?? raw.LastError),
  };
}

function normalizeBackgroundServices(raw: unknown): BackgroundService[] {
  if (Array.isArray(raw)) {
    return raw.map((item) =>
      normalizeBackgroundService(item as Record<string, unknown>),
    );
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const collection = Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.data)
        ? record.data
        : Array.isArray(record.services)
          ? record.services
          : [];

    return collection.map((item) =>
      normalizeBackgroundService(item as Record<string, unknown>),
    );
  }

  return [];
}

export const backgroundServicesApi = {
  async list(): Promise<BackgroundService[]> {
    const raw = await api.get<unknown>(BASE);
    return normalizeBackgroundServices(raw);
  },

  async get(name: string): Promise<BackgroundService> {
    const raw = await api.get<Record<string, unknown>>(
      `${BASE}/${encodeURIComponent(name)}`,
    );
    return normalizeBackgroundService(raw);
  },
};
