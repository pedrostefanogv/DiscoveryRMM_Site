import { describe, expect, it } from "vitest";
import {
  applyFieldMask,
  fieldMaskPlaceholder,
  fieldMaskTokenCount,
  isFieldMaskComplete,
  maskNumericDraft,
  normalizeNumericDraft,
} from "./fieldMask";

describe("applyFieldMask", () => {
  it("formata CPF e descarta caracteres não numéricos", () => {
    expect(applyFieldMask("999.999.999-99", "12345678901")).toBe("123.456.789-01");
    expect(applyFieldMask("999.999.999-99", "123.456.789-01")).toBe("123.456.789-01");
    expect(applyFieldMask("999.999.999-99", "12a34")).toBe("123.4");
  });

  it("formata letras e números (preserva a caixa)", () => {
    expect(applyFieldMask("AA-9999", "ab1234")).toBe("ab-1234");
    expect(applyFieldMask("AA-9999", "AB1234")).toBe("AB-1234");
  });

  it("não quebra com máscara parcialmente preenchida", () => {
    expect(applyFieldMask("(99) 99999-9999", "119")).toBe("(11) 9");
  });

  it("sem máscara devolve o valor original", () => {
    expect(applyFieldMask(null, "qualquer coisa")).toBe("qualquer coisa");
    expect(applyFieldMask("  ", "texto")).toBe("texto");
  });
});

describe("normalizeNumericDraft", () => {
  it("converte pt-BR mascarado em número parseável", () => {
    expect(normalizeNumericDraft("R$ 1.234,56")).toBe("1234.56");
    expect(normalizeNumericDraft("R$ 1.234.567,89")).toBe("1234567.89");
    expect(normalizeNumericDraft("99,9")).toBe("99.9");
  });

  it("mantém formato en-US e aceita valores negativos", () => {
    expect(normalizeNumericDraft("1234.56")).toBe("1234.56");
    expect(normalizeNumericDraft("1,234.56")).toBe("1234.56");
    expect(normalizeNumericDraft("-42")).toBe("-42");
  });

  it("devolve vazio quando não há dígito", () => {
    expect(normalizeNumericDraft("")).toBe("");
    expect(normalizeNumericDraft("R$")).toBe("");
    expect(normalizeNumericDraft(null)).toBe("");
  });
});

describe("maskNumericDraft", () => {
  it("formata valor decimal com a máscara de moeda", () => {
    expect(maskNumericDraft("R$ 9.999.999,99", "1234.56")).toBe("R$ 1.234,56");
    expect(maskNumericDraft("R$ 9.999.999,99", "R$ 1.234,56")).toBe("R$ 1.234,56");
    expect(maskNumericDraft("R$ 9.999.999,99", "1000000")).toBe("R$ 1.000.000,00");
  });

  it("sem máscara devolve o valor normalizado", () => {
    expect(maskNumericDraft(null, "1.234,56")).toBe("1234.56");
    expect(maskNumericDraft(" ", "1.234,56")).toBe("1234.56");
  });

  it("vazio continua vazio", () => {
    expect(maskNumericDraft("R$ 9.999.999,99", "")).toBe("");
  });
});

describe("fieldMaskPlaceholder / token count / completude", () => {
  it("gera exemplo visual", () => {
    expect(fieldMaskPlaceholder("999.999.999-99")).toBe("000.000.000-00");
  });

  it("conta posições preenchíveis", () => {
    expect(fieldMaskTokenCount("999.999.999-99")).toBe(11);
    expect(fieldMaskTokenCount(null)).toBe(0);
  });

  it("detecta máscara completa", () => {
    expect(isFieldMaskComplete("999.999.999-99", "12345678901")).toBe(true);
    expect(isFieldMaskComplete("999.999.999-99", "123")).toBe(false);
    expect(isFieldMaskComplete(null, "123")).toBe(true);
  });
});
