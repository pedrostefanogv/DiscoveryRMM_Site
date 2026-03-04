import { useMutation } from "@tanstack/react-query";
import { deployTokensApi } from "@/api";
import type { CreateDeployTokenRequest } from "@/api";

export function useCreateDeployToken() {
  return useMutation({
    mutationFn: (data: CreateDeployTokenRequest) =>
      deployTokensApi.create(data),
  });
}
