// SLA Calendar and Escalation helpers

import type {
  SlaCalendarSummary,
  SlaCalendarHoliday,
  TicketEscalationRule,
} from "@/api/types";

export const WORKDAY_OPTIONS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda" },
  { value: "2", label: "Terça" },
  { value: "3", label: "Quarta" },
  { value: "4", label: "Quinta" },
  { value: "5", label: "Sexta" },
  { value: "6", label: "Sábado" },
];

export const OCCURRENCE_OPTIONS = [
  { value: "1", label: "1ª" },
  { value: "2", label: "2ª" },
  { value: "3", label: "3ª" },
  { value: "4", label: "4ª" },
  { value: "-1", label: "Última" },
];

export function parseWorkDaysJson(json: string | null): number[] {
  if (!json) return [1, 2, 3, 4, 5];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((d): d is number => typeof d === "number")
      : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

export function buildWorkDaysJson(days: number[]): string {
  return JSON.stringify([...days].sort((a, b) => a - b));
}

export function formatWorkDays(days: number[]): string {
  if (days.length === 0) return "Nenhum";
  const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return days.map((d) => names[d] ?? String(d)).join(", ");
}

export function formatHoursBefore(hours: number): string {
  if (hours <= 0) return "Imediato";
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  return remaining > 0 ? `${days}d ${remaining}h` : `${days}d`;
}

export function toggleWorkDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
}

export interface CalendarFormState {
  name: string;
  timezone: string;
  workDayStartHour: number;
  workDayEndHour: number;
  workDays: number[];
}

export function toCalendarFormState(
  calendar: SlaCalendarSummary,
): CalendarFormState {
  return {
    name: calendar.name,
    timezone: calendar.timezone,
    workDayStartHour: calendar.workDayStartHour,
    workDayEndHour: calendar.workDayEndHour,
    workDays: parseWorkDaysJson(calendar.workDaysJson),
  };
}

export interface HolidayFormState {
  date: string;
  name: string;
  holidayType: number;
  relativeMonth: number | null;
  relativeDayOfWeek: number | null;
  relativeOccurrence: number | null;
  relativeMethod: number | null;
}

export function toHolidayFormState(
  holiday: SlaCalendarHoliday,
): HolidayFormState {
  return {
    date: holiday.date,
    name: holiday.name,
    holidayType: holiday.holidayType,
    relativeMonth: holiday.relativeMonth,
    relativeDayOfWeek: holiday.relativeDayOfWeek,
    relativeOccurrence: holiday.relativeOccurrence,
    relativeMethod: holiday.relativeMethod,
  };
}

export interface EscalationFormState {
  name: string;
  triggerAtSlaPercent: number;
  triggerAtHoursBefore: number;
  reassignToUserId: string | null;
  reassignToDepartmentId: string | null;
  bumpPriority: boolean;
  notifyAssignee: boolean;
  isActive: boolean;
}

export function toRuleFormState(
  rule: TicketEscalationRule,
): EscalationFormState {
  return {
    name: rule.name,
    triggerAtSlaPercent: rule.triggerAtSlaPercent,
    triggerAtHoursBefore: rule.triggerAtHoursBefore,
    reassignToUserId: rule.reassignToUserId,
    reassignToDepartmentId: rule.reassignToDepartmentId,
    bumpPriority: rule.bumpPriority,
    notifyAssignee: rule.notifyAssignee,
    isActive: rule.isActive,
  };
}
