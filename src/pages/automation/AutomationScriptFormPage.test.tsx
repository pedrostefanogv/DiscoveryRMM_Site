import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tela dedicada de criar/editar script (antes era modal na listagem).
 *
 * Regressões cobertas:
 *  - /automation/scripts/new monta o formulário vazio e envia o payload completo;
 *  - /automation/scripts/:id/edit hidrata o formulário a partir do detalhe.
 */
const { createMutate, updateMutate, detail } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  detail: {
    id: "s1",
    clientId: null,
    name: "Limpar temporarios",
    summary: "Remove arquivos temporarios",
    scriptType: "PowerShell",
    version: "2.0.0",
    isActive: true,
    lastUpdatedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    content: 'Write-Output "ok"',
    contentHashSha256: "abc",
    updatedAt: "2026-01-01T00:00:00Z",
  },
}));

vi.mock("@/components/custom-fields/CustomFieldsUsedByPanel", () => ({
  CustomFieldsUsedByPanel: () => null,
}));

vi.mock("@/hooks/useClients", () => ({
  useClients: () => ({ data: [{ id: "c1", name: "Cliente A" }] }),
}));

vi.mock("@/hooks/useAutomation", () => ({
  useAutomationScript: (id: string) =>
    id
      ? { data: detail, isLoading: false, isError: false, refetch: vi.fn() }
      : { data: undefined, isLoading: false, isError: false, refetch: vi.fn() },
  useCreateAutomationScript: () => ({ mutate: createMutate, isPending: false }),
  useUpdateAutomationScript: () => ({ mutate: updateMutate, isPending: false }),
}));

import AutomationScriptFormPage from "./AutomationScriptFormPage";

function renderAt(entry: string) {
  const router = createMemoryRouter(
    [
      { path: "/automation/scripts/new", element: <AutomationScriptFormPage /> },
      { path: "/automation/scripts/:id/edit", element: <AutomationScriptFormPage /> },
      { path: "/automation/scripts", element: <p>lista de scripts</p> },
    ],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  detail.scriptType = "PowerShell";
});

describe("AutomationScriptFormPage", () => {
  it("envia o payload completo ao criar um script", () => {
    renderAt("/automation/scripts/new");

    expect(screen.getByText("Novo script")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Meu script" } });
    fireEvent.change(screen.getByLabelText("Resumo *"), {
      target: { value: "Faz alguma coisa" },
    });
    fireEvent.change(screen.getByLabelText("Conteudo do script *"), {
      target: { value: 'Write-Output "ok"' },
    });

    fireEvent.click(screen.getByRole("button", { name: /criar/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [vars] = createMutate.mock.calls[0];
    expect(vars.data).toMatchObject({
      name: "Meu script",
      summary: "Faz alguma coisa",
      content: 'Write-Output "ok"',
      version: "1.0.0",
      isActive: true,
    });
    expect(vars.correlationId).toContain("script-create");
    // Na criação o escopo é escolhido pelo operador.
    expect((screen.getByLabelText("Cliente") as HTMLSelectElement).disabled).toBe(false);
  });

  it("hidrata o formulário a partir do detalhe ao editar", () => {
    renderAt("/automation/scripts/s1/edit");

    expect(screen.getByText("Editar script")).toBeTruthy();
    expect((screen.getByLabelText("Nome *") as HTMLInputElement).value).toBe("Limpar temporarios");
    expect((screen.getByLabelText("Versão") as HTMLInputElement).value).toBe("2.0.0");
    expect((screen.getByLabelText("Conteudo do script *") as HTMLTextAreaElement).value).toBe(
      'Write-Output "ok"',
    );

    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const [vars] = updateMutate.mock.calls[0];
    expect(vars.id).toBe("s1");
    expect(vars.data.version).toBe("2.0.0");
    // A API devolve scriptType como NOME ("PowerShell"): o payload precisa voltar
    // como enum numérico, senão o PUT recebe null e responde 400.
    expect(vars.data.scriptType).toBe(0);
    // A API ignora ClientId no update: o select de escopo fica travado na edição.
    expect((screen.getByLabelText("Cliente") as HTMLSelectElement).disabled).toBe(true);
  });

  it("trata ScriptType desconhecido como Custom em vez de trocar para PowerShell", () => {
    detail.scriptType = "Bash";
    renderAt("/automation/scripts/s1/edit");

    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    const [vars] = updateMutate.mock.calls[0];
    expect(vars.data.scriptType).toBe(4);
  });
});
