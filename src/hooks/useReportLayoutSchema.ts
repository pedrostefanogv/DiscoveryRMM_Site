import { useQuery } from "@tanstack/react-query";
import * as reportsApi from "@/api/reports";

const KEYS = {
  all: ["reportLayoutSchema"] as const,
  schema: () => [...KEYS.all, "detail"] as const,
};

export function useReportLayoutSchema() {
  return useQuery({
    queryKey: KEYS.schema(),
    queryFn: () => reportsApi.getReportLayoutSchema(),
    staleTime: 5 * 60 * 1000,
  });
}
