import { api } from "./client";
import type {
  AddSlaCalendarHolidayRequest,
  CreateSlaCalendarRequest,
  SlaCalendarCreateResponse,
  SlaCalendarDetail,
  SlaCalendarHoliday,
  SlaCalendarSummary,
  SlaCalendarUpdateResponse,
  UpdateSlaCalendarRequest,
  UpdateSlaCalendarHolidayRequest,
} from "./types";

const BASE = "/api/v1/sla-calendars";

export const slaCalendarsApi = {
  list: (clientId?: string) =>
    api.get<SlaCalendarSummary[]>(BASE, { clientId }),

  get: (id: string) => api.get<SlaCalendarDetail>(`${BASE}/${id}`),

  create: (data: CreateSlaCalendarRequest) =>
    api.post<SlaCalendarCreateResponse>(BASE, data),

  update: (id: string, data: UpdateSlaCalendarRequest) =>
    api.put<SlaCalendarUpdateResponse>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),

  addHoliday: (id: string, data: AddSlaCalendarHolidayRequest) =>
    api.post<SlaCalendarHoliday>(`${BASE}/${id}/holidays`, data),

  updateHoliday: (id: string, holidayId: string, data: UpdateSlaCalendarHolidayRequest) =>
    api.put<SlaCalendarHoliday>(`${BASE}/${id}/holidays/${holidayId}`, data),

  deleteHoliday: (id: string, holidayId: string) =>
    api.del<void>(`${BASE}/${id}/holidays/${holidayId}`),
};