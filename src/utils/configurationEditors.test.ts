import { describe, expect, it } from "vitest";
import {
  AGENT_HOME_TAB_OPTIONS,
  APP_STORE_POLICY_LABELS,
  APP_STORE_POLICY_OPTIONS,
  buildServerDraft,
  clientEditableFields,
  fieldDefault,
  formatAppStorePolicyValue,
  getAgentHomeTabOptions,
  getDependentsToDisable,
  getFeatureDependencyIssue,
  isBooleanToggleField,
  parseFieldValue,
  serverEditableFields,
  siteEditableFields,
  toPatchPayloadValue,
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

describe("aba de Atualizações de Aplicativos (updatesTabEnabled)", () => {
  it("expõe o kill switch como boolean em servidor, cliente e site", () => {
    for (const [scope, fields] of scopes) {
      const field = fields.find((item) => item.key === "updatesTabEnabled");
      expect(field, `${scope} sem updatesTabEnabled`).toBeDefined();
      expect(field?.kind, `${scope} updatesTabEnabled não é boolean`).toBe("boolean");
      // O grupo "features" é o mesmo de windowsUpdateEnabled/appStorePolicy, para
      // o campo cair no card de funcionalidades (e não virar blob JSON).
      expect(field?.group, `${scope} updatesTabEnabled fora de features`).toBe("features");
      expect(field?.label).toBeTruthy();
      expect(field?.description).toBeTruthy();
    }
  });

  it("é desenhado como switch (kind boolean) e não como JSON", () => {
    const field = serverEditableFields.find(
      (item) => item.key === "updatesTabEnabled",
    );
    expect(field).toBeDefined();
    expect(isBooleanToggleField(field!)).toBe(true);
  });

  it("valida e envia apenas true/false no payload", () => {
    expect(validateFieldValue("boolean", "true", "updatesTabEnabled")).toBe(true);
    expect(validateFieldValue("boolean", "false", "updatesTabEnabled")).toBe(true);
    expect(validateFieldValue("boolean", "sim", "updatesTabEnabled")).not.toBe(true);
    expect(parseFieldValue("boolean", "true", "updatesTabEnabled")).toBe(true);
    expect(parseFieldValue("boolean", "false", "updatesTabEnabled")).toBe(false);
    expect(toPatchPayloadValue("boolean", true)).toBe(true);
  });

  it("fica junto de windowsUpdateEnabled no servidor", () => {
    const keys = serverEditableFields.map((item) => item.key);
    const updatesTabIndex = keys.indexOf("updatesTabEnabled");
    const windowsUpdateIndex = keys.indexOf("windowsUpdateEnabled");
    expect(updatesTabIndex).toBeGreaterThanOrEqual(0);
    expect(windowsUpdateIndex).toBeGreaterThanOrEqual(0);
    expect(Math.abs(updatesTabIndex - windowsUpdateIndex)).toBe(1);
  });
});

describe("dependências entre funcionalidades", () => {
  it("expõe Bootstrap P2P via Nuvem em servidor e cliente, mas não no site", () => {
    // O backend não tem override de site para cloud bootstrap: enviar o campo no
    // PATCH de site retorna 400 ("Campos não reconhecidos em Site").
    expect(
      serverEditableFields.some((field) => field.key === "cloudBootstrapEnabled"),
    ).toBe(true);
    expect(
      clientEditableFields.some((field) => field.key === "cloudBootstrapEnabled"),
    ).toBe(true);
    expect(
      siteEditableFields.some((field) => field.key === "cloudBootstrapEnabled"),
    ).toBe(false);
  });

  it("não expõe mais as configurações de auto-update de software", () => {
    // Campo removido do produto: atualizações de software são manuais.
    for (const [scope, fields] of scopes) {
      expect(
        fields.some((field) => field.key === "autoUpdateSettingsJson"),
        scope,
      ).toBe(false);
    }
  });

  it("expõe Zero-Touch em todos os escopos", () => {
    for (const [scope, fields] of scopes) {
      expect(
        fields.some((field) => field.key === "zeroTouchEnabled"),
        `${scope} sem zeroTouchEnabled`,
      ).toBe(true);
    }
  });

  it("bloqueia P2P sem descoberta nem cloud bootstrap", () => {
    expect(
      getFeatureDependencyIssue("p2PFilesEnabled", {
        discoveryEnabled: "false",
        cloudBootstrapEnabled: "false",
      }),
    ).toBeTruthy();
    expect(
      getFeatureDependencyIssue("p2PFilesEnabled", {
        discoveryEnabled: "true",
        cloudBootstrapEnabled: "false",
      }),
    ).toBeNull();
    expect(
      getFeatureDependencyIssue("p2PFilesEnabled", {
        discoveryEnabled: "false",
        cloudBootstrapEnabled: "true",
      }),
    ).toBeNull();
  });

  it("bloqueia zero-touch sem descoberta de rede", () => {
    expect(
      getFeatureDependencyIssue("zeroTouchEnabled", { discoveryEnabled: "false" }),
    ).toBeTruthy();
    expect(
      getFeatureDependencyIssue("zeroTouchEnabled", { discoveryEnabled: "true" }),
    ).toBeNull();
  });

  it("não bloqueia funcionalidades sem dependência", () => {
    expect(getFeatureDependencyIssue("chatAIEnabled", {})).toBeNull();
  });

  it("desativar a descoberta desliga P2P e Zero-Touch ativos", () => {
    const dependents = getDependentsToDisable("discoveryEnabled", {
      discoveryEnabled: "true",
      p2PFilesEnabled: "true",
      zeroTouchEnabled: "true",
      cloudBootstrapEnabled: "false",
    });
    expect(dependents.sort()).toEqual(["p2PFilesEnabled", "zeroTouchEnabled"]);
  });

  it("P2P sobrevive quando há cloud bootstrap como caminho alternativo", () => {
    expect(
      getDependentsToDisable("discoveryEnabled", {
        discoveryEnabled: "true",
        p2PFilesEnabled: "true",
        cloudBootstrapEnabled: "true",
      }),
    ).toEqual([]);
  });

  it("desativar o cloud desliga P2P quando não há descoberta", () => {
    expect(
      getDependentsToDisable("cloudBootstrapEnabled", {
        discoveryEnabled: "false",
        cloudBootstrapEnabled: "true",
        p2PFilesEnabled: "true",
      }),
    ).toEqual(["p2PFilesEnabled"]);
  });
});

describe("página inicial do agent (agentHomeTab)", () => {
  it("expõe exatamente os ids aceitos pela API, em ordem", () => {
    expect(AGENT_HOME_TAB_OPTIONS.map((option) => option.value)).toEqual([
      "status",
      "store",
      "updates",
      "chat",
      "support",
      "knowledge",
    ]);
  });

  it("declara o campo agentHomeTab como select nas três listas", () => {
    for (const [scope, fields] of scopes) {
      const field = fields.find((item) => item.key === "agentHomeTab");
      expect(field, `${scope} sem agentHomeTab`).toBeDefined();
      expect(field?.kind, `${scope} agentHomeTab não é select`).toBe("select");
      expect(field?.options).toBe(AGENT_HOME_TAB_OPTIONS);
    }
  });

  it("exige que uma aba tenha sido escolhida (a lista válida é do servidor)", () => {
    expect(validateFieldValue("select", "support")).toBe(true);
    expect(validateFieldValue("select", "chat")).toBe(true);
    // Um id fora da lista local ainda é aceito aqui: o servidor é a autoridade
    // e a lista publicada na metadata pode evoluir sem release do console.
    expect(validateFieldValue("select", "futureTab")).toBe(true);
    expect(validateFieldValue("select", "")).not.toBe(true);
    expect(typeof validateFieldValue("select", "")).toBe("string");
  });

  it("monta as opções a partir do catálogo publicado pelo servidor", () => {
    expect(getAgentHomeTabOptions(["knowledge", "chat"])).toEqual([
      { value: "knowledge", label: "Base de Conhecimento" },
      { value: "chat", label: "Chat IA" },
    ]);
  });

  it("usa o id como rótulo para valor novo e cai no fallback local sem lista", () => {
    expect(getAgentHomeTabOptions(["futureTab"])).toEqual([
      { value: "futureTab", label: "futureTab" },
    ]);
    expect(getAgentHomeTabOptions([])).toEqual(AGENT_HOME_TAB_OPTIONS);
    expect(getAgentHomeTabOptions(undefined)).toEqual(AGENT_HOME_TAB_OPTIONS);
  });

  it("normaliza o id escolhido no payload", () => {
    expect(parseFieldValue("select", " chat ")).toBe("chat");
  });

  it("usa status como default", () => {
    expect(fieldDefault("select")).toBe("status");
  });
});

describe("validação de TicketAttachmentSettingsJson", () => {
  const base = {
    enabled: true,
    maxFileSizeBytes: 10485760,
    maxLargeFileSizeBytes: 2147483648,
    allowedContentTypes: ["image/png"],
    presignedUploadUrlTtlMinutes: 15,
  };

  it("aceita o payload completo com maxLargeFileSizeBytes", () => {
    expect(
      validateFieldValue(
        "json",
        JSON.stringify(base),
        "ticketAttachmentSettingsJson",
      ),
    ).toBe(true);
  });

  it("mantém retrocompatibilidade quando maxLargeFileSizeBytes está ausente", () => {
    const { maxLargeFileSizeBytes: _omit, ...legacy } = base;
    expect(
      validateFieldValue(
        "json",
        JSON.stringify(legacy),
        "ticketAttachmentSettingsJson",
      ),
    ).toBe(true);
  });

  it("rejeita maxLargeFileSizeBytes menor que maxFileSizeBytes", () => {
    const result = validateFieldValue(
      "json",
      JSON.stringify({ ...base, maxLargeFileSizeBytes: 1024 * 1024 }),
      "ticketAttachmentSettingsJson",
    );
    expect(result).not.toBe(true);
    expect(String(result)).toMatch(/MaxLargeFileSizeBytes/);
  });

  it("rejeita maxLargeFileSizeBytes acima de 10GB", () => {
    const result = validateFieldValue(
      "json",
      JSON.stringify({ ...base, maxLargeFileSizeBytes: 11 * 1024 * 1024 * 1024 }),
      "ticketAttachmentSettingsJson",
    );
    expect(result).not.toBe(true);
  });

  it("aceita maxLargeFileSizeBytes igual ao limite das conversas", () => {
    expect(
      validateFieldValue(
        "json",
        JSON.stringify({
          ...base,
          maxFileSizeBytes: 1024 * 1024 * 1024,
          maxLargeFileSizeBytes: 1024 * 1024 * 1024,
        }),
        "ticketAttachmentSettingsJson",
      ),
    ).toBe(true);
  });

});

describe("configuração global dos sensores (SensorsSettingsJson)", () => {
  it("expõe o campo no escopo do servidor como JSON", () => {
    const field = serverEditableFields.find(
      (candidate) => candidate.key === "SensorsSettingsJson",
    );

    expect(field).toBeDefined();
    expect(field?.kind).toBe("json");
  });

  it("aceita o payload completo dos sensores", () => {
    const payload = JSON.stringify({
      enabled: true,
      defaultIntervalSeconds: 300,
      autoTicketEnabled: true,
      notifyEnabled: true,
    });

    expect(validateFieldValue("json", payload, "SensorsSettingsJson")).toBe(
      true,
    );
  });

  it("rejeita JSON sintaticamente inválido", () => {
    expect(
      validateFieldValue("json", "{ enabled: true }", "SensorsSettingsJson"),
    ).not.toBe(true);
  });

  it("interpreta campo vazio como objeto vazio", () => {
    // parseFieldValue devolve o valor JÁ parseado (objeto), não a string JSON.
    expect(parseFieldValue("json", "", "SensorsSettingsJson")).toEqual({});
  });
});

/**
 * Bug de produção (HTTP 400 no toggle de "Sensores de Monitoramento"):
 * o grupo "features" mistura switches (kind boolean) com blob JSON
 * (SensorsSettingsJson, kind json). A página roteava o render por GROUP e
 * desenhava o campo JSON como switch; ao alternar, o PATCH mandava `true`
 * para uma propriedade string e o backend explodia em JsonElement.GetString().
 */
describe("campos do grupo features com kind json nao sao toggles", () => {
  const featureFields = serverEditableFields.filter((field) => field.group === "features");
  const featureToggleFields = featureFields.filter((field) => isBooleanToggleField(field));
  const featureJsonFields = featureFields.filter((field) => field.kind === "json");
  const sensorsField = serverEditableFields.find(
    (field) => field.key === "SensorsSettingsJson",
  );

  it("isBooleanToggleField aceita só kind boolean", () => {
    expect(sensorsField).toBeDefined();
    expect(isBooleanToggleField(sensorsField!)).toBe(false);

    const recoveryField = serverEditableFields.find((field) => field.key === "recoveryEnabled");
    expect(recoveryField).toBeDefined();
    expect(isBooleanToggleField(recoveryField!)).toBe(true);
  });

  it("SensorsSettingsJson cai em featureJsonFields e nunca em featureToggleFields", () => {
    expect(featureJsonFields.map((field) => field.key)).toContain("SensorsSettingsJson");
    expect(featureToggleFields.map((field) => field.key)).not.toContain("SensorsSettingsJson");
    // O contador de "módulos ativos" só considera toggles: o blob JSON fica fora.
    expect(featureToggleFields.length).toBe(featureFields.length - featureJsonFields.length);
  });

  it("serializa o payload do campo JSON como STRING para o PATCH", () => {
    const parsed = parseFieldValue(
      "json",
      JSON.stringify({
        enabled: false,
        defaultIntervalSeconds: 600,
        autoTicketEnabled: true,
        notifyEnabled: false,
      }),
      "SensorsSettingsJson",
    );

    // parseFieldValue continua devolvendo OBJETO (contrato do formulário).
    expect(typeof parsed).toBe("object");

    const payload = toPatchPayloadValue("json", parsed);
    expect(typeof payload).toBe("string");
    expect(JSON.parse(payload as string)).toEqual({
      enabled: false,
      defaultIntervalSeconds: 600,
      autoTicketEnabled: true,
      notifyEnabled: false,
    });
  });

  it("não re-serializa strings já prontas (lockedFieldsJson) e preserva booleanos", () => {
    // lockedFieldsJson sai STRING de parseFieldValue: re-encodar gravaria "[]" literal.
    const locked = parseFieldValue("json", "", "lockedFieldsJson");
    expect(locked).toBe("[]");
    expect(toPatchPayloadValue("json", locked)).toBe("[]");

    // Toggles continuam indo como booleano (não viram "true" string).
    expect(toPatchPayloadValue("boolean", true)).toBe(true);
    expect(toPatchPayloadValue("number", 30)).toBe(30);
  });
});

