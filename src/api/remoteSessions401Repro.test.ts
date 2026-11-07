/**
 * 401 EM POST /api/v1/remote-sessions — reprodução e regimes (incidente 2026-11-07).
 *
 * Concentra a PROVA EMPÍRICA no nível do cliente HTTP, em três camadas:
 *
 *  A) O elo do cliente — sem token, o request sai SEM Authorization, e o backend
 *     responde 401 {"message":"Autenticação necessária."} (41 bytes), que é a
 *     string de RequirePermissionFilter (AuthFilters.cs:253), disparada quando
 *     HttpContext.Items["UserId"] não é Guid.
 *  B) O regime de storage que deixa a popup sem token (sessionStorage é isolado
 *     por aba; só há hydration compartilhada com "manter conectado").
 *  C) O motivo de a popup ser vulnerável nos DOIS regimes: RemoteSession.tsx:219
 *     inicializa accessTokenRef apenas da query string (que o launcher não
 *     preenche mais) e NUNCA do storage — o override de :229-230 descarta a
 *     hidratação que protege as demais janelas.
 *
 * NOTA DE ESCOPO (evita duplicação com src/auth/storageRegimes.test.ts):
 *  - storageRegimes.test.ts prova o REGIME no módulo de storage (loadAuthSession).
 *  - Este arquivo prova a CONSEQUÊNCIA no transporte (header ausente -> 401).
 *  São camadas distintas; a de storage usa makeStorage() injetado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetchResponse, configureApiClient } from "./client";

const AGENT = "01a189d0-8076-7ddd-b55e-d7ca6054e5ab";
const PATH = `/api/v1/remote-sessions/${AGENT}`;

function captureFetch(status: number, body: unknown) {
  const seen: Headers[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers));
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return seen;
}

describe("A) elo do cliente: token ausente => request sem Authorization => 401", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sem token, o POST sai SEM header Authorization", async () => {
    const seen = captureFetch(401, { message: "Autenticação necessária." });

    configureApiClient({
      getAccessToken: () => null,
      refreshAccessToken: async () => null,
      onAuthFailure: () => {},
    });

    const res = await apiFetchResponse(PATH, {
      method: "POST",
      body: JSON.stringify({ agentId: AGENT, kind: "screen" }),
    });

    expect(res.status).toBe(401);
    expect(seen).toHaveLength(1);
    expect(seen[0].has("Authorization")).toBe(false);
    await expect(res.json()).resolves.toEqual({ message: "Autenticação necessária." });
  });

  it("com token, o MESMO POST envia Authorization: Bearer", async () => {
    const seen = captureFetch(200, { id: "s1" });

    configureApiClient({
      getAccessToken: () => "jwt-de-teste",
      refreshAccessToken: async () => null,
      onAuthFailure: () => {},
    });

    const res = await apiFetchResponse(PATH, {
      method: "POST",
      body: JSON.stringify({ agentId: AGENT, kind: "screen" }),
    });

    expect(res.status).toBe(200);
    expect(seen[0].get("Authorization")).toBe("Bearer jwt-de-teste");
  });

  it("token vazio ('') também produz request sem Authorization", async () => {
    const seen = captureFetch(401, { message: "Autenticação necessária." });

    // accessTokenRef.current é inicializado como '' em RemoteSession.tsx:219
    configureApiClient({
      getAccessToken: () => "",
      refreshAccessToken: async () => null,
      onAuthFailure: () => {},
    });

    const res = await apiFetchResponse(PATH, { method: "POST" });

    expect(res.status).toBe(401);
    expect(seen[0].has("Authorization")).toBe(false);
  });
});

describe("C) a popup é vulnerável nos DOIS regimes de storage", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("mesmo com token válido no storage compartilhado, a ref local vazia vence", async () => {
    const seen = captureFetch(401, {});

    // "manter conectado" LIGADO: o localStorage compartilhado TEM token — é o
    // cenário que hidrata e salva as demais janelas dedicadas.
    const storageToken = "jwt-no-localStorage-compartilhado";

    // Replica RemoteSession.tsx:219 + :230: a ref nasce só da URL (vazia agora,
    // porque remoteSessionLauncher.ts:43-45 parou de passar o token).
    const accessTokenRef = { current: "" };
    configureApiClient({
      getAccessToken: () => accessTokenRef.current,
      refreshAccessToken: async () => null,
      onAuthFailure: () => {},
    });

    const res = await apiFetchResponse(PATH, { method: "POST" });

    // O token EXISTIA no storage e mesmo assim o header não foi enviado.
    expect(storageToken).toBeTruthy();
    expect(res.status).toBe(401);
    expect(seen[0].has("Authorization")).toBe(false);
  });
});
