import { useQuery } from "@tanstack/react-query";
import { aiCostApi, type AiCostCockpitParams } from "@/api/aiCost";

const KEYS = {
  all: ["ai-cost-cockpit"] as const,
  cockpit: (params: AiCostCockpitParams) =>
    [...KEYS.all, params.clientId ?? null, params.from ?? null, params.to ?? null] as const,
};

export function useAiCostCockpit(params: AiCostCockpitParams = {}) {
  return useQuery({
    queryKey: KEYS.cockpit(params),
    queryFn: () => aiCostApi.cockpit(params),
    placeholderData: (previous) => previous,
  });
}
