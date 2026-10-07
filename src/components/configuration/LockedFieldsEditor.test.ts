import { describe, expect, it } from "vitest";
import { parseLockedFields, toApiFieldName } from "./LockedFieldsEditor";

describe("editor de campos bloqueados", () => {
  it("converte o campo do editor para o nome da propriedade da API", () => {
    expect(toApiFieldName("recoveryEnabled")).toBe("RecoveryEnabled");
    expect(toApiFieldName("agentOnlineGraceSeconds")).toBe("AgentOnlineGraceSeconds");
    expect(toApiFieldName("aiIntegrationSettingsJson")).toBe("AIIntegrationSettingsJson");
    expect(toApiFieldName("agentUpdatePolicyJson")).toBe("AgentUpdatePolicyJson");
    expect(toApiFieldName("backgroundProcessingSettingsJson")).toBe("BackgroundProcessingSettingsJson");
  });

  it("faz parse tolerante do lockedFieldsJson", () => {
    expect(parseLockedFields('["DiscoveryEnabled","RecoveryEnabled"]')).toEqual([
      "DiscoveryEnabled",
      "RecoveryEnabled",
    ]);
    expect(parseLockedFields("")).toEqual([]);
    expect(parseLockedFields("   ")).toEqual([]);
    expect(parseLockedFields("não é json")).toEqual([]);
    expect(parseLockedFields('{"a":1}')).toEqual([]);
    expect(parseLockedFields('[1,"x",null,"   "]')).toEqual(["x"]);
  });
});
