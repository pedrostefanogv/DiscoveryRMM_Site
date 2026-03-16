export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

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

  return (
    STATUS_FALLBACK_MESSAGE[res.status] ??
    res.statusText ??
    "Erro de requisicao"
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
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
    init?: RequestInit,
  ) => request<T>(`${path}${qs(params)}`, init),

  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: "PUT",
      body: JSON.stringify(body),
    }),

  patch: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  del: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: "DELETE" }),
};

export { ApiError };
