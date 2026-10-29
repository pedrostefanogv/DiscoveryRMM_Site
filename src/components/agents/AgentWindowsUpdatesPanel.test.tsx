import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentWindowsUpdateSnapshot } from "@/api/types";

/**
 * Testes do painel da aba "Atualizações" do agente (?tab=atualizacoes).
 * Os hooks são mockados: aqui validamos a leitura do snapshot (alertas de
 * varredura, estado vazio explicativo, atividade, polling acelerado).
 */

const HOUR = 60 * 60 * 1000;

const state: {
  snapshot: AgentWindowsUpdateSnapshot | undefined;
  items: unknown[];
  scanMock: ReturnType<typeof vi.fn>;
  snapshotOptions: Array<{ fastPolling?: boolean } | undefined>;
} = {
  snapshot: undefined,
  items: [],
  scanMock: vi.fn(),
  snapshotOptions: [],
};

function baseSnapshot(overrides: Partial<AgentWindowsUpdateSnapshot> = {}): AgentWindowsUpdateSnapshot {
  return {
    agentId: "a1",
    pendingCount: 0,
    installedCount: 4,
    deniedCount: 0,
    approvedCount: 0,
    scanStatus: "ok",
    scanError: null,
    scanDurationMs: 5745,
    lastCollectedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    pendingReboot: false,
    pendingRebootReasons: [],
    rebootCheckedAt: null,
    ...overrides,
  };
}

vi.mock("@/hooks/useAgentWindowsUpdates", () => ({
  useAgentWindowsUpdates: () => ({
    data: { items: state.items, totalCount: state.items.length, page: 1, pageSize: 25, pendingCount: 0, installedCount: 0 },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useAgentWindowsUpdateSnapshot: (
    _agentId: string,
    options?: { fastPolling?: boolean },
  ) => {
    state.snapshotOptions.push(options);
    return {
      data: state.snapshot,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
  useScanAgentWindowsUpdates: () => ({ isPending: false, mutateAsync: state.scanMock }),
  useSetAgentWindowsUpdateApproval: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useInstallAgentWindowsUpdate: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useInstallApprovedWindowsUpdates: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useBulkAgentWindowsUpdates: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useApplyPatchOsPolicy: () => ({ isPending: false, mutate: vi.fn() }),
  useRollbackPatchOsPolicy: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("@/hooks/usePatchesRealtime", () => ({ usePatchesRealtime: () => undefined }));

vi.mock("@/auth/authorization", () => ({
  useAuthorization: () => ({ hasAnyPermission: () => true }),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import { AgentWindowsUpdatesPanel } from "./AgentWindowsUpdatesPanel";

function renderPanel() {
  return render(<AgentWindowsUpdatesPanel agentId="a1" />);
}

describe("AgentWindowsUpdatesPanel — aba Atualizações do agente", () => {
  afterEach(() => {
    cleanup();
    state.snapshot = undefined;
    state.items = [];
    state.snapshotOptions = [];
    state.scanMock = vi.fn().mockResolvedValue({ success: true, commandId: "c1" });
  });

  it("mostra a idade da última varredura e os contadores do snapshot", () => {
    state.snapshot = baseSnapshot({ lastCollectedAt: new Date(Date.now() - 2 * HOUR).toISOString(), pendingCount: 3, installedCount: 4 });
    renderPanel();

    expect(screen.getByText(/Última varredura há 2 h/)).toBeTruthy();
    expect(screen.getByText("Pendentes (3)")).toBeTruthy();
    expect(screen.getByText("Instaladas (4)")).toBeTruthy();
    // Varredura recente: sem banner de alerta.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("alerta varredura desatualizada (mais de 6h) com motivo e botão de nova varredura", async () => {
    state.snapshot = baseSnapshot({
      lastCollectedAt: new Date(Date.now() - 8 * HOUR).toISOString(),
    });
    renderPanel();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Varredura desatualizada");
    expect(alert.textContent).toMatch(/6h/);

    // Botão do banner + toolbar + estado vazio: qualquer um pede a varredura.
    const scanButtons = screen.getAllByRole("button", { name: /Verificar atualizações/ });
    expect(scanButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(scanButtons[0]);
    await waitFor(() => expect(state.scanMock).toHaveBeenCalledTimes(1));
    expect(state.scanMock).toHaveBeenCalledWith({
      agentId: "a1",
      reason: expect.stringContaining("Atualizações"),
    });
  });

  it("alerta quando a varredura falhou e exibe o erro", () => {
    state.snapshot = baseSnapshot({
      scanStatus: "error",
      scanError: "wuauserv Start=4",
      scanErrorCode: "service_disabled",
    });
    renderPanel();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("A última varredura falhou");
    expect(alert.textContent).toMatch(/wuauserv/);
    expect(alert.textContent).toContain("wuauserv Start=4");
  });

  it("alerta quando o agente nunca enviou inventário", () => {
    state.snapshot = undefined;
    renderPanel();
    expect(screen.getByRole("alert").textContent).toContain("Nenhuma varredura recebida deste agente");
  });

  it("explica o estado vazio de pendentes em vez de sugerir que a máquina está em dia", () => {
    state.snapshot = baseSnapshot();
    renderPanel();

    expect(
      screen.getByText("Nenhuma atualização PENDENTE detectada pela busca do Windows Update."),
    ).toBeTruthy();
    expect(screen.getByText(/IsInstalled=0/)).toBeTruthy();
  });

  it("trata o vazio como suspeito quando há reinício pendente e mostra o badge de atividade", () => {
    state.snapshot = baseSnapshot({
      pendingReboot: true,
      pendingRebootReasons: ["cbs", "file_rename"],
    });
    renderPanel();

    // Badge da toolbar + banner de reinício pendente.
    expect(screen.getAllByText("Reinício pendente").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/a atualização pode já estar instalada/)).toBeTruthy();
    expect(screen.getByText(/Component Based Servicing/)).toBeTruthy();
  });

  it("não mostra percentual de download no badge de reinício pendente", () => {
    state.snapshot = baseSnapshot({
      pendingReboot: true,
      pendingRebootReasons: ["cbs"],
      probe: { downloadInProgress: false, downloadPercent: 42 },
    });
    renderPanel();

    // O percentual é do download anterior: no badge de reboot seria mentira.
    expect(document.body.textContent ?? "").not.toContain("42%");
  });

  it("mostra o percentual junto do badge quando o download está em andamento", () => {
    state.snapshot = baseSnapshot({ probe: { downloadInProgress: true, downloadPercent: 42 } });
    renderPanel();

    expect(screen.getByText("42%")).toBeTruthy();
  });

  it("mostra download em andamento a partir da sonda do agente", () => {
    state.snapshot = baseSnapshot({ probe: { downloadInProgress: true, downloadPercent: 40 } });
    renderPanel();

    const badge = screen.getByText("Download em andamento");
    expect(badge).toBeTruthy();
    // O percentual aparece no tooltip do badge (title).
    expect(document.querySelector('[title*="40%"]')).toBeTruthy();
  });

  it("mostra o diagnóstico da sonda (serviço desabilitado, WSUS)", () => {
    state.snapshot = baseSnapshot({
      wuaAvailable: false,
      probe: { service: "disabled", serviceDisabled: true, wsus: true },
    });
    renderPanel();

    const text = document.body.textContent ?? "";
    expect(text).toContain("Serviço Windows Update");
    expect(text).toContain("desabilitado");
    expect(text).toContain("WSUS");
    expect(text).toContain("WUA (COM)");
  });

  it("pede polling acelerado do snapshot enquanto a varredura pedida não chega", async () => {
    state.snapshot = baseSnapshot({ lastCollectedAt: new Date(Date.now() - 7 * HOUR).toISOString() });
    renderPanel();

    expect(state.snapshotOptions.at(-1)?.fastPolling).toBe(false);

    fireEvent.click(screen.getAllByRole("button", { name: /Verificar atualizações/ })[0]);
    await waitFor(() => expect(state.scanMock).toHaveBeenCalled());
    await waitFor(() => expect(state.snapshotOptions.at(-1)?.fastPolling).toBe(true));
  });

  it("pede polling acelerado quando há reinício pendente", async () => {
    state.snapshot = baseSnapshot({ pendingReboot: true });
    renderPanel();
    await waitFor(() => expect(state.snapshotOptions.at(-1)?.fastPolling).toBe(true));
  });

  it("expõe as abas como tablist acessível com o contador de cada lista", () => {
    state.snapshot = baseSnapshot({ pendingCount: 2, installedCount: 4 });
    renderPanel();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tablist", { name: "Lista de atualizações" })).toBeTruthy();
  });

  it("mostra o resumo do cabeçalho sem repetir contadores zerados", () => {
    state.snapshot = baseSnapshot({ pendingCount: 0, installedCount: 4 });
    renderPanel();

    expect(
      screen.getByText("Nenhuma atualização pendente · 4 instaladas no inventário"),
    ).toBeTruthy();
  });

  it("agrupa aprovar/recusar/forçar no menu de ações da linha", async () => {
    state.snapshot = baseSnapshot({ pendingCount: 1 });
    const update = {
      id: "u1",
      updateKey: "wu:1",
      groupKey: "g1",
      kbId: "KB5043131",
      kbIds: ["KB5043131"],
      title: "Atualização cumulativa (KB5043131)",
      description: null,
      classification: "Atualizações de segurança",
      severity: "Critical",
      isPending: true,
      isInstalled: false,
      isHidden: false,
      requiresReboot: false,
      maxDownloadSize: 1024,
      supportUrl: null,
      publishedAt: new Date(Date.now() - HOUR).toISOString(),
      installedAt: null,
      reportedAt: new Date().toISOString(),
      approvalState: "Denied" as const,
      approvalSource: null,
      status: "Denied" as const,
      installResultCode: null,
      installError: null,
      source: "wua",
    };
    state.items = [update];
    renderPanel();

    // As ações secundárias não ocupam a linha: só "Instalar" e o menu.
    expect(screen.queryByRole("button", { name: /Aprovar Atualização/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Mais ações para Atualização cumulativa/ }));

    const labels = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    expect(labels.some((label) => label?.includes("Aprovar"))).toBe(true);
    expect(labels.some((label) => label?.includes("Recusar"))).toBe(true);
    // Recusada: o "forçar" continua acessível, mas com aviso de auditoria.
    expect(labels.some((label) => label?.includes("Forçar instalação"))).toBe(true);
  });

  it("aplica filtro de severidade, mostra o vazio filtrado e limpa os filtros", async () => {
    state.snapshot = baseSnapshot();
    renderPanel();

    fireEvent.change(screen.getByLabelText("Severidade"), { target: { value: "Critical" } });

    // Há dois botões "Limpar filtros": na barra de abas e no vazio filtrado.
    const clearButtons = await screen.findAllByRole("button", { name: /Limpar filtros/ });
    expect(clearButtons.length).toBe(2);
    const clear = clearButtons[0];
    expect(screen.getByText("Nenhuma atualização corresponde aos filtros")).toBeTruthy();

    fireEvent.click(clear);
    await waitFor(() =>
      expect(screen.queryByText("Nenhuma atualização corresponde aos filtros")).toBeNull(),
    );
    expect(screen.getByText("Nenhuma atualização PENDENTE detectada pela busca do Windows Update.")).toBeTruthy();
  });

  it("abre o painel de política do SO em vez de expor as ações na barra principal", () => {
    state.snapshot = baseSnapshot();
    renderPanel();

    // As ações raras não ficam soltas na barra principal.
    expect(screen.queryByRole("button", { name: "Aplicar no SO" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Política do SO/ }));

    expect(screen.getByRole("button", { name: /Aplicar no SO/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reverter SO/ })).toBeTruthy();
  });

  it("mantém os dados mesmo sem os campos opcionais novos da API", () => {
    // Snapshot no formato "antigo": sem scanErrorCode/probe/skippedCount.
    state.snapshot = {
      agentId: "a1",
      pendingCount: 0,
      installedCount: 0,
      deniedCount: 0,
      approvedCount: 0,
      scanStatus: "unknown",
      scanError: null,
      scanDurationMs: null,
      lastCollectedAt: new Date(Date.now() - HOUR).toISOString(),
      pendingReboot: false,
      pendingRebootReasons: [],
      rebootCheckedAt: null,
    };
    renderPanel();

    // scanStatus "unknown" com coleta válida é tratado como ok (sem alerta).
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.body.textContent).toContain("status: unknown");
  });
});
