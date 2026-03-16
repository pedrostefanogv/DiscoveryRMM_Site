import { ApiError, api, apiFetchResponse, parseErrorMessage } from "./client";
import type {
  CreateDeployTokenRequest,
  DeployInstallerPayload,
  DeployToken,
} from "./types";

export type CreateDeployTokenResponse = DeployToken | DeployInstallerPayload;

function parseContentDispositionFileName(
  contentDisposition: string | null,
): string {
  if (!contentDisposition) return "discovery-installer.exe";

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
  return plainMatch?.[1]?.trim() || "discovery-installer.exe";
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
};
