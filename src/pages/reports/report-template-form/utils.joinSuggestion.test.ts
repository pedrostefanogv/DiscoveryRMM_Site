import { describe, expect, it } from "vitest";
import { getAutoJoinSuggestion } from "./utils";

describe("getAutoJoinSuggestion", () => {
  it("casa source sem alias com target com alias (bug do wizard)", () => {
    // Antes: source usava reference puro ("agentId") e target usava
    // "hw.agentId", entao a interseccao era SEMPRE vazia e nenhuma
    // sugestao automatica era feita.
    const suggestion = getAutoJoinSuggestion({
      joinSuggestions: [],
      sourceKeyOptions: [
        { field: "agentId", reference: "agentId", isJoinKey: true },
        { field: "clientId", reference: "clientId", isJoinKey: true },
      ],
      targetKeyOptions: [
        { field: "agentId", reference: "hw.agentId", isJoinKey: true },
        { field: "siteId", reference: "hw.siteId", isJoinKey: true },
      ],
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.sourceKey).toBe("agentId");
    expect(suggestion?.targetKey).toBe("hw.agentId");
  });

  it("preserva a forma com alias nos dois lados", () => {
    const suggestion = getAutoJoinSuggestion({
      joinSuggestions: [],
      sourceKeyOptions: [
        { field: "agentId", reference: "sns.agentId", isJoinKey: true },
      ],
      targetKeyOptions: [
        { field: "agentId", reference: "hw.agentId", isJoinKey: true },
      ],
    });
    expect(suggestion).toEqual({
      sourceKey: "sns.agentId",
      targetKey: "hw.agentId",
    });
  });

  it("prefere o primeiro source que casa com um target", () => {
    const suggestion = getAutoJoinSuggestion({
      joinSuggestions: [],
      sourceKeyOptions: [
        { field: "sensorId", reference: "sns.sensorId", isJoinKey: true },
        { field: "agentId", reference: "sns.agentId", isJoinKey: true },
      ],
      targetKeyOptions: [
        { field: "agentId", reference: "hw.agentId", isJoinKey: true },
      ],
    });
    expect(suggestion).toEqual({
      sourceKey: "sns.agentId",
      targetKey: "hw.agentId",
    });
  });

  it("usa a sugestao explicita quando existir", () => {
    const suggestion = getAutoJoinSuggestion({
      joinSuggestions: [{ sourceKey: "a", targetKey: "b", joinType: "left" }],
      sourceKeyOptions: [],
      targetKeyOptions: [],
    });
    expect(suggestion).toEqual({ sourceKey: "a", targetKey: "b", joinType: "left" });
  });

  it("retorna null quando nao ha chave nenhuma", () => {
    expect(
      getAutoJoinSuggestion({
        joinSuggestions: [],
        sourceKeyOptions: [],
        targetKeyOptions: [],
      }),
    ).toBeNull();
  });
});
