import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { slaCalendarsApi } from "@/api/sla-calendars";
import type {
  AddSlaCalendarHolidayRequest,
  CreateSlaCalendarRequest,
  UpdateSlaCalendarHolidayRequest,
  UpdateSlaCalendarRequest,
} from "@/api";

const KEYS = {
  all: ["sla-calendars"] as const,
  list: (clientId?: string) =>
    [...KEYS.all, "list", clientId ?? "all"] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
};

export function useSlaCalendars(clientId?: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.list(clientId),
    queryFn: () => slaCalendarsApi.list(clientId),
    enabled,
  });
}

export function useSlaCalendar(id: string | null, enabled = true) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : [...KEYS.all, "detail", "disabled"],
    queryFn: () => slaCalendarsApi.get(id as string),
    enabled: enabled && !!id,
  });
}

export function useCreateSlaCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSlaCalendarRequest) =>
      slaCalendarsApi.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.list() });
    },
  });
}

export function useUpdateSlaCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateSlaCalendarRequest;
    }) => slaCalendarsApi.update(id, data),
    onSuccess: (_result, vars) => {
      void queryClient.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
      void queryClient.invalidateQueries({ queryKey: KEYS.list() });
    },
  });
}

export function useDeleteSlaCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => slaCalendarsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.list() });
    },
  });
}

export function useAddSlaCalendarHoliday() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: AddSlaCalendarHolidayRequest;
    }) => slaCalendarsApi.addHoliday(id, data),
    onSuccess: (_result, vars) => {
      void queryClient.invalidateQueries({ queryKey: KEYS.all });
      void queryClient.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
    },
  });
}

export function useDeleteSlaCalendarHoliday() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, holidayId }: { id: string; holidayId: string }) =>
      slaCalendarsApi.deleteHoliday(id, holidayId),
    onSuccess: (_result, vars) => {
      void queryClient.invalidateQueries({ queryKey: KEYS.all });
      void queryClient.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
    },
  });
}

export function useUpdateSlaCalendarHoliday() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      holidayId,
      data,
    }: {
      id: string;
      holidayId: string;
      data: UpdateSlaCalendarHolidayRequest;
    }) => slaCalendarsApi.updateHoliday(id, holidayId, data),
    onSuccess: (_result, vars) => {
      void queryClient.invalidateQueries({ queryKey: KEYS.all });
      void queryClient.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
    },
  });
}
