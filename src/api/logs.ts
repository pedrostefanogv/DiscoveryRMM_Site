import { api } from "./client";
import type { LogEntry, LogsQuery, CreateLogRequest } from "./types";

const BASE = "/api/Logs";

export const logsApi = {
  list: (params: LogsQuery = {}) =>
    api.get<LogEntry[]>(BASE, params as Record<string, unknown>),

  create: (data: CreateLogRequest) => api.post<LogEntry>(BASE, data),
};
