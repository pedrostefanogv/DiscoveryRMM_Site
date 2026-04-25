import { useQuery } from "@tanstack/react-query";
import { ticketKpiApi } from "@/api/ticket-kpi";
import type { TicketKpiQuery } from "@/api";

const KEYS = {
  all: ["ticket-kpi"] as const,
  summary: (params: TicketKpiQuery) => [...KEYS.all, "summary", params] as const,
};

export function useTicketKpi(params: TicketKpiQuery = {}, enabled = true) {
  return useQuery({
    queryKey: KEYS.summary(params),
    queryFn: () => ticketKpiApi.get(params),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}