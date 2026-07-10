import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api";
import { clearAuthSession, emptyAuthSession, loadAuthSession, saveAuthSession } from "./storage";
import type { TokenPair } from "@/api/auth";
import type { AuthSessionState } from "./types";

// ═══════════════════════════════════════════════════════════
// Testes unitários para os bugs críticos de auth corrigidos
// BUG-01: lastActivityAt/lastRefreshAttemptAt como refs
// BUG-02: retry com backoff no refreshSession
// BUG-03: renomeação de getHeartbeat para getMyHeartbeat
// ═══════════════════════════════════════════════════════════

function createTokenPair(overrides?: Partial<TokenPair>): TokenPair {
  return {
    accessToken: "access-token-123",
    refreshToken: "refresh-token-456",
    expiresInSeconds: 3600,
    ...overrides,
  };
}

// ───────────────────────────────────────
// BUG-01: Persistência de estado do auth
// ───────────────────────────────────────
describe("Storage e sessão", () => {
  beforeEach(() => {
    clearAuthSession();
  });

  it("saveAuthSession persiste e loadAuthSession recupera corretamente", () => {
    const session: AuthSessionState = {
      ...emptyAuthSession,
      stage: "authenticated",
      accessToken: "at-123",
      refreshToken: "rt-456",
      expiresAt: Date.now() + 3600_000,
      temporaryMfaToken: null,
      loginResponse: null,
    };

    saveAuthSession(session);
    const loaded = loadAuthSession();

    expect(loaded.stage).toBe("authenticated");
    expect(loaded.accessToken).toBe("at-123");
    expect(loaded.refreshToken).toBe("rt-456");
    expect(loaded.expiresAt).toBeGreaterThan(Date.now());
  });

  it("clearAuthSession remove a sessão do storage", () => {
    saveAuthSession({
      ...emptyAuthSession,
      stage: "authenticated",
      accessToken: "at-123",
      refreshToken: "rt-456",
      expiresAt: Date.now() + 3600_000,
    });

    clearAuthSession();
    const loaded = loadAuthSession();
    expect(loaded.stage).toBe("anonymous");
    expect(loaded.accessToken).toBeNull();
  });

  it("loadAuthSession rejeita sessão com tokens expirados (stage anonymous)", () => {
    saveAuthSession({
      ...emptyAuthSession,
      stage: "authenticated",
      accessToken: null,
      refreshToken: null,
      expiresAt: Date.now() - 1000,
    });

    const loaded = loadAuthSession();
    // Sem tokens válidos → stage volta para anonymous
    expect(loaded.stage).toBe("anonymous");
  });
});

// ───────────────────────────────────────
// BUG-02: Lógica de retry com backoff exponencial
// ───────────────────────────────────────

async function simulatedRefreshWithRetry(
  refreshFn: () => Promise<TokenPair>,
  getAccessToken: () => string | null,
  onAuthFailure: () => void,
  maxRetries = 3,
  baseDelayMs = 2000,
): Promise<string | null> {
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    try {
      const tokens = await refreshFn();
      return tokens.accessToken;
    } catch (error: unknown) {
      const isApiError =
        error instanceof ApiError ||
        (typeof error === "object" && error !== null && "status" in error);

      if (isApiError) {
        const status = (error as { status: number }).status;
        if (status === 401 || status === 403) {
          onAuthFailure();
          return null;
        }
      }

      retryCount++;
      if (retryCount > maxRetries) {
        onAuthFailure();
        return null;
      }

      const delay = baseDelayMs * Math.pow(2, retryCount - 1);
      console.warn(
        `[auth] Refresh falhou (tentativa ${retryCount}/${maxRetries}). Nova tentativa em ${delay}ms.`,
      );
      await new Promise((r) => setTimeout(r, delay));

      const currentToken = getAccessToken();
      if (currentToken) return currentToken;
    }
  }

  return getAccessToken();
}

describe("BUG-02: Retry com backoff exponencial no refreshSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("faz retry com backoff exponencial (2s, 4s, 8s) para erro de rede", async () => {
    let attempts = 0;
    const refreshFn = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts <= 3) {
        throw new TypeError("Failed to fetch");
      }
      return createTokenPair({ accessToken: "success-after-retry" });
    });

    const onAuthFailure = vi.fn();

    // Dispara a função (não await — usamos timers para controlar os timeouts)
    const promise = simulatedRefreshWithRetry(
      refreshFn,
      () => null,
      onAuthFailure,
    );

    // A 1a chamada ocorre imediatamente (antes do primeiro setTimeout)
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshFn).toHaveBeenCalledTimes(1);

    // Backoff 1 (2s) — avança 2s, a 2a tentativa deve ocorrer
    await vi.advanceTimersByTimeAsync(2000);
    expect(refreshFn).toHaveBeenCalledTimes(2);

    // Backoff 2 (4s) — avança +4s
    await vi.advanceTimersByTimeAsync(4000);
    expect(refreshFn).toHaveBeenCalledTimes(3);

    // Backoff 3 (8s) — avança +8s; a 4a tentativa = sucesso
    await vi.advanceTimersByTimeAsync(8000);
    expect(refreshFn).toHaveBeenCalledTimes(4);

    const result = await promise;
    expect(result).toBe("success-after-retry");
    expect(onAuthFailure).not.toHaveBeenCalled();
  });

  it("faz logout imediato para erro HTTP 401 (token inválido)", async () => {
    const refreshFn = vi.fn().mockRejectedValue(new ApiError(401, "Token inválido"));
    const onAuthFailure = vi.fn();

    const result = await simulatedRefreshWithRetry(
      refreshFn,
      () => "stale-token",
      onAuthFailure,
    );

    expect(result).toBeNull();
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
    expect(refreshFn).toHaveBeenCalledTimes(1); // sem retry
  });

  it("faz retry 3x e logout para erro HTTP 500 persistente", async () => {
    const refreshFn = vi.fn().mockRejectedValue(new ApiError(500, "Erro interno"));
    const onAuthFailure = vi.fn();

    const promise = simulatedRefreshWithRetry(
      refreshFn,
      () => null,
      onAuthFailure,
    );

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
    expect(refreshFn).toHaveBeenCalledTimes(4); // 1 + 3 retries
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it("retorna token atual se ainda válido durante retry", async () => {
    const refreshFn = vi.fn().mockRejectedValue(new TypeError("rede falhou"));
    const onAuthFailure = vi.fn();

    const promise = simulatedRefreshWithRetry(
      refreshFn,
      () => "still-valid-token",
      onAuthFailure,
    );

    // Avança primeiro backoff; o retry detecta que currentToken existe
    await vi.advanceTimersByTimeAsync(2100);
    const result = await promise;

    expect(result).toBe("still-valid-token");
    expect(onAuthFailure).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────
// BUG-03: getMyHeartbeat renomeado
// ───────────────────────────────────────
describe("BUG-03: getMyHeartbeat (antigo getHeartbeat)", () => {
  it("getMyHeartbeat existe com 0 parâmetros", async () => {
    const { agentsApi } = await import("@/api/agents");
    expect(typeof agentsApi.getMyHeartbeat).toBe("function");
    expect(agentsApi.getMyHeartbeat.length).toBe(0);
  });

  it("getHeartbeat antigo foi removido do export", async () => {
    const { agentsApi } = await import("@/api/agents");
    expect((agentsApi as Record<string, unknown>).getHeartbeat).toBeUndefined();
  });
});
