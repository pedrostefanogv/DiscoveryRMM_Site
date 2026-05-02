import { api } from "./client";
import type { AdminJobActionResult } from "./types";

const BASE = "/api/v1/admin/jobs";

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

function buildJobPath(jobGroup: string, jobName: string, action: string) {
  return `${BASE}/${encodeURIComponent(jobGroup)}/${encodeURIComponent(jobName)}/${action}`;
}

function normalizeActionResult(
  raw: unknown,
  jobGroup: string,
  jobName: string,
  action: string,
): AdminJobActionResult {
  if (!raw || typeof raw !== "object") {
    return {
      jobGroup,
      jobName,
      action,
      success: true,
      message: null,
      status: null,
    };
  }

  const record = raw as Record<string, unknown>;

  return {
    jobGroup: normalizeNullableString(record.jobGroup ?? record.JobGroup) ?? jobGroup,
    jobName: normalizeNullableString(record.jobName ?? record.JobName) ?? jobName,
    action,
    success:
      normalizeOptionalBoolean(record.success ?? record.Success) ??
      normalizeOptionalBoolean(record.isSuccess ?? record.IsSuccess) ??
      true,
    message: normalizeNullableString(record.message ?? record.Message),
    status: normalizeNullableString(record.status ?? record.Status),
  };
}

async function runJobAction(
  jobGroup: string,
  jobName: string,
  action: string,
): Promise<AdminJobActionResult> {
  const raw = await api.post<unknown>(buildJobPath(jobGroup, jobName, action));
  return normalizeActionResult(raw, jobGroup, jobName, action);
}

export const jobsApi = {
  list: () => api.get<unknown[]>(BASE),

  get: (jobGroup: string, jobName: string) =>
    api.get<unknown>(
      `${BASE}/${encodeURIComponent(jobGroup)}/${encodeURIComponent(jobName)}`,
    ),

  trigger: (jobGroup: string, jobName: string) =>
    runJobAction(jobGroup, jobName, "trigger"),

  pause: (jobGroup: string, jobName: string) =>
    runJobAction(jobGroup, jobName, "pause"),

  resume: (jobGroup: string, jobName: string) =>
    runJobAction(jobGroup, jobName, "resume"),

  schedulerStandby: () =>
    api.post<void>(`${BASE}/scheduler/standby`),

  schedulerStart: () =>
    api.post<void>(`${BASE}/scheduler/start`),
};
