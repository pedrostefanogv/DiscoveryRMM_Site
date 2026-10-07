import { describe, expect, it } from "vitest";
import {
  APP_STORE_POLICY_LABELS,
  APP_STORE_POLICY_OPTIONS,
  buildServerDraft,
  clientEditableFields,
  formatAppStorePolicyValue,
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

describe("política da loja de aplicativos", () => {
  it("expõe exatamente as três opções suportadas pelo backend (0/1/2)", () => {
    expect(APP_STORE_POLICY_OPTIONS.map((option) => option.value)).toEqual([
      "0",
      "1",
      "2",
    ]);
  });

  it("não exibe caracteres corrompidos (?) nos rótulos das opções", () => {
    const corrupted = APP_STORE_POLICY_OPTIONS.map((option) => option.label).filter(
      (label) => label.includes("?") || label.includes("\uFFFD"),
    );
    expect(corrupted).toEqual([]);
  });

  it("valida apenas 0, 1 e 2", () => {
    expect(validateFieldValue("policy", "0", "appStorePolicy")).toBe(true);
    expect(validateFieldValue("policy", "1", "appStorePolicy")).toBe(true);
    expect(validateFieldValue("policy", "2", "appStorePolicy")).toBe(true);
    expect(validateFieldValue("policy", "3", "appStorePolicy")).not.toBe(true);
    expect(validateFieldValue("policy", "", "appStorePolicy")).not.toBe(true);
  });

  it("envia a política como número no payload", () => {
    expect(parseFieldValue("policy", "1", "appStorePolicy")).toBe(1);
  });

  it("usa PreApproved (1) quando o servidor não devolve a política", () => {
    const draft = buildServerDraft(undefined, serverEditableFields);
    expect(draft.appStorePolicy).toBe("1");
  });

  it("normaliza o enum em string devolvido pela API", () => {
    const draft = buildServerDraft(
      { appStorePolicy: "Disabled" } as never,
      serverEditableFields,
    );
    expect(draft.appStorePolicy).toBe("0");
  });

  it("formata rótulos legíveis a partir de número ou nome do enum", () => {
    expect(formatAppStorePolicyValue(0)).toBe(APP_STORE_POLICY_LABELS[0]);
    expect(formatAppStorePolicyValue(2)).toBe(APP_STORE_POLICY_LABELS[2]);
    expect(formatAppStorePolicyValue("PreApproved")).toBe(APP_STORE_POLICY_LABELS[1]);
    expect(formatAppStorePolicyValue("1")).toBe(APP_STORE_POLICY_LABELS[1]);
    expect(formatAppStorePolicyValue(null)).toBe("");
  });
});
