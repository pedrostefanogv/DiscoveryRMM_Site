import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Página de detalhes/consulta de um script de automação.
 *
 * Regressões cobertas:
 *  - o detalhe renderiza nome, tipo, versão e conteúdo em modo leitura;
 *  - "Editar" leva para a tela dedicada de edição.
 */
const { detail, mutateAsync } = vi.hoisted(() => ({
  detail: {
    id: "s1",
    clientId: "c1",
    name: "Limpar temporarios",
    summary: "Remove arquivos temporarios",
    scriptType: "PowerShell",
    version: "2.0.0",
    isActive: true,
    lastUpdatedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    content: 'Write-Output "ok"',
    contentHashSha256: "abcdef0123456789",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  mutateAsync: vi.fn(),
}));

vi.mock("@/components/custom-fields/CustomFieldsUsedByPanel", () => ({
  CustomFieldsUsedByPanel: () => null,
}));

vi.mock("@/hooks/useClients", () => ({
  useClients: () => ({ data: [{ id: "c1", name: "Cliente A" }] }),
}));

vi.mock("@/hooks/useAutomation", () => ({
  useAutomationScript: () => ({ data: detail, isLoading: false, isError: false, refetch: vi.fn() }),
  useConsumeAutomationScript: () => ({ mutateAsync, isPending: false }),
  useAutomationScriptAudit: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

import AutomationScriptViewPage from "./AutomationScriptViewPage";

function renderAt(entry: string) {
  const router = createMemoryRouter(
    [
      { path: "/automation/scripts/:id", element: <AutomationScriptViewPage /> },
      { path: "/automation/scripts/:id/edit", element: <p>editor de script</p> },
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
});

describe("AutomationScriptViewPage", () => {
  it("mostra os dados e o conteúdo do script em modo consulta", () => {
    renderAt("/automation/scripts/s1");

    expect(screen.getByText("Limpar temporarios")).toBeTruthy();
    expect((screen.getByLabelText("Cliente") as HTMLInputElement).value).toBe("Cliente A");
    expect((screen.getByLabelText("ScriptType") as HTMLInputElement).value).toBe("PowerShell");
    expect((screen.getByLabelText("Versão") as HTMLInputElement).value).toBe("2.0.0");
    expect((screen.getByLabelText("Conteúdo do script") as HTMLTextAreaElement).value).toBe(
      'Write-Output "ok"',
    );
  });

  it("leva para a edição ao clicar em Editar", async () => {
    renderAt("/automation/scripts/s1");
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(await screen.findByText("editor de script")).toBeTruthy();
  });

  it("não permite consumir script inativo", () => {
    detail.isActive = false;
    try {
      renderAt("/automation/scripts/s1");

      expect(
        (screen.getByRole("button", { name: /registrar consumo/i }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(screen.getByText(/Script inativo: a API só gera payload de consumo/)).toBeTruthy();
    } finally {
      detail.isActive = true;
    }
  });

  it("registra o consumo e exibe o payload sem depender do hash", async () => {
    // Hash ausente: o consumo deve continuar sendo reportado como sucesso.
    mutateAsync.mockResolvedValueOnce({ ...detail, scriptId: detail.id, contentHashSha256: "" });
    renderAt("/automation/scripts/s1");

    fireEvent.click(screen.getByRole("button", { name: /registrar consumo/i }));

    expect(await screen.findByText(/"scriptId": "s1"/)).toBeTruthy();
    expect(mutateAsync).toHaveBeenCalledWith("s1");
  });
});
