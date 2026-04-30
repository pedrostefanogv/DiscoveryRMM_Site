import { ApiError, api, apiFetchResponse, parseErrorMessage } from "./client";
import type {
  CreateDeployTokenRequest,
  DownloadDeployPackageRequest,
  DeployInstallerOptionsResponse,
  DeployInstallerPayload,
  DeployInstallerType,
  DeployInstallerTypeInput,
  DeployToken,
  ListDeployTokensParams,
  MeshCentralInstallInstructions,
  PrebuildAgentRequest,
} from "./types";

export type CreateDeployTokenResponse = DeployToken | DeployInstallerPayload;
const BASE = "/api/deploy-tokens";

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

function packageFallbackFileName(artifact: string | null | undefined): string {
  const trimmed = artifact?.trim();
  return trimmed ? trimmed : "discovery-package.bin";
}

export const deployTokensApi = {
  list: (params: ListDeployTokensParams = {}) =>
    api.get<DeployToken[]>(BASE, params as Record<string, unknown>),

  create: async (
    data: CreateDeployTokenRequest,
  ): Promise<CreateDeployTokenResponse> => {
    if (data.delivery === "token") {
      return api.post<DeployToken>(BASE, data);
    }

    const response = await apiFetchResponse(BASE, {
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
      `${BASE}/installer-options`,
      { rawToken },
    ),

  getMeshCentralInstallInstructions: (
    id: string,
    data: DownloadDeployPackageRequest,
  ) =>
    api.post<MeshCentralInstallInstructions>(
      `${BASE}/${id}/meshcentral-install`,
      data,
    ),

  revoke: (id: string) => api.post<void>(`${BASE}/${id}/revoke`),

  prebuild: (data?: PrebuildAgentRequest) =>
    api.post<unknown>(`${BASE}/prebuild`, data),

  downloadPackage: async (
    id: string,
    data: DownloadDeployPackageRequest,
  ): Promise<DeployInstallerPayload> => {
    const response = await apiFetchResponse(`${BASE}/${id}/download`, {
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
        packageFallbackFileName(data.artifact),
      ),
      blob,
    };
  },

  downloadInstaller: async (
    rawToken: string,
    installerType: DeployInstallerTypeInput,
  ): Promise<DeployInstallerPayload> => {
    const normalizedType = normalizeInstallerType(installerType);
    const response = await apiFetchResponse(
      `${BASE}/download-installer`,
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
