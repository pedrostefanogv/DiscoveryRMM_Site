import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Dashboard: regressões cobertas aqui
 * - B3: nada de "Desconectado" antes das métricas de infraestrutura carregarem
 *   (estado de saúde tem 3 valores: verificando/conectado/desconectado);
 * - B2: "NATS TCP" não pode exibir "Unreachable" quando o backend ainda não
 *   verificou (campo nulo = não verificado);
 * - B6: tiles de Sent (comandos) e Canceladas (automação) para o total fechar;
 * - B5: rótulos honestos (Erros/Fatal, Info/Debug).
 */

const mocks = vi.hoisted(() => ({
  realtime: undefined as unknown,
  summary: undefined as unknown,
}));

vi.mock('@/api', () => ({
  // undefined => request pendente (simula "métricas ainda não chegaram").
  getRealtimeStats: async () => {
    if (mocks.realtime === undefined) {
      return await new Promise(() => {});
    }
    return mocks.realtime;
  },
}));

vi.mock('@/hooks/useDashboardSummary', () => ({
  useDashboardSummary: () => ({
    data: mocks.summary,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useDashboardRealtime', () => ({ useDashboardRealtime: vi.fn() }));

vi.mock('@/hooks/useSoftwareInventory', () => ({
  useSoftwareInventorySnapshot: () => ({
    data: { totalInstalled: 699 },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/components/agents/P2PMetricsCard', () => ({
  P2PMetricsCard: () => <div data-testid="p2p-card" />,
}));

vi.mock('@/components/platform/ObjectStorageCard', () => ({
  ObjectStorageCard: () => <div data-testid="object-storage-card" />,
}));

import Dashboard from './Dashboard';

function makeSummary() {
  return {
    scope: { level: 'global', clientId: null, siteId: null },
    period: {
      fromUtc: '2026-10-13T09:50:00Z',
      toUtc: '2026-10-14T09:50:00Z',
      windowHours: 24,
    },
    agents: { total: 5, online: 1, offline: 4, stale: 0, maintenance: 0, error: 0, onlineGraceSeconds: 120 },
    commands: { total: 116, pending: 0, sent: 3, running: 0, completed: 107, failed: 9, successRate: 92.2 },
    tickets: { total: 20, open: 17, closed: 3, slaBreachedOpen: 5 },
    logs: { total: 6411, error: 6044, warn: 30, info: 337 },
    automation: { total: 261, dispatched: 0, acknowledged: 122, completed: 125, failed: 14, cancelled: 2, successRate: 89.9 },
    clients: { total: 3, active: 3 },
    sites: { total: 4 },
    generatedAtUtc: '2026-10-14T09:50:00Z',
  };
}

function makeRealtime(overrides: Record<string, unknown> = {}) {
  return {
    checkedAtUtc: '2026-10-14T09:50:00Z',
    application: { environment: 'Production', machineName: 'discovery-homolog' },
    realtime: {
      natsConnected: true,
      natsConnectionState: 'Open',
      natsTcpReachable: true,
      natsTcpLatencyMs: 3,
      natsRttMs: 2,
      redisConnected: true,
      redisPingMs: 1,
      ...overrides,
    },
    database: { connected: true, provider: 'Npgsql.EntityFrameworkCore.PostgreSQL' },
    processMetrics: { workingSetBytes: 691_000_000, gcHeapBytes: 340_000_000, threadCount: 36, uptimeFormatted: '17m 8s' },
    threadPool: { workerAvailable: 32765, workerMin: 36, ioAvailable: 1000, ioMin: 1 },
    business: { available: true },
  };
}

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  mocks.realtime = undefined;
  mocks.summary = undefined;
});

describe('Dashboard', () => {
  it('não renderiza "Desconectado" enquanto as métricas de infraestrutura não chegaram', () => {
    mocks.summary = makeSummary();
    mocks.realtime = undefined;

    renderDashboard();

    expect(screen.queryAllByText('Desconectado')).toHaveLength(0);
    expect(screen.queryAllByText('verificando…').length).toBeGreaterThan(0);
  });

  it('mostra "não verificado" no NATS TCP quando o backend devolve null (nunca "Unreachable")', async () => {
    mocks.summary = makeSummary();
    mocks.realtime = makeRealtime({ natsTcpReachable: null, natsTcpLatencyMs: null });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('não verificado')).toBeTruthy();
    });
    expect(screen.queryByText('Unreachable')).toBeNull();
  });

  it('mostra "Reachable" no NATS TCP quando o probe confirma conectividade', async () => {
    mocks.summary = makeSummary();
    mocks.realtime = makeRealtime({ natsTcpReachable: true });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Reachable')).toBeTruthy();
    });
  });

  it('fecha os totais com tiles de Sent e Canceladas e usa rótulos honestos de log', () => {
    mocks.summary = makeSummary();
    mocks.realtime = makeRealtime();

    renderDashboard();

    // B6: tiles que faltavam para o total fechar.
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByText('Canceladas')).toBeTruthy();
    // B5: rótulos que refletem a agregação real do backend.
    expect(screen.getByText('Erros/Fatal')).toBeTruthy();
    expect(screen.getByText('Info/Debug')).toBeTruthy();
  });

  it('renderiza o card de Object Storage (que não entra no refresh global)', () => {
    mocks.summary = makeSummary();
    mocks.realtime = makeRealtime();

    renderDashboard();

    expect(screen.getByTestId('object-storage-card')).toBeTruthy();
    expect(screen.getByTestId('p2p-card')).toBeTruthy();
  });
});
