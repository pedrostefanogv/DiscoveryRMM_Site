import { describe, expect, it } from "vitest";
import {
  AGENT_DETAIL_DEFAULT_TAB,
  AGENT_DETAIL_FALLBACK_ROUTE,
  AGENT_DETAIL_TAB_SLUGS,
  agentDetailBackTarget,
  agentDetailTabFromSlug,
  agentDetailTabSlug,
  type AgentDetailDataTab,
} from "./agentDetailUtils";

/**
 * Deep link das abas do detalhe do agente (?tab=aplicativos, ?tab=tarefas-agendadas).
 * Os slugs são contrato público de URL/histórico: se mudarem, links salvos quebram.
 */
describe("agentDetailTabSlug", () => {
  it("mapeia cada aba para um slug legível e estável", () => {
    expect(AGENT_DETAIL_TAB_SLUGS).toEqual({
      software: "aplicativos",
      printers: "impressoras",
      tickets: "ultimos-chamados",
      listeningPorts: "portas-em-escuta",
      openSockets: "conexoes-abertas",
      startupItems: "inicializacao",
      scheduledTasks: "tarefas-agendadas",
      logs: "logs",
    });
  });

  it("faz round-trip slug -> aba -> slug", () => {
    for (const tab of Object.keys(AGENT_DETAIL_TAB_SLUGS) as AgentDetailDataTab[]) {
      expect(agentDetailTabFromSlug(agentDetailTabSlug(tab))).toBe(tab);
    }
  });
});

describe("agentDetailTabFromSlug", () => {
  it("cai no padrão quando o slug está ausente", () => {
    expect(agentDetailTabFromSlug(null)).toBe(AGENT_DETAIL_DEFAULT_TAB);
    expect(agentDetailTabFromSlug(undefined)).toBe(AGENT_DETAIL_DEFAULT_TAB);
    expect(agentDetailTabFromSlug("")).toBe(AGENT_DETAIL_DEFAULT_TAB);
  });

  it("ignora caixa e espaços extras", () => {
    expect(agentDetailTabFromSlug("  TAREFAS-AGENDADAS ")).toBe("scheduledTasks");
  });

  it("cai no padrão para slug desconhecido (URL antiga/inválida)", () => {
    expect(agentDetailTabFromSlug("aba-inexistente")).toBe(AGENT_DETAIL_DEFAULT_TAB);
  });
});

/**
 * Botão "Voltar" do detalhe do agente: com histórico anterior real, preserva a
 * origem (`navigate(-1)`); sem histórico (link direto/refresh), cai na
 * listagem de agentes em vez de sair do app. As abas internas não criam
 * histórico porque a troca de aba usa `replace`.
 */
describe("agentDetailBackTarget", () => {
  it("preserva a página anterior quando há histórico dentro do app", () => {
    expect(agentDetailBackTarget(1)).toBeNull();
    expect(agentDetailBackTarget(7)).toBeNull();
  });

  it("volta para a listagem quando o detalhe é a primeira entrada", () => {
    expect(agentDetailBackTarget(0)).toBe(AGENT_DETAIL_FALLBACK_ROUTE);
  });

  it("volta para a listagem quando o índice de histórico é ausente/inválido", () => {
    expect(agentDetailBackTarget(null)).toBe(AGENT_DETAIL_FALLBACK_ROUTE);
    expect(agentDetailBackTarget(undefined)).toBe(AGENT_DETAIL_FALLBACK_ROUTE);
  });
});
