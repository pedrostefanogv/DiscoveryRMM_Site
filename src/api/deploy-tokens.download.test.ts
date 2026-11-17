import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

import { deployTokensApi, genericInstallerUrl } from "./deploy-tokens";

/**
 * Regressao do bug "instalador zero-touch baixado truncado".
 *
 * Sintoma em campo: o download do endpoint /api/v1/download/agent/generic
 * terminava em ~13-14 MB de um .exe de ~61 MB, com HTTP 200 — arquivo
 * corrompido, sem erro visivel no console.
 *
 * Causa: apiFetchResponse aplica DEFAULT_REQUEST_TIMEOUT_MS (60s) quando o
 * chamador nao informa timeoutMs. Em conexao lenta o AbortSignal.timeout
 * cortava a transferencia no meio. Os downloads grandes precisam de
 * timeoutMs: 0 (mesma convencao de app-store.ts / reports.ts).
 */
function emptyResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/octet-stream" }),
    blob: async () => new Blob([]),
    json: async () => ({}),
    text: async () => "",
  } as unknown as Response;
}

function jsonResponse(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "Error",
    headers: new Headers({ "content-type": "application/json" }),
    blob: async () => new Blob([]),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Le o init efetivamente passado ao fetch (apos o spread interno do client). */
function lastFetchInit(): RequestInit & { timeoutMs?: number } {
  const calls = fetchMock.mock.calls;
  return calls[calls.length - 1][1] as RequestInit & { timeoutMs?: number };
}

describe("deploy-tokens — downloads grandes sem timeout de 60s", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(emptyResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("probeGenericInstaller NAO herda o timeout padrao de 60s", async () => {
    await deployTokensApi.probeGenericInstaller();

    // Com timeoutMs: 0 o client nao anexa AbortSignal.timeout — logo o signal
    // do fetch e undefined (nao ha signal externo neste fluxo). Em cache miss o
    // servidor roda o build NSIS antes do primeiro byte (~54s), entao o default
    // de 60s estouraria.
    expect(lastFetchInit().signal).toBeUndefined();
  });

  it("probeGenericInstaller aponta para o endpoint generico anonimo", async () => {
    await deployTokensApi.probeGenericInstaller();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/download/agent/generic");
  });

  it("genericInstallerUrl respeita API_BASE_URL e o prefixo de versao", () => {
    // Default (VITE_API_URL ausente): same-origin relativo, onde o atributo
    // `download` do <a> e honrado pelo navegador.
    expect(genericInstallerUrl()).toBe("/api/v1/download/agent/generic");
  });

  it("probeGenericInstaller LANCA em 503 (sem build) para a UI mostrar o erro", async () => {
    // O <a download> puro navegaria para o corpo JSON do erro e o toast ainda
    // diria "download iniciado". A sonda converte isso em erro visivel.
    fetchMock.mockResolvedValue(
      jsonResponse({ message: "Generic installer is not available on this server." }, 503),
    );

    await expect(deployTokensApi.probeGenericInstaller()).rejects.toMatchObject({ status: 503 });
  });

  it("downloadInstaller (token) tambem nao herda o timeout de 60s", async () => {
    await deployTokensApi.downloadInstaller("tok", "installer");

    expect(lastFetchInit().signal).toBeUndefined();
  });

  it("createAndDownload tambem nao herda o timeout de 60s", async () => {
    await deployTokensApi.createAndDownload({
      clientId: "c1",
      siteId: "s1",
      expiresInHours: 24,
      multiUse: false,
      installerType: "installer",
    } as never);

    expect(lastFetchInit().signal).toBeUndefined();
  });

  it("downloadPackage tambem nao herda o timeout de 60s", async () => {
    await deployTokensApi.downloadPackage("id-1", { artifact: "pkg.zip" } as never);

    expect(lastFetchInit().signal).toBeUndefined();
  });

  it("controle: uma chamada comum do mesmo modulo MANTEM o signal de timeout", async () => {
    // Garante que o teste acima detecta de fato a ausencia do signal e nao um
    // fetch mockado que nunca recebe signal.
    await deployTokensApi.getInstallerOptions("tok");

    expect(lastFetchInit().signal).toBeInstanceOf(AbortSignal);
  });
});
