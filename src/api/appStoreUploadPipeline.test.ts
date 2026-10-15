import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pipeline do upload multipart direto no storage (instaladores grandes).
 *
 * O que estes testes protegem:
 *  - 5 blocos em voo (PART_CONCURRENCY) e a fila reposta NO INSTANTE em que um
 *    bloco termina — era isso que fazia o envio andar em lotes de 3 e "dar uma
 *    pausa" entre eles;
 *  - a confirmação de ETag (caso CORS, em que o PUT não devolve o header) é UMA
 *    chamada no fim, e não um GET por bloco travando a virada de cada bloco.
 */

const mocks = vi.hoisted(() => ({
  putPresignedPart: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("./client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    ApiError,
    api: {
      get: mocks.get,
      post: mocks.post,
      del: mocks.del,
      upload: mocks.upload,
      putPresignedPart: mocks.putPresignedPart,
    },
  };
});

import { appStoreApi } from "./app-store";

const PART_SIZE = 1024 * 1024;
const TOTAL_PARTS = 12;
const EXPECTED_CONCURRENCY = 5;

function makeFile(name: string): File {
  return new File([new Uint8Array(PART_SIZE * TOTAL_PARTS)], name, { lastModified: 1 });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timeout esperando a condição do teste");
    await flush();
  }
}

function partNumberFromUrl(url: string): number {
  return Number(url.slice(url.lastIndexOf("/") + 1));
}

interface Fixture {
  started: number[];
  maxInFlight: number;
  completeBodies: Record<string, unknown>[];
  resolve: (partNumber: number) => void;
}

function wireApi(etagFor: (partNumber: number) => string): Fixture {
  const resolvers = new Map<number, () => void>();
  const fixture: Fixture = {
    started: [],
    maxInFlight: 0,
    completeBodies: [],
    resolve: (partNumber: number) => resolvers.get(partNumber)?.(),
  };
  let inFlight = 0;

  mocks.post.mockImplementation(async (path: string, body?: unknown) => {
    if (path.endsWith("/multipart/")) {
      return {
        uploadId: "upload-1",
        objectKey: "app-store/custom/installers/x/Setup.zip",
        partSizeBytes: PART_SIZE,
        totalParts: TOTAL_PARTS,
      };
    }

    if (path.endsWith("/parts")) {
      const partNumbers = (body as { partNumbers: number[] }).partNumbers;
      return {
        parts: partNumbers.map((partNumber) => ({
          partNumber,
          url: `https://storage.local/part/${partNumber}`,
        })),
      };
    }

    if (path.endsWith("/complete")) {
      fixture.completeBodies.push(body as Record<string, unknown>);
      return {
        objectKey: "app-store/custom/installers/x/Setup.zip",
        fileName: "Setup.zip",
        sizeBytes: PART_SIZE * TOTAL_PARTS,
        checksum: "sha",
      };
    }

    throw new Error(`POST inesperado no teste: ${path}`);
  });

  mocks.putPresignedPart.mockImplementation((url: string) => {
    const partNumber = partNumberFromUrl(url);
    fixture.started.push(partNumber);
    inFlight += 1;
    fixture.maxInFlight = Math.max(fixture.maxInFlight, inFlight);

    return new Promise<{ etag: string }>((resolve) => {
      resolvers.set(partNumber, () => {
        inFlight -= 1;
        resolve({ etag: etagFor(partNumber) });
      });
    });
  });

  return fixture;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("upload multipart direto no storage", () => {
  it("mantém 5 blocos em voo e repõe a fila assim que um termina", async () => {
    const fixture = wireApi((partNumber) => `etag-${partNumber}`);
    const file = makeFile("pipeline.zip");

    const upload = appStoreApi.uploadCustomAsset(file, "installer", () => {}, undefined);

    await waitFor(() => fixture.started.length === EXPECTED_CONCURRENCY);
    expect(fixture.started).toEqual([1, 2, 3, 4, 5]);
    expect(fixture.maxInFlight).toBe(EXPECTED_CONCURRENCY);

    // Conclui SÓ o primeiro bloco: o 6º tem de sair na hora, sem esperar os
    // outros quatro que seguem em voo (é esse encadeamento que tira a "pausa").
    fixture.resolve(1);
    await waitFor(() => fixture.started.length === EXPECTED_CONCURRENCY + 1);
    expect(fixture.started[EXPECTED_CONCURRENCY]).toBe(6);

    // Libera os demais conforme entram em voo.
    for (let partNumber = 2; partNumber <= TOTAL_PARTS; partNumber++) {
      await waitFor(() => fixture.started.includes(partNumber));
      fixture.resolve(partNumber);
    }

    await upload;

    expect(fixture.maxInFlight).toBeLessThanOrEqual(EXPECTED_CONCURRENCY);
    expect(fixture.started).toHaveLength(TOTAL_PARTS);
    expect(fixture.started).toEqual(
      Array.from({ length: TOTAL_PARTS }, (_, index) => index + 1),
    );
    expect(fixture.completeBodies).toHaveLength(1);

    const parts = (fixture.completeBodies[0] as { parts: { etag: string }[] }).parts;
    expect(parts).toHaveLength(TOTAL_PARTS);
    expect(parts.every((part) => part.etag.length > 0)).toBe(true);

    // ETag veio no PUT: nenhuma chamada extra ao estado do upload.
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("nunca falha o vínculo: sem ETag confirmável, o complete vai sem a lista e a API resolve no storage", async () => {
    // Storage atrás de CORS que não devolve o header no PUT E não lista a parte
    // na hora: o arquivo inteiro já subiu, então o vínculo não pode falhar.
    const fixture = wireApi(() => "");
    mocks.get.mockResolvedValue({
      uploadId: "upload-1",
      objectKey: "app-store/custom/installers/x/Setup.zip",
      partSizeBytes: PART_SIZE,
      totalParts: TOTAL_PARTS,
      completed: false,
      receivedBytes: 0,
      receivedParts: [],
      pendingParts: [],
    });

    const file = makeFile("sem-etag.zip");
    const upload = appStoreApi.uploadCustomAsset(file, "installer", () => {}, undefined);

    for (let partNumber = 1; partNumber <= TOTAL_PARTS; partNumber++) {
      await waitFor(() => fixture.started.includes(partNumber));
      fixture.resolve(partNumber);
    }

    await upload;

    expect(mocks.get).toHaveBeenCalledTimes(3);
    // Lista vazia = "use as partes que o storage tem" (ListParts no servidor).
    expect(fixture.completeBodies[0]).toEqual({ parts: [] });
  });

  it("confirma os ETags em UMA chamada no fim quando o PUT não devolve o header", async () => {
    const fixture = wireApi(() => "");
    mocks.get.mockResolvedValue({
      uploadId: "upload-1",
      objectKey: "app-store/custom/installers/x/Setup.zip",
      partSizeBytes: PART_SIZE,
      totalParts: TOTAL_PARTS,
      completed: false,
      receivedBytes: PART_SIZE * TOTAL_PARTS,
      receivedParts: Array.from({ length: TOTAL_PARTS }, (_, index) => ({
        partNumber: index + 1,
        eTag: `etag-${index + 1}`,
        sizeBytes: PART_SIZE,
      })),
      pendingParts: [],
    });

    const file = makeFile("cors.zip");
    const upload = appStoreApi.uploadCustomAsset(file, "installer", () => {}, undefined);

    await waitFor(() => fixture.started.length === EXPECTED_CONCURRENCY);
    // Nenhum GET de confirmação enquanto os blocos estão em voo.
    expect(mocks.get).not.toHaveBeenCalled();

    for (let partNumber = 1; partNumber <= TOTAL_PARTS; partNumber++) {
      await waitFor(() => fixture.started.includes(partNumber));
      fixture.resolve(partNumber);
    }

    await upload;

    // UMA chamada para todos os blocos (antes era um GET por bloco).
    expect(mocks.get).toHaveBeenCalledTimes(1);

    const parts = (fixture.completeBodies[0] as { parts: { etag: string }[] }).parts;
    expect(parts).toHaveLength(TOTAL_PARTS);
    expect(parts.every((part) => part.etag.startsWith("etag-"))).toBe(true);
  });
});
