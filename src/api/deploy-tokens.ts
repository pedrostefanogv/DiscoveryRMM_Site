import { api } from "./client";
import type { DeployToken, CreateDeployTokenRequest } from "./types";

export const deployTokensApi = {
  create: (data: CreateDeployTokenRequest) =>
    api.post<DeployToken>("/api/deploy-tokens", data),
};
