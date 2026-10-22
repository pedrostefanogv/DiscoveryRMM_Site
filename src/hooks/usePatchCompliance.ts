import { useQuery } from "@tanstack/react-query";
import { patchComplianceApi, type PatchComplianceParams } from "@/api/patchCompliance";

const KEYS = {
  all: ["patch-compliance"] as const,
  get: (params: PatchComplianceParams) =>
    [...KEYS.all, params.clientId ?? null, params.siteId ?? null] as const,
};

export function usePatchCompliance(params: PatchComplianceParams = {}) {
  return useQuery({
    queryKey: KEYS.get(params),
    queryFn: () => patchComplianceApi.get(params),
    placeholderData: (previous) => previous,
  });
}
