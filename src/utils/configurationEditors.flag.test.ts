import { describe, expect, it } from "vitest";
import { isConfigFlagOn, validateFieldValue } from "./configurationEditors";

describe("isConfigFlagOn", () => {
  it("string \"true\" esta ligada", () => {
    expect(isConfigFlagOn("true")).toBe(true);
  });

  it("string \"false\" (ou qualquer outra) esta desligada", () => {
    expect(isConfigFlagOn("false")).toBe(false);
    expect(isConfigFlagOn("TRUE")).toBe(false);
    expect(isConfigFlagOn("1")).toBe(false);
    expect(isConfigFlagOn("sim")).toBe(false);
  });

  it("booleanos", () => {
    expect(isConfigFlagOn(true)).toBe(true);
    expect(isConfigFlagOn(false)).toBe(false);
  });

  it("valores vazios/nulos estao desligados", () => {
    expect(isConfigFlagOn(undefined)).toBe(false);
    expect(isConfigFlagOn(null)).toBe(false);
    expect(isConfigFlagOn("")).toBe(false);
    expect(isConfigFlagOn(0)).toBe(false);
    expect(isConfigFlagOn(1)).toBe(false);
  });
});
describe("objectStorageRegion (compatibilidade Cloudflare R2)", () => {
  it("aceita regiao em branco — R2 nao tem regiao", () => {
    expect(validateFieldValue("string", "", "objectStorageRegion")).toBe(true);
    expect(validateFieldValue("string", "   ", "objectStorageRegion")).toBe(true);
  });

  it("aceita regiao explicita e 'auto'", () => {
    expect(validateFieldValue("string", "auto", "objectStorageRegion")).toBe(true);
    expect(validateFieldValue("string", "sa-east-1", "objectStorageRegion")).toBe(true);
  });
});
