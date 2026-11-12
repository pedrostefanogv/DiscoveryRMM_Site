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
  REALTIME_CONTRACT_MODE_OPTIONS,
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

/**
 * B4: o backend tornou KnowledgeEmbeddingEnabled um kill switch real e herdável
 * (servidor → cliente → site). A entrada na UI precisa ser um TOGGLE nos três
 * escopos — se virasse "json" o PATCH mandaria um blob para uma propriedade
 * bool e a API devolveria 400.
 */
describe("embeddings da base de conhecimento (knowledgeEmbeddingEnabled)", () => {
  it("expõe o kill switch como boolean em servidor, cliente e site", () => {
    for (const [scope, fields] of scopes) {
      const field = fields.find((item) => item.key === "knowledgeEmbeddingEnabled");
      expect(field, `${scope} sem knowledgeEmbeddingEnabled`).toBeDefined();
      expect(field?.kind, `${scope} knowledgeEmbeddingEnabled não é boolean`).toBe("boolean");
      expect(field?.group, `${scope} knowledgeEmbeddingEnabled fora de features`).toBe("features");
      expect(field?.label).toBeTruthy();
      expect(field?.description).toBeTruthy();
    }
  });

  it("é desenhado como switch (kind boolean) e não como JSON", () => {
    const field = serverEditableFields.find(
      (item) => item.key === "knowledgeEmbeddingEnabled",
    );
    expect(field).toBeDefined();
    expect(isBooleanToggleField(field!)).toBe(true);
    expect(field!.kind).not.toBe("json");
  });

  it("valida e envia apenas true/false no payload", () => {
    expect(validateFieldValue("boolean", "true", "knowledgeEmbeddingEnabled")).toBe(true);
    expect(validateFieldValue("boolean", "false", "knowledgeEmbeddingEnabled")).toBe(true);
    expect(validateFieldValue("boolean", "sim", "knowledgeEmbeddingEnabled")).not.toBe(true);
    expect(parseFieldValue("boolean", "true", "knowledgeEmbeddingEnabled")).toBe(true);
    expect(parseFieldValue("boolean", "false", "knowledgeEmbeddingEnabled")).toBe(false);
    expect(toPatchPayloadValue("boolean", true)).toBe(true);
  });

  it("aparece exatamente uma vez por escopo", () => {
    for (const [scope, fields] of scopes) {
      const occurrences = fields.filter(
        (field) => field.key === "knowledgeEmbeddingEnabled",
      );
      expect(occurrences, `${scope} duplicou knowledgeEmbeddingEnabled`).toHaveLength(1);
    }
  });

  it("não tem dependência de descoberta/zero-touch (o job não os requer)", () => {
    // Diferente do P2P e do Zero-Touch: o job de embeddings roda no servidor e
    // não depende de discoveryEnabled — não pode entrar em FEATURE_DEPENDENCIES.
    expect(
      getFeatureDependencyIssue("knowledgeEmbeddingEnabled", {
        discoveryEnabled: "false",
        zeroTouchEnabled: "false",
      }),
    ).toBeNull();
    expect(
      getDependentsToDisable("discoveryEnabled", {
        discoveryEnabled: "true",
        knowledgeEmbeddingEnabled: "true",
      }),
    ).toEqual([]);
  });

  it("descreve que o gate é de agendamento e exige restart", () => {
    const field = serverEditableFields.find(
      (item) => item.key === "knowledgeEmbeddingEnabled",
    );
    // A UI não pode prometer efeito imediato: o Quartz decide no startup.
    expect(field?.description?.toLowerCase()).toContain("reiniciar");
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
  // O grupo "features" agora também tem campos NUMÉRICOS (McpToolCallsPerMinute),
  // que não são toggles nem blob JSON. São renderizados em bloco próprio na
  // ServerConfigurationPage e ficam fora do contador de "módulos ativos".
  const featureNumberFields = featureFields.filter((field) => field.kind === "number");
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
    // O contador de "módulos ativos" só considera toggles: o blob JSON e os
    // campos numéricos ficam fora. A asserção continua EXATA (deriva as outras
    // categorias) para pegar qualquer campo que deixe de ser renderizado.
    expect(featureToggleFields.length).toBe(
      featureFields.length - featureJsonFields.length - featureNumberFields.length,
    );
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

/**
 * CFG-A / task-11: os 10 kill switches do GRUPO A da auditoria
 * (_verificacao_pendencias/AUDITORIA_APPSETTINGS_VS_UI.md) passaram a ter UI.
 *
 * Antes só existiam no appsettings.json: ligar/desligar exigia editar o arquivo
 * no servidor. Estes testes travam o contrato que o backend (task-10) publicou,
 * porque uma divergência de nome/kind NÃO dá erro de compilação — o toggle
 * aparece na tela e o PATCH volta 400 (ou pior, o campo nem aparece, pois a UI
 * só renderiza o que está no catálogo).
 */
describe("kill switches de feature (GRUPO A da auditoria)", () => {
  /** Os 7 que HERDAM servidor -> cliente -> site (bool? em Client/Site). */
  const INHERITABLE_KEYS = [
    "departmentAuthShadowMode",
    "pushEnabled",
    "wingetCatalogEnabled",
    "remoteAccessEnabled",
    "remoteAccessRecordingEnabled",
    "remoteAccessRecordingAutoDeleteExpired",
    "automaticLoggingEnabled",
  ] as const;

  /**
   * Os 3 que existem SÓ no servidor. Não têm bool? em Client/Site: mandá-los no
   * PATCH de cliente/site devolve 400 ("Campos não reconhecidos").
   */
  const SERVER_ONLY_KEYS = [
    "openTelemetryEnabled",
    "migrationsRunOnStartup",
    "realtimeContractMode",
  ] as const;

  const ALL_KEYS = [...INHERITABLE_KEYS, ...SERVER_ONLY_KEYS];

  const findField = (fields: typeof serverEditableFields, key: string) =>
    fields.find((field) => field.key === key);

  it("expõe os 10 campos no escopo do servidor", () => {
    for (const key of ALL_KEYS) {
      expect(
        findField(serverEditableFields, key),
        `servidor sem ${key}`,
      ).toBeDefined();
    }
  });

  it("expõe os 7 herdáveis em servidor, cliente e site", () => {
    for (const key of INHERITABLE_KEYS) {
      for (const [scope, fields] of scopes) {
        expect(findField(fields, key), `${scope} sem ${key}`).toBeDefined();
      }
    }
  });

  it("NÃO expõe os 3 campos de servidor em cliente/site", () => {
    // openTelemetryEnabled/realtimeContractMode/migrationsRunOnStartup são do
    // servidor inteiro (pipeline de telemetria, contrato global do dashboard e
    // schema do banco): não herdam por cliente/site e o PATCH seria recusado.
    for (const key of SERVER_ONLY_KEYS) {
      expect(
        findField(clientEditableFields, key),
        `cliente não deveria ter ${key}`,
      ).toBeUndefined();
      expect(
        findField(siteEditableFields, key),
        `site não deveria ter ${key}`,
      ).toBeUndefined();
    }
  });

  it("aparece exatamente uma vez por escopo (sem duplicar o campo)", () => {
    for (const [scope, fields] of scopes) {
      for (const key of ALL_KEYS) {
        const occurrences = fields.filter((field) => field.key === key);
        const expected = SERVER_ONLY_KEYS.includes(
          key as (typeof SERVER_ONLY_KEYS)[number],
        )
          ? scope === "server"
            ? 1
            : 0
          : 1;
        expect(occurrences, `${scope} duplicou/omitiu ${key}`).toHaveLength(
          expected,
        );
      }
    }
  });

  it("usa kind boolean (nunca json) nos 9 switches — o bug do SensorsSettingsJson", () => {
    // O grupo "features" mistura switches com blob JSON. Se um kill switch
    // nascer como "json" o PATCH manda um blob para uma propriedade bool e o
    // backend devolve 400 — exatamente o incidente do SensorsSettingsJson.
    const booleanKeys = ALL_KEYS.filter((key) => key !== "realtimeContractMode");

    for (const key of booleanKeys) {
      const field = findField(serverEditableFields, key);
      expect(field, key).toBeDefined();
      expect(field?.kind, `${key} não é boolean`).toBe("boolean");
      expect(isBooleanToggleField(field!), `${key} não roteia como switch`).toBe(
        true,
      );
      // Em client/site (os herdáveis) o kind precisa ser o mesmo.
      if (!SERVER_ONLY_KEYS.includes(key as (typeof SERVER_ONLY_KEYS)[number])) {
        expect(findField(clientEditableFields, key)?.kind, key).toBe("boolean");
        expect(findField(siteEditableFields, key)?.kind, key).toBe("boolean");
      }
    }
  });

  it("departmentAuthShadowMode é BOOLEAN, não select (o PATCH manda bool)", () => {
    // O estado Observação/Ativo é o MESMO booleano ShadowMode do backend
    // (TicketsController.cs:1141 deriva canTreat dele). Um "select" mandaria
    // string no PATCH e a API recusaria.
    const field = findField(serverEditableFields, "departmentAuthShadowMode");
    expect(field?.kind).toBe("boolean");
    expect(field?.options).toBeUndefined();
  });

  it("realtimeContractMode é select com os 3 valores aceitos pelo backend", () => {
    const field = findField(serverEditableFields, "realtimeContractMode");
    expect(field?.kind).toBe("select");
    // Valores EXATOS do appsettings/RealtimeContractOptions.
    expect(field?.options?.map((option) => option.value)).toEqual([
      "auto",
      "strict",
      "legacy",
    ]);
    expect(REALTIME_CONTRACT_MODE_OPTIONS).toBe(field?.options);
  });

  it("realtimeContractMode valida o preenchimento e envia string no payload", () => {
    expect(validateFieldValue("select", "auto", "realtimeContractMode")).toBe(true);
    expect(validateFieldValue("select", "strict", "realtimeContractMode")).toBe(true);
    expect(validateFieldValue("select", "legacy", "realtimeContractMode")).toBe(true);
    const empty = validateFieldValue("select", "", "realtimeContractMode");
    expect(empty).not.toBe(true);
    // A mensagem precisa falar do campo certo, não da aba do agent.
    expect(String(empty)).toMatch(/realtime/i);
    // String, nunca booleano: a propriedade no backend é string?.
    expect(parseFieldValue("select", "strict", "realtimeContractMode")).toBe("strict");
    expect(toPatchPayloadValue("select", "strict")).toBe("strict");
  });

  it("não assume 'status' como default do select de realtime", () => {
    // fieldDefault era fixo em "status" (default do agentHomeTab): qualquer
    // outro select nascia inválido e o PATCH era recusado.
    const field = findField(serverEditableFields, "realtimeContractMode");
    expect(fieldDefault("select", field!)).toBe("auto");
    // O default histórico do agentHomeTab continua valendo para ele.
    const homeTab = findField(serverEditableFields, "agentHomeTab");
    expect(fieldDefault("select", homeTab!)).toBe("status");
    // Sem field informado, mantém o comportamento anterior.
    expect(fieldDefault("select")).toBe("status");
  });

  it("defaults do draft espelham o appsettings de hoje (zero surpresa)", () => {
    // O draft sem dados do servidor é o que a tela mostra antes da resposta.
    // fieldDefault devolvia "false" para TODO booleano: com 9 dos 10 ligados no
    // appsettings, abrir a configuração mostraria tudo desligado — e salvar
    // desligaria features ativas em produção.
    const draft = buildServerDraft(undefined, serverEditableFields);

    const expected: Record<string, string> = {
      departmentAuthShadowMode: "true",
      pushEnabled: "true",
      wingetCatalogEnabled: "true",
      remoteAccessEnabled: "true",
      remoteAccessRecordingEnabled: "true",
      remoteAccessRecordingAutoDeleteExpired: "true",
      automaticLoggingEnabled: "true",
      migrationsRunOnStartup: "true",
      // Estava "false" no appsettings: expor não pode ligar telemetria sozinho.
      openTelemetryEnabled: "false",
      realtimeContractMode: "auto",
    };

    for (const [key, value] of Object.entries(expected)) {
      expect(draft[key], `default de ${key}`).toBe(value);
    }
  });

  it("declara defaultValue explícito em todo kill switch que não seja false", () => {
    // Sem defaultValue o fallback é "false" (fieldDefault). Só é aceitável
    // quando o default REAL do backend também é false (openTelemetryEnabled).
    for (const key of ALL_KEYS) {
      const field = findField(serverEditableFields, key);
      expect(field?.defaultValue, `${key} sem defaultValue`).toBeDefined();
      expect(field?.defaultValue?.length, `${key} defaultValue vazio`).toBeGreaterThan(0);
      if (key === "openTelemetryEnabled") {
        expect(field?.defaultValue).toBe("false");
      } else {
        expect(field?.defaultValue, `${key} não pode cair no "false"`).not.toBe("false");
      }
    }
  });

  it("mantém o mesmo defaultValue nos escopos herdáveis", () => {
    // O valor exibido ao herdar precisa ser o mesmo nos três escopos, senão a
    // tela do cliente mostraria um estado diferente do servidor.
    for (const key of INHERITABLE_KEYS) {
      const server = findField(serverEditableFields, key)?.defaultValue;
      expect(findField(clientEditableFields, key)?.defaultValue, key).toBe(server);
      expect(findField(siteEditableFields, key)?.defaultValue, key).toBe(server);
    }
  });

  it("não entra em FEATURE_DEPENDENCIES (nenhum depende de discovery/zero-touch)", () => {
    // Diferente de p2PFilesEnabled/zeroTouchEnabled: estes switches não exigem
    // caminho de descoberta. Registrar dependência aqui desabilitaria o toggle
    // na tela quando a descoberta estivesse desligada.
    for (const key of ALL_KEYS) {
      expect(
        getFeatureDependencyIssue(key, {
          discoveryEnabled: "false",
          cloudBootstrapEnabled: "false",
          zeroTouchEnabled: "false",
        }),
        `${key} não deveria ter dependência`,
      ).toBeNull();
    }

    const dependents = getDependentsToDisable("discoveryEnabled", {
      discoveryEnabled: "true",
      p2PFilesEnabled: "false",
      zeroTouchEnabled: "false",
      ...Object.fromEntries(ALL_KEYS.map((key) => [key, "true"])),
    });
    for (const key of ALL_KEYS) {
      expect(dependents, `${key} foi desligado junto`).not.toContain(key);
    }
  });

  it("todos têm label e description não vazios", () => {
    for (const key of ALL_KEYS) {
      const field = findField(serverEditableFields, key);
      expect(field?.label, `${key} sem label`).toBeTruthy();
      expect(field?.description, `${key} sem description`).toBeTruthy();
      expect(field?.description?.trim().length, `${key} description vazia`).toBeGreaterThan(
        40,
      );
    }
  });

  it("DepartmentAuth explica o risco de bloquear todos e o efeito imediato", () => {
    const description =
      findField(serverEditableFields, "departmentAuthShadowMode")?.description ?? "";
    // O aviso é obrigatório: ligar o modo Ativo sem popular os times bloqueia
    // quem não tem acesso global.
    expect(description).toMatch(/BLOQUEIA TODOS/i);
    expect(description).toMatch(/Observa[çc][ãa]o/i);
    expect(description).toMatch(/Ativo/i);
    // Este campo NÃO exige restart: a TicketAccessPolicy resolve o valor
    // direto da configuração do servidor a cada negação (com cache), então a
    // troca Observação->Ativo vale na hora. A UI não pode prometer restart,
    // senão o operador acha que precisa reiniciar para medir o efeito.
    expect(description.toLowerCase()).toContain("efeito imediato");
    // A frase é "não exige reiniciar a API": o operador lê que NÃO precisa
    // reiniciar. O que não pode aparecer é a promessa antiga de que reiniciar
    // é obrigatório.
    expect(description.toLowerCase()).toContain("não exige reiniciar");
  });

  it("migrationsRunOnStartup avisa do schema desatualizado e exige restart", () => {
    const description =
      findField(serverEditableFields, "migrationsRunOnStartup")?.description ?? "";
    expect(description).toMatch(/schema desatualizado/i);
    expect(description).toMatch(/boot|inicializa/i);
    expect(description.toLowerCase()).toContain("reiniciar");
  });

  it("realtimeContractMode avisa que strict pode quebrar o dashboard", () => {
    const description =
      findField(serverEditableFields, "realtimeContractMode")?.description ?? "";
    expect(description).toMatch(/estrito/i);
    expect(description).toMatch(/legado/i);
    expect(description).toMatch(/dashboard/i);
    expect(description.toLowerCase()).toContain("reiniciar");
  });

  it("openTelemetryEnabled avisa que exige coletor OTLP", () => {
    const description =
      findField(serverEditableFields, "openTelemetryEnabled")?.description ?? "";
    expect(description).toMatch(/OTLP/i);
    expect(description).toMatch(/coletor/i);
    expect(description.toLowerCase()).toContain("reiniciar");
  });

  it("campos herdáveis avisam que vazio herda do nível acima", () => {
    for (const key of INHERITABLE_KEYS) {
      expect(
        findField(clientEditableFields, key)?.description?.toLowerCase(),
        `cliente ${key} não menciona herança`,
      ).toContain("herda");
      expect(
        findField(siteEditableFields, key)?.description?.toLowerCase(),
        `site ${key} não menciona herança`,
      ).toContain("herda");
    }
  });

  it("não reintroduz McpToolPolicyJson nem campos legados", () => {
    // ConfigurationFieldCatalog.cs:22-25 marca esse campo como legado; o
    // catálogo do frontend não deve trazê-lo de volta.
    for (const [scope, fields] of scopes) {
      expect(
        fields.some((field) => /mcptoolpolicyjson/i.test(field.key)),
        scope,
      ).toBe(false);
    }
  });
});

/**
 * Teto GLOBAL herdável de chamadas de ferramentas MCP do chat IA por minuto
 * (McpToolCallsPerMinute no backend). O nome da chave NÃO pode divergir do
 * backend: como o PATCH é por nome de propriedade, um erro de digitação aparece
 * na tela e a API devolve 400 (ou ignora o campo).
 */
describe("teto global de chamadas de tools MCP (McpToolCallsPerMinute)", () => {
  it("expõe o campo como number em servidor, cliente e site", () => {
    for (const [scope, fields] of scopes) {
      const field = fields.find((item) => item.key === "McpToolCallsPerMinute");
      expect(field, `${scope} sem McpToolCallsPerMinute`).toBeDefined();
      expect(field?.kind, `${scope} McpToolCallsPerMinute não é number`).toBe("number");
      expect(field?.group, `${scope} McpToolCallsPerMinute fora de features`).toBe("features");
      expect(field?.unit, `${scope} sem unidade`).toBe("chamadas/min");
      expect(field?.label).toBeTruthy();
      expect(field?.description).toBeTruthy();
    }
  });

  it("aparece exatamente uma vez por escopo", () => {
    for (const [scope, fields] of scopes) {
      expect(
        fields.filter((field) => field.key === "McpToolCallsPerMinute"),
        `${scope} duplicou McpToolCallsPerMinute`,
      ).toHaveLength(1);
    }
  });

  it("é renderizável: number não vira toggle nem blob JSON", () => {
    const field = serverEditableFields.find(
      (item) => item.key === "McpToolCallsPerMinute",
    );
    expect(field).toBeDefined();
    expect(isBooleanToggleField(field!)).toBe(false);
    expect(field!.kind).not.toBe("json");
  });

  it("valida a faixa 1..600 e recusa 0 (o backend valida o mesmo range)", () => {
    expect(validateFieldValue("number", "0", "McpToolCallsPerMinute")).not.toBe(true);
    expect(validateFieldValue("number", "1", "McpToolCallsPerMinute")).toBe(true);
    expect(validateFieldValue("number", "20", "McpToolCallsPerMinute")).toBe(true);
    expect(validateFieldValue("number", "600", "McpToolCallsPerMinute")).toBe(true);
    expect(validateFieldValue("number", "601", "McpToolCallsPerMinute")).not.toBe(true);
    expect(validateFieldValue("number", "-1", "McpToolCallsPerMinute")).not.toBe(true);
    expect(validateFieldValue("number", "abc", "McpToolCallsPerMinute")).not.toBe(true);
  });

  it("converte para número no payload (int no backend)", () => {
    expect(parseFieldValue("number", "45", "McpToolCallsPerMinute")).toBe(45);
  });

  it("no servidor nasce com 20 (o backend recusa 0 neste campo)", () => {
    const field = serverEditableFields.find(
      (item) => item.key === "McpToolCallsPerMinute",
    );
    expect(field?.defaultValue).toBe("20");
    expect(fieldDefault("number", field)).toBe("20");

    const draft = buildServerDraft(undefined, serverEditableFields);
    expect(draft.McpToolCallsPerMinute).toBe("20");
  });

  it("NÃO muda o default dos outros campos number (continua 0)", () => {
    const other = serverEditableFields.find(
      (item) => item.key === "inventoryIntervalHours",
    );
    expect(fieldDefault("number", other)).toBe("0");
    expect(fieldDefault("number")).toBe("0");
  });

  it("cliente e site herdam: sem defaultValue para não gravar 20 como override", () => {
    // Em cliente/site o campo é anulável (null = herda). Um defaultValue aqui
    // não é usado pelo buildServerDraft (que só vale para o servidor), então
    // declará-lo só criaria a impressão de um override silencioso.
    for (const fields of [clientEditableFields, siteEditableFields]) {
      const field = fields.find((item) => item.key === "McpToolCallsPerMinute");
      expect(field?.defaultValue).toBeUndefined();
    }
  });

  it("descreve que o efetivo é o MENOR entre o teto global e o limite da tool", () => {
    for (const [scope, fields] of scopes) {
      const description =
        fields.find((item) => item.key === "McpToolCallsPerMinute")?.description ?? "";
      expect(description, `${scope} não cita o padrão 20`).toContain("20");
      expect(description, `${scope} não cita a faixa 1..600`).toContain("1..600");
      expect(description.toLowerCase(), `${scope} não cita o limite por ferramenta`).toContain(
        "ferramenta",
      );
      expect(description, `${scope} não cita o MENOR`).toContain("MENOR");
    }
  });

  it("herdáveis de cliente/site avisam de quem herdam", () => {
    expect(
      clientEditableFields
        .find((item) => item.key === "McpToolCallsPerMinute")
        ?.description?.toLowerCase(),
    ).toContain("herda do servidor");
    expect(
      siteEditableFields
        .find((item) => item.key === "McpToolCallsPerMinute")
        ?.description?.toLowerCase(),
    ).toContain("herda do cliente");
  });
});
