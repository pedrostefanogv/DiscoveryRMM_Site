import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appStoreApi } from "@/api/app-store";
import { AppInstallationType } from "@/api/types";
import type {
  CreateAppApprovalRuleRequest,
  UpsertCustomPackageRequest,
} from "@/api/types";
import type {
  CatalogParams,
  ApprovalsParams,
  AuditParams,
  EffectiveParams,
} from "@/api/app-store";

const KEYS = {
  all: ["appStore"] as const,
  catalog: (params: CatalogParams) => ["appStore", "catalog", params] as const,
  package: (packageId: string, installationType?: number) =>
    ["appStore", "package", packageId, installationType] as const,
  approvals: (params: ApprovalsParams) =>
    ["appStore", "approvals", params] as const,
  audit: (params: AuditParams) => ["appStore", "audit", params] as const,
  effective: (params: EffectiveParams) =>
    ["appStore", "effective", params] as const,
};

export function useAppStoreCatalog(params: CatalogParams = {}) {
  return useQuery({
    queryKey: KEYS.catalog(params),
    queryFn: () => appStoreApi.getCatalog(params),
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
        // O DETALHE do pacote (["appStore","package",…]) é outra chave e tem
        // staleTime de 60s: sem invalidar, o modal/editor continuava mostrando
        // "sem instalador" logo depois de o arquivo ser enviado e vinculado.
        qc.invalidateQueries({ queryKey: ["appStore", "package"] }),
      ]),
  });
}

export function useDeleteCustomPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (packageId: string) =>
      appStoreApi.deleteCustomPackage(packageId),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["appStore", "catalog"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "effective"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "approvals"] }),
        qc.invalidateQueries({ queryKey: ["appStore", "package"] }),
      ]),
  });
}

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
