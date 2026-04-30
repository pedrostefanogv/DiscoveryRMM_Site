import { api } from "./client";
import type {
  ReportSchedule,
  CreateReportScheduleRequest,
  UpdateReportScheduleRequest,
} from "./types";

const BASE = "/api/reports/schedules";

export const reportSchedulesApi = {
  list: () => api.get<ReportSchedule[]>(BASE),

  get: (id: string) => api.get<ReportSchedule>(`${BASE}/${id}`),

  create: (data: CreateReportScheduleRequest) =>
    api.post<ReportSchedule>(BASE, data),

  update: (id: string, data: UpdateReportScheduleRequest) =>
    api.put<ReportSchedule>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),
};
