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

describe("client.ts — erros de validação estruturados (Fatia I)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 400 no shape da API: { errors: [{ code, message, field }] }. */
  function validationResponse(errors: unknown[]): Response {
    return jsonResponse({ errors }, 400);
  }

  it("expõe ApiError.errors com code/message/field e mantém .message igual", async () => {
    fetchMock.mockResolvedValue(
      validationResponse([
        {
          code: "Validation",
          field: "layoutJson",
          message: "o campo 'hw.agentIde' nao existe em nenhuma fonte do layout.",
        },
        {
          code: "Validation",
          field: "dataSources[1].join.sourceKey",
          message: "a chave de origem e obrigatoria a partir da segunda fonte.",
        },
      ]),
    );

    let caught: unknown;
    try {
      await api.post("/api/v1/reports/templates", { a: 1 });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiError = caught as ApiError;

    // CONTRATO PÚBLICO PRESERVADO: formato exato de antes.
    expect(apiError.message).toBe(
      "layoutJson: o campo 'hw.agentIde' nao existe em nenhuma fonte do layout.; " +
        "dataSources[1].join.sourceKey: a chave de origem e obrigatoria a partir da segunda fonte.",
    );

    // Campo NOVO, aditivo.
    expect(apiError.errors).toHaveLength(2);
    expect(apiError.errors?.[0]).toEqual({
      code: "Validation",
      field: "layoutJson",
      message: "o campo 'hw.agentIde' nao existe em nenhuma fonte do layout.",
    });
    expect(apiError.errors?.[1].field).toBe("dataSources[1].join.sourceKey");
  });

  it("mensagem que CONTÉM '; ' chega INTEIRA na lista estruturada", async () => {
    // Este é o bug que a fatia fecha: no caminho achatado a mensagem seria
    // partida em duas por causa do delimitador.
    const mensagemComPontoEVirgula =
      "o join por 'agentId' nao casou nenhuma linha; verifique se o agente reportou sensores.";
    fetchMock.mockResolvedValue(
      validationResponse([
        { code: "Validation", field: "layoutJson", message: mensagemComPontoEVirgula },
      ]),
    );

    let caught: unknown;
    try {
      await api.post("/api/v1/reports/templates", { a: 1 });
    } catch (error) {
      caught = error;
    }

    const apiError = caught as ApiError;
    expect(apiError.errors).toHaveLength(1);
    expect(apiError.errors?.[0].message).toBe(mensagemComPontoEVirgula);
  });

  it("shape FluentValidation ({ Campo: [msg] }) continua funcionando", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ errors: { Name: ["Nome é obrigatório."] } }, 400),
    );

    let caught: unknown;
    try {
      await api.post("/api/v1/reports/templates", { a: 1 });
    } catch (error) {
      caught = error;
    }

    const apiError = caught as ApiError;
    expect(apiError.message).toBe("Name: Nome é obrigatório.");
    expect(apiError.errors).toEqual([
      { field: "Name", message: "Nome é obrigatório." },
    ]);
  });

  it("400 sem 'errors' mantém o fallback e não inventa lista", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: "Requisição inválida" }, 400),
    );

    let caught: unknown;
    try {
      await api.post("/api/v1/reports/templates", { a: 1 });
    } catch (error) {
      caught = error;
    }

    const apiError = caught as ApiError;
    expect(apiError.message).toBe("Requisição inválida");
    expect(apiError.errors).toBeUndefined();
  });

  it("erro sem corpo cai no fallback de status e segue sem lista", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => "",
    } as unknown as Response);

    await expect(
      api.post("/api/v1/reports/templates", { a: 1 }),
    ).rejects.toMatchObject({ status: 503, message: "Serviço indisponível" });
  });
});
