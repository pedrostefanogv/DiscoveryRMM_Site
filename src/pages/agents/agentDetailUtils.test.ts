import { describe, expect, it } from "vitest";
import {
  AGENT_AUTOSTART_DEFAULT_VIEW,
  AGENT_AUTOSTART_VIEW_SLUGS,
  AGENT_DETAIL_DEFAULT_TAB,
  AGENT_DETAIL_FALLBACK_ROUTE,
  AGENT_DETAIL_TAB_SLUGS,
  AGENT_NETWORK_DEFAULT_VIEW,
  AGENT_NETWORK_VIEW_SLUGS,
  agentAutostartViewFromSlug,
  agentAutostartViewSlug,
  agentDetailBackTarget,
  agentDetailTabFromSlug,
  agentDetailTabSlug,
  agentNetworkViewFromSlug,
  agentNetworkViewSlug,
  scheduledTaskLastResultLabel,
  type AgentAutostartView,
  type AgentDetailDataTab,
  type AgentNetworkView,
} from "./agentDetailUtils";

/**
 * Deep link das abas do detalhe do agente (?tab=aplicativos, ?tab=tarefas-agendadas).
 * Os slugs são contrato público de URL/histórico: se mudarem, links salvos quebram.
 */
describe("agentDetailTabSlug", () => {
  it("mapeia cada aba para um slug legível e estável", () => {
    expect(AGENT_DETAIL_TAB_SLUGS).toEqual({
      info: "info",
      notes: "anotacoes",
      labelHistory: "historico-de-labels",
      software: "aplicativos",
      printers: "impressoras",
      tickets: "ultimos-chamados",
      network: "rede",
      autostart: "execucao-automatica",
      policies: "politicas",
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
    expect(agentDetailTabFromSlug("  TAREFAS-AGENDADAS ")).toBe("autostart");
  });

  it("abre na aba principal Info por padrão", () => {
    expect(AGENT_DETAIL_DEFAULT_TAB).toBe("info");
  });

  it("resolve os deep links das abas de anotações e histórico de labels", () => {
    expect(agentDetailTabFromSlug("info")).toBe("info");
    expect(agentDetailTabFromSlug("anotacoes")).toBe("notes");
    expect(agentDetailTabFromSlug("historico-de-labels")).toBe("labelHistory");
  });

  it("mantém os slugs legados de portas/conexões apontando para a aba unificada Rede", () => {
    expect(agentDetailTabFromSlug("portas-em-escuta")).toBe("network");
    expect(agentDetailTabFromSlug("conexoes-abertas")).toBe("network");
    expect(agentDetailTabFromSlug("rede")).toBe("network");
  });

  it("mantém os slugs legados de inicialização/tarefas apontando para Execução Automática", () => {
    expect(agentDetailTabFromSlug("inicializacao")).toBe("autostart");
    expect(agentDetailTabFromSlug("tarefas-agendadas")).toBe("autostart");
    expect(agentDetailTabFromSlug("execucao-automatica")).toBe("autostart");
  });

  it("cai no padrão para slug desconhecido (URL antiga/inválida)", () => {
    expect(agentDetailTabFromSlug("aba-inexistente")).toBe(AGENT_DETAIL_DEFAULT_TAB);
  });
});

/**
 * Sub-abas de rede: adaptadores, portas em escuta e conexões abertas foram
 * unificados numa aba só. Os slugs antigos continuam válidos como deep link.
 */
describe("sub-abas de rede", () => {
  it("mapeia cada sub-aba para um slug", () => {
    expect(AGENT_NETWORK_VIEW_SLUGS).toEqual({
      adapters: "rede",
      listeningPorts: "portas-em-escuta",
      openSockets: "conexoes-abertas",
    });
  });

  it("faz round-trip view -> slug -> view", () => {
    for (const view of Object.keys(AGENT_NETWORK_VIEW_SLUGS) as AgentNetworkView[]) {
      expect(agentNetworkViewFromSlug(agentNetworkViewSlug(view))).toBe(view);
    }
  });

  it("resolve os slugs legados e cai em adapters quando desconhecido", () => {
    expect(agentNetworkViewFromSlug("portas-em-escuta")).toBe("listeningPorts");
    expect(agentNetworkViewFromSlug("Conexoes-Abertas")).toBe("openSockets");
    expect(agentNetworkViewFromSlug("rede")).toBe("adapters");
    expect(agentNetworkViewFromSlug("nao-existe")).toBe(AGENT_NETWORK_DEFAULT_VIEW);
    expect(agentNetworkViewFromSlug(null)).toBe(AGENT_NETWORK_DEFAULT_VIEW);
  });
});

/**
 * Sub-abas de "Execução Automática": itens de inicialização e tarefas agendadas
 * foram unificados numa aba só. Os slugs antigos continuam válidos como deep
 * link e selecionam a sub-aba correspondente.
 */
describe("sub-abas de execução automática", () => {
  it("mapeia cada sub-aba para um slug", () => {
    expect(AGENT_AUTOSTART_VIEW_SLUGS).toEqual({
      startupItems: "inicializacao",
      scheduledTasks: "tarefas-agendadas",
    });
  });

  it("faz round-trip view -> slug -> view", () => {
    for (const view of Object.keys(AGENT_AUTOSTART_VIEW_SLUGS) as AgentAutostartView[]) {
      expect(agentAutostartViewFromSlug(agentAutostartViewSlug(view))).toBe(view);
    }
  });

  it("resolve os slugs legados e cai em inicialização quando desconhecido", () => {
    expect(agentAutostartViewFromSlug("inicializacao")).toBe("startupItems");
    expect(agentAutostartViewFromSlug("TAREFAS-AGENDADAS")).toBe("scheduledTasks");
    expect(agentAutostartViewFromSlug("execucao-automatica")).toBe(AGENT_AUTOSTART_DEFAULT_VIEW);
    expect(agentAutostartViewFromSlug("nao-existe")).toBe(AGENT_AUTOSTART_DEFAULT_VIEW);
    expect(agentAutostartViewFromSlug(null)).toBe(AGENT_AUTOSTART_DEFAULT_VIEW);
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

describe("scheduledTaskLastResultLabel", () => {
  it("trata 0 como sucesso", () => {
    expect(scheduledTaskLastResultLabel(0)).toBe("Sucesso (0)");
  });

  it("exibe o código para os demais HRESULTs", () => {
    expect(scheduledTaskLastResultLabel(1)).toBe("Código 1");
    expect(scheduledTaskLastResultLabel(-2147024891)).toBe("Código -2147024891");
  });

  it("cai no traço quando o resultado é ausente", () => {
    expect(scheduledTaskLastResultLabel(null)).toBe("—");
    expect(scheduledTaskLastResultLabel(undefined)).toBe("—");
    expect(scheduledTaskLastResultLabel(Number.NaN)).toBe("—");
  });
});
