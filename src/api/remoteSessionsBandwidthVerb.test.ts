/**
 * VERBO<->ROTA do cliente de sessões remotas (regressão do 405 de banda).
 *
 * Incidente 2026-11-10 (produção, discovery.pstefano.com.br): o viewer trocava o
 * teto de banda com POST .../bandwidth, mas o backend só expõe
 * [HttpPut("{agentId}/{sessionId}/bandwidth")] (RemoteSessionsController.cs:351).
 * O HAR mostrava HTTP 405 com "allow: PUT": a troca de teto em runtime NUNCA
 * funcionou — só o bloco "bandwidth" do payload de start tinha efeito.
 *
 * Estes testes travam o verbo e o path de cada rota contra o controller, para
 * que uma divergência volte a falhar no CI em vez de só em produção.
 *
 * Escopo: apenas o transporte (method + URL + body). O comportamento da tela
 * (toasts) é coberto pelos testes de RemoteSession.tsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { remoteSessionsApi } from "./remote-sessions";
import { configureApiClient } from "./client";

const AGENT = "01a189d0-8076-7ddd-b55e-d7ca6054e5ab";
const SESSION = "01a189d0-8076-7ddd-b55e-d7ca6054e5ac";
const BASE = "/api/v1/remote-sessions";

interface Call {
    method: string;
    path: string;
    body: unknown;
}

/** Captura method+path+body de cada requisição e responde 200 com JSON vazio. */
function captureFetch(): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
            calls.push({
                method: init?.method ?? "GET",
                path: String(url),
                body: init?.body ? JSON.parse(String(init.body)) : undefined,
            });
            return new Response("{}", {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }),
    );
    return calls;
}

describe("remote-sessions: verbo HTTP por rota (paridade com RemoteSessionsController.cs)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        configureApiClient({
            getAccessToken: () => "test-token",
            refreshAccessToken: async () => "test-token",
            onAuthFailure: () => {},
        });
    });

    it("changeBandwidth usa PUT (NÃO POST) — [HttpPut(.../bandwidth)]", async () => {
        const calls = captureFetch();

        await remoteSessionsApi.changeBandwidth(AGENT, SESSION, { mode: "manual", ceilingKbps: 2000 });

        expect(calls).toHaveLength(1);
        // O bug de produção: method === "POST" aqui devolvia 405 (allow: PUT).
        expect(calls[0].method).toBe("PUT");
        expect(calls[0].path).toBe(`${BASE}/${AGENT}/${SESSION}/bandwidth`);
        expect(calls[0].body).toEqual({ mode: "manual", ceilingKbps: 2000 });
    });

    it("changeQuality usa PUT na rota /quality (controle: já funcionava)", async () => {
        const calls = captureFetch();

        await remoteSessionsApi.changeQuality(AGENT, SESSION, { quality: "high", auto: false });

        expect(calls[0].method).toBe("PUT");
        expect(calls[0].path).toBe(`${BASE}/${AGENT}/${SESSION}/quality`);
    });

    it("as duas rotas de política (banda/qualidade) usam o MESMO verbo", async () => {
        const calls = captureFetch();

        await remoteSessionsApi.changeBandwidth(AGENT, SESSION, { mode: "hd" });
        await remoteSessionsApi.changeQuality(AGENT, SESSION, { quality: "high" });

        expect(calls[0].method).toBe(calls[1].method);
    });

    it("rotas POST permanecem POST (start/stop/renew/nats-credentials)", async () => {
        const calls = captureFetch();

        await remoteSessionsApi.startSession(AGENT, {
            agentId: AGENT,
            kind: "screen",
            transport: "nats",
            quality: "high",
            codec: "webp",
            durationMinutes: 30,
        });
        await remoteSessionsApi.stopSession(AGENT, SESSION);
        await remoteSessionsApi.renewSession(AGENT, SESSION);
        await remoteSessionsApi.getSessionCredentials(AGENT, SESSION);

        expect(calls.map((c) => c.method)).toEqual(["POST", "POST", "POST", "POST"]);
        expect(calls.map((c) => c.path)).toEqual([
            `${BASE}/${AGENT}`,
            `${BASE}/${AGENT}/${SESSION}/stop`,
            `${BASE}/${AGENT}/${SESSION}/renew`,
            `${BASE}/${AGENT}/${SESSION}/nats-credentials`,
        ]);
    });

    it("getBandwidthPolicy usa GET", async () => {
        const calls = captureFetch();

        await remoteSessionsApi.getBandwidthPolicy();

        expect(calls[0].method).toBe("GET");
        expect(calls[0].path).toBe(`${BASE}/bandwidth-policy`);
    });
});
