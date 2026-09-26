export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";
export const API_VERSION_PREFIX = "/api/v1";

export interface ApiRequestInit extends RequestInit {
  auth?: boolean;
  retryOnAuthError?: boolean;
  /**
   * Timeout da requisição em ms (o fetch é abortado ao expirar).
   * Use 0 para desativar em operações de longa duração.
   * Default: 60s — evita UI presa em loading quando o backend não responde.
   */
  timeoutMs?: number;
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
  502: "Serviço temporariamente indisponível",
  503: "Serviço indisponível",
  504: "Tempo de resposta excedido",
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

  // Lê o corpo uma única vez: tentar res.json() e depois res.text() falha
  // porque o stream já teria sido consumido pela primeira leitura.
  let rawBody: string | null = null;
  try {
    rawBody = await res.text();
  } catch {
    rawBody = null;
  }

  if (contentType.includes("application/json") && rawBody !== null) {
    try {
      const payload = JSON.parse(rawBody) as
        | {
            message?: unknown;
            error?: unknown;
            detail?: unknown;
            details?: unknown;
            code?: unknown;
            errors?: unknown;
            title?: unknown;
          }
        | string;
      if (typeof payload === "string" && payload.trim()) return payload;
      if (payload && typeof payload === "object") {
        const detailsMessage = normalizeErrorDetails(payload.details);

        // ValidationProblemDetails: extrai erros por campo
        if (payload.errors && typeof payload.errors === "object") {
          const fieldErrors = Object.entries(
            payload.errors as Record<string, unknown>,
          )
            .flatMap(([field, msgs]) => {
              if (Array.isArray(msgs))
                return msgs.map((m: unknown) => `${field}: ${String(m)}`);
              return [`${field}: ${String(msgs)}`];
            })
            .join("; ");
          if (fieldErrors) return fieldErrors;
        }

        // { code, message } combo
        if (payload.code && payload.message) {
          const baseMessage = `[${String(payload.code)}] ${String(payload.message)}`;
          return detailsMessage
            ? `${baseMessage}. ${detailsMessage}`
            : baseMessage;
        }

        const message =
          payload.message ??
          payload.error ??
          payload.detail ??
          payload.title ??
          res.statusText;
        if (typeof message === "string" && message.trim()) {
          return detailsMessage ? `${message}. ${detailsMessage}` : message;
        }

        if (detailsMessage) return detailsMessage;
      }
    } catch {
      // Fallback para parse de texto/status abaixo.
    }
  }

  if (rawBody !== null) {
    const text = rawBody.trim();
    if (text && !text.startsWith("<")) return rawBody;
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

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/**
 * Combina o signal externo (ex.: AbortSignal do TanStack Query) com um timeout.
 * Sem AbortSignal.any no runtime, prioriza o signal externo (cancelamento).
 */
function buildRequestSignal(init: ApiRequestInit): AbortSignal | undefined {
  const signals: AbortSignal[] = [];

  if (init.signal) {
    signals.push(init.signal);
  }

  const timeoutMs = init.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (
    timeoutMs > 0 &&
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    signals.push(AbortSignal.timeout(timeoutMs));
  }

  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];

  const anyFn = (
    AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }
  ).any;
  return anyFn ? anyFn(signals) : signals[0];
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

  const signal = buildRequestSignal(init);

  const response = await fetch(url, {
    ...init,
    headers,
    signal,
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
      signal,
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
    // Corpos crus definem seu próprio Content-Type (boundary/urlencoded);
    // sobrescrevê-lo quebraria multipart upload.
    const hasRawBody =
      init?.body instanceof FormData ||
      init?.body instanceof URLSearchParams ||
      init?.body instanceof Blob;
    if (!hasRawBody) {
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

    // Objetos não são representáveis em query string — evita "[object Object]".
    if (typeof v === "object") {
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

  post: <T>(path: string, body?: unknown, init?: ApiRequestInit) => {
    // Corpos binários/form devem ir crus: JSON.stringify(FormData) === "{}"
    // e o Content-Type (boundary etc.) é derivado do próprio body.
    const isRawBody =
      body instanceof FormData ||
      body instanceof URLSearchParams ||
      body instanceof Blob ||
      body instanceof ArrayBuffer ||
      ArrayBuffer.isView(body);

    return request<T>(path, {
      ...init,
      method: "POST",
      body: isRawBody
        ? (body as BodyInit)
        : body !== undefined
          ? JSON.stringify(body)
          : "{}",
    });
  },

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
