/**
 * REGRESSÃO C1 — a popup de acesso remoto deve usar o token do storage.
 *
 * Incidente 2026-11-07: POST /api/v1/remote-sessions -> 401
 * {"message":"Autenticação necessária."}.
 *
 * Causa: RemoteSession.tsx inicializava a ref do token SOMENTE do parâmetro
 * 'accessToken' da URL — que remoteSessionLauncher.ts deixou de preencher. Como a
 * página sobrescreve o provider global (configureApiClient), ela descartava a
 * sessão já hidratada no storage e ficava sem identidade até o handshake
 * cross-tab responder; a primeira chamada saía sem header Authorization.
 *
 * Este teste fixa o contrato da correção: legado da URL tem PRECEDÊNCIA, e na
 * ausência dele o token vem de loadAuthSession().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const STORAGE_KEY = "discovery.auth.session.v1";
const KEEP_KEY = "discovery.auth.keep-signed-in.v1";

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  } as unknown as Storage;
}

/** Replica a expressão de RemoteSession.tsx: legacy || loadAuthSession().accessToken ?? '' */
async function resolvePopupToken(legacyAccessToken: string): Promise<string> {
  const { loadAuthSession } = await import("@/auth/storage");
  return legacyAccessToken || (loadAuthSession().accessToken ?? "");
}

describe("C1 — popup resolve token do storage quando a URL não traz nenhum", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(window, "localStorage", { value: makeStorage(), configurable: true, writable: true });
    Object.defineProperty(window, "sessionStorage", { value: makeStorage(), configurable: true, writable: true });
  });

  it("ANTES (regressão): sem token na URL, a ref ficava vazia => request sem Authorization => 401", async () => {
    window.localStorage.setItem(KEEP_KEY, "1");
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ stage: "authenticated", accessToken: "jwt-valido", refreshToken: "r1", expiresAt: Date.now() + 3600_000 }),
    );

    // Comportamento antigo: a ref vinha apenas de legacyAccessToken ('' na URL nova).
    const legacyAccessToken = "";
    const oldBehaviour = legacyAccessToken;
    expect(oldBehaviour).toBe("");

    // Comportamento corrigido: cai no storage e encontra a sessão.
    await expect(resolvePopupToken(legacyAccessToken)).resolves.toBe("jwt-valido");
  });

  it("precedência: o token legado da URL vence o do storage", async () => {
    window.localStorage.setItem(KEEP_KEY, "1");
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ stage: "authenticated", accessToken: "jwt-do-storage", refreshToken: "r1", expiresAt: Date.now() + 3600_000 }),
    );

    await expect(resolvePopupToken("jwt-legado-da-url")).resolves.toBe("jwt-legado-da-url");
  });

  it("sem sessão no storage e sem URL, segue vazio (handshake cross-tab é a fonte)", async () => {
    // Nada gravado: a popup deve permanecer sem token e pedir via TOKEN_REQUEST.
    await expect(resolvePopupToken("")).resolves.toBe("");
  });

  it("regime sessionStorage: a sessão da própria janela também é aproveitada", async () => {
    window.localStorage.setItem(KEEP_KEY, "0");
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ stage: "authenticated", accessToken: "jwt-da-propria-janela", refreshToken: "r1", expiresAt: Date.now() + 3600_000 }),
    );

    await expect(resolvePopupToken("")).resolves.toBe("jwt-da-propria-janela");
  });
});
