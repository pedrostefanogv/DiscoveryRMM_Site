import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

import { ticketsApi } from "./tickets";
import { knowledgeApi } from "./knowledge";

/**
 * Regressao da mesma classe de bug do instalador zero-touch truncado:
 * apiFetchResponse aplica DEFAULT_REQUEST_TIMEOUT_MS (60s) quando o chamador
 * nao passa timeoutMs. Para arquivos grandes o AbortSignal.timeout corta o
 * corpo DEPOIS do HTTP 200 e o arquivo sai truncado, sem erro visivel.
 *
 * O backend permite anexos de chamado ate MaxLargeFileSizeBytes
 * (2 GB por padrao, teto de 10 GB), entao estes endpoints PRECISAM de
 * timeoutMs: 0.
 */
function binResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({
      "content-type": "application/octet-stream",
      "content-disposition": 'attachment; filename="anexo.bin"',
    }),
    blob: async () => new Blob([]),
    json: async () => ({}),
    text: async () => "",
  } as unknown as Response;
}

function lastInit(): RequestInit {
  const calls = fetchMock.mock.calls;
  return calls[calls.length - 1][1] as RequestInit;
}

describe("downloads de arquivo grande nao herdam o timeout de 60s", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(binResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ticketsApi.downloadAttachment: sem signal de timeout (anexo ate 2 GB)", async () => {
    await ticketsApi.downloadAttachment("ticket-1", "att-1");

    expect(lastInit().signal).toBeUndefined();
  });

  it("knowledgeApi.downloadImage: teto FINITO generoso, nao timeout: 0", async () => {
    // Imagem de KB e pequena e este e o caminho de FALLBACK: um teto finito
    // evita que um servidor que envia headers e trava deixe a imagem pendurada
    // para sempre. O default de 60s e que era apertado demais em link lento.
    await knowledgeApi.downloadImage("art-1", "img-1");

    expect(lastInit().signal).toBeInstanceOf(AbortSignal);
  });

  it("controle: chamada comum de ticketsApi MANTEM o signal de timeout", async () => {
    // Garante que a ausencia de signal nos testes acima e real, e nao um mock
    // que nunca recebe signal.
    await ticketsApi.getCapabilities("ticket-1");

    expect(lastInit().signal).toBeInstanceOf(AbortSignal);
  });
});
