import { api } from "./client";
import type {
  LogsQuery,
  LogCursorPage,
  LogSummary,
  LogScopeOptions,
} from "./types";

const BASE = "/api/v1/Logs";

export const logsApi = {
  list: (params: LogsQuery = {}) =>
    api.get<LogCursorPage>(BASE, params as Record<string, unknown>),

  listPage: (params: LogsQuery = {}) =>
    api.get<LogCursorPage>(`${BASE}/page`, params as Record<string, unknown>),

  getSummary: (params: LogsQuery = {}) =>
    api.get<LogSummary>(`${BASE}/summary`, params as Record<string, unknown>),

  getScopeOptions: () => api.get<LogScopeOptions>(`${BASE}/scope-options`),
};
