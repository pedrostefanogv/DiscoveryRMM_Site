import { describe, expect, it } from "vitest";
import {
  applyFieldMask,
  fieldMaskPlaceholder,
  fieldMaskTokenCount,
  isFieldMaskComplete,
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
