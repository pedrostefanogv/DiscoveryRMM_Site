import { afterEach, describe, expect, it, vi } from "vitest";
import { knowledgeApi } from "./knowledge";

/** Resposta JSON mínima compatível com o client (evita depender de rede). */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function firstCall(mock: {
  mock: { calls: unknown[][] };
}): [string, RequestInit | undefined] {
  const call = mock.mock.calls[0] as unknown as [
    RequestInfo | URL,
    RequestInit | undefined,
  ];
  return [String(call[0]), call[1]];
}

describe("knowledgeApi imagens privadas", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prepareImageUpload faz POST no endpoint de presign do artigo", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        attachmentId: "att-1",
        objectKey: "kb/art-1/att-1",
        uploadUrl: "https://storage.local/put/att-1",
        httpMethod: "PUT",
        expiresAtUtc: "2030-01-01T00:00:00Z",
      }),
    );

    const result = await knowledgeApi.prepareImageUpload("art-1", {
      fileName: "print.png",
      contentType: "image/png",
      sizeBytes: 1234,
    });

    expect(result.attachmentId).toBe("att-1");
    const [url, init] = firstCall(fetchMock);
    expect(url).toContain("/api/v1/knowledge/art-1/images/presigned-upload");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      fileName: "print.png",
      contentType: "image/png",
      sizeBytes: 1234,
    });
  });

  it("completeImageUpload faz POST com attachmentId/objectKey e devolve a imagem", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        id: "att-1",
        fileName: "print.png",
        contentType: "image/png",
        sizeBytes: 1234,
        createdAt: "2026-01-01T10:00:00Z",
        uploadedBy: "user-1",
      }),
    );

    const result = await knowledgeApi.completeImageUpload("art-1", {
      attachmentId: "att-1",
      objectKey: "kb/art-1/att-1",
      fileName: "print.png",
      contentType: "image/png",
      sizeBytes: 1234,
    });

    expect(result.id).toBe("att-1");
    const [url, init] = firstCall(fetchMock);
    expect(url).toContain("/api/v1/knowledge/art-1/images/complete-upload");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      attachmentId: "att-1",
      objectKey: "kb/art-1/att-1",
      fileName: "print.png",
      contentType: "image/png",
      sizeBytes: 1234,
    });
  });

  it("downloadImage usa fetch autenticado e devolve o blob", async () => {
    const blob = new Blob(["binario"], { type: "image/png" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(blob, { status: 200 }));

    const result = await knowledgeApi.downloadImage("art-1", "att-1");

    expect(result).toBeInstanceOf(Blob);
    const [url] = firstCall(fetchMock);
    expect(url).toContain("/api/v1/knowledge/art-1/images/att-1");
  });
});
