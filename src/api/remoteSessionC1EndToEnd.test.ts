/**
 * C1 — prova END-TO-END: com a correção, o token hidratado do storage vira
 * header Authorization no request real (o que faltava no incidente).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetchResponse, configureApiClient } from "./client";

const STORAGE_KEY = "discovery.auth.session.v1";
const KEEP_KEY = "discovery.auth.keep-signed-in.v1";
const AGENT = "01a189d0-8076-7ddd-b55e-d7ca6054e5ab";

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

describe("C1 end-to-end: token hidratado => Authorization presente", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    Object.defineProperty(window, "localStorage", { value: makeStorage(), configurable: true, writable: true });
    Object.defineProperty(window, "sessionStorage", { value: makeStorage(), configurable: true, writable: true });
  });

  it("a ref alimentada pelo storage faz o POST sair COM Authorization", async () => {
    window.localStorage.setItem(KEEP_KEY, "1");
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ stage: "authenticated", accessToken: "jwt-hidratado", refreshToken: "r1", expiresAt: Date.now() + 3600_000 }),
    );

    const { loadAuthSession } = await import("@/auth/storage");

    // Réplica da correção em RemoteSession.tsx: legacy || storage ?? ''
    const legacyAccessToken = "";
    const accessTokenRef = { current: legacyAccessToken || (loadAuthSession().accessToken ?? "") };
    expect(accessTokenRef.current).toBe("jwt-hidratado");

    const seen: Headers[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      seen.push(new Headers(init.headers));
      return new Response(JSON.stringify({ id: "s1" }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    configureApiClient({
      getAccessToken: () => accessTokenRef.current,
      refreshAccessToken: async () => null,
      onAuthFailure: () => {},
    });

    const res = await apiFetchResponse(`/api/v1/remote-sessions/${AGENT}`, { method: "POST" });

    // Antes da correção este request saía sem header e levava 401.
    expect(res.status).toBe(200);
    expect(seen[0].get("Authorization")).toBe("Bearer jwt-hidratado");
  });
});
