import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appStoreApi } from "@/api/app-store";
import { getAppStoreUpdateIntent } from "@/api/appStoreUpdateIntent";
import type { AppStoreUpdateIntentParams } from "@/api/appStoreUpdateIntent";
import { AppInstallationType } from "@/api/types";
import type {
  CreateAppApprovalRuleRequest,
  UpsertCustomPackageRequest,
  AppApprovalOrphanCleanupResponse,
  RestoreCustomPackageResponse,
} from "@/api/types";
import type {
  CatalogParams,
  ApprovalsParams,
  AuditParams,
  EffectiveParams,
  CustomTrashParams,
} from "@/api/app-store";

const KEYS = {
  all: ["appStore"] as const,
  trash: (params: CustomTrashParams) =>
    ["appStore", "custom-trash", params] as const,
  catalog: (params: CatalogParams) => ["appStore", "catalog", params] as const,
  package: (packageId: string, installationType?: number) =>
    ["appStore", "package", packageId, installationType] as const,
  approvals: (params: ApprovalsParams) =>
    ["appStore", "approvals", params] as const,
  resolvedApprovals: (params: ApprovalsParams) =>
    ["appStore", "approvals-resolved", params] as const,
  audit: (params: AuditParams) => ["appStore", "audit", params] as const,
  effective: (params: EffectiveParams) =>
    ["appStore", "effective", params] as const,
  updateIntent: (params: AppStoreUpdateIntentParams) =>
    ["appStore", "update-intent", params] as const,
};

export function useAppStoreCatalog(
  params: CatalogParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: KEYS.catalog(params),
    queryFn: () => appStoreApi.getCatalog(params),
    // O seletor de pacote da aprovação só consulta quando o operador busca.
    enabled: options.enabled ?? true,
  });
}

export function useAppStorePackage(
  packageId?: string,
  installationType?: number,
) {
  return useQuery({
    queryKey: KEYS.package(packageId ?? "", installationType),
    queryFn: () => appStoreApi.getPackage(packageId ?? "", installationType),
    enabled: !!packageId,
  });
}

export function useAppStoreApprovals(params: ApprovalsParams) {
  return useQuery({
    queryKey: KEYS.approvals(params),
    queryFn: () => appStoreApi.getApprovals(params),
  });
}

/**
 * Regras já resolvidas para o escopo, com a cadeia de herança. É o que a aba
 * Aprovações usa: com um cliente selecionado ela mostra também o que ele herda
 * do Global (e do Cliente, no caso de um site).
 */
export function useAppStoreResolvedApprovals(
  params: ApprovalsParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: KEYS.resolvedApprovals(params),
    queryFn: () => appStoreApi.getResolvedApprovals(params),
    // Escopo Cliente/Site/Agente sem id não tem cadeia para resolver: o
    // endpoint responde 400 e a aba mostraria erro antes de o operador escolher.
    enabled: options.enabled ?? true,
  });
}

/**
 * Simulação de intenção de atualização para o escopo (nada é executado). Só
 * consulta quando o escopo é válido: escopo Cliente/Site/Agente sem id
 * devolveria 400 — igual ao uso do hook vizinho de aprovações resolvidas.
 */
export function useAppStoreUpdateIntent(
  params: AppStoreUpdateIntentParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: KEYS.updateIntent(params),
    queryFn: () => getAppStoreUpdateIntent(params),
    enabled: options.enabled ?? true,
  });
}

export function useAppStoreAudit(params: AuditParams = {}) {
  return useQuery({
    queryKey: KEYS.audit(params),
    queryFn: () => appStoreApi.getAudit(params),
  });
}

export function useAppStoreEffective(params: EffectiveParams) {
  return useQuery({
    queryKey: KEYS.effective(params),
    queryFn: () => appStoreApi.getEffective(params),
  });
}

export function useCreateApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAppApprovalRuleRequest) =>
      appStoreApi.createApproval(data),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["appStore", "approvals"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "approvals-resolved"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "audit"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "effective"] }),
      ]),
  });
}

export function useDeleteApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, reason }: { ruleId: string; reason?: string }) =>
      appStoreApi.deleteApproval(ruleId, reason),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["appStore", "approvals"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "approvals-resolved"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "audit"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "effective"] }),
      ]),
  });
}

export function useUpsertCustomPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertCustomPackageRequest) =>
      appStoreApi.upsertCustomPackage(data),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["appStore", "catalog"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "effective"] }),
        // Nome do pacote exibido nas regras resolvidas vem do catálogo: renomear
        // ou excluir um custom deixava o nome antigo na aba Aprovações.
        qc.invalidateQueries({ queryKey: ["appStore", "approvals-resolved"] }),
        // O DETALHE do pacote (["appStore","package",…]) é outra chave e tem
        // staleTime de 60s: sem invalidar, o modal/editor continuava mostrando
        // "sem instalador" logo depois de o arquivo ser enviado e vinculado.
        qc.invalidateQueries({ queryKey: ["appStore", "package"] }),
      ]),
  });
}

/**
 * Soft delete: o pacote vai para a lixeira e as aprovações dele são apagadas
 * definitivamente. Exige a confirmação digitada (a API compara com o packageId).
 */
export function useDeleteCustomPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ packageId, confirm, reason }: { packageId: string; confirm: string; reason?: string }) =>
      appStoreApi.deleteCustomPackage(packageId, confirm, reason),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["appStore", "catalog"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "effective"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "approvals"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "approvals-resolved"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "package"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "custom-trash"] }),
      ]),
  });
}

/** Pacotes custom na lixeira. */
export function useCustomTrash(params: CustomTrashParams = {}) {
  return useQuery({
    queryKey: KEYS.trash(params),
    queryFn: () => appStoreApi.getCustomTrash(params),
  });
}

/** Restaura um pacote da lixeira (as aprovações não voltam). */
export function useRestoreCustomPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (packageId: string) => appStoreApi.restoreCustomPackage(packageId),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["appStore", "catalog"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "custom-trash"] }),
      ]),
  });
}

/**
 * Exclusão definitiva (2 passos). O 409 de purge sobe como erro para o
 * componente decidir repetir com force=true.
 */
export function usePermanentDeleteCustomPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ packageId, confirm, force }: { packageId: string; confirm: string; force: boolean }) =>
      appStoreApi.permanentlyDeleteCustomPackage(packageId, confirm, force),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["appStore", "catalog"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "custom-trash"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "effective"] }),
      ]),
  });
}

/** Limpa regras de aprovação órfãs (dryRun reporta; sem dryRun remove). */
export function useCleanupOrphanApprovalRules() {
  const qc = useQueryClient();
  return useMutation<
    AppApprovalOrphanCleanupResponse,
    Error,
    { dryRun: boolean }
  >({
    mutationFn: ({ dryRun }) => appStoreApi.cleanupOrphanApprovalRules(dryRun),
    onSuccess: (_data, { dryRun }) => {
      if (dryRun) return;
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["appStore", "approvals"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "approvals-resolved"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "audit"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "effective"] }),
      ]);
    },
  });
}

export type { RestoreCustomPackageResponse };

export function useDeleteCustomPackageIcon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (packageId: string) =>
      appStoreApi.deleteCustomPackageIcon(packageId),
    onSuccess: (_data, packageId) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["appStore", "catalog"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "package", packageId] }),
      ]),
  });
}

export function useDeleteCustomPackageFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (packageId: string) =>
      appStoreApi.deleteCustomPackageFile(packageId),
    onSuccess: (_data, packageId) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["appStore", "catalog"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "package", packageId] }),
      ]),
  });
}

export function useSyncCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (installationType: AppInstallationType) =>
      appStoreApi.syncCatalog(installationType),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["appStore", "catalog"] }),
  });
}
