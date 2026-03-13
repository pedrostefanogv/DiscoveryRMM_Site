import { useQuery } from "@tanstack/react-query";
import * as reportsApi from "@/api/reports";
import type { ReportDatasetTypeValue } from "@/api/types";

const KEYS = {
  all: ["reportAutocomplete"] as const,
  list: (term: string, datasetType?: ReportDatasetTypeValue, alias?: string) =>
    [...KEYS.all, term, datasetType, alias] as const,
};

export function useReportAutocomplete(params: {
  term: string;
  datasetType?: ReportDatasetTypeValue;
  alias?: string;
  enabled?: boolean;
}) {
  const { term, datasetType, alias, enabled = true } = params;

  return useQuery({
    queryKey: KEYS.list(term, datasetType, alias),
    queryFn: () =>
      reportsApi.getReportAutocomplete({
        term,
        datasetType: datasetType!,
        alias,
      }),
    enabled: enabled && !!datasetType && term.trim().length > 0,
    staleTime: 60 * 1000,
  });
}
