import { useMutation } from "@tanstack/react-query";
import { ApiError, deployTokensApi } from "@/api";
import type {
  CreateDeployTokenRequest,
  DeployInstallerOptionsResponse,
  DeployInstallerPayload,
  DeployInstallerTypeInput,
} from "@/api";
import type { CreateDeployTokenResponse } from "@/api/deploy-tokens";

export function useCreateDeployToken() {
  return useMutation<
    CreateDeployTokenResponse,
    ApiError,
    CreateDeployTokenRequest
  >({
    mutationFn: (data: CreateDeployTokenRequest) =>
      deployTokensApi.create(data),
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

export function useDownloadDeployInstaller() {
  return useMutation<DeployInstallerPayload, ApiError, DeployDownloadParams>({
    mutationFn: ({ rawToken, installerType }) =>
      deployTokensApi.downloadInstaller(rawToken, installerType),
  });
}
