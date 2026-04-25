import { ApiError, api, apiFetchResponse, parseErrorMessage } from "./client";
import type {
  CreateDeployTokenRequest,
  DeployInstallerOptionsResponse,
  DeployInstallerPayload,
  DeployInstallerType,
  DeployInstallerTypeInput,
  DeployToken,
  MeshCentralInstallInstructions,
} from "./types";

export type CreateDeployTokenResponse = DeployToken | DeployInstallerPayload;

function parseContentDispositionFileName(
  contentDisposition: string | null,
  fallbackFileName = "discovery-installer.exe",
): string {
  if (!contentDisposition) return fallbackFileName;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() || fallbackFileName;
}

function normalizeInstallerType(type: DeployInstallerTypeInput): DeployInstallerType {
  if (type === "installer") return "online";
  if (type === "portable") return "offline";
  return type;
}

function installerFallbackFileName(type: DeployInstallerType): string {
  return type === "offline"
    ? "discovery-installer-offline.zip"
    : "discovery-installer.exe";
}

export const deployTokensApi = {
  create: async (
    data: CreateDeployTokenRequest,
  ): Promise<CreateDeployTokenResponse> => {
    if (data.delivery === "token") {
      return api.post<DeployToken>("/api/deploy-tokens", data);
    }

    const response = await apiFetchResponse(`/api/deploy-tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const message = await parseErrorMessage(response);
      throw new ApiError(response.status, message);
    }

    const blob = await response.blob();
    return {
      fileName: parseContentDispositionFileName(
        response.headers.get("content-disposition"),
      ),
      blob,
    };
  },

  getInstallerOptions: (rawToken: string) =>
    api.post<DeployInstallerOptionsResponse>(
      "/api/deploy-tokens/installer-options",
      { rawToken },
    ),

  getMeshCentralInstallInstructions: (id: string) =>
    api.post<MeshCentralInstallInstructions>(
      `/api/deploy-tokens/${id}/meshcentral-install`,
    ),

  downloadInstaller: async (
    rawToken: string,
    installerType: DeployInstallerTypeInput,
  ): Promise<DeployInstallerPayload> => {
    const normalizedType = normalizeInstallerType(installerType);
    const response = await apiFetchResponse(
      "/api/deploy-tokens/download-installer",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rawToken,
          installerType: normalizedType,
        }),
      },
    );

    if (!response.ok) {
      const message = await parseErrorMessage(response);
      throw new ApiError(response.status, message);
    }

    const blob = await response.blob();
    return {
      fileName: parseContentDispositionFileName(
        response.headers.get("content-disposition"),
        installerFallbackFileName(normalizedType),
      ),
      blob,
    };
  },
};
