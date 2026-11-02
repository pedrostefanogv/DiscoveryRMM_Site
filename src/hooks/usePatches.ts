import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  patchesApi,
  patchActionsApi,
  patchPolicyApi,
  type PatchInventoryParams,
} from "@/api/patches";
import type {
  PatchApprovalActionType,
  PatchApprovalScopeType,
  PatchEnforcementMode,
  PatchRebootPolicy,
  PatchScope,
} from "@/api/types";

const KEYS = {
  all: ["patches"] as const,
  overview: (scope: PatchScope, scopeId?: string) =>
    [...KEYS.all, "overview", scope, scopeId ?? null] as const,
  snapshot: (scope: PatchScope, scopeId?: string) =>
    [...KEYS.all, "snapshot", scope, scopeId ?? null] as const,
  inventory: (params: PatchInventoryParams) =>
    [...KEYS.all, "inventory", params] as const,
  inventoryAgents: (
    groupKey: string,
    scope: PatchScope,
    scopeId?: string,
    cursor?: string,
  ) => [...KEYS.all, "inventory-agents", groupKey, scope, scopeId ?? null, cursor ?? null] as const,
  pending: (scope: PatchScope, scopeId: string | undefined, cursor: string | undefined, search: string) =>
    [...KEYS.all, "pending", scope, scopeId ?? null, cursor ?? null, search] as const,
  approvals: (scopeType?: PatchApprovalScopeType, scopeId?: string, search?: string) =>
    [...KEYS.all, "approvals", scopeType ?? null, scopeId ?? null, search ?? ""] as const,
  audit: () => [...KEYS.all, "audit"] as const,
  policy: (scopeType: PatchApprovalScopeType, scopeId?: string) =>
    [...KEYS.all, "policy", scopeType, scopeId ?? null] as const,
};

function resolveScopeId(scope: PatchScope, clientId?: string, siteId?: string): string | undefined {
  if (scope === "client") return clientId;
  if (scope === "site") return siteId;
  return undefined;
}

export function usePatchOverview(scope: PatchScope, clientId?: string, siteId?: string) {
  const scopeId = resolveScopeId(scope, clientId, siteId);
  const enabled = scope === "global" || Boolean(scopeId);
  return useQuery({
    queryKey: KEYS.overview(scope, scopeId),
    queryFn: () => patchesApi.overview({ scope, scopeId }),
    enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function usePatchSnapshot(scope: PatchScope, clientId?: string, siteId?: string) {
  const scopeId = resolveScopeId(scope, clientId, siteId);
  const enabled = scope === "global" || Boolean(scopeId);
  return useQuery({
    queryKey: KEYS.snapshot(scope, scopeId),
    queryFn: () => patchesApi.snapshot({ scope, scopeId }),
    enabled,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function usePatchInventory(params: {
  scope: PatchScope;
  clientId?: string;
  siteId?: string;
  cursor?: string;
  limit?: number;
  search?: string;
  severity?: string;
  status?: string;
  order?: "asc" | "desc";
}) {
  const scopeId = resolveScopeId(params.scope, params.clientId, params.siteId);
  const enabled = params.scope === "global" || Boolean(scopeId);
  return useQuery({
    queryKey: KEYS.inventory({
      scope: params.scope,
      scopeId,
      cursor: params.cursor,
      limit: params.limit,
      search: params.search,
      severity: params.severity,
      status: params.status,
      order: params.order,
    }),
    queryFn: () =>
      patchesApi.inventory({
        scope: params.scope,
        scopeId,
        cursor: params.cursor,
        limit: params.limit,
        search: params.search,
        severity: params.severity,
        status: params.status,
        order: params.order,
      }),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function usePatchInventoryAgents(params: {
  groupKey: string;
  scope: PatchScope;
  clientId?: string;
  siteId?: string;
  cursor?: string;
  limit?: number;
  status?: string;
}) {
  const scopeId = resolveScopeId(params.scope, params.clientId, params.siteId);
  return useQuery({
    queryKey: KEYS.inventoryAgents(params.groupKey, params.scope, scopeId, params.cursor),
    queryFn: () =>
      patchesApi.inventoryAgents(params.groupKey, {
        scope: params.scope,
        scopeId,
        cursor: params.cursor,
        limit: params.limit,
        status: params.status,
      }),
    enabled: Boolean(params.groupKey),
    placeholderData: (previous) => previous,
  });
}

export function usePatchPending(params: {
  scope: PatchScope;
  clientId?: string;
  siteId?: string;
  cursor?: string;
  limit?: number;
  search?: string;
}) {
  const scopeId = resolveScopeId(params.scope, params.clientId, params.siteId);
  const enabled = params.scope === "global" || Boolean(scopeId);
  return useQuery({
    queryKey: KEYS.pending(params.scope, scopeId, params.cursor, params.search ?? ""),
    queryFn: () =>
      patchesApi.pending({
        scope: params.scope,
        scopeId,
        cursor: params.cursor,
        limit: params.limit,
        search: params.search,
      }),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function usePatchApprovals(params?: {
  scopeType?: PatchApprovalScopeType;
  scopeId?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: KEYS.approvals(params?.scopeType, params?.scopeId, params?.search),
    queryFn: () => patchesApi.approvals(params),
  });
}

export function usePatchApprovalAudit() {
  return useQuery({
    queryKey: KEYS.audit(),
    queryFn: () => patchesApi.approvalAudit({ limit: 200 }),
  });
}

export function usePatchPolicy(scopeType: PatchApprovalScopeType, scopeId?: string) {
  return useQuery({
    queryKey: KEYS.policy(scopeType, scopeId),
    queryFn: () => patchPolicyApi.get({ scopeType, scopeId }),
  });
}

function useInvalidatePatches() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: KEYS.all });
  };
}

export function useCreatePatchApproval() {
  const invalidate = useInvalidatePatches();
  return useMutation({
    mutationFn: (body: {
      scopeType: PatchApprovalScopeType;
      scopeId?: string | null;
      updateKey: string;
      action?: PatchApprovalActionType;
      reason?: string | null;
    }) => patchesApi.createApproval(body),
    onSuccess: invalidate,
  });
}

export function useDeletePatchApproval() {
  const invalidate = useInvalidatePatches();
  return useMutation({
    mutationFn: (ruleId: string) => patchesApi.deleteApproval(ruleId),
    onSuccess: invalidate,
  });
}

export function useUpdatePatchPolicy() {
  const invalidate = useInvalidatePatches();
  return useMutation({
    mutationFn: (input: {
      body: {
        enforcementMode: PatchEnforcementMode;
        autoApproveClassifications: string[];
        autoApproveSeverities: string[];
        autoInstallEnabled: boolean;
        maintenanceWindowJson: string | null;
        rebootPolicy: PatchRebootPolicy;
        rebootAllowed: boolean;
        maxInstallsPerRun: number;
        hideDeniedUpdates: boolean;
        /** WU-04/D09: retenção por idade (0 = sem deferral). */
        deferralDays?: number;
        /** WU-05/D03: deadline de instalação em dias (0 = sem). */
        deadlineDays?: number;
        /** WU-19/WU-20/D22: origens habilitadas ("os"/"third_party"). */
        sources?: string[];
        /** Segundo consentimento para apps de terceiros. */
        allowThirdPartyApps?: boolean;
      };
      scopeType: PatchApprovalScopeType;
      scopeId?: string;
    }) => patchPolicyApi.update(input.body, { scopeType: input.scopeType, scopeId: input.scopeId }),
    onSuccess: invalidate,
  });
}

export function useScanPatchScope() {
  const invalidate = useInvalidatePatches();
  return useMutation({
    mutationFn: (body: { scope: PatchScope; scopeId?: string | null }) =>
      patchActionsApi.scan(body),
    onSuccess: invalidate,
  });
}

export function useInstallPatchScope() {
  const invalidate = useInvalidatePatches();
  return useMutation({
    mutationFn: (body: {
      scope: PatchScope;
      scopeId?: string | null;
      updateKeys: string[];
      force?: boolean;
      confirm?: boolean;
      postAction?: "none" | "restart" | "shutdown";
    }) => patchActionsApi.install(body),
    onSuccess: invalidate,
  });
}
