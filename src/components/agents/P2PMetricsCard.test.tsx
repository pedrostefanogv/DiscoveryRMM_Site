import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { overviewMock } = vi.hoisted(() => ({ overviewMock: vi.fn() }));

vi.mock('@/hooks/useP2POverview', () => ({
  useP2POverview: (params: unknown) => overviewMock(params),
}));

import { P2PMetricsCard } from './P2PMetricsCard';

type Kpis = {
  activeAgents: number;
  activeSeeders: number;
  replicationSuccessRate: number;
  replicationsStartedDelta?: number;
  replicationsSucceededDelta?: number;
  bytesServedDelta: number;
  bytesDownloadedDelta: number;
  queuePressure: number;
  artifactsWithPeers: number;
  /** Tráfego evitado: pré-cargas abortadas por o pacote já estar no estado final. */
  preloadSkippedFinalStateDelta?: number;
  lastTelemetryAtUtc?: string | null;
};

function overviewResult(over: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...over,
  };
}

function withKpis(kpis: Kpis, over: Record<string, unknown> = {}) {
  return overviewResult({
    data: {
      scope: 'global',
      window: '24h',
      health: 'ok',
      updatedAtUtc: '2026-09-27T12:00:00Z',
      kpis,
      ...over,
    },
  });
}

const baseKpis: Kpis = {
  activeAgents: 3,
  activeSeeders: 1,
  replicationSuccessRate: 80,
  replicationsStartedDelta: 10,
  replicationsSucceededDelta: 8,
  bytesServedDelta: 2 * 1024 ** 3,
  bytesDownloadedDelta: 512 * 1024 ** 2,
  queuePressure: 0.2,
  artifactsWithPeers: 4,
  preloadSkippedFinalStateDelta: 2,
  lastTelemetryAtUtc: '2026-09-27T11:55:00Z',
};

describe('P2PMetricsCard', () => {
  afterEach(() => {
    cleanup();
    overviewMock.mockReset();
  });

  it('mostra empty state (sem zeros) quando não há telemetria na janela', () => {
    overviewMock.mockReturnValue(
      withKpis({ ...baseKpis, lastTelemetryAtUtc: null }, { health: 'nodata' }),
    );

    render(<P2PMetricsCard />);

    expect(screen.getByText(/Sem telemetria P2P nesta janela/)).toBeTruthy();
    expect(screen.queryByText('Agentes ativos')).toBeNull();
  });

  it('renderiza os KPIs quando há telemetria', () => {
    overviewMock.mockReturnValue(withKpis(baseKpis));

    render(<P2PMetricsCard />);

    expect(screen.getByText('Agentes ativos')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('80.0%')).toBeTruthy();
    expect(screen.getByText('20.0%')).toBeTruthy();
    expect(screen.getByText('2.00 GB')).toBeTruthy();
    expect(screen.getByText('Saudável')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('exibe "—" no success rate quando não há replicações iniciadas', () => {
    overviewMock.mockReturnValue(
      withKpis({
        ...baseKpis,
        replicationsStartedDelta: 0,
        replicationsSucceededDelta: 0,
        bytesServedDelta: 1024 ** 2,
        bytesDownloadedDelta: 1024 ** 2,
        queuePressure: 0.1,
      }),
    );

    render(<P2PMetricsCard />);

    // Único "—" da tela: o success rate sem replicações observáveis.
    // Asserção escopada no card de success rate: contar "\u2014" na tela inteira
    // é frágil — outros KPIs (ex.: pré-cargas evitadas) também usam "\u2014" sem dado.
    const successLabel = screen.getByText('Success rate');
    const successCard = successLabel.closest('div')?.parentElement;
    expect(successCard).toBeTruthy();
    expect(within(successCard!).getByText('\u2014')).toBeTruthy();
    expect(screen.queryByText('0.0%')).toBeNull();
  });

  it('envia windowHours derivado da janela do dashboard', () => {
    overviewMock.mockReturnValue(overviewResult({ isLoading: true }));

    render(<P2PMetricsCard window="7d" />);

    expect(overviewMock).toHaveBeenCalledWith({ scope: 'global', windowHours: 168 });
  });

  it('mostra "0 B" (e não "—") quando não houve transferência na janela', () => {
    overviewMock.mockReturnValue(
      withKpis({
        ...baseKpis,
        bytesServedDelta: 0,
        bytesDownloadedDelta: 0,
        replicationsStartedDelta: 5,
        replicationsSucceededDelta: 5,
      }),
    );

    render(<P2PMetricsCard />);

    // Bytes servidos + bytes baixados.
    expect(screen.getAllByText('0 B')).toHaveLength(2);
  });

  it('mostra erro com ação de retry que chama refetch', () => {
    const refetch = vi.fn();
    overviewMock.mockReturnValue(overviewResult({ isError: true, refetch }));

    render(<P2PMetricsCard />);

    expect(screen.getByText(/Não foi possível carregar as métricas P2P/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
