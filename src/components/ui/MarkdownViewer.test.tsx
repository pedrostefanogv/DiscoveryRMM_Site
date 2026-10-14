import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// O viewer depende do tema; aqui bastam as props controladas.
vi.mock("@/theme/ThemeContext", () => ({
  useTheme: () => ({ mode: "dark" }),
}));

vi.mock("@/hooks/useKnowledge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useKnowledge")>();
  return { ...actual, useKnowledgeImageUrl: vi.fn() };
});

import { useKnowledgeImageUrl } from "@/hooks/useKnowledge";
import { MarkdownViewer } from "./MarkdownViewer";

const mockedUrl = vi.mocked(useKnowledgeImageUrl);
const GUID = "abcdef12-3456-7890-abcd-ef1234567890";

describe("MarkdownViewer urlTransform", () => {
  beforeEach(() => {
    mockedUrl.mockReturnValue({
      url: "https://storage.local/signed.png",
      isLoading: false,
      isError: false,
    });
  });

  it("preserva o src kbimage:<uuid> e resolve a imagem privada", async () => {
    render(<MarkdownViewer source={`![foto](kbimage:${GUID})`} articleId="art-1" />);

    // O renderer de markdown é carregado sob demanda (lazy); o primeiro render
    // em jsdom pode passar de 1s, então o timeout padrão do findBy é curto aqui.
    const img = await screen.findByAltText("foto", {}, { timeout: 5000 });
    expect(img.getAttribute("src")).toBe("https://storage.local/signed.png");
  });

  it("continua bloqueando javascript: e mantém links http(s)", async () => {
    render(
      <MarkdownViewer
        source={"[click](javascript:alert(1)) e [ok](https://example.com)"}
        articleId="art-1"
      />,
    );

    const bad = await screen.findByText("click");
    expect(bad.getAttribute("href") ?? "").not.toContain("javascript:");

    const good = screen.getByText("ok");
    expect(good.getAttribute("href")).toBe("https://example.com");
  });

  it("sem articleId mantém o comportamento padrão (kbimage: é removido)", async () => {
    render(<MarkdownViewer source={`![foto](kbimage:${GUID})`} />);

    const img = await screen.findByAltText("foto", {}, { timeout: 5000 });
    expect(img.getAttribute("src") ?? "").not.toContain("kbimage:");
  });
});
