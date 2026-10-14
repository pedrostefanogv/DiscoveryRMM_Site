import { describe, expect, it } from "vitest";
import {
  buildKbImageToken,
  countKbImageOccurrences,
  kbImageSizeInMarkdown,
  kbImageSizeStyle,
  normalizeKbImageSize,
  parseKbImageSrc,
  removeKbImageFromMarkdown,
  updateKbImageSizeInMarkdown,
} from "./kbImage";

const GUID = "11111111-2222-3333-4444-555555555555";

describe("kbImage — tamanho no título do token", () => {
  it("normaliza tamanhos aceitos e rejeita o resto", () => {
    expect(normalizeKbImageSize("50%")).toBe("50%");
    expect(normalizeKbImageSize("w=50%")).toBe("50%");
    expect(normalizeKbImageSize(" 420 ")).toBe("420");
    expect(normalizeKbImageSize("101%")).toBeNull();
    expect(normalizeKbImageSize("5000")).toBeNull();
    expect(normalizeKbImageSize("abc")).toBeNull();
    expect(normalizeKbImageSize("")).toBeNull();
    expect(normalizeKbImageSize(null)).toBeNull();
  });

  it("monta o token com e sem tamanho (src continua parseável)", () => {
    expect(buildKbImageToken(GUID, "Print")).toBe(`![Print](kbimage:${GUID})`);
    expect(buildKbImageToken(GUID, "Print", "50%")).toBe(
      `![Print](kbimage:${GUID} "w=50%")`,
    );
    // Tamanho inválido: token natural.
    expect(buildKbImageToken(GUID, "Print", "9999")).toBe(
      `![Print](kbimage:${GUID})`,
    );
    expect(parseKbImageSrc(`kbimage:${GUID}`)).toBe(GUID);
  });

  it("converte o título em largura CSS", () => {
    expect(kbImageSizeStyle("w=50%")).toEqual({ width: "50%" });
    expect(kbImageSizeStyle("w=420")).toEqual({ width: "420px" });
    expect(kbImageSizeStyle("80%")).toEqual({ width: "80%" });
    expect(kbImageSizeStyle(undefined)).toBeUndefined();
    expect(kbImageSizeStyle("999%")).toBeUndefined();
  });

  it("reescreve TODAS as ocorrências preservando o alt e o resto do texto", () => {
    const content =
      `Antes\n\n![Print](kbimage:${GUID})\n\n![Outro](kbimage:${GUID} "w=25%")\n\nDepois`;

    const sized = updateKbImageSizeInMarkdown(content, GUID, "50%");
    expect(countKbImageOccurrences(sized, GUID)).toBe(2);
    expect(sized).toContain(`![Print](kbimage:${GUID} "w=50%")`);
    expect(sized).toContain(`![Outro](kbimage:${GUID} "w=50%")`);
    expect(sized).toContain("Antes");
    expect(sized).toContain("Depois");

    // Voltar para natural remove o título sem perder as referências.
    const natural = updateKbImageSizeInMarkdown(sized, GUID, null);
    expect(natural).not.toContain("w=");
    expect(countKbImageOccurrences(natural, GUID)).toBe(2);
  });

  it("tolera título malformado (sufixo antes do parêntese)", () => {
    const malformed = `![a](kbimage:${GUID} "w=50%" extra)`;

    expect(countKbImageOccurrences(malformed, GUID)).toBe(1);
    expect(kbImageSizeInMarkdown(malformed, GUID)).toBe("50%");
    // Reescrever normaliza o token (o lixo do título sai).
    expect(updateKbImageSizeInMarkdown(malformed, GUID, "25%")).toBe(
      `![a](kbimage:${GUID} "w=25%")`,
    );
    expect(removeKbImageFromMarkdown(malformed, GUID)).not.toContain("kbimage");
  });

  it("lê o tamanho com aspas simples e ignora valor inválido no título", () => {
    expect(kbImageSizeInMarkdown(`![a](kbimage:${GUID} 'w=420')`, GUID)).toBe("420");
    expect(kbImageSizeInMarkdown(`![a](kbimage:${GUID} "w=999%")`, GUID)).toBeNull();
  });

  it("lê o tamanho atual do markdown", () => {
    expect(kbImageSizeInMarkdown(`![a](kbimage:${GUID} "w=75%")`, GUID)).toBe(
      "75%",
    );
    expect(kbImageSizeInMarkdown(`![a](kbimage:${GUID})`, GUID)).toBeNull();
    expect(kbImageSizeInMarkdown("", GUID)).toBeNull();
  });

  it("token sem fechar NÃO engole texto alheio (regressão de over-match)", () => {
    // O "![" órfão antes do token fazia o match atravessar linhas e o replace
    // apagava prosa inteira do artigo (perda silenciosa ao salvar).
    const content =
      `Texto ![ com colchete aberto\n\n![print](kbimage:${GUID}) e mais texto\n\nFim.`;

    const removed = removeKbImageFromMarkdown(content, GUID);
    expect(removed).toContain("com colchete aberto");
    expect(removed).toContain("e mais texto");
    expect(removed).toContain("Fim.");
    expect(countKbImageOccurrences(removed, GUID)).toBe(0);

    const stillThere = `![incompleto\nlinha 2\n![print](kbimage:${GUID}) fim`;
    expect(removeKbImageFromMarkdown(stillThere, GUID)).toContain("linha 2");
  });

  it("remove token sozinho em item de lista (bullet não fica vazio)", () => {
    const content = `- ![a](kbimage:${GUID})\n- outro item`;
    const removed = removeKbImageFromMarkdown(content, GUID);
    expect(removed).not.toContain("kbimage");
    expect(removed).toContain("- outro item");
    expect(removed).not.toMatch(/^-\s*$/m);
  });

  it("remove o token (com ou sem tamanho) sem tocar no resto", () => {
    const content = `Topo\n\n![a](kbimage:${GUID})\n\n![b](kbimage:${GUID} "w=50%")\n\nFim`;

    const removed = removeKbImageFromMarkdown(content, GUID);
    expect(countKbImageOccurrences(removed, GUID)).toBe(0);
    expect(removed).toContain("Topo");
    expect(removed).toContain("Fim");
  });
});
