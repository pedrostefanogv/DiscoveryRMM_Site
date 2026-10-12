import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { useParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Listagem de scripts de automação.
 *
 * Regressões cobertas:
 *  - a coluna "Ações" não existe mais (as ações foram para o botão direito);
 *  - clicar em um item navega para a página de detalhes/consulta;
 *  - o botão direito abre o menu com abrir/editar/auditoria/excluir.
 */
const { script } = vi.hoisted(() => ({
  script: {
    id: "s1",
    clientId: "c1",
    name: "Limpar temporarios",
    summary: "Remove arquivos temporarios",
    scriptType: "PowerShell",
    version: "2.0.0",
    isActive: true,
    lastUpdatedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
  },
}));

vi.mock("@/hooks/useClients", () => ({
  useClients: () => ({ data: [{ id: "c1", name: "Cliente A" }] }),
}));

vi.mock("@/hooks/useAutomation", () => ({
  useAutomationScripts: () => ({
    data: { items: [script], hasMore: false, nextCursor: null },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useDeleteAutomationScript: () => ({ mutate: vi.fn(), isPending: false }),
  useAutomationScriptAudit: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import AutomationScriptsPage from "./AutomationScriptsPage";

function ScriptDetailStub() {
  const { id } = useParams<{ id: string }>();
  return <p>detalhe do script {id}</p>;
}

function renderAt(entry: string) {
  const router = createMemoryRouter(
    [
      { path: "/automation/scripts", element: <AutomationScriptsPage /> },
      { path: "/automation/scripts/:id", element: <ScriptDetailStub /> },
      { path: "/automation/scripts/:id/edit", element: <p>editor de script</p> },
    ],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AutomationScriptsPage", () => {
  it("não expõe mais a coluna de ações", () => {
    renderAt("/automation/scripts");
    expect(screen.getByText("Limpar temporarios")).toBeTruthy();
    expect(screen.queryByText("Ações")).toBeNull();
    expect(screen.queryByRole("button", { name: /^editar$/i })).toBeNull();
  });

  it("abre a página de detalhes ao clicar no item", async () => {
    renderAt("/automation/scripts");
    fireEvent.click(screen.getByText("Limpar temporarios"));
    expect(await screen.findByText("detalhe do script s1")).toBeTruthy();
  });

  it("abre o menu de ações no botão direito", async () => {
    renderAt("/automation/scripts");
    const row = screen.getByText("Limpar temporarios").closest("tr");
    expect(row).toBeTruthy();
    fireEvent.contextMenu(row as HTMLTableRowElement);

    expect(await screen.findByRole("menuitem", { name: /abrir detalhes/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /editar/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /auditoria/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /excluir/i })).toBeTruthy();
  });

  it("navega para a consulta pelo item do menu", async () => {
    renderAt("/automation/scripts");
    fireEvent.contextMenu(screen.getByText("Limpar temporarios").closest("tr") as HTMLTableRowElement);
    fireEvent.click(await screen.findByRole("menuitem", { name: /abrir detalhes/i }));

    expect(await screen.findByText("detalhe do script s1")).toBeTruthy();
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("navega para a edição pelo item do menu", async () => {
    renderAt("/automation/scripts");
    fireEvent.contextMenu(screen.getByText("Limpar temporarios").closest("tr") as HTMLTableRowElement);
    fireEvent.click(await screen.findByRole("menuitem", { name: /^editar$/i }));

    expect(await screen.findByText("editor de script")).toBeTruthy();
  });

  it("abre a auditoria pelo item do menu", async () => {
    renderAt("/automation/scripts");
    fireEvent.contextMenu(screen.getByText("Limpar temporarios").closest("tr") as HTMLTableRowElement);
    fireEvent.click(await screen.findByRole("menuitem", { name: /auditoria/i }));

    expect(await screen.findByText("Auditoria do script")).toBeTruthy();
    expect(screen.getByText("Nenhum evento de auditoria encontrado.")).toBeTruthy();
  });
});
