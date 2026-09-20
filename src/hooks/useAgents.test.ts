import { describe, expect, it } from "vitest";
import { agentSoftwareNextCursorGuard } from "./useAgents";

/**
 * Guard contra loop infinito de paginação por cursor:
 * se o backend repetir o nextCursor (ex.: decode falhando e ignorando o
 * cursor), a infinite query buscaria a mesma página para sempre.
 * Regressão do detalhe do agente (tngplacas: listagem de softwares em loop).
 */
describe("agentSoftwareNextCursorGuard", () => {
  it("retorna o nextCursor quando ele avança além do cursor de entrada", () => {
    expect(
      agentSoftwareNextCursorGuard({ cursor: "cursor-a", nextCursor: "cursor-b" }),
    ).toBe("cursor-b");
  });

  it("retorna o nextCursor na primeira página (sem cursor de entrada)", () => {
    expect(
      agentSoftwareNextCursorGuard({ cursor: null, nextCursor: "cursor-a" }),
    ).toBe("cursor-a");
  });

  it("encerra a iteração quando o backend repete o mesmo cursor (loop)", () => {
    expect(
      agentSoftwareNextCursorGuard({ cursor: "cursor-a", nextCursor: "cursor-a" }),
    ).toBeUndefined();
  });

  it("encerra a iteração quando não há nextCursor", () => {
    expect(
      agentSoftwareNextCursorGuard({ cursor: "cursor-a", nextCursor: null }),
    ).toBeUndefined();
    expect(
      agentSoftwareNextCursorGuard({ cursor: null, nextCursor: null }),
    ).toBeUndefined();
  });
});
