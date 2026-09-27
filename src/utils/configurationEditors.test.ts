import { describe, expect, it } from "vitest";
import {
  clientEditableFields,
  parseFieldValue,
  serverEditableFields,
  siteEditableFields,
  validateFieldValue,
} from "./configurationEditors";

const scopes = [
  ["server", serverEditableFields],
  ["client", clientEditableFields],
  ["site", siteEditableFields],
] as const;

const allFields = scopes.flatMap(([, fields]) => fields);

describe("catálogo de campos de configuração", () => {
  it("não possui chaves duplicadas em nenhum escopo", () => {
    for (const [scope, fields] of scopes) {
      const keys = fields.map((field) => field.key);
      expect(new Set(keys).size, `${scope} possui chave duplicada`).toBe(keys.length);
    }
  });

  it("não referencia campos de MeshCentral (código morto removido)", () => {
    const meshFields = allFields.filter((field) => /mesh/i.test(field.key));
    expect(meshFields.map((field) => field.key)).toEqual([]);
  });

  it("usa agentOnlineGraceSeconds (propriedade real da API)", () => {
    expect(allFields.some((field) => field.key === "agentOnlineGraceSeconds")).toBe(true);
    expect(allFields.some((field) => field.key === "agentOfflineThresholdSeconds")).toBe(false);
  });

  it("valida a faixa de agentOnlineGraceSeconds em 60..3600", () => {
    expect(validateFieldValue("number", "59", "agentOnlineGraceSeconds")).not.toBe(true);
    expect(validateFieldValue("number", "60", "agentOnlineGraceSeconds")).toBe(true);
    expect(validateFieldValue("number", "3600", "agentOnlineGraceSeconds")).toBe(true);
    expect(validateFieldValue("number", "3601", "agentOnlineGraceSeconds")).not.toBe(true);
  });

  it("converte agentOnlineGraceSeconds para número no payload", () => {
    expect(parseFieldValue("number", "120", "agentOnlineGraceSeconds")).toBe(120);
  });

  it("mantém o campo de processamento em segundo plano apenas uma vez no servidor", () => {
    const occurrences = serverEditableFields.filter(
      (field) => field.key === "backgroundProcessingSettingsJson",
    );
    expect(occurrences).toHaveLength(1);
  });
});
