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

/**
 * Intervalo de refetch da lista de pendências.
 *
 * POR QUE 30s (e não os 60s do overview/snapshot):
 * 1. O ajuste de status no servidor é feito na TRANSIÇÃO do heartbeat: enquanto o
 *    agente está online, o `status`/`lastSeenAt` PERSISTIDOS no banco ficam congelados
 *    no último valor gravado (a cada ~180s o TTL da chave Redis expira e o job de
 *    expiração grava "Offline"). Sem um fetch novo, esse dado envelhece na tela
 *    enquanto o `now` do useNowTick (5s) avança, e em 120s (a janela de frescor de
 *    agentStatus.ts) TODO agente virava "Offline" sozinho — só o F5 corrigia.
 * 2. 30s é metade da janela de 120s: na pior das hipóteses o dado que a regra de
 *    frescor olha tem 30s de idade + até 180s do ciclo de persistência do backend.
 *    Um intervalo de 60s deixaria o último fetch colado no limite da janela; 30s dá
 *    folga para o servidor responder antes de a UI desistir do sinal. A página é
 *    paginada (limit 25) e a resposta é leve, então o custo é irrelevante.
 * 3. A regra definitiva passou a ser o campo autoritativo `isOnline` (Redis) que o
 *    backend envia no DTO; o refetch curto é o que mantém esse campo atualizado sem
 *    o usuário apertar "Atualizar".
 *
 * `refetchIntervalInBackground: false` mantém a aba oculta sem gastar rede; ao voltar
 * para a aba o React Query refaz o fetch na hora e o status se corrige sozinho.
 */
const PENDING_REFETCH_INTERVAL_MS = 30_000;

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
    // Atualização automática da lista (ver comentário acima). O placeholderData
    // abaixo é o que evita o "pisca": a tabela segue renderizada com os dados
    // anteriores enquanto o novo fetch está em voo (isPlaceholderData), sem cair
    // no estado de loading.
    refetchInterval: PENDING_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
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
