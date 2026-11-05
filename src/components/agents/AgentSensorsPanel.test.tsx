import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { AppApprovalScopeType } from "@/api/types";
import type { AgentSensorsPayload, SensorItem } from "@/api";

// O painel é presentational, mas os modais filhos (form/histórico) usam hooks de
// react-query — stubs evitam precisar de QueryClientProvider no teste das abas.
const { useSensorEventsMock } = vi.hoisted(() => ({ useSensorEventsMock: vi.fn() }));

vi.mock("@/hooks/useSensors", () => ({
  useSensorEvents: useSensorEventsMock,
  useSensorDefinitions: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useClients", () => ({ useClients: () => ({ data: [] }) }));
vi.mock("@/hooks/useSites", () => ({ useSites: () => ({ data: [] }) }));
vi.mock("@/hooks/useAutomation", () => ({
  useAutomationScripts: () => ({ data: { items: [] } }),
}));

import AgentSensorsPanel from "./AgentSensorsPanel";
import type { SensorEvent } from "@/api";

/** Página vazia padrão do histórico (os testes de paginação trocam o retorno). */
const EMPTY_EVENTS = {
  data: { items: [] as SensorEvent[], nextCursor: null },
  isLoading: false,
  isError: false,
  isFetching: false,
};

beforeEach(() => {
  useSensorEventsMock.mockReset();
  useSensorEventsMock.mockReturnValue(EMPTY_EVENTS);
});

function sensor(over: Partial<SensorItem> = {}): SensorItem {
  return {
    sensorId: "s1",
    key: "disco-c",
    name: "Disco C:",
    description: "Volume do sistema",
    sensorType: "DiskSpace",
    target: "C:",
    targetKey: "C:",
    scopeType: AppApprovalScopeType.Agent,
    isInherited: false,
    sourceScope: null,
    warningThreshold: 15,
    criticalThreshold: 10,
    thresholdUnit: "Percent",
    comparison: "LowerIsWorse",
    channels: [
      { key: "free_percent", label: "Livre", unit: "Percent", display: "chart", isPrimary: true },
    ],
    currentChannels: { free_percent: 12 },
    primaryChannel: "free_percent",
    primaryValue: 12,
    sparkline: { free_percent: [18, 16, 12] },
    status: "Warning",
    severity: "Warning",
    message: "Disco C:: 12% livre.",
    isStale: false,
    exitCode: null,
    durationMs: 120,
    outputExcerpt: null,
    consecutiveFailures: 0,
    totalRuns: 10,
    totalFailures: 1,
    lastRunAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    lastStatusChangedAt: null,
    lastAlertedAt: null,
    intervalSeconds: 300,
    timeoutSeconds: 10,
    failsBeforeAlert: 2,
    autoTicketPolicy: "OnEscalation" as const,
    autoTicketMinDurationSeconds: 0,
    autoTicketImpact: "Medium" as const,
    minSeverityToAlert: "Warning",
    scriptId: null,
    scriptName: null,
    chartJson: null,
    optionsJson: null,
    displayOrder: 0,
    isPinned: false,
    ...over,
  };
}

/** Evento do histórico (modal "Histórico"). */
function event(over: Partial<SensorEvent> = {}): SensorEvent {
  return {
    id: "e1",
    targetKey: "C:",
    kind: "StatusChanged",
    status: "Warning",
    severity: "Warning",
    previousStatus: "Passing",
    previousSeverity: null,
    message: null,
    exitCode: null,
    occurredAt: "2026-11-03T12:00:00Z",
    ...over,
  };
}

function payload(over: Partial<AgentSensorsPayload> = {}): AgentSensorsPayload {
  return {
    agentId: "a1",
    sensorFingerprint: "abc123def4567890",
    lastSyncedSensorFingerprint: "abc123def4567890",
    lastSensorSyncAt: "2026-11-03T12:00:00Z",
    upToDate: true,
    generatedAt: "2026-11-03T12:05:00Z",
    defaultIntervalSeconds: 300,
    staleAfterSeconds: 900,
    counts: { total: 1, passing: 0, warning: 1, failing: 0, pending: 0, unknown: 0, stale: 0 },
    items: [sensor()],
    ...over,
  };
}

function renderPanel(over: Partial<ComponentProps<typeof AgentSensorsPanel>> = {}) {
  const props: ComponentProps<typeof AgentSensorsPanel> = {
    agentId: "a1",
    canView: true,
    canExecute: true,
    canCreate: true,
    canManage: true,
    payload: payload(),
    isLoading: false,
    isError: false,
    isFetching: false,
    onRetry: vi.fn(),
    onRefresh: vi.fn(),
    isForcing: false,
    onForceSync: vi.fn(),
    isRunning: false,
    onRun: vi.fn().mockResolvedValue(undefined),
    isSaving: false,
    onSaveSensor: vi.fn().mockResolvedValue(undefined),
    onDeleteSensor: vi.fn().mockResolvedValue(undefined),
    onResetSensor: vi.fn().mockResolvedValue(undefined),
    onResetAllSensors: vi.fn().mockResolvedValue(undefined),
    isResetting: false,
    onAddRecommended: vi.fn().mockResolvedValue(undefined),
    isAddingRecommended: false,
    recommendedProgress: null,
    clientId: "c1",
    siteId: "s1",
    ...over,
  };
  return render(<AgentSensorsPanel {...props} />);
}

afterEach(() => {
  cleanup();
  // O teste do card de hover usa timers falsos (rowHoverDelayMs do DataTable).
  vi.useRealTimers();
});

describe("AgentSensorsPanel", () => {
  it("explica a falta de permissão sem consultar/mostrar vazio", () => {
    renderPanel({ canView: false, payload: undefined });

    expect(screen.getByText("Sem permissão para ver os sensores")).toBeTruthy();
    expect(screen.queryByText("Nenhum sensor configurado")).toBeNull();
  });

  it("mostra loading enquanto o payload não chega", () => {
    renderPanel({ payload: undefined, isLoading: true });

    expect(screen.getByText("Carregando sensores...")).toBeTruthy();
  });

  it("mostra erro com ação de tentar novamente", () => {
    const onRetry = vi.fn();
    renderPanel({ payload: undefined, isError: true, onRetry });

    expect(screen.getByText("Não foi possível carregar os sensores")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("mostra o estado vazio e o CTA cria os sensores recomendados", () => {
    const onAddRecommended = vi.fn().mockResolvedValue(undefined);
    renderPanel({
      onAddRecommended,
      payload: payload({
        items: [],
        counts: { total: 0, passing: 0, warning: 0, failing: 0, pending: 0, unknown: 0, stale: 0 },
      }),
    });

    expect(screen.getByText("Nenhum sensor configurado")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Adicionar sensores recomendados/ }));
    // O CTA cria de fato as 4 definições (não abre mais o formulário).
    expect(onAddRecommended).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: /Novo sensor/ })).toBeNull();
  });

  it("mostra o progresso da criação dos recomendados e não reenvia o CTA", () => {
    const onAddRecommended = vi.fn().mockResolvedValue(undefined);
    renderPanel({
      onAddRecommended,
      isAddingRecommended: true,
      recommendedProgress: { done: 2, total: 4 },
      payload: payload({
        items: [],
        counts: { total: 0, passing: 0, warning: 0, failing: 0, pending: 0, unknown: 0, stale: 0 },
      }),
    });

    expect(screen.getByRole("status").textContent).toContain("2 de 4");
    fireEvent.click(screen.getByRole("button", { name: /Criando sensores/ }));
    expect(onAddRecommended).not.toHaveBeenCalled();
  });

  it("lista o sensor com status, valor atual, limiares e última execução", () => {
    renderPanel();

    expect(screen.getByText("Disco C:")).toBeTruthy();
    expect(screen.getByText(/Espaço em disco/)).toBeTruthy();
    expect(screen.getByText("12%")).toBeTruthy();
    expect(screen.getByText("Atenção")).toBeTruthy();
    expect(screen.getByText(/atenção 15% · crítico 10%/)).toBeTruthy();
    expect(screen.getByText("há 5 min")).toBeTruthy();
    // Sparkline desenhada a partir das amostras do canal primário.
    expect(document.querySelector("table polyline")).toBeTruthy();
  });

  it("mostra os chips de contagem e o fingerprint do conjunto", () => {
    renderPanel();

    expect(screen.getByText(/abc123def456/)).toBeTruthy();
    expect(screen.getByText("Atenção 1")).toBeTruthy();
    expect(screen.getByText("Total 1")).toBeTruthy();
    expect(screen.getByText("Sem dados 0")).toBeTruthy();
  });

  it("indica agent atualizado/desatualizado pelo fingerprint entregue", () => {
    renderPanel();
    expect(screen.getByText("Agent atualizado")).toBeTruthy();
    cleanup();

    renderPanel({
      payload: payload({ upToDate: false, lastSyncedSensorFingerprint: "antigo" }),
    });
    expect(screen.getByText("Agent desatualizado")).toBeTruthy();
    cleanup();

    renderPanel({
      payload: payload({ upToDate: false, lastSyncedSensorFingerprint: null, lastSensorSyncAt: null }),
    });
    expect(screen.getByText("Nunca recebeu")).toBeTruthy();
  });

  it("mostra Sem dados recentes quando o sensor está atrasado", () => {
    renderPanel({ payload: payload({ items: [sensor({ isStale: true, status: "Passing" })] }) });

    expect(screen.getByText("Sem dados recentes")).toBeTruthy();
  });

  it("executa todos os sensores pelo botão do cabeçalho", () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    renderPanel({ onRun });

    fireEvent.click(screen.getByRole("button", { name: /Executar todos/ }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("oferece executar agora/editar/excluir no menu de ações da linha", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Ações do sensor Disco C:/ }));

    expect(screen.getByRole("menuitem", { name: /Ver gráfico/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Histórico/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Reiniciar estado/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Editar/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Excluir/ })).toBeTruthy();
  });

  it("reinicia o estado de um sensor pelo menu da linha", () => {
    const onResetSensor = vi.fn().mockResolvedValue(undefined);
    renderPanel({ onResetSensor });

    fireEvent.click(screen.getByRole("button", { name: /Ações do sensor Disco C:/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Reiniciar estado/ }));

    expect(onResetSensor).toHaveBeenCalledWith("s1");
  });

  it("confirma antes de reiniciar o estado de TODOS os sensores", () => {
    const onResetAllSensors = vi.fn().mockResolvedValue(undefined);
    renderPanel({ onResetAllSensors });

    fireEvent.click(screen.getByRole("button", { name: /Reiniciar estados/ }));
    // Nada é reiniciado antes da confirmação.
    expect(onResetAllSensors).not.toHaveBeenCalled();
    expect(screen.getByText(/todos os sensores/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Reiniciar$/ }));
    expect(onResetAllSensors).toHaveBeenCalledTimes(1);
  });

  it("força a sincronização da policy pelo botão do cabeçalho", () => {
    const onForceSync = vi.fn();
    renderPanel({ onForceSync, payload: payload({ upToDate: false }) });

    fireEvent.click(screen.getByRole("button", { name: /Forçar sincronização/ }));
    expect(onForceSync).toHaveBeenCalledTimes(1);
  });

  it("respeita as permissões de gestão (criar/editar/excluir)", () => {
    renderPanel({ canCreate: false, canManage: false });

    const create = screen.getByRole("button", { name: /Novo sensor/ }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Ações do sensor Disco C:/ }));
    const edit = screen.getByRole("menuitem", { name: /Editar/ }) as HTMLButtonElement;
    const remove = screen.getByRole("menuitem", { name: /Excluir/ }) as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
    expect(remove.disabled).toBe(true);
  });

  it("desabilita ações de execução sem Sensors.Execute", () => {
    renderPanel({ canExecute: false });

    const runAll = screen.getByRole("button", { name: /Executar todos/ }) as HTMLButtonElement;
    expect(runAll.disabled).toBe(true);
    const resetAll = screen.getByRole("button", { name: /Reiniciar estados/ }) as HTMLButtonElement;
    expect(resetAll.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Ações do sensor Disco C:/ }));
    const resetOne = screen.getByRole("menuitem", { name: /Reiniciar estado/ }) as HTMLButtonElement;
    expect(resetOne.disabled).toBe(true);
  });

  it("pagina o histórico com cursor e mantém a lista ao carregar mais", () => {
    // Respostas ESTÁVEIS (mesma identidade entre renders): se o mock devolvesse
    // um objeto novo a cada render, o efeito de acumulação rodaria em loop.
    const firstPage = {
      data: { items: [event({ id: "e1", kind: "StatusChanged" })], nextCursor: "c1" },
      isLoading: false,
      isError: false,
      isFetching: false,
    };
    const secondPage = {
      data: { items: [event({ id: "e2", kind: "Reset", status: "Unknown" })], nextCursor: null },
      isLoading: false,
      isError: false,
      isFetching: false,
    };
    useSensorEventsMock.mockImplementation(
      (_agentId: string, _sensorId: string, params: { cursor?: string | null } = {}) =>
        params.cursor === "c1" ? secondPage : firstPage,
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Ações do sensor Disco C:/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Histórico/ }));

    expect(screen.getByText("Mudança de estado")).toBeTruthy();
    // A primeira página usa só limit (cursor null).
    expect(useSensorEventsMock).toHaveBeenCalledWith("a1", "s1", { limit: 50 });

    fireEvent.click(screen.getByRole("button", { name: /Carregar mais/ }));

    // A segunda página pede o cursor devolvido pelo servidor...
    expect(useSensorEventsMock).toHaveBeenCalledWith("a1", "s1", { limit: 50, cursor: "c1" });
    // ...e a lista acumula (o evento anterior continua visível).
    expect(screen.getByText("Mudança de estado")).toBeTruthy();
    expect(screen.getByText("Estado zerado")).toBeTruthy();
    expect(screen.getByText(/Fim do histórico/)).toBeTruthy();
  });

  it("hover-card mostra valores completos (sem truncate) e liga o modo clamp", async () => {
    vi.useFakeTimers();
    renderPanel({
      payload: payload({
        items: [sensor({ outputExcerpt: "linha 1\nlinha 2\nlinha 3" })],
      }),
    });

    const row = screen
      .getAllByRole("row")
      .find((candidate) => candidate.querySelector("td")) as HTMLElement;
    fireEvent.mouseOver(row);
    await act(async () => {
      // Delay configurado no painel (rowHoverDelayMs=1200) + rAF de ajuste.
      await vi.advanceTimersByTimeAsync(1200);
      await vi.advanceTimersByTimeAsync(32);
    });

    const dialog = screen.getByRole("dialog");
    // O painel é o consumidor que ativa o modo opt-in (card rola em vez de ser
    // recortado no fim da área visível).
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.className).toContain("pointer-events-auto");

    // DetailItem sem truncate: o valor quebra a linha e aparece completo.
    const label = within(dialog).getByText("Limiares");
    const value = (label.parentElement as HTMLElement).querySelectorAll("p")[1] as HTMLElement;
    expect(value.textContent).toContain("atenção 15%");
    expect(value.className).not.toContain("truncate");
    expect(value.className).toContain("break-words");
    // O title antigo só existia para valores string (ReactNode ficava sem
    // alternativa): com a quebra de linha ele deixou de ser necessário.
    expect(value.getAttribute("title")).toBeNull();

    // "Saída (trecho)" ganhou mais altura antes de rolar (era max-h-24).
    const pre = dialog.querySelector("pre") as HTMLElement;
    expect(pre.className).not.toContain("max-h-24");
    expect(pre.className).toContain("max-h-64");
  });
});
