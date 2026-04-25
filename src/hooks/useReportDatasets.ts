import { useQuery } from "@tanstack/react-query";
import * as reportsApi from "@/api/reports";

const KEYS = {
  all: ["reportDatasets"] as const,
  catalog: () => [...KEYS.all, "catalog"] as const,
};

export function useReportDatasets() {
  return useQuery({
    queryKey: KEYS.catalog(),
    queryFn: () => reportsApi.getDatasetCatalog(),
    staleTime: 5 * 60 * 1000, // 5 minutes - catalog rarely changes
  });
}
