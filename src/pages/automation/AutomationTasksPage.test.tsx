import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Filtros da tela /automation/tasks.
 *
 * Regressões cobertas:
 *  - os filtros de tipo de ação e trigger ficam visíveis (não escondidos no avançado);
 *  - o filtro de trigger vai para a query como `triggers` (aplicado no servidor,
 *    então vale para todas as páginas e não só para o que já foi carregado);
 *  - o status vira `isActive` (true/false/undefined);
 *  - "Limpar filtros" zera os parâmetros.
 */
const { listCalls, task } = vi.hoisted(() => ({
  listCalls: [] as Record<string, unknown>[],
  task: {
    id: "t1",
    name: "Instalar Brave",
    description: "Rollout do navegador",
    actionType: "InstallPackage",
    scopeType: "Global",
    scopeId: null,
    scopeName: null,
    isActive: true,
    requiresApproval: false,
    notificationMode: "Silent",
    toastTiming: "After",
    executionOrder: 77,
    lastUpdatedAt: "2026-01-01T00:00:00Z",
  },
}));

vi.mock("@/hooks/useAutomation", () => ({
  useAutomationTasks: (params: Record<string, unknown>) => {
    listCalls.push(params);
    return {
      data: { items: [task], hasMore: false, nextCursor: null },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
  useAutomationScripts: () => ({ data: { items: [] }, isLoading: false, isError: false }),
  useAutomationKnownTags: () => ({ data: [], isLoading: false }),
  useAutomationTask: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useAutomationTaskAudit: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateAutomationTask: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAutomationTask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAutomationTask: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreAutomationTask: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useClients", () => ({ useClients: () => ({ data: [] }) }));
vi.mock("@/hooks/useSites", () => ({ useSites: () => ({ data: [] }) }));
vi.mock("@/hooks/useAgents", () => ({ useAgentsBySite: () => ({ data: [] }) }));
vi.mock("@/hooks/useAppStore", () => ({ useAppStoreCatalog: () => ({ data: { items: [] } }) }));
vi.mock("@/hooks/useCustomFields", () => ({ useAgentCustomFieldMap: () => ({ data: { definitions: [] } }) }));
vi.mock("@/hooks/useAutoKey", () => ({
  useAutoKey: () => ({
    keyForTitle: (title: string) => title,
    markTouched: vi.fn(),
    setTouched: vi.fn(),
  }),
}));

import AutomationTasksPage from "./AutomationTasksPage";

const lastListParams = () => listCalls[listCalls.length - 1];

afterEach(() => {
  cleanup();
  listCalls.length = 0;
  vi.clearAllMocks();
});

describe("AutomationTasksPage — filtros por ação, trigger e status", () => {
  it("mostra os filtros de tipo de ação, trigger e status", () => {
    render(<AutomationTasksPage />);

    expect(screen.getByText("Tipo de ação")).toBeTruthy();
    expect(screen.getByText("Trigger")).toBeTruthy();
    expect(screen.getByLabelText("Status")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Instalar pacote" })).toBeTruthy();
    for (const label of ["Imediato", "Recorrente", "Login do usuário", "Check-in do agent"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("manda o trigger selecionado para a query (filtro no servidor)", () => {
    render(<AutomationTasksPage />);

    fireEvent.click(screen.getByRole("button", { name: "Recorrente" }));

    expect(lastListParams().triggers).toEqual(["Recurring"]);
  });

  it("combina múltiplos triggers", () => {
    render(<AutomationTasksPage />);

    fireEvent.click(screen.getByRole("button", { name: "Imediato" }));
    fireEvent.click(screen.getByRole("button", { name: "Recorrente" }));

    expect(lastListParams().triggers).toEqual(["Immediate", "Recurring"]);
  });

  it("combina múltiplos tipos de ação", () => {
    render(<AutomationTasksPage />);

    fireEvent.click(screen.getByRole("button", { name: "Instalar pacote" }));
    fireEvent.click(screen.getByRole("button", { name: "Executar script" }));

    expect(lastListParams().actionTypes).toEqual(["InstallPackage", "RunScript"]);
  });

  it("traduz o status para isActive", () => {
    render(<AutomationTasksPage />);
    const status = screen.getByLabelText("Status");

    fireEvent.change(status, { target: { value: "inactive" } });
    expect(lastListParams().isActive).toBe(false);

    fireEvent.change(status, { target: { value: "active" } });
    expect(lastListParams().isActive).toBe(true);

    fireEvent.change(status, { target: { value: "" } });
    expect(lastListParams().isActive).toBeUndefined();
  });

  it("limpa todos os filtros", () => {
    render(<AutomationTasksPage />);

    fireEvent.click(screen.getByRole("button", { name: "Imediato" }));
    expect(lastListParams().triggers).toEqual(["Immediate"]);

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    expect(lastListParams().triggers).toBeUndefined();
    expect(lastListParams().actionTypes).toBeUndefined();
    expect(lastListParams().isActive).toBeUndefined();
  });

  it("renderiza a tarefa retornada pela listagem", () => {
    render(<AutomationTasksPage />);

    expect(screen.getByText("Instalar Brave")).toBeTruthy();
  });

  it("mostra a coluna Ordem com o executionOrder da tarefa", () => {
    render(<AutomationTasksPage />);

    expect(screen.getByText("Ordem")).toBeTruthy();
    expect(screen.getByText("77")).toBeTruthy();
  });

  it("mostra o campo Ordem de execução com o default de RunScript ao abrir Nova tarefa", () => {
    render(<AutomationTasksPage />);

    fireEvent.click(screen.getByRole("button", { name: "Nova tarefa" }));

    const field = screen.getByLabelText("Ordem de execução (0–99)") as HTMLInputElement;
    expect(field.value).toBe("40");
  });

  it("atualiza a ordem para o default do ActionType enquanto não foi editada", () => {
    render(<AutomationTasksPage />);

    fireEvent.click(screen.getByRole("button", { name: "Nova tarefa" }));
    fireEvent.change(screen.getByLabelText("ActionType"), { target: { value: "0" } });

    const field = screen.getByLabelText("Ordem de execução (0–99)") as HTMLInputElement;
    expect(field.value).toBe("10");
  });

  it("preserva a ordem digitada ao trocar o ActionType", () => {
    render(<AutomationTasksPage />);

    fireEvent.click(screen.getByRole("button", { name: "Nova tarefa" }));
    const field = screen.getByLabelText("Ordem de execução (0–99)") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "55" } });
    fireEvent.change(screen.getByLabelText("ActionType"), { target: { value: "0" } });

    expect(field.value).toBe("55");
  });
});
