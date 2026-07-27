import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, deployTokensApi } from "@/api";
import type {
  CreateDeployTokenAndDownloadRequest,
  CreateDeployTokenRequest,
  DownloadDeployPackageRequest,
  DeployInstallerOptionsResponse,
  DeployToken,
  DeployInstallerPayload,
  DeployInstallerTypeInput,
  ListDeployTokensParams,
  PrebuildAgentRequest,
} from "@/api";

const KEYS = {
  all: ["deploy-tokens"] as const,
  list: (params: ListDeployTokensParams) => [...KEYS.all, "list", params] as const,
};

interface UseDeployTokensOptions {
  enabled?: boolean;
}

export function useDeployTokens(
  params: ListDeployTokensParams = {},
  options: UseDeployTokensOptions = {},
) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => deployTokensApi.list(params),
    enabled: options.enabled ?? true,
  });
}

export function useCreateDeployToken() {
  const qc = useQueryClient();
  return useMutation<DeployToken, ApiError, CreateDeployTokenRequest>({
    mutationFn: (data: CreateDeployTokenRequest) =>
      deployTokensApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useCreateDeployTokenAndDownload() {
  const qc = useQueryClient();
  return useMutation<
    DeployInstallerPayload,
    ApiError,
    CreateDeployTokenAndDownloadRequest
  >({
    mutationFn: (data: CreateDeployTokenAndDownloadRequest) =>
      deployTokensApi.createAndDownload(data),
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
