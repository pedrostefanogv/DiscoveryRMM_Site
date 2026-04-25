import { useQuery } from "@tanstack/react-query";
import * as reportsApi from "@/api/reports";

const KEYS = {
  all: ["reportTemplateHistory"] as const,
  byTemplate: (id: string, limit?: number) => [...KEYS.all, id, limit] as const,
};

export function useReportTemplateHistory(id: string, limit?: number) {
  return useQuery({
    queryKey: KEYS.byTemplate(id, limit),
    queryFn: () => reportsApi.getReportTemplateHistory(id, limit),
    enabled: !!id,
  });
}
