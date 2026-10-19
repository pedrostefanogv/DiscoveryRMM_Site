import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentPatchesApi } from "@/api/patches";
import type { PatchApprovalScopeType } from "@/api/types";

const KEYS = {
  all: ["agentWindowsUpdates"] as const,
  page: (agentId: string, params: Record<string, unknown>) =>
    [...KEYS.all, "page", agentId, params] as const,
  snapshot: (agentId: string) => [...KEYS.all, "snapshot", agentId] as const,
};

export function useAgentWindowsUpdates(
  agentId: string | undefined,
  params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    severity?: string;
    order?: "asc" | "desc";
  },
) {
  return useQuery({
    queryKey: KEYS.page(agentId ?? "", params),
    queryFn: () => agentPatchesApi.page(agentId!, params),
    enabled: Boolean(agentId),
    placeholderData: (previous) => previous,
  });
}

/** Cadência normal do snapshot quando nada está acontecendo no agente. */
const SNAPSHOT_IDLE_INTERVAL_MS = 30_000;
/** Cadência acelerada: varredura recém-solicitada, reinício pendente ou painel aberto acompanhando. */
const SNAPSHOT_FAST_INTERVAL_MS = 15_000;

export interface AgentWindowsUpdateSnapshotOptions {
  /**
   * Acompanhar o agente em cadência acelerada (15s). O painel liga isso quando
   * acabou de pedir uma varredura ou quando há reinício pendente.
   */
  fastPolling?: boolean;
  /** Desliga o polling (útil em telas que só leem o snapshot uma vez). */
  polling?: boolean;
}

export function useAgentWindowsUpdateSnapshot(
  agentId: string | undefined,
  options?: AgentWindowsUpdateSnapshotOptions,
) {
  const polling = options?.polling !== false;
  return useQuery({
    queryKey: KEYS.snapshot(agentId ?? ""),
    queryFn: () => agentPatchesApi.snapshot(agentId!),
    enabled: Boolean(agentId),
    refetchInterval: !polling
      ? false
      : options?.fastPolling
        ? SNAPSHOT_FAST_INTERVAL_MS
        : SNAPSHOT_IDLE_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

function useInvalidateAgentPatches() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: KEYS.all });
    void queryClient.invalidateQueries({ queryKey: ["agents"] });
    void queryClient.invalidateQueries({ queryKey: ["patches"] });
  };
}

export function useScanAgentWindowsUpdates() {
  const invalidate = useInvalidateAgentPatches();
  return useMutation({
    mutationFn: (input: string | { agentId: string; reason?: string }) =>
      typeof input === "string"
        ? agentPatchesApi.scan(input)
        : agentPatchesApi.scan(input.agentId, input.reason ? { reason: input.reason } : undefined),
    onSuccess: invalidate,
  });
}

export function useInstallAgentWindowsUpdate() {
  const invalidate = useInvalidateAgentPatches();
  return useMutation({
    mutationFn: (input: {
      agentId: string;
      updateKey: string;
      force?: boolean;
      postAction?: "none" | "restart" | "shutdown";
      reason?: string;
    }) =>
      agentPatchesApi.install(input.agentId, input.updateKey, {
        force: input.force,
        postAction: input.postAction,
        reason: input.reason,
      }),
    onSuccess: invalidate,
  });
}

export function useInstallApprovedWindowsUpdates() {
  const invalidate = useInvalidateAgentPatches();
  return useMutation({
    mutationFn: (input: {
      agentId: string;
      postAction?: "none" | "restart" | "shutdown";
      confirm?: boolean;
    }) =>
      agentPatchesApi.installApproved(input.agentId, {
        postAction: input.postAction,
        confirm: input.confirm,
      }),
    onSuccess: invalidate,
  });
}

export function useSetAgentWindowsUpdateApproval() {
  const invalidate = useInvalidateAgentPatches();
  return useMutation({
    mutationFn: (input: {
      agentId: string;
      updateKey: string;
      action: "approve" | "deny";
      scope?: PatchApprovalScopeType;
      reason?: string;
      targetScopeId?: string | null;
    }) => {
      const body = {
        scope: input.scope,
        reason: input.reason,
        targetScopeId: input.targetScopeId,
      };
      return input.action === "approve"
        ? agentPatchesApi.approve(input.agentId, input.updateKey, body)
        : agentPatchesApi.deny(input.agentId, input.updateKey, body);
    },
    onSuccess: invalidate,
  });
}

export function useApproveAgentPendingWindowsUpdates() {
  const invalidate = useInvalidateAgentPatches();
  return useMutation({
    mutationFn: (input: {
      agentId: string;
      action?: "Approve" | "Deny";
      scope?: PatchApprovalScopeType;
      reason?: string;
    }) =>
      agentPatchesApi.approvePending(input.agentId, {
        action: input.action,
        scope: input.scope,
        reason: input.reason,
      }),
    onSuccess: invalidate,
  });
}

export function useApplyPatchOsPolicy() {
  const invalidate = useInvalidateAgentPatches();
  return useMutation({
    mutationFn: (input: { agentId: string; hideDenied?: boolean }) =>
      agentPatchesApi.applyOsPolicy(input.agentId, { hideDenied: input.hideDenied }),
    onSuccess: invalidate,
  });
}

export function useRollbackPatchOsPolicy() {
  const invalidate = useInvalidateAgentPatches();
  return useMutation({
    mutationFn: (agentId: string) => agentPatchesApi.rollbackOsPolicy(agentId),
    onSuccess: invalidate,
  });
}

export function useBulkAgentWindowsUpdates() {
  const invalidate = useInvalidateAgentPatches();
  return useMutation({
    mutationFn: (input: {
      agentId: string;
      action: "approve" | "deny" | "install";
      updateKeys: string[];
      scope?: PatchApprovalScopeType;
      reason?: string;
    }) => agentPatchesApi.bulk(input.agentId, input),
    onSuccess: invalidate,
  });
}
