import { useQuery } from "@tanstack/react-query";
import { ticketKpiApi } from "@/api/ticket-kpi";
import type {
  CursorPageDto,
  TicketKpiByAssignee,
  TicketKpiByDepartment,
  TicketKpiQuery,
  TicketKpiResult,
} from "@/api";

const KEYS = {
  all: ["ticket-kpi"] as const,
  summary: (params: TicketKpiQuery) =>
    [...KEYS.all, "summary", params] as const,
};

function normalizeKpi(
  data: TicketKpiResult | Record<string, unknown>,
): TicketKpiResult {
  const d = data as unknown as Record<string, unknown>;

  const normalizeArrayField = <T>(field: unknown): T[] => {
    if (Array.isArray(field)) return field as T[];
    if (field && typeof field === "object") {
      const cursor = field as CursorPageDto<T>;
      return cursor.items ?? [];
    }
    return [];
  };

  return {
    totalOpen: Number(d.totalOpen ?? 0),
    totalClosed: Number(d.totalClosed ?? 0),
    slaBreached: Number(d.slaBreached ?? 0),
    slaWarning: Number(d.slaWarning ?? 0),
    onHold: Number(d.onHold ?? 0),
    frtAchievementRate: Number(d.frtAchievementRate ?? 0),
    avgResolutionHours: Number(d.avgResolutionHours ?? 0),
    avgAgeOpenHours: Number(d.avgAgeOpenHours ?? 0),
    byAssignee: normalizeArrayField<TicketKpiByAssignee>(d.byAssignee),
    byDepartment: normalizeArrayField<TicketKpiByDepartment>(d.byDepartment),
  };
}

export function useTicketKpi(params: TicketKpiQuery = {}, enabled = true) {
  return useQuery({
    queryKey: KEYS.summary(params),
    queryFn: () => ticketKpiApi.get(params),
    enabled,
    staleTime: 30_000,
    refetchInterval: 300_000,
    select: (data) => {
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const d = data as unknown as Record<string, unknown>;
        if (
          "items" in d &&
          d.totalOpen === undefined &&
          d.totalClosed === undefined
        ) {
          const page = d as unknown as CursorPageDto<TicketKpiResult>;
          if (page.items?.[0]) return page.items[0];
        }
      }
      return normalizeKpi(
        data as unknown as TicketKpiResult | Record<string, unknown>,
      );
    },
  });
}
