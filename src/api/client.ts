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
  400: "Solicitacao invalida",
  401: "Nao autenticado",
  403: "Acesso negado",
  404: "Recurso nao encontrado",
  408: "Tempo de resposta excedido",
  429: "Muitas requisicoes",
  500: "Erro interno do servidor",
  502: "Gateway indisponivel",
  503: "Servico indisponivel",
  504: "Tempo de resposta do gateway excedido",
};

async function parseErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await res.json()) as
        | { message?: unknown; error?: unknown; detail?: unknown; code?: unknown; errors?: unknown }
        | string;
      if (typeof payload === "string" && payload.trim()) return payload;
      if (payload && typeof payload === "object") {
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
          return `[${String(payload.code)}] ${String(payload.message)}`;
        }

        const message =
          payload.message ?? payload.error ?? payload.detail ?? payload.title ?? res.statusText;
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

  return (
    STATUS_FALLBACK_MESSAGE[res.status] ??
    res.statusText ??
    "Erro de requisicao"
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

  if (
    !headers.has("Content-Type") &&
    init?.body &&
    !(init.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
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
      body: body ? JSON.stringify(body) : undefined,
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
