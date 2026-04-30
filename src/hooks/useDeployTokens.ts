import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, deployTokensApi } from "@/api";
import type {
  CreateDeployTokenRequest,
  DownloadDeployPackageRequest,
  DeployInstallerOptionsResponse,
  MeshCentralInstallInstructions,
  DeployInstallerPayload,
  DeployInstallerTypeInput,
  ListDeployTokensParams,
  PrebuildAgentRequest,
} from "@/api";
import type { CreateDeployTokenResponse } from "@/api/deploy-tokens";

const KEYS = {
  all: ["deploy-tokens"] as const,
  list: (params: ListDeployTokensParams) => [...KEYS.all, "list", params] as const,
};

export function useDeployTokens(params: ListDeployTokensParams = {}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => deployTokensApi.list(params),
  });
}

export function useCreateDeployToken() {
  const qc = useQueryClient();
  return useMutation<
    CreateDeployTokenResponse,
    ApiError,
    CreateDeployTokenRequest
  >({
    mutationFn: (data: CreateDeployTokenRequest) =>
      deployTokensApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeployInstallerOptions() {
  return useMutation<DeployInstallerOptionsResponse, ApiError, string>({
    mutationFn: (rawToken: string) => deployTokensApi.getInstallerOptions(rawToken),
  });
}

interface DeployDownloadParams {
  rawToken: string;
  installerType: DeployInstallerTypeInput;
}

interface DeployPackageParams extends DownloadDeployPackageRequest {
  tokenId: string;
}

export function useDownloadDeployInstaller() {
  return useMutation<DeployInstallerPayload, ApiError, DeployDownloadParams>({
    mutationFn: ({ rawToken, installerType }) =>
      deployTokensApi.downloadInstaller(rawToken, installerType),
  });
}

export function useDeployTokenMeshCentralInstallInstructions() {
  return useMutation<MeshCentralInstallInstructions, ApiError, DeployPackageParams>({
    mutationFn: ({ tokenId, rawToken, artifact }) =>
      deployTokensApi.getMeshCentralInstallInstructions(tokenId, {
        rawToken,
        artifact,
      }),
  });
}

export function useDownloadDeployPackage() {
  return useMutation<DeployInstallerPayload, ApiError, DeployPackageParams>({
    mutationFn: ({ tokenId, rawToken, artifact }) =>
      deployTokensApi.downloadPackage(tokenId, { rawToken, artifact }),
  });
}

export function useRevokeDeployToken() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (tokenId: string) => deployTokensApi.revoke(tokenId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function usePrebuildDeployPackage() {
  return useMutation<unknown, ApiError, PrebuildAgentRequest | undefined>({
    mutationFn: (payload) => deployTokensApi.prebuild(payload),
  });
}
