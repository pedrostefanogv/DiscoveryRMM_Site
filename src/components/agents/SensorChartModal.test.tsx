import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppApprovalScopeType } from "@/api/types";
import type { SensorItem, SensorSeries } from "@/api";

const { useSensorSeriesMock, useSensorEventsMock, downloadTextFileMock } = vi.hoisted(() => ({
  useSensorSeriesMock: vi.fn(),
  useSensorEventsMock: vi.fn(),
  downloadTextFileMock: vi.fn(),
}));

vi.mock("@/hooks/useSensorSeries", () => ({
  useSensorSeries: useSensorSeriesMock,
}));

vi.mock("@/hooks/useSensors", () => ({
  useSensorEvents: useSensorEventsMock,
}));

// O recharts é carregado sob demanda: aqui interessa a barra de ações do modal.
vi.mock("./SensorChartCanvas", () => ({
  default: ({ visibleChannelKeys }: { visibleChannelKeys?: string[] }) => (
    <div data-testid="canvas" data-visible-channels={(visibleChannelKeys ?? []).join(",")} />
  ),
}));

// O download real mexeria com Blob/URL; espiona só a borda de I/O.
vi.mock("./sensorUtils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sensorUtils") >();
  return { ...actual, downloadTextFile: downloadTextFileMock };
});

import SensorChartModal from "./SensorChartModal";

function sensor(over: Partial<SensorItem> = {}): SensorItem {
  return {
    sensorId: "s1",
    key: "disco-c",
    name: "Disco C:",
    description: null,
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
    message: null,
    isStale: false,
    exitCode: null,
    durationMs: 120,
    outputExcerpt: null,
    consecutiveFailures: 0,
    totalRuns: 10,
    totalFailures: 1,
    lastRunAt: "2026-01-01T00:00:00.000Z",
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

function serie(over: Partial<SensorSeries> = {}): SensorSeries {
  return {
    agentId: "a1",
    sensorId: "s1",
    targetKey: "C:",
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-01-01T01:00:00.000Z",
    resolution: "raw",
    stepSeconds: 60,
    warningThreshold: 15,
    criticalThreshold: 10,
    comparison: "LowerIsWorse",
    thresholdUnit: "Percent",
    channels: [
      {
        key: "free_percent",
        label: "Livre",
        unit: "Percent",
        points: [
          { t: "2026-01-01T00:00:00.000Z", v: 12, min: null, max: null },
          { t: "2026-01-01T00:01:00.000Z", v: 11, min: null, max: null },
        ],
        stats: { min: 11, avg: 12, max: 12, p95: 12, last: 11, count: 2 },
      },
    ],
    statusStrips: [],
    ...over,
  };
}

/** Sem argumento devolve uma série válida; `null` simula a série que ainda não chegou. */
function mockSerie(data: SensorSeries | null = null) {
  useSensorSeriesMock.mockReturnValue({
    data: data === null ? serie() : (data as SensorSeries | undefined),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

/** Série ainda não carregada (`data` indefinido no react-query). */
function mockSeriePendente() {
  useSensorSeriesMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

function renderModal() {
  return render(
    <SensorChartModal open onClose={vi.fn()} agentId="a1" sensor={sensor()} />,
  );
}

function botaoExportar(): HTMLButtonElement {
  return screen.getByRole("button", { name: /Exportar CSV/ }) as HTMLButtonElement;
}

beforeEach(() => {
  useSensorSeriesMock.mockReset();
  useSensorEventsMock.mockReset();
  useSensorEventsMock.mockReturnValue({ data: { items: [], nextCursor: null }, isLoading: false, isError: false });
  downloadTextFileMock.mockReset();
  mockSerie();
});

afterEach(() => cleanup());

describe("SensorChartModal — exportação CSV", () => {
  it("baixa o CSV dos pontos exibidos na janela atual", () => {
    renderModal();

    fireEvent.click(botaoExportar());

    expect(downloadTextFileMock).toHaveBeenCalledTimes(1);
    const [nome, conteudo] = downloadTextFileMock.mock.calls[0] as [string, string];
    // O nome carrega sensor e alvo para o arquivo não virar "export.csv" genérico.
    expect(nome).toMatch(/^sensor-.*\.csv$/);
    expect(nome).toContain("disco-c");
    expect(conteudo).toContain("instante;free_percent");
    // Só os pontos da série carregada: 1 cabeçalho + 2 amostras.
    expect(conteudo.split("\r\n").filter(Boolean)).toHaveLength(3);
  });

  it("fica desabilitado quando a janela não tem amostras", () => {
    mockSerie(serie({ channels: [{ ...serie().channels[0], points: [] }] }));
    renderModal();

    expect(botaoExportar().disabled).toBe(true);
    fireEvent.click(botaoExportar());
    expect(downloadTextFileMock).not.toHaveBeenCalled();
  });

  it("não exporta enquanto a série não chegou", () => {
    mockSeriePendente();
    renderModal();

    expect(botaoExportar().disabled).toBe(true);
  });
});

describe("SensorChartModal — canais por unidade, rótulos e atualização", () => {
  function memorySensor(): SensorItem {
    return sensor({
      sensorId: "mem1",
      name: "Uso de memória",
      sensorType: "Memory",
      target: null,
      targetKey: "",
      warningThreshold: 80,
      criticalThreshold: 90,
      thresholdUnit: "Percent",
      comparison: "HigherIsWorse",
      primaryChannel: "used_percent",
      channels: [
        { key: "used_percent", label: "Uso de memória", unit: "Percent", display: "chart", isPrimary: true },
        { key: "available_bytes", label: "Disponível", unit: "Bytes", display: "chart", isPrimary: false },
        { key: "total_bytes", label: "Total (bytes)", unit: "Bytes", display: "chart", isPrimary: false },
      ],
    });
  }

  function memorySeries(): SensorSeries {
    return serie({
      sensorId: "mem1",
      targetKey: "",
      warningThreshold: 80,
      criticalThreshold: 90,
      comparison: "HigherIsWorse",
      thresholdUnit: "Percent",
      channels: [
        {
          key: "used_percent",
          label: "used_percent",
          unit: "Percent",
          points: [{ t: "2026-01-01T00:00:00.000Z", v: 29.14, min: null, max: null }],
          stats: { min: 26, avg: 30, max: 48, p95: 32, last: 29.14, count: 54 },
        },
        {
          key: "available_bytes",
          label: "available_bytes",
          unit: "Bytes",
          points: [{ t: "2026-01-01T00:00:00.000Z", v: 4.2e9, min: null, max: null }],
          stats: { min: 3e9, avg: 4.1e9, max: 4.3e9, p95: 4.2e9, last: 4.2e9, count: 54 },
        },
        {
          key: "total_bytes",
          label: "total_bytes",
          unit: "Bytes",
          points: [{ t: "2026-01-01T00:00:00.000Z", v: 5.9e9, min: null, max: null }],
          stats: { min: 5.9e9, avg: 5.9e9, max: 5.9e9, p95: 5.9e9, last: 5.9e9, count: 54 },
        },
      ],
      statusStrips: [
        { from: "2026-01-01T00:00:00.000Z", to: "2026-01-01T01:00:00.000Z", status: "Passing" },
      ],
    });
  }

  it("seleciona por padrão apenas canais da unidade primária e enriquece rótulos", () => {
    mockSerie(memorySeries());
    render(
      <SensorChartModal open onClose={vi.fn()} agentId="a1" sensor={memorySensor()} />,
    );

    const canvas = screen.getByTestId("canvas");
    expect(canvas.getAttribute("data-visible-channels")).toBe("used_percent");

    const toggleUsed = screen.getByRole("button", { name: /Uso de memória/ });
    const toggleAvail = screen.getByRole("button", { name: /Disponível/ });
    const toggleTotal = screen.getByRole("button", { name: /Total/ });
    expect(toggleUsed.getAttribute("aria-pressed")).toBe("true");
    expect(toggleAvail.getAttribute("aria-pressed")).toBe("false");
    expect(toggleTotal.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggleAvail);
    expect(canvas.getAttribute("data-visible-channels")).toBe("used_percent,available_bytes");
    expect(screen.getByText("100% em OK no período")).toBeTruthy();
  });

  it("ignora placeholderData de outro sensor e permite atualizar", () => {
    mockSerie(serie({ sensorId: "outro-sensor" }));
    renderModal();

    expect(screen.queryByTestId("canvas")).toBeNull();
    expect(screen.getByText("Sem amostras nesta janela")).toBeTruthy();

    mockSerie(serie());
    fireEvent.click(screen.getByRole("button", { name: /Atualizar/ }));
    expect(useSensorSeriesMock).toHaveBeenCalled();
  });

  it("exibe banner de previsão quando há tendência consistente e permite selecionar sensor para comparação", () => {
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    const points = [0, 6, 12, 18, 24].map((h, i) => ({
      t: new Date(base + h * 3_600_000).toISOString(),
      v: 50 - i * 5,
      min: null,
      max: null,
    }));
    mockSerie(
      serie({
        from: points[0].t,
        to: points[4].t,
        channels: [
          {
            key: "free_percent",
            label: "Livre",
            unit: "Percent",
            points,
            stats: { min: 30, avg: 40, max: 50, p95: 50, last: 30, count: 5 },
          },
        ],
      }),
    );

    const cpuSensor = sensor({ sensorId: "cpu1", name: "CPU", sensorType: "Cpu", target: null, targetKey: "" });
    render(
      <SensorChartModal
        open
        onClose={vi.fn()}
        agentId="a1"
        sensor={sensor()}
        availableSensors={[sensor(), cpuSensor]}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("Previsão:");
    const select = screen.getByLabelText("Comparar com outro sensor") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "cpu1" } });
    expect(select.value).toBe("cpu1");
  });
});
