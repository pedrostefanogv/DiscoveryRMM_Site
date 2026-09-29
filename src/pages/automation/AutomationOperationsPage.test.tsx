import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Página de operações: contexto do agent, KPIs, filtros e reenvio.
 *
 * Regressões cobertas:
 *  - force sync envia as flags (antes eram descartadas pelo backend);
 *  - link profundo (?agentId=) resolve cliente/site do agente;
 *  - nome de task/script aparece no histórico (antes só GUID).
 */
const {
  runTaskNowMock,
  runScriptNowMock,
  forceSyncMock,
  runTaskForScopeMock,
  runScriptForScopeMock,
  forceSyncForScopeMock,
  cancelExecutionMock,
  toastErrorMock,
  toastSuccessMock,
  hasAnyPermissionMock,
} = vi.hoisted(() => ({
  runTaskNowMock: vi.fn(),
  runScriptNowMock: vi.fn(),
  forceSyncMock: vi.fn(),
  runTaskForScopeMock: vi.fn(),
  runScriptForScopeMock: vi.fn(),
  forceSyncForScopeMock: vi.fn(),
  cancelExecutionMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  hasAnyPermissionMock: vi.fn(() => true),
}));

const bulkResult = {
  scope: "site",
  scopeId: "s1",
  correlationId: "bulk-task-1",
  totalAgents: 2,
  eligibleAgents: 2,
  dispatched: 1,
  queued: 1,
  failed: 0,
  skippedOffline: 0,
  skippedMaintenance: 0,
  items: [
    { agentId: "agent-1", hostname: "PC-001", status: "dispatched", error: null },
    {
      agentId: "agent-2",
      hostname: "PC-002",
      status: "queued",
      error: "agent offline: aguardando reconexão",
    },
  ],
};

/** Mutation fake que resolve com o resultado do lote. */
function scopeMutation(capture: (vars: unknown) => void) {
  return (vars: unknown, options?: { onSuccess?: (result: unknown) => void }) => {
    capture(vars);
    options?.onSuccess?.(bulkResult);
  };
}

vi.mock("@/auth/authorization", () => ({
  useAuthorization: () => ({ hasAnyPermission: hasAnyPermissionMock }),
}));

const agent = {
  id: "agent-1",
  clientId: "c1",
  siteId: "s1",
  hostname: "PC-001",
  displayName: "Recepção",
  operatingSystem: "Windows 11",
  osVersion: "23H2",
  agentVersion: "1.0.0",
  isOnline: true,
  lastSeen: "2026-01-01T00:00:00Z",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const executions = [
  {
    id: "e1",
    commandId: "cmd-1",
    agentId: "agent-1",
    taskId: "t1",
    scriptId: null,
    sourceType: "RunNow",
    status: "Completed",
    correlationId: "corr-1",
    createdAt: "2026-01-01T10:00:00Z",
    acknowledgedAt: "2026-01-01T10:00:05Z",
    resultReceivedAt: "2026-01-01T10:00:20Z",
    exitCode: 0,
    errorMessage: null,
    requestMetadataJson: null,
    ackMetadataJson: null,
    resultMetadataJson: null,
    taskName: "Instalar Chrome",
    scriptName: null,
  },
  {
    id: "e2",
    commandId: "cmd-2",
    agentId: "agent-1",
    taskId: null,
    scriptId: "s1",
    sourceType: "RunNow",
    status: "Failed",
    correlationId: "corr-2",
    createdAt: "2026-01-01T11:00:00Z",
    acknowledgedAt: "2026-01-01T11:00:02Z",
    resultReceivedAt: "2026-01-01T11:00:30Z",
    exitCode: 1,
    errorMessage: "exit 1",
    requestMetadataJson: null,
    ackMetadataJson: null,
    resultMetadataJson: null,
    taskName: null,
    scriptName: "Limpar Temp",
  },
  {
    id: "e3",
    commandId: "cmd-3",
    agentId: "agent-1",
    taskId: "t2",
    scriptId: null,
    sourceType: "RunNow",
    status: "Dispatched",
    correlationId: "corr-3",
    createdAt: "2026-01-01T12:00:00Z",
    acknowledgedAt: null,
    resultReceivedAt: null,
    exitCode: null,
    errorMessage: null,
    requestMetadataJson: null,
    ackMetadataJson: null,
    resultMetadataJson: null,
    taskName: "Aplicar Política",
    scriptName: null,
  },
];

vi.mock("react-hot-toast", () => {
  // O default é chamável (toast("...")) e também expõe success/error.
  const toastFn = (...args: unknown[]) => toastSuccessMock(...args);
  return {
    default: Object.assign(toastFn, {
      success: (...args: unknown[]) => toastSuccessMock(...args),
      error: (...args: unknown[]) => toastErrorMock(...args),
    }),
  };
});

vi.mock("@/hooks/useAutomation", () => ({
  useAutomationScripts: () => ({
    data: { items: [{ id: "s1", name: "Limpar Temp" }] },
    isLoading: false,
  }),
  useAutomationTasks: () => ({
    data: { items: [{ id: "t1", name: "Instalar Chrome" }] },
    isLoading: false,
  }),
  useAutomationExecutions: (
    _agentId: string,
    filters: { status?: string; sourceType?: string; taskId?: string; scriptId?: string } = {},
  ) => {
    const data = executions.filter((execution) => {
      if (filters.status && String(execution.status) !== filters.status) return false;
      if (filters.taskId && execution.taskId !== filters.taskId) return false;
      if (filters.scriptId && execution.scriptId !== filters.scriptId) return false;
      return true;
    });
    return { data, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useRunAutomationTaskNow: () => ({ mutate: runTaskNowMock, isPending: false }),
  useRunAutomationScriptNow: () => ({ mutate: runScriptNowMock, isPending: false }),
  useForceAutomationSync: () => ({ mutate: forceSyncMock, isPending: false }),
  useRunAutomationTaskForScope: () => ({ mutate: scopeMutation(runTaskForScopeMock), isPending: false }),
  useRunAutomationScriptForScope: () => ({ mutate: scopeMutation(runScriptForScopeMock), isPending: false }),
  useForceAutomationSyncForScope: () => ({ mutate: scopeMutation(forceSyncForScopeMock), isPending: false }),
  useCancelAutomationExecution: () => ({ mutate: cancelExecutionMock, isPending: false }),
}));

const clientAgents = [
  agent,
  { ...agent, id: "agent-2", hostname: "PC-002", displayName: null, isOnline: false },
];

vi.mock("@/hooks/useAgents", () => ({
  // O hook real fica disabled sem id — devolver dados sempre mascararia a
  // resolução do deep link e poluiria o contexto.
  useAgent: (id?: string) => ({ data: id ? agent : undefined, isLoading: false }),
  useAgentsBySite: () => ({ data: [agent], isLoading: false }),
  useAgentsByClient: () => ({ data: clientAgents, isLoading: false }),
}));

// O realtime usa useQueryClient + NATS: fora do escopo deste teste de UI.
vi.mock("@/hooks/useAutomationExecutionsRealtime", () => ({
  useAutomationExecutionsRealtime: vi.fn(),
  isAutomationExecutionEventForAgent: vi.fn(() => true),
}));

vi.mock("@/hooks/useClients", () => ({
  useClients: () => ({ data: [{ id: "c1", name: "Acme" }], isLoading: false }),
}));

vi.mock("@/hooks/useSites", () => ({
  useSites: () => ({ data: [{ id: "s1", name: "Matriz" }], isLoading: false }),
}));

import AutomationOperationsPage from "./AutomationOperationsPage";

function renderPage(entry = "/automation/operations?agentId=agent-1") {
  const router = createMemoryRouter(
    [
      { path: "/automation/operations", element: <AutomationOperationsPage /> },
      { path: "/agents/:id", element: <p>DETALHE DO AGENT</p> },
    ],
    { initialEntries: [entry] },
  );
  return render(<RouterProvider router={router} />);
}

/** Texto da tabela de histórico (evita casar com opções dos selects). */
function tableText(): string {
  return document.querySelector("table")?.textContent ?? "";
}

describe("AutomationOperationsPage", () => {
  beforeEach(() => {
    runTaskNowMock.mockClear();
    runScriptNowMock.mockClear();
    forceSyncMock.mockClear();
    toastErrorMock.mockClear();
    toastSuccessMock.mockClear();
    hasAnyPermissionMock.mockReset();
    hasAnyPermissionMock.mockReturnValue(true);
    runTaskForScopeMock.mockClear();
    runScriptForScopeMock.mockClear();
    forceSyncForScopeMock.mockClear();
    cancelExecutionMock.mockClear();
  });

  afterEach(() => cleanup());

  it("resolve o alvo do link profundo e mostra o histórico com nomes", () => {
    renderPage();

    // ?agentId= → agente resolvido via API e contexto preenchido.
    expect(screen.getByText("Recepção")).toBeTruthy();
    // Nomes resolvidos pela API (antes a coluna só mostrava GUIDs).
    expect(tableText()).toContain("Instalar Chrome");
    expect(tableText()).toContain("Limpar Temp");
  });

  it("filtra somente falhas", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Somente falhas/ }));

    expect(tableText()).not.toContain("Instalar Chrome");
    expect(tableText()).toContain("Limpar Temp");
  });

  it("reenvia a execução falhada pelo script de origem", () => {
    renderPage();

    // Linha 2 = execução falhada de script.
    fireEvent.click(screen.getAllByTitle("Reenviar esta operação para o agent")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reenvio" }));

    expect(runScriptNowMock).toHaveBeenCalledTimes(1);
    expect(runScriptNowMock.mock.calls[0][0]).toMatchObject({
      agentId: "agent-1",
      scriptId: "s1",
    });
  });

  it("opera o site inteiro a partir do seletor de escopo", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Site inteiro" }));
    expect(screen.queryByLabelText("Agent")).toBeNull();

    fireEvent.change(screen.getByLabelText("Tarefa"), { target: { value: "t1" } });
    fireEvent.click(screen.getByRole("button", { name: /Executar tarefa/ }));
    // Confirmação mostra o alcance antes de disparar.
    expect(screen.getByText("Confirmar operação em massa")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Executar no escopo" }));

    expect(runTaskForScopeMock).toHaveBeenCalledTimes(1);
    expect(runTaskForScopeMock.mock.calls[0][0]).toMatchObject({
      scope: { clientId: "c1", siteId: "s1" },
      taskId: "t1",
    });
  });

  it("opera o cliente inteiro (sem site) e enfileira agentes offline", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Cliente inteiro" }));
    fireEvent.change(screen.getByLabelText("Tarefa"), { target: { value: "t1" } });
    fireEvent.click(screen.getByRole("button", { name: /Executar tarefa/ }));
    fireEvent.click(screen.getByRole("button", { name: "Executar no escopo" }));

    expect(runTaskForScopeMock.mock.calls[0][0]).toMatchObject({
      scope: { clientId: "c1" },
      taskId: "t1",
    });

    // Painel de resultado: 1 enviado agora, 1 na fila para a reconexão.
    expect(screen.getByText("Resultado do último lote")).toBeTruthy();
    expect(screen.getByText("Na fila (offline)")).toBeTruthy();
  });

  it("não deixa disparar em massa sem escopo selecionado", () => {
    // Sem deep link: nenhum cliente selecionado.
    renderPage("/automation/operations");

    fireEvent.click(screen.getByRole("button", { name: "Site inteiro" }));
    expect(
      screen.getByRole("button", { name: /Executar tarefa/ }).hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cliente inteiro" }));
    expect(
      screen.getByRole("button", { name: /Executar tarefa/ }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("cancela uma execução pendente (comando sai da reentrega)", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar execução" }));

    expect(cancelExecutionMock).toHaveBeenCalledTimes(1);
    expect(cancelExecutionMock.mock.calls[0][0]).toMatchObject({
      agentId: "agent-1",
      executionId: "e3",
    });
  });

  it("desabilita os disparos quando a conta não tem permissão de execução", () => {
    hasAnyPermissionMock.mockReturnValue(false);
    renderPage();

    for (const name of ["Executar tarefa", "Executar script", "Executar force sync"]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
    for (const retry of screen.getAllByRole("button", { name: "Reenviar" })) {
      expect(retry.hasAttribute("disabled")).toBe(true);
    }
  });

  it("não dispara force sync com todas as opções desmarcadas", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Policies"), { target: { value: "false" } });
    fireEvent.change(screen.getByLabelText("Inventory"), { target: { value: "false" } });
    fireEvent.click(screen.getByRole("button", { name: "Executar force sync" }));

    expect(forceSyncMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it("envia as flags de force sync para o backend", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Policies"), { target: { value: "false" } });
    fireEvent.change(screen.getByLabelText("Inventory"), { target: { value: "false" } });
    fireEvent.change(screen.getByLabelText("Software"), { target: { value: "true" } });
    fireEvent.click(screen.getByRole("button", { name: "Executar force sync" }));

    expect(forceSyncMock).toHaveBeenCalledTimes(1);
    expect(forceSyncMock.mock.calls[0][0]).toMatchObject({
      agentId: "agent-1",
      request: {
        policies: false,
        inventory: false,
        software: true,
        appStore: false,
      },
    });
  });
});
