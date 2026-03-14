import { API_BASE_URL, ApiError, api } from "./client";
import type {
  CreateDeployTokenRequest,
  DeployInstallerPayload,
  DeployToken,
} from "./types";

export type CreateDeployTokenResponse = DeployToken | DeployInstallerPayload;

async function parseErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await res.json()) as
        | { message?: unknown; error?: unknown; detail?: unknown }
        | string;
      if (typeof payload === "string" && payload.trim()) return payload;
      if (payload && typeof payload === "object") {
        const message =
          payload.message ?? payload.error ?? payload.detail ?? res.statusText;
        if (typeof message === "string" && message.trim()) return message;
      }
    } catch {
      // Fallback para parse de texto/status abaixo.
    }
  }

  try {
    const text = await res.text();
    if (text.trim() && !text.trim().startsWith("<")) return text;
  } catch {
    // Fallback para status message abaixo.
  }

  return res.statusText || "Erro de requisicao";
}

function parseContentDispositionFileName(
  contentDisposition: string | null,
): string {
  if (!contentDisposition) return "meduza-installer.exe";

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
  return plainMatch?.[1]?.trim() || "meduza-installer.exe";
}

export const deployTokensApi = {
  create: async (
    data: CreateDeployTokenRequest,
  ): Promise<CreateDeployTokenResponse> => {
    if (data.delivery === "token") {
      return api.post<DeployToken>("/api/deploy-tokens", data);
    }

    const response = await fetch(`${API_BASE_URL}/api/deploy-tokens`, {
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
