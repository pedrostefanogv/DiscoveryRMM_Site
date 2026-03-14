import { useMutation } from "@tanstack/react-query";
import { deployTokensApi } from "@/api";
import type { CreateDeployTokenRequest } from "@/api";
import type { CreateDeployTokenResponse } from "@/api/deploy-tokens";

export function useCreateDeployToken() {
  return useMutation<
    CreateDeployTokenResponse,
    Error,
    CreateDeployTokenRequest
  >({
    mutationFn: (data: CreateDeployTokenRequest) =>
      deployTokensApi.create(data),
  });
}
