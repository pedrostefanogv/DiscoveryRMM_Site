export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";
export const API_VERSION_PREFIX = "/api/v1";

export interface ApiRequestInit extends RequestInit {
  auth?: boolean;
  retryOnAuthError?: boolean;
}

interface ApiClientConfig {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
  onAuthFailure: () => void;
}

const defaultApiClientConfig: ApiClientConfig = {
  getAccessToken: () => null,
  refreshAccessToken: async () => null,
  onAuthFailure: () => {},
};

let apiClientConfig = defaultApiClientConfig;
let refreshInFlight: Promise<string | null> | null = null;

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const STATUS_FALLBACK_MESSAGE: Record<number, string> = {
  400: "Solicitação inválida",
  401: "Não autenticado",
  403: "Acesso negado",
  404: "Recurso não encontrado",
  408: "Tempo de resposta excedido",
  429: "Muitas requisições",
  500: "Erro interno do servidor",
  502: "Gateway indisponível",
  503: "Serviço indisponível",
  504: "Tempo de resposta do gateway excedido",
};

function normalizeErrorDetails(details: unknown): string | null {
  if (typeof details === "string") {
    const trimmed = details.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(details)) {
    const parts = details
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item === null || item === undefined) return "";
        return JSON.stringify(item);
      })
      .filter(Boolean);

    return parts.length > 0 ? parts.join("; ") : null;
  }

  if (details && typeof details === "object") {
    const parts = Object.entries(details as Record<string, unknown>)
      .flatMap(([key, value]) => {
        if (Array.isArray(value)) {
          return value
            .map((entry) => `${key}: ${String(entry)}`)
            .filter((entry) => entry.trim().length > 0);
        }

        if (value === null || value === undefined) return [];
        const text = `${key}: ${String(value)}`.trim();
        return text.length > 0 ? [text] : [];
      })
      .filter(Boolean);

    return parts.length > 0 ? parts.join("; ") : null;
  }

  return null;
}

async function parseErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await res.json()) as
        | { message?: unknown; error?: unknown; detail?: unknown; details?: unknown; code?: unknown; errors?: unknown; title?: unknown }
        | string;
      if (typeof payload === "string" && payload.trim()) return payload;
      if (payload && typeof payload === "object") {
        const detailsMessage = normalizeErrorDetails(payload.details);

        // ValidationProblemDetails: extrai erros por campo
        if (payload.errors && typeof payload.errors === "object") {
          const fieldErrors = Object.entries(payload.errors as Record<string, unknown>)
            .flatMap(([field, msgs]) => {
              if (Array.isArray(msgs)) return msgs.map((m: unknown) => `${field}: ${String(m)}`);
              return [`${field}: ${String(msgs)}`];
            })
            .join("; ");
          if (fieldErrors) return fieldErrors;
        }

        // { code, message } combo
        if (payload.code && payload.message) {
          const baseMessage = `[${String(payload.code)}] ${String(payload.message)}`;
          return detailsMessage ? `${baseMessage}. ${detailsMessage}` : baseMessage;
        }

        const message =
          payload.message ?? payload.error ?? payload.detail ?? payload.title ?? res.statusText;
        if (typeof message === "string" && message.trim()) {
          return detailsMessage ? `${message}. ${detailsMessage}` : message;
        }

        if (detailsMessage)
          return detailsMessage;
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

  return (
    STATUS_FALLBACK_MESSAGE[res.status] ??
    res.statusText ??
    "Erro de requisição"
  );
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = apiClientConfig
    .refreshAccessToken()
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

export function configureApiClient(config: Partial<ApiClientConfig>) {
  apiClientConfig = {
    ...apiClientConfig,
    ...config,
  };
}

export function getApiAccessToken(): string | null {
  return apiClientConfig.getAccessToken();
}

function normalizeApiPath(path: string): string {
  if (!path.startsWith("/")) {
    return path;
  }

  // Migra automaticamente endpoints legados /api/* para /api/v1/*.
  if (path.startsWith("/api/v")) {
    return path;
  }

  if (path === "/api") {
    return API_VERSION_PREFIX;
  }

  if (path.startsWith("/api/")) {
    return `${API_VERSION_PREFIX}${path.slice(4)}`;
  }

  return path;
}

export async function apiFetchResponse(
  path: string,
  init: ApiRequestInit = {},
): Promise<Response> {
  const normalizedPath = normalizeApiPath(path);
  const url = `${API_BASE_URL}${normalizedPath}`;
  const headers = new Headers(init.headers);
  const useAuth = init.auth !== false;

  if (useAuth && !headers.has("Authorization")) {
    const accessToken = apiClientConfig.getAccessToken();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (response.status === 401 && useAuth && init.retryOnAuthError !== false) {
    const refreshedAccessToken = await refreshAccessToken();
    if (!refreshedAccessToken) {
      apiClientConfig.onAuthFailure();
      return response;
    }

    const retryHeaders = new Headers(init.headers);
    retryHeaders.set("Authorization", `Bearer ${refreshedAccessToken}`);

    const retriedResponse = await fetch(url, {
      ...init,
      headers: retryHeaders,
    });

    if (retriedResponse.status === 401) {
      apiClientConfig.onAuthFailure();
    }

    return retriedResponse;
  }

  return response;
}

async function request<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? "GET").toUpperCase();

  // Always set Content-Type for methods that typically carry JSON,
  // even when body is absent, so the server doesn't reject with 415.
  const jsonMethods = new Set(["POST", "PUT", "PATCH"]);
  if (jsonMethods.has(method) && !headers.has("Content-Type")) {
    const hasFormData = init?.body instanceof FormData;
    if (!hasFormData) {
      headers.set("Content-Type", "application/json");
    }
  }

  const res = await apiFetchResponse(path, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const message = await parseErrorMessage(res);
    throw new ApiError(res.status, message);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") {
      continue;
    }

    if (Array.isArray(v)) {
      for (const item of v) {
        if (item !== undefined && item !== null && item !== "") {
          sp.append(k, String(item));
        }
      }
      continue;
    }

    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  get: <T>(
    path: string,
    params: Record<string, unknown> = {},
    init?: ApiRequestInit,
  ) => request<T>(`${path}${qs(params)}`, init),

  post: <T>(path: string, body?: unknown, init?: ApiRequestInit) =>
    request<T>(path, {
      ...init,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : '{}',
    }),

  put: <T>(path: string, body: unknown, init?: ApiRequestInit) =>
    request<T>(path, {
      ...init,
      method: "PUT",
      body: JSON.stringify(body),
    }),

  patch: <T>(path: string, body: unknown, init?: ApiRequestInit) =>
    request<T>(path, {
      ...init,
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  del: <T>(path: string, init?: ApiRequestInit) =>
    request<T>(path, { ...init, method: "DELETE" }),
};

export { ApiError, parseErrorMessage };
