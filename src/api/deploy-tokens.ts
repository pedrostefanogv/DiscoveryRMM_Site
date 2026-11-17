import {
  ApiError,
  API_BASE_URL,
  API_VERSION_PREFIX,
  api,
  apiFetchResponse,
  parseErrorMessage,
} from "./client";
import type {
  CreateDeployTokenAndDownloadRequest,
  CreateDeployTokenRequest,
  DownloadDeployPackageRequest,
  DeployInstallerOptionsResponse,
  DeployInstallerPayload,
  DeployInstallerType,
  DeployInstallerTypeInput,
  DeployToken,
  ListDeployTokensParams,
  PrebuildAgentRequest,
} from "./types";
const BASE = "/api/v1/deploy-tokens";

function parseContentDispositionFileName(
  contentDisposition: string | null,
  fallbackFileName = "discovery-agent-bootstrap.exe",
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
    : "discovery-agent-bootstrap.exe";
}

function packageFallbackFileName(artifact: string | null | undefined): string {
  const trimmed = artifact?.trim();
  return trimmed ? trimmed : "discovery-package.bin";
}

export const deployTokensApi = {
  list: (params: ListDeployTokensParams = {}) =>
    api.get<DeployToken[]>(BASE, params as Record<string, unknown>),

  create: (data: CreateDeployTokenRequest) =>
    api.post<DeployToken>(BASE, data),

  createAndDownload: async (
    data: CreateDeployTokenAndDownloadRequest,
  ): Promise<DeployInstallerPayload> => {
    // timeoutMs: 0 — installer/zip grande; ver downloadGenericInstaller.
    const response = await apiFetchResponse(`${BASE}/create-and-download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      timeoutMs: 0,
    });

    if (!response.ok) {
      const message = await parseErrorMessage(response);
      throw new ApiError(response.status, message);
    }

    const blob = await response.blob();
    return {
      fileName: parseContentDispositionFileName(
        response.headers.get("content-disposition"),
        data.installerType === "offline"
          ? "discovery-installer-offline.zip"
          : "discovery-agent-bootstrap.exe",
      ),
      blob,
    };
  },

  getInstallerOptions: (rawToken: string) =>
    api.post<DeployInstallerOptionsResponse>(
      `${BASE}/installer-options`,
      { rawToken },
    ),

  // O backend expõe apenas DELETE /deploy-tokens/{id} (POST /{id}/revoke dá 404).
  revoke: (id: string) => api.del<void>(`${BASE}/${id}`),

  prebuild: (data?: PrebuildAgentRequest) =>
    api.post<unknown>(`${BASE}/prebuild`, data),

  downloadPackage: async (
    id: string,
    data: DownloadDeployPackageRequest,
  ): Promise<DeployInstallerPayload> => {
    // timeoutMs: 0 — pacote de deploy grande; ver downloadGenericInstaller.
    const response = await apiFetchResponse(`${BASE}/${id}/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      timeoutMs: 0,
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
        // timeoutMs: 0 — instalador grande; ver downloadGenericInstaller.
        timeoutMs: 0,
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

  /**
   * Sonda o instalador generico (zero-touch) SEM consumir o corpo.
   *
   * O download em si e feito pelo proprio navegador, via `<a download>`
   * apontando para {@link genericInstallerUrl} — streaming nativo para o disco,
   * sem bufferizar os ~61 MB em memoria e sem o timeout de 60s que truncava o
   * arquivo em ~13-14 MB com HTTP 200 ja enviado.
   *
   * Esta sonda existe apenas para dar um caminho de ERRO visivel: sem ela, um
   * 503/500 da API (sem build disponivel / falha de build) viraria uma
   * navegacao para o corpo JSON do erro e a UI ainda diria "download iniciado".
   *
   * Le so os headers e cancela o corpo. NAO detecta truncamento no meio do
   * stream (isso exigiria ler o arquivo inteiro).
   */
  probeGenericInstaller: async (): Promise<void> => {
    // timeoutMs: 0 — em cache miss o servidor roda o build NSIS antes do
    // primeiro byte (~54s medidos), o que estoura o default de 60s.
    const response = await apiFetchResponse(genericInstallerUrl(), {
      method: "GET",
      timeoutMs: 0,
      retryOnAuthError: false,
    });

    try {
      await response.body?.cancel();
    } catch {
      // Corpo ja fechado/consumido — irrelevante para a sonda.
    }

    if (!response.ok) {
      const message = await parseErrorMessage(response);
      throw new ApiError(response.status, message);
    }
  },
};

/**
 * URL publica do instalador generico (zero-touch).
 *
 * Composta com API_BASE_URL para respeitar VITE_API_URL. Com API_BASE_URL=""
 * (default, same-origin) o resultado e "/api/v1/download/agent/generic".
 * O atributo `download` so e honrado pelo navegador em URLs same-origin.
 */
export function genericInstallerUrl(): string {
  return `${API_BASE_URL}${API_VERSION_PREFIX}/download/agent/generic`;
}
