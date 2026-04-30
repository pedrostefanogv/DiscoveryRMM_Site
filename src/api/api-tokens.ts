import { api } from "./client";
import type { ApiToken, CreateApiTokenRequest } from "./types";

const BASE = "/api/api-tokens";

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return null;
}

function normalizeApiToken(raw: Record<string, unknown>): ApiToken {
  const revokedAt = normalizeNullableString(raw.revokedAt ?? raw.RevokedAt);

  return {
    id: String(raw.id ?? raw.tokenId ?? raw.Id ?? ""),
    name: String(raw.name ?? raw.Name ?? ""),
    token: normalizeNullableString(raw.token ?? raw.Token ?? raw.value ?? raw.Value),
    maskedToken: normalizeNullableString(
      raw.maskedToken ?? raw.MaskedToken ?? raw.tokenPreview ?? raw.TokenPreview,
    ),
    prefix: normalizeNullableString(raw.prefix ?? raw.Prefix),
    createdAt: normalizeNullableString(raw.createdAt ?? raw.CreatedAt),
    expiresAt: normalizeNullableString(raw.expiresAt ?? raw.ExpiresAt),
    lastUsedAt: normalizeNullableString(raw.lastUsedAt ?? raw.LastUsedAt),
    revokedAt,
    isActive:
      normalizeBoolean(raw.isActive ?? raw.IsActive) ??
      normalizeBoolean(raw.active ?? raw.Active) ??
      !revokedAt,
  };
}

function normalizeApiTokens(raw: unknown): ApiToken[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeApiToken(item as Record<string, unknown>));
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const collection = Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.data)
        ? record.data
        : Array.isArray(record.tokens)
          ? record.tokens
          : [];

    return collection.map((item) =>
      normalizeApiToken(item as Record<string, unknown>),
    );
  }

  return [];
}

export const apiTokensApi = {
  async list(): Promise<ApiToken[]> {
    const raw = await api.get<unknown>(BASE);
    return normalizeApiTokens(raw);
  },

  async create(data: CreateApiTokenRequest): Promise<ApiToken> {
    const raw = await api.post<Record<string, unknown>>(BASE, data);
    return normalizeApiToken(raw);
  },

  delete: (tokenId: string) => api.del<void>(`${BASE}/${tokenId}`),
};
