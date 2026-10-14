import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Isola o componente do react-query/API: o estado da URL é controlado aqui.
vi.mock("@/hooks/useKnowledge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useKnowledge")>();
  return { ...actual, useKnowledgeImageUrl: vi.fn() };
});

// O fallback autenticado (stream) é controlado por teste.
vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    knowledgeApi: { ...actual.knowledgeApi, downloadImage: vi.fn() },
  };
});

import { knowledgeApi } from "@/api";
import { useKnowledgeImageUrl } from "@/hooks/useKnowledge";
import { KbMarkdownImage } from "./KbMarkdownImage";

const mockedUrl = vi.mocked(useKnowledgeImageUrl);
const mockedDownload = vi.mocked(knowledgeApi.downloadImage);
const GUID = "11111111-2222-3333-4444-555555555555";

beforeAll(() => {
  // jsdom não implementa createObjectURL/revokeObjectURL.
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    value: vi.fn(() => "blob:kb-image"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    writable: true,
    value: vi.fn(),
  });
});

describe("KbMarkdownImage", () => {
  beforeEach(() => {
    mockedUrl.mockReset();
    mockedDownload.mockReset();
  });

  it("resolve kbimage:<guid> e renderiza a img com a URL pré-assinada", () => {
    mockedUrl.mockReturnValue({
      url: "https://storage.local/signed.png",
      isLoading: false,
      isError: false,
    });

    render(<KbMarkdownImage articleId="art-1" src={`kbimage:${GUID}`} alt="Print" />);

    const img = screen.getByAltText("Print") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://storage.local/signed.png");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(mockedUrl).toHaveBeenCalledWith("art-1", GUID, true);
    expect(mockedDownload).not.toHaveBeenCalled();
  });

  it("mostra placeholder enquanto a URL carrega", () => {
    mockedUrl.mockReturnValue({ url: null, isLoading: true, isError: false });

    render(<KbMarkdownImage articleId="art-1" src={`kbimage:${GUID}`} />);

    expect(screen.getByTestId("kb-image-loading")).toBeTruthy();
  });

  it("usa o stream autenticado quando o presign falha", async () => {
    mockedUrl.mockReturnValue({ url: null, isLoading: false, isError: true });
    mockedDownload.mockResolvedValue(new Blob(["png"], { type: "image/png" }));

    render(<KbMarkdownImage articleId="art-1" src={`kbimage:${GUID}`} alt="Print" />);

    const img = await screen.findByAltText("Print");
    expect(img.getAttribute("src")).toBe("blob:kb-image");
    expect(mockedDownload).toHaveBeenCalledWith("art-1", GUID);
  });

  it("mostra fallback discreto quando presign E stream falham (sem img quebrada)", async () => {
    mockedUrl.mockReturnValue({ url: null, isLoading: false, isError: true });
    mockedDownload.mockRejectedValue(new Error("403"));

    render(<KbMarkdownImage articleId="art-1" src={`kbimage:${GUID}`} />);

    expect(await screen.findByTestId("kb-image-error")).toBeTruthy();
    expect(screen.getByText("Imagem indisponível")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("repassa http(s), data: e blob: direto para a img sem consultar a API", () => {
    // Sem kbimage: o hook é chamado (regra dos hooks) mas desabilitado.
    mockedUrl.mockReturnValue({ url: null, isLoading: false, isError: false });

    render(<KbMarkdownImage articleId="art-1" src="https://example.com/a.png" alt="Externa" />);
    render(<KbMarkdownImage articleId="art-1" src="data:image/png;base64,AAAA" alt="Data" />);
    render(<KbMarkdownImage articleId="art-1" src="blob:http://localhost/x" alt="Blob" />);

    expect((screen.getByAltText("Externa") as HTMLImageElement).getAttribute("src")).toBe(
      "https://example.com/a.png",
    );
    expect(screen.getByAltText("Data")).toBeTruthy();
    expect(screen.getByAltText("Blob")).toBeTruthy();
    expect(mockedUrl).toHaveBeenCalledWith("art-1", "", false);
    expect(mockedDownload).not.toHaveBeenCalled();
  });
});
