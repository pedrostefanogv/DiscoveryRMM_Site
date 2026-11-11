import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────
//
// A página é testada com os HOOKS REAIS (useSensorDefinitions/useDeleteSensor)
// e apenas o CLIENTE HTTP mockado: assim o teste cobre de verdade o caminho
// api.listDefinitions -> tabela e delete -> sensorsApi.remove + invalidação do
// cache (SENSOR_KEYS.all), em vez de validar apenas que um mock foi chamado.
vi.mock("@/api/sensors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/sensors")>();
  return {
    ...actual,
    sensorsApi: {
      ...actual.sensorsApi,
      listDefinitions: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  };
});

vi.mock("@/hooks/useClients", () => ({
  useClients: () => ({
    data: [{ id: "c1", name: "Cliente Um" }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSites", () => ({
  useSites: () => ({
    data: [{ id: "s1", name: "Matriz" }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

// O modal é de outro arquivo (compartilhado com a aba do agente); aqui ele é
// isolado. O stub guarda a ÚLTIMA chamada de onSave de cada instância e o botão
// abaixo a dispara — sem isso não há como exercitar o caminho criar/editar, que
// é justamente o que a página decide.
const modalCalls: { open: boolean; onSave: (data: unknown, sensorId?: string) => Promise<void> }[] =
  [];

vi.mock("@/components/agents/SensorFormModal", () => ({
  default: (props: {
    open: boolean;
    onClose: () => void;
    clientId: string | null;
    siteId: string | null;
    sensor: { sensorId: string } | null;
    onSave: (data: unknown, sensorId?: string) => Promise<void>;
  }) => {
    modalCalls.push({ open: props.open, onSave: props.onSave });
    if (!props.open) return null;
    // Lista o escopo herdado da URL: o teste confere o pré-preenchimento.
    return (
      <div data-testid="sensor-form-modal">
        <span data-testid="modal-mode">{props.sensor ? "edicao" : "criacao"}</span>
        <span data-testid="modal-escopo">
          {props.clientId ?? "-"}|{props.siteId ?? "-"}
        </span>
        <button
          type="button"
          data-testid="modal-save"
          onClick={() =>
            void props
              .onSave({ name: "Sensor novo", sensorType: "DiskSpace" }, props.sensor?.sensorId)
              .catch(() => {})
          }
        >
          salvar-modal
        </button>
      </div>
    );
  },
}));

import { sensorsApi } from "@/api/sensors";
import { SENSOR_KEYS } from "@/hooks/useSensors";
import { AppApprovalScopeType } from "@/api/types";
import type { SensorDefinition } from "@/api";
import SensorsManagePage from "./SensorsManagePage";

const CLIENT_GUID = "11111111-2222-3333-4444-555555555555";
const SITE_GUID = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const AGENT_GUID = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
const DEFINITION_ID = "dddddddd-1111-2222-3333-444444444444";
const SECOND_ID = "dddddddd-5555-6666-7777-888888888888";
const ORPHAN_ID = "dddddddd-9999-0000-1111-222222222222";

/** Definição completa (contrato do API) com overrides por teste. */
function definition(over: Partial<SensorDefinition> = {}): SensorDefinition {
  return {
    id: DEFINITION_ID,
    key: "disco",
    name: "Disco C:",
    description: "Espaço livre do volume do sistema",
    sensorType: "DiskSpace",
    scopeType: AppApprovalScopeType.Agent,
    clientId: CLIENT_GUID,
    siteId: SITE_GUID,
    agentId: AGENT_GUID,
    clientName: "Cliente Um",
    siteName: "Matriz",
    agentName: "WS-01",
    includeTags: [],
    excludeTags: [],
    target: "C:",
    warningThreshold: 15,
    criticalThreshold: 10,
    thresholdUnit: "Percent",
    comparison: "LowerIsWorse",
    optionsJson: null,
    scriptId: null,
    scriptName: null,
    channels: [],
    extractorsJson: null,
    exitCodeMapJson: null,
    chartJson: null,
    intervalSeconds: 300,
    timeoutSeconds: 10,
    storeSamples: true,
    failsBeforeAlert: 2,
    autoTicketPolicy: "OnEscalation" as const,
    autoTicketMinDurationSeconds: 0,
    autoTicketImpact: "Medium" as const,
    minSeverityToAlert: "Warning",
    severityWhenFailing: "Critical",
    alertOnSensorError: true,
    displayOrder: 0,
    isPinned: false,
    isActive: true,
    lastUpdatedAt: "2026-11-03T12:00:00Z",
    createdAt: "2026-11-01T09:00:00Z",
    updatedAt: "2026-11-03T12:00:00Z",
    createdBy: "operador",
    isInherited: false,
    sourceScope: null,
    ...over,
  };
}

const DEFINITIONS: SensorDefinition[] = [
  definition(),
  definition({
    id: SECOND_ID,
    key: "cpu",
    name: "CPU",
    description: null,
    sensorType: "Cpu",
    scopeType: AppApprovalScopeType.Global,
    clientId: null,
    siteId: null,
    agentId: null,
    clientName: null,
    siteName: null,
    agentName: null,
    target: null,
    isActive: false,
  }),
];

let queryClient: QueryClient;

function renderPage(initialEntry = "/sensors/manage") {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SensorsManagePage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Espelha a URL corrente para conferir os filtros persistidos. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="url">{location.search}</span>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  modalCalls.length = 0;
  vi.mocked(sensorsApi.listDefinitions).mockResolvedValue(DEFINITIONS);
  vi.mocked(sensorsApi.create).mockResolvedValue(definition());
  vi.mocked(sensorsApi.remove).mockResolvedValue(undefined);
  vi.mocked(sensorsApi.update).mockResolvedValue(definition());
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.clearAllMocks();
});

describe("SensorsManagePage", () => {
  it("mostra NOMES de cliente/site/agente em vez dos GUIDs", async () => {
    renderPage();

    expect(await screen.findByText("Disco C:")).toBeTruthy();
    // Nomes resolvidos pela API (clientName/siteName/agentName). "Cliente Um"
    // aparece também como opção do filtro, então a asserção é por presença.
    expect(screen.getAllByText("Cliente Um").length).toBeGreaterThan(1);
    expect(screen.getByText("Matriz · WS-01")).toBeTruthy();
    // GUID completo nunca aparece na tabela.
    expect(screen.queryByText(CLIENT_GUID)).toBeNull();
    expect(screen.queryByText(AGENT_GUID)).toBeNull();
  });

  it("cai para o GUID curto quando a API não resolve o nome do escopo", async () => {
    vi.mocked(sensorsApi.listDefinitions).mockResolvedValue([
      definition({
        id: ORPHAN_ID,
        name: "Sensor órfão",
        clientId: CLIENT_GUID,
        clientName: null,
        siteId: null,
        siteName: null,
        agentId: null,
        agentName: null,
        scopeType: AppApprovalScopeType.Client,
      }),
    ]);
    renderPage();

    expect(await screen.findByText("Sensor órfão")).toBeTruthy();
    // 8 primeiros caracteres do GUID — legível e sem o GUID inteiro.
    expect(screen.getByText(CLIENT_GUID.slice(0, 8))).toBeTruthy();
    expect(screen.queryByText(CLIENT_GUID)).toBeNull();
  });

  it("persiste os filtros na URL e refaz a consulta com eles", async () => {
    renderPage();
    await screen.findByText("Disco C:");

    // Filtro por TIPO.
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "Cpu" } });
    await waitFor(() => {
      expect(screen.getByTestId("url").textContent).toBe("?sensorType=Cpu");
    });
    await waitFor(() => {
      expect(vi.mocked(sensorsApi.listDefinitions)).toHaveBeenLastCalledWith(
        expect.objectContaining({ sensorType: "Cpu", includeInactive: true }),
      );
    });

    // Filtro por STATUS (Ativos/Inativos).
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "inactive" } });
    await waitFor(() => {
      expect(screen.getByTestId("url").textContent).toContain("status=inactive");
    });
    await waitFor(() => {
      expect(vi.mocked(sensorsApi.listDefinitions)).toHaveBeenLastCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  it("busca com debounce: só consulta depois de parar de digitar", async () => {
    renderPage();
    await screen.findByText("Disco C:");

    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "cpu" } });

    // Antes do debounce (300ms) a consulta NÃO mudou.
    expect(vi.mocked(sensorsApi.listDefinitions)).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "cpu" }),
    );

    await waitFor(
      () => {
        expect(vi.mocked(sensorsApi.listDefinitions)).toHaveBeenLastCalledWith(
          expect.objectContaining({ search: "cpu" }),
        );
      },
      { timeout: 2000 },
    );
    await waitFor(() => {
      expect(screen.getByTestId("url").textContent).toBe("?q=cpu");
    });
  });

  it("exclui chamando sensorsApi.remove e invalidando o cache de sensores", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderPage();
    await screen.findByText("Disco C:");

    fireEvent.click(screen.getByRole("button", { name: "Excluir Disco C:" }));

    // O ConfirmDialog abre com o nome da definição e a ação irreversível.
    const dialog = await screen.findByText(/Esta ação não pode ser desfeita/);
    expect(dialog).toBeTruthy();
    const confirm = within(document.body).getByRole("button", { name: "Excluir" });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(vi.mocked(sensorsApi.remove)).toHaveBeenCalledWith(DEFINITION_ID);
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SENSOR_KEYS.all });
    });
  });

  it("ativa/desativa a definição com update parcial (só isActive)", async () => {
    renderPage();
    await screen.findByText("Disco C:");

    fireEvent.click(screen.getByRole("button", { name: "Desativar Disco C:" }));

    await waitFor(() => {
      expect(vi.mocked(sensorsApi.update)).toHaveBeenCalledWith(DEFINITION_ID, {
        isActive: false,
      });
    });
  });

  it("mostra o estado vazio quando não há definições", async () => {
    vi.mocked(sensorsApi.listDefinitions).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("Nenhum sensor cadastrado")).toBeTruthy();
    // A página agora cria: o texto orienta o botão em vez de mandar para o agente.
    expect(screen.getByText(/Use o botão "Novo sensor"/)).toBeTruthy();
  });

  it("estado vazio com filtro explica que é o recorte, não a ausência de sensores", async () => {
    vi.mocked(sensorsApi.listDefinitions).mockResolvedValue([]);
    renderPage("/sensors/manage?clientId=c1");

    expect(await screen.findByText("Nenhum sensor neste filtro")).toBeTruthy();
    expect(screen.getByText(/Ajuste os filtros/)).toBeTruthy();
  });

  it("cria o sensor pelo botão 'Novo sensor' e invalida o cache de sensores", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderPage();
    await screen.findByText("Disco C:");

    // Nenhum modal aberto até o clique.
    expect(screen.queryByTestId("sensor-form-modal")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Novo sensor" }));

    const modal = await screen.findByTestId("sensor-form-modal");
    expect(within(modal).getByTestId("modal-mode").textContent).toBe("criacao");

    fireEvent.click(within(modal).getByTestId("modal-save"));

    await waitFor(() => {
      expect(vi.mocked(sensorsApi.create)).toHaveBeenCalledWith({
        name: "Sensor novo",
        sensorType: "DiskSpace",
      });
    });
    // Criar NÃO pode cair no update.
    expect(vi.mocked(sensorsApi.update)).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SENSOR_KEYS.all });
    });
    // Sucesso fecha o modal de criação.
    await waitFor(() => {
      expect(screen.queryByTestId("sensor-form-modal")).toBeNull();
    });
  });

  it("pré-preenche o escopo da criação com os filtros da URL", async () => {
    renderPage(`/sensors/manage?clientId=${CLIENT_GUID}&siteId=${SITE_GUID}`);
    await screen.findByText("Disco C:");

    fireEvent.click(screen.getByRole("button", { name: "Novo sensor" }));

    const modal = await screen.findByTestId("sensor-form-modal");
    expect(within(modal).getByTestId("modal-escopo").textContent).toBe(
      `${CLIENT_GUID}|${SITE_GUID}`,
    );
  });

  it("abre a criação quando a URL traz ?new=1 e consome o parâmetro", async () => {
    renderPage("/sensors/manage?new=1");
    await screen.findByText("Disco C:");

    // O modal de criação abre pelo link vindo da página de frota...
    const modal = await screen.findByTestId("sensor-form-modal");
    expect(within(modal).getByTestId("modal-mode").textContent).toBe("criacao");
    // ...e o parâmetro sai da URL (senão o F5 reabriria o modal).
    await waitFor(() => {
      expect(screen.getByTestId("url").textContent).not.toContain("new=1");
    });
    expect(screen.getByTestId("url").textContent).toBe("");

    // Fechar depois disso não reabre (o efeito não tem o que consumir).
    fireEvent.click(screen.getByRole("button", { name: "Novo sensor" }));
    expect(screen.getByTestId("sensor-form-modal")).toBeTruthy();
  });

  it("edita com update (sensorId preenchido) quando o modal vem da linha", async () => {
    renderPage();
    await screen.findByText("Disco C:");

    fireEvent.click(screen.getByRole("button", { name: "Editar Disco C:" }));

    const modal = await screen.findByTestId("sensor-form-modal");
    expect(within(modal).getByTestId("modal-mode").textContent).toBe("edicao");

    fireEvent.click(within(modal).getByTestId("modal-save"));

    await waitFor(() => {
      expect(vi.mocked(sensorsApi.update)).toHaveBeenCalledWith(DEFINITION_ID, {
        name: "Sensor novo",
        sensorType: "DiskSpace",
      });
    });
    // Editar NÃO pode criar uma definição nova.
    expect(vi.mocked(sensorsApi.create)).not.toHaveBeenCalled();
  });
});
