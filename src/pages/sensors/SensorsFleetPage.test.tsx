import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useSensorsFleetSummaryMock } = vi.hoisted(() => ({
  useSensorsFleetSummaryMock: vi.fn(),
}));

vi.mock("@/hooks/useSensors", () => ({
  useSensorsFleetSummary: useSensorsFleetSummaryMock,
}));

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

import SensorsFleetPage from "./SensorsFleetPage";
import type { SensorFleetSummary } from "@/api";

const SUMMARY: SensorFleetSummary = {
  generatedAt: "2026-11-03T12:00:00Z",
  clientId: null,
  siteId: null,
  counts: {
    total: 12,
    passing: 6,
    warning: 3,
    failing: 2,
    pending: 1,
    unknown: 0,
    stale: 2,
    agentsWithFailing: 2,
  },
  byType: [
    { sensorType: "DiskSpace", total: 5, warning: 2, failing: 1 },
    { sensorType: "Cpu", total: 4, warning: 1, failing: 1 },
  ],
  top: [
    {
      agentId: "a1",
      hostname: "WS-01",
      displayName: "Estação Recepção",
      clientId: "c1",
      clientName: "Cliente Um",
      siteId: "s1",
      siteName: "Matriz",
      failing: 2,
      warning: 1,
      worstSeverity: "Critical",
    },
  ],
};

function mockSummary(over: Partial<Record<string, unknown>> = {}) {
  useSensorsFleetSummaryMock.mockReturnValue({
    data: SUMMARY,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...over,
  });
}

/** `initialEntry` permite abrir a página já com os filtros na URL (deep link). */
function renderPage(initialEntry = "/sensors") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SensorsFleetPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useSensorsFleetSummaryMock.mockReset();
  mockSummary();
});

afterEach(() => cleanup());

describe("SensorsFleetPage", () => {
  it("mostra os cards de contagem, a tabela por tipo e o top de agentes", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Sensores" })).toBeTruthy();
    // Cards (rótulos únicos do cabeçalho de contagens).
    expect(screen.getByText("Agentes com falha")).toBeTruthy();
    expect(screen.getByText("Sem dados recentes")).toBeTruthy();
    expect(screen.getByText("Sem coleta")).toBeTruthy();
    // Tabela por tipo (rótulo traduzido do enum).
    expect(screen.getByText("Espaço em disco")).toBeTruthy();
    expect(screen.getByText("CPU")).toBeTruthy();
    // Top de agentes com link direto para a aba Sensores do detalhe.
    const link = screen.getByRole("link", { name: /Estação Recepção/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/agents/a1?tab=sensores");
    // Cliente/site do agente também aparecem como opções dos filtros de escopo.
    expect(screen.getAllByText("Cliente Um").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Matriz").length).toBeGreaterThan(1);
    expect(screen.getByText("Pior severidade")).toBeTruthy();
    // Semântica do contrato: stale é dimensão à parte (não soma com os status).
    expect(screen.getByText(/dimensão à parte/)).toBeTruthy();
  });

  it("filtra por cliente e site (refaz a consulta do resumo)", () => {
    renderPage();

    expect(useSensorsFleetSummaryMock).toHaveBeenCalledWith({
      clientId: undefined,
      siteId: undefined,
    });

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "c1" } });
    expect(useSensorsFleetSummaryMock).toHaveBeenLastCalledWith({
      clientId: "c1",
      siteId: undefined,
    });

    fireEvent.change(screen.getByLabelText("Site"), { target: { value: "s1" } });
    expect(useSensorsFleetSummaryMock).toHaveBeenLastCalledWith({
      clientId: "c1",
      siteId: "s1",
    });

    fireEvent.click(screen.getByRole("button", { name: /Limpar filtros/ }));
    expect(useSensorsFleetSummaryMock).toHaveBeenLastCalledWith({
      clientId: undefined,
      siteId: undefined,
    });
  });

  it("mostra o estado vazio quando não há sensores", () => {
    mockSummary({
      data: {
        ...SUMMARY,
        counts: { total: 0, passing: 0, warning: 0, failing: 0, pending: 0, unknown: 0, stale: 0, agentsWithFailing: 0 },
        byType: [],
        top: [],
      },
    });
    renderPage();

    expect(screen.getByText("Nenhum sensor monitorado")).toBeTruthy();
    expect(screen.queryByText("Agentes com falha")).toBeNull();
  });

  it("mostra erro com ação de tentar novamente", () => {
    const refetch = vi.fn();
    mockSummary({ data: undefined, isError: true, refetch });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("mostra loading enquanto o resumo não chega", () => {
    mockSummary({ data: undefined, isLoading: true });
    renderPage();

    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "Carregando resumo dos sensores...",
    );
  });
});

/** Espelha a URL corrente para conferir o deep link dos filtros. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="url">{location.search}</span>;
}


describe("SensorsFleetPage — filtros na URL (deep link)", () => {
  it("escreve cliente e site na querystring ao filtrar", () => {
    renderPage();
    expect(screen.getByTestId("url").textContent).toBe("");

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "c1" } });
    expect(screen.getByTestId("url").textContent).toBe("?clientId=c1");

    fireEvent.change(screen.getByLabelText("Site"), { target: { value: "s1" } });
    expect(screen.getByTestId("url").textContent).toBe("?clientId=c1&siteId=s1");

    fireEvent.click(screen.getByRole("button", { name: /Limpar filtros/ }));
    // URL limpa volta a ser "todos", sem chaves vazias sobrando.
    expect(screen.getByTestId("url").textContent).toBe("");
  });

  it("trocar o cliente descarta o site na URL (site pertence ao cliente)", () => {
    renderPage("/sensors?clientId=c1&siteId=s1");
    expect(useSensorsFleetSummaryMock).toHaveBeenLastCalledWith({ clientId: "c1", siteId: "s1" });

    // Trocar para "todos os clientes" também precisa limpar o site na URL.
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "" } });
    expect(screen.getByTestId("url").textContent).toBe("");
  });

  it("abre já filtrado quando a URL traz os parâmetros", () => {
    renderPage("/sensors?clientId=c1&siteId=s1");

    expect(useSensorsFleetSummaryMock).toHaveBeenCalledWith({ clientId: "c1", siteId: "s1" });
    expect((screen.getByLabelText("Cliente") as HTMLSelectElement).value).toBe("c1");
    expect((screen.getByLabelText("Site") as HTMLSelectElement).value).toBe("s1");
  });
});
