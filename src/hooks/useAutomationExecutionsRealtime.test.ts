import { describe, expect, it } from "vitest";
import { isAutomationExecutionEventForAgent } from "./useAutomationExecutionsRealtime";

const AGENT = "agent-1";

describe("isAutomationExecutionEventForAgent", () => {
  it("aceita os eventos de execução do agente", () => {
    for (const eventType of [
      "AutomationExecutionCreated",
      "AutomationExecutionAcknowledged",
      "AutomationExecutionResult",
    ]) {
      expect(
        isAutomationExecutionEventForAgent(
          { eventType, data: { agentId: AGENT }, timestampUtc: "2026-01-01T00:00:00Z" },
          AGENT,
        ),
      ).toBe(true);
    }
  });

  it("ignora eventos de outros agentes do mesmo site", () => {
    expect(
      isAutomationExecutionEventForAgent(
        { eventType: "AutomationExecutionResult", data: { agentId: "outro" } },
        AGENT,
      ),
    ).toBe(false);
  });

  it("ignora eventos de outros domínios", () => {
    expect(
      isAutomationExecutionEventForAgent(
        { eventType: "AgentHeartbeat", data: { agentId: AGENT } },
        AGENT,
      ),
    ).toBe(false);
  });

  it("invalida quando o evento não traz agentId (evita UI presa)", () => {
    expect(
      isAutomationExecutionEventForAgent({ eventType: "AutomationExecutionResult" }, AGENT),
    ).toBe(true);
  });

  it("passa por payload achatado (sem campo data)", () => {
    expect(
      isAutomationExecutionEventForAgent(
        { eventType: "AutomationExecutionCreated", agentId: AGENT },
        AGENT,
      ),
    ).toBe(true);
  });

  it("tolera entradas inválidas", () => {
    expect(isAutomationExecutionEventForAgent(null, AGENT)).toBe(false);
    expect(isAutomationExecutionEventForAgent(undefined, AGENT)).toBe(false);
    expect(isAutomationExecutionEventForAgent({} as never, AGENT)).toBe(false);
  });
});
