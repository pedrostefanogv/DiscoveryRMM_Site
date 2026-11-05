import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import type { DatasetCatalogItem } from "@/api/types";

// ── Mocks ─────────────────────────────────────────────────
// O wizard busca o catalogo ao montar; devolvemos Hardware + Sensores, o par
// do bug original, para exercitar o fluxo real de montagem do join.
const datasets: DatasetCatalogItem[] = [
  {
    key: "agentHardware",
    type: "agentHardware",
    datasetType: "4",
    name: "Hardware dos Agentes",
    fields: ["agentId", "agentHostname", "osName"],
    fieldMetadata: [
      { field: "agentId", reference: "agentId", isJoinKey: true, defaultAlias: "hw.agentId" },
      { field: "agentHostname", reference: "agentHostname", defaultAlias: "hw.agentHostname" },
      { field: "osName", reference: "osName", defaultAlias: "hw.osName" },
    ],
  },
  {
    key: "agentSensors",
    type: "agentSensors",
    datasetType: "29",
    name: "Sensores (estado e métricas)",
    fields: ["agentId", "sensorName", "severity"],
    fieldMetadata: [
      { field: "agentId", reference: "agentId", isJoinKey: true, defaultAlias: "sns.agentId" },
      { field: "sensorName", reference: "sensorName", defaultAlias: "sns.sensorName" },
      { field: "severity", reference: "severity", defaultAlias: "sns.severity" },
    ],
  },
];

vi.mock("@/hooks/useReportDatasets", () => ({
  useReportDatasets: () => ({
    data: datasets,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();

vi.mock("@/hooks/useReportTemplates", () => ({
  useCreateReportTemplate: () => ({
    mutateAsync: createMutateAsync,
    isPending: false,
  }),
  useUpdateReportTemplate: () => ({
    mutateAsync: updateMutateAsync,
    isPending: false,
  }),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import { ReportTemplateWizard } from "./index";

function renderWizard(props?: { templateId?: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReportTemplateWizard {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Avanca ate o passo de metadados, preenchendo o nome do template. */
function goToMetadata() {
  // Passo 1: escolhe Hardware (fonte principal). O card mostra o `name`.
  fireEvent.click(screen.getByText("Hardware dos Agentes"));
  fireEvent.click(screen.getByRole("button", { name: /Próximo: Organização/ }));
  // Passo 2: segue para metadados. O nome exato evita casar com os botoes
  // do indicador de passos ("Metadados").
  fireEvent.click(screen.getByRole("button", { name: /^Próximo/ }));
}

function fillName() {
  const nameInput = screen.getByPlaceholderText(
    "Ex: Inventário de Dispositivos",
  ) as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: "Meu Template" } });
}

/**
 * Erro 400 no formato que o cliente HTTP produz: parseErrorMessage junta cada
 * "errors[]" como "{field}: {message}" separado por "; ".
 */
function validationError400() {
  return new ApiError(
    400,
    "layoutJson: o campo 'hw.agentIde' nao existe em nenhuma fonte do layout.; " +
      "dataSources[1].join.sourceKey: a chave de origem e obrigatoria a partir da segunda fonte.",
  );
}

beforeEach(() => {
  createMutateAsync.mockReset();
  updateMutateAsync.mockReset();
  navigateMock.mockReset();
});

describe("ReportTemplateWizard - erros de validacao do backend", () => {
  it("CREATE: exibe as 2 mensagens de validacao quando o backend rejeita", async () => {
    createMutateAsync.mockRejectedValueOnce(validationError400());

    renderWizard();
    goToMetadata();
    fillName();

    fireEvent.click(screen.getByRole("button", { name: /Criar Template/ }));

    // As DUAS mensagens precisam aparecer, nao um alert generico.
    await waitFor(() => {
      expect(
        screen.getByText(/o campo 'hw.agentIde' nao existe/),
      ).toBeTruthy();
    });
    expect(screen.getByText(/a chave de origem e obrigatoria/)).toBeTruthy();

    // O campo layoutJson e ancorado no contexto de layout/dados.
    expect(
      screen.getByText("Layout do relatório (fontes, colunas e joins):", {
        exact: false,
      }),
    ).toBeTruthy();

    // Cabecalho do fluxo de criacao.
    expect(screen.getByText("Não foi possível criar o template")).toBeTruthy();
  });

  it("CREATE: mantem o usuario na tela, com o nome preenchido, e nao navega", async () => {
    createMutateAsync.mockRejectedValueOnce(validationError400());

    renderWizard();
    goToMetadata();
    fillName();
    fireEvent.click(screen.getByRole("button", { name: /Criar Template/ }));

    await waitFor(() => {
      expect(screen.getByText(/hw.agentIde/)).toBeTruthy();
    });

    // Estado intacto: o nome continua preenchido.
    const nameInput = screen.getByPlaceholderText(
      "Ex: Inventário de Dispositivos",
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Meu Template");

    // Nao navegou para lugar nenhum.
    expect(navigateMock).not.toHaveBeenCalled();

    // O botao voltou a ficar habilitado.
    const button = screen.getByRole("button", {
      name: /Criar Template/,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("UPDATE: mesmo tratamento no fluxo de edicao", async () => {
    updateMutateAsync.mockRejectedValueOnce(validationError400());

    renderWizard({ templateId: "abc-123" });
    goToMetadata();
    fillName();

    fireEvent.click(screen.getByRole("button", { name: /Salvar Alterações/ }));

    await waitFor(() => {
      expect(screen.getByText(/o campo 'hw.agentIde' nao existe/)).toBeTruthy();
    });
    expect(screen.getByText(/a chave de origem e obrigatoria/)).toBeTruthy();
    expect(
      screen.getByText("Não foi possível salvar as alterações"),
    ).toBeTruthy();
    expect(updateMutateAsync).toHaveBeenCalled();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("SUCESSO: nenhuma mensagem de erro aparece e navega", async () => {
    createMutateAsync.mockResolvedValueOnce({ id: "novo-id" });

    renderWizard();
    goToMetadata();
    fillName();
    fireEvent.click(screen.getByRole("button", { name: /Criar Template/ }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        "/reports/templates/novo-id/edit/wizard",
      );
    });
    expect(screen.queryByText(/Não foi possível/)).toBeNull();
  });

  it("nova tentativa limpa os erros anteriores", async () => {
    createMutateAsync.mockRejectedValueOnce(validationError400());

    renderWizard();
    goToMetadata();
    fillName();
    fireEvent.click(screen.getByRole("button", { name: /Criar Template/ }));

    await waitFor(() => {
      expect(screen.getByText(/hw.agentIde/)).toBeTruthy();
    });

    // Segunda tentativa com sucesso: a mensagem antiga precisa sumir.
    createMutateAsync.mockResolvedValueOnce({ id: "ok-id" });
    fireEvent.click(screen.getByRole("button", { name: /Criar Template/ }));

    await waitFor(() => {
      expect(screen.queryByText(/hw.agentIde/)).toBeNull();
    });
  });
});
