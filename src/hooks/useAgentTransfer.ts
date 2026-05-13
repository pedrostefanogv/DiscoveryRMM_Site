import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/api";
import type { TransferAgentRequest, TransferAgentBulkRequest } from "@/api";

const KEYS = {
  all: ["agentTransfer"] as const,
  validate: (agentId: string, targetSiteId: string) =>
    [...KEYS.all, "validate", agentId, targetSiteId] as const,
};

export function useValidateTransfer(agentId: string, targetSiteId: string) {
  return useQuery({
    queryKey: KEYS.validate(agentId, targetSiteId),
    queryFn: () => agentsApi.validateTransfer(agentId, targetSiteId),
    enabled: !!agentId && !!targetSiteId,
    retry: false,
    staleTime: 30_000,
  });
}

export function useTransferAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      data,
    }: {
      agentId: string;
      data: TransferAgentRequest;
    }) => agentsApi.transfer(agentId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useTransferBulkAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TransferAgentBulkRequest) =>
      agentsApi.transferBulk(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: KEYS.all });

      if (result.errorCount > 0) {
        const firstError = result.errors[0];
        throw new Error(
          `${result.successCount} transferido(s), ${result.errorCount} falha(s). ${firstError ? `Erro: ${firstError.error}` : ""}`,
        );
      }
    },
  });
}
