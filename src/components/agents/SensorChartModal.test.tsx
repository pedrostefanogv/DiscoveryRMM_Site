import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppApprovalScopeType } from "@/api/types";
import type { SensorItem, SensorSeries } from "@/api";

const { useSensorSeriesMock, downloadTextFileMock } = vi.hoisted(() => ({
  useSensorSeriesMock: vi.fn(),
  downloadTextFileMock: vi.fn(),
}));

vi.mock("@/hooks/useSensorSeries", () => ({
  useSensorSeries: useSensorSeriesMock,
}));

// O recharts é carregado sob demanda: aqui interessa a barra de ações do modal.
vi.mock("./SensorChartCanvas", () => ({
  default: () => <div data-testid="canvas" />,
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
