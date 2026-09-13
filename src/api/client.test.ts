import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

import { api, apiFetchResponse, parseErrorMessage, ApiError } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("client.ts — correções B1/B11/B12/O1", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("B1: api.post passa FormData cru (sem JSON.stringify e sem Content-Type JSON)", async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["content"]), "artifact.zip");

    await api.post("/api/v1/test-upload", formData);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/v1/test-upload");
    expect(init.body).toBe(formData); // mesma instância — não serializado
    expect(init.body).not.toBe("{}");
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBeNull(); // boundary é do FormData
  });

  it("B1: api.post continua serializando JSON para objetos comuns", async () => {
    await api.post("/api/v1/test-json", { a: 1 });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("B12: qs ignora objetos complexos (não serializa [object Object])", async () => {
    await api.get("/api/v1/test", { ok: "1", nested: { a: 1 } });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("ok=1");
    expect(url).not.toContain("object");
    expect(url).not.toContain("nested");
  });

  it("B11: parseErrorMessage extrai mensagem de corpo JSON mesmo após falha de parse", async () => {
    const response = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => {
        throw new Error("stream já consumido");
      },
      text: async () => JSON.stringify({ message: "Falha específica do servidor" }),
    } as unknown as Response;

    const message = await parseErrorMessage(response);
    expect(message).toBe("Falha específica do servidor");
  });

  it("B11: parseErrorMessage cai no fallback de status quando o corpo está vazio", async () => {
    const response = {
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => "",
    } as unknown as Response;

    const message = await parseErrorMessage(response);
    expect(message).toBe("Serviço indisponível");
  });

  it("O1: timeoutMs=0 não anexa signal de timeout (mantém signal externo)", async () => {
    const external = new AbortController();
    await apiFetchResponse("/api/v1/test", {
      method: "GET",
      signal: external.signal,
      timeoutMs: 0,
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(external.signal);
  });

  it("O1: request sem init recebe signal de timeout padrão", async () => {
    await api.get("/api/v1/test");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("O1: request abortada lança erro e não duplica chamadas", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(
      Object.assign(new Error("Aborted"), { name: "AbortError" }),
    );

    await expect(
      apiFetchResponse("/api/v1/test", { signal: controller.signal }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ApiError mantém status e mensagem", () => {
    const error = new ApiError(404, "não encontrado");
    expect(error.status).toBe(404);
    expect(error.message).toBe("não encontrado");
    expect(error.name).toBe("ApiError");
  });
});
