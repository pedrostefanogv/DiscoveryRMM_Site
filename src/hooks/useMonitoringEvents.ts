import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { monitoringEventsApi } from "@/api";
import type { CreateMonitoringEventRequest } from "@/api";

const KEYS = {
  all: ["monitoring-events"] as const,
  decisions: (id: string) => [...KEYS.all, "auto-ticket-decisions", id] as const,
};

export function useMonitoringEventAutoTicketDecisions(id: string) {
  return useQuery({
    queryKey: KEYS.decisions(id),
    queryFn: () => monitoringEventsApi.getAutoTicketDecisions(id),
    enabled: !!id,
  });
}

export function useCreateMonitoringEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMonitoringEventRequest) =>
      monitoringEventsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useEvaluateMonitoringEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => monitoringEventsApi.evaluate(id),
    onSuccess: (_result, id) =>
      qc.invalidateQueries({ queryKey: KEYS.decisions(id) }),
  });
}
