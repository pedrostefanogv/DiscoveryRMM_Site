import { afterEach, describe, expect, it, vi } from "vitest";
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
  describeAgentCommandOutcome,
  extractDeferredNextRunAt,
  scheduledTaskLastResultLabel,
  awaitAgentCommandById,
  notifyAgentCommandOutcome,
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
      customFields: "campos-customizados",
      notes: "anotacoes",
      labelHistory: "historico-de-labels",
      software: "aplicativos",
      printers: "impressoras",
      tickets: "ultimos-chamados",
      network: "rede",
      autostart: "execucao-automatica",
      windowsUpdates: "atualizacoes",
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
    expect(agentDetailTabFromSlug("campos-customizados")).toBe("customFields");
    expect(agentDetailTabFromSlug("anotacoes")).toBe("notes");
    expect(agentDetailTabFromSlug("historico-de-labels")).toBe("labelHistory");
  });

  it("mantém os slugs legados de portas/conexões apontando para a aba unificada Rede", () => {
    expect(agentDetailTabFromSlug("portas-em-escuta")).toBe("network");
    expect(agentDetailTabFromSlug("conexoes-abertas")).toBe("network");
    expect(agentDetailTabFromSlug("rede")).toBe("network");
  });

  it("mantém os slugs legados de inicialização/tarefas apontando para Autoruns", () => {
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
 * Sub-abas de "Autoruns": itens de inicialização e tarefas agendadas
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

/**
 * Desfecho do comando devolvido pela API. Regressão do bug de power: o agent
 * confirma cedo com exit 0 e adia a execução; antes o painel mostrava
 * "sucesso" para um comando que nunca rodou.
 */
describe("describeAgentCommandOutcome", () => {
  it("não trata adiamento (deferred_to_window) como sucesso", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Failed",
      result: JSON.stringify({
        status: "deferred_to_window",
        nextRunAt: "2026-11-03T02:00:00Z",
      }),
      exitCode: 0,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("adiado para a janela de manutenção");
    expect(outcome.message).toContain("executa em");
    expect(outcome.message).not.toContain("sucesso");
  });

  it("detecta o adiamento mesmo quando o status veio como Completed (ack antecipado)", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Completed",
      result: '{"status":"deferred_to_window"}',
      exitCode: 0,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("Nada foi executado na máquina");
  });

  it("reporta sucesso apenas para completed sem adiamento e exit 0", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Completed",
      result: '{"status":"ok"}',
      exitCode: 0,
    });

    expect(outcome).toEqual({ ok: true, message: "Ação executada com sucesso no agent." });
  });

  it("expõe exit code e erro do agent quando o comando falha", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Failed",
      result: null,
      exitCode: 5,
      errorMessage: "Access is denied.",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("Código de saída 5");
    expect(outcome.message).toContain("Access is denied.");
  });

  it("mantém pending/sent/running como 'enviado' (sem inventar desfecho)", () => {
    const outcome = describeAgentCommandOutcome({ status: "Sent", result: null, exitCode: null });

    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain("resultado aparece quando o agent responder");
  });
});

describe("extractDeferredNextRunAt", () => {
  it("lê nextRunAt do output JSON", () => {
    expect(
      extractDeferredNextRunAt('{"status":"deferred_to_window","nextRunAt":"2026-11-03T02:00:00Z"}'),
    ).toBe("2026-11-03T02:00:00Z");
  });

  it("devolve null para output ausente, não-JSON ou sem nextRunAt", () => {
    expect(extractDeferredNextRunAt(null)).toBeNull();
    expect(extractDeferredNextRunAt("comando de energia aceito")).toBeNull();
    expect(extractDeferredNextRunAt('{"status":"deferred_to_window"}')).toBeNull();
  });
});

/** nextRunAt textual legado (agent antigo sem JSON). */
describe("extractDeferredNextRunAt — fallback textual", () => {
  it("lê nextRunAt=... de output texto", () => {
    expect(extractDeferredNextRunAt("deferred_to_window nextRunAt=2026-11-03T05:00:00Z")).toBe(
      "2026-11-03T05:00:00Z",
    );
  });
});

function command(overrides: {
  id?: string;
  agentId?: string;
  commandType?: string;
  status?: string;
  result?: string | null;
  exitCode?: number | null;
  errorMessage?: string | null;
  createdAt?: string;
  completedAt?: string | null;
}): AgentCommandLike {
  return {
    id: "cmd-1",
    agentId: "agent-1",
    commandType: "Restart",
    status: "Pending",
    result: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  };
}

/** Shape mínimo do AgentCommand (commandType string, payload opcional). */
interface AgentCommandLike {
  id: string;
  agentId: string;
  commandType: string;
  status: string;
  result: string | null;
  createdAt: string;
  completedAt: string | null;
  exitCode?: number | null;
  errorMessage?: string | null;
  payload?: string;
}

/**
 * Contrato JSON declarativo do comando de power (fonte de verdade nas 3
 * camadas). O agent Go agora emite {"status":...,"message":...} e a API C#
 * devolve commandId — a UI classifica pelo status JSON ANTES do fallback
 * textual, e deferral/denial nunca viram sucesso (mesmo com exit 0).
 */
describe("describeAgentCommandOutcome — contrato JSON de power", () => {
  it("classifica executed pelo JSON do contrato", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Completed",
      result: JSON.stringify({ status: "executed", action: "restart", message: "Reinicialização executada." }),
      exitCode: 0,
    });

    expect(outcome).toEqual({ ok: true, message: "Ação executada com sucesso no agent." });
  });

  it("classifica scheduled como aceito/agendado (não executado ainda)", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Completed",
      result: JSON.stringify({ status: "scheduled", action: "restart", delaySeconds: 300 }),
      exitCode: 0,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain("agendada e ainda não foi executada");
    expect(outcome.message).toContain("(300 s)");
    expect(outcome.message).not.toContain("sucesso");
  });

  it("classifica deferred_by_user com contagem e janela do defer", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Completed",
      result: JSON.stringify({
        status: "deferred_by_user",
        action: "restart",
        defer: { current: 1, max: 3, minutes: 60 },
      }),
      exitCode: 0,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("Adiado pelo usuário (1/3, 60 min)");
    expect(outcome.message).toContain("nada foi executado agora");
  });

  it("classifica denied mesmo com exit code 10 e status Completed", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Completed",
      result: JSON.stringify({ status: "denied", action: "restart" }),
      exitCode: 10,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe("O usuário negou a ação.");
  });

  it("classifica failed pelo JSON e expõe exit code/erro", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Completed",
      result: JSON.stringify({ status: "failed", action: "shutdown", message: "service not running" }),
      exitCode: 1,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("Código de saída 1");
  });

  it("lê JSON embutido em texto (status do contrato tem precedência)", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Completed",
      result: 'Comando aceito: {"status":"denied","action":"restart"}',
      exitCode: 0,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe("O usuário negou a ação.");
  });

  it("status novo 'deferred' da API sem output legível não é sucesso", () => {
    const outcome = describeAgentCommandOutcome({ status: "deferred", result: null, exitCode: null });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("adiado");
  });
});

/**
 * Fallback textual para agents antigos (output texto): marcadores
 * case-insensitive — o output pode chegar com caixa variada e diacríticos
 * corrompidos pela code page OEM.
 */
describe("describeAgentCommandOutcome — fallback textual legado", () => {
  it("reconhece deferred_to_window com nextRunAt textual", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Completed",
      result: "DEFERRED_TO_WINDOW nextRunAt=2026-11-03T05:00:00Z",
      exitCode: 0,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("adiado para a janela de manutenção");
    expect(outcome.message).toContain("executa em");
  });

  it("reconhece 'adiado pelo usuário' em qualquer caixa (diacríticos à parte)", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Completed",
      result: "ADIADO PELO USUÁRIO — comando não executado agora",
      exitCode: 0,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("Adiado pelo usuário");
  });

  it("reconhece 'agendado silenciosamente' como scheduled", () => {
    const outcome = describeAgentCommandOutcome({
      status: "Completed",
      result: "Agendado Silenciosamente para execução futura",
      exitCode: 0,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain("agendada e ainda não foi executada");
  });
});

/**
 * Helper ÚNICO de polling por commandId (AgentContextMenu/AgentList/AgentDetail).
 */
vi.mock("@/api", () => ({
  agentsApi: {
    listCommands: vi.fn(),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe("awaitAgentCommandById", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("polla até o comando com o commandId ficar terminal e classifica pelo contrato", async () => {
    const { agentsApi } = await import("@/api");
    const listCommands = vi.mocked(agentsApi.listCommands);
    listCommands
      .mockResolvedValueOnce([command({ id: "cmd-1", status: "Sent", result: null, exitCode: null })])
      .mockResolvedValueOnce([
        command({
          id: "cmd-1",
          status: "Completed",
          result: JSON.stringify({ status: "executed", action: "restart" }),
          exitCode: 0,
        }),
      ]);

    const outcome = await awaitAgentCommandById("agent-1", "cmd-1", { pollIntervalMs: 0 });

    expect(listCommands).toHaveBeenCalledTimes(2);
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toBe("Ação executada com sucesso no agent.");
  });

  it("para no primeiro desfecho terminal (deferred_by_user do contrato)", async () => {
    const { agentsApi } = await import("@/api");
    const listCommands = vi.mocked(agentsApi.listCommands);
    listCommands.mockResolvedValue([
      command({
        id: "cmd-2",
        status: "Completed",
        result: JSON.stringify({ status: "deferred_by_user", defer: { current: 1, max: 3, minutes: 60 } }),
        exitCode: 0,
      }),
    ]);

    const outcome = await awaitAgentCommandById("agent-1", "cmd-2", { pollIntervalMs: 0 });

    expect(listCommands).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("Adiado pelo usuário (1/3, 60 min)");
  });

  it("sem commandId (API antiga) não consulta e devolve o desfecho 'enviado'", async () => {
    const { agentsApi } = await import("@/api");
    const listCommands = vi.mocked(agentsApi.listCommands);

    const outcome = await awaitAgentCommandById("agent-1", null, { pollIntervalMs: 0 });

    expect(listCommands).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain("Comando enviado ao agent");
  });

  it("esgota as tentativas sem resultado e devolve 'Comando enviado' (não inventa)", async () => {
    const { agentsApi } = await import("@/api");
    const listCommands = vi.mocked(agentsApi.listCommands);
    listCommands.mockResolvedValue([]);

    const outcome = await awaitAgentCommandById("agent-1", "cmd-404", { maxAttempts: 2, pollIntervalMs: 0 });

    expect(listCommands).toHaveBeenCalledTimes(2);
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain("resultado aparece quando o agent responder");
  });

  it("falhas transitórias de rede não abortam o polling", async () => {
    const { agentsApi } = await import("@/api");
    const listCommands = vi.mocked(agentsApi.listCommands);
    listCommands
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([
        command({
          id: "cmd-3",
          status: "Failed",
          result: JSON.stringify({ status: "failed", action: "restart" }),
          exitCode: 1,
        }),
      ]);

    const outcome = await awaitAgentCommandById("agent-1", "cmd-3", { pollIntervalMs: 0 });

    expect(listCommands).toHaveBeenCalledTimes(2);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("Código de saída 1");
  });
});

describe("notifyAgentCommandOutcome", () => {
  it("despacha sucesso/erro no toast conforme o desfecho", async () => {
    const toast = (await import("react-hot-toast")).default as unknown as {
      success: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };

    notifyAgentCommandOutcome({ ok: true, message: "ok msg" });
    notifyAgentCommandOutcome({ ok: false, message: "erro msg" });

    expect(toast.success).toHaveBeenCalledWith("ok msg");
    expect(toast.error).toHaveBeenCalledWith("erro msg");
  });
});


