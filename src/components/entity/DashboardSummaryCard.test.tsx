import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DashboardSummaryCard } from './DashboardSummaryCard';
import type { DashboardSummaryDto } from '@/api/dashboard';

function summary(overrides: Partial<DashboardSummaryDto['automation']> = {}): DashboardSummaryDto {
  return {
    scope: { level: 'global', clientId: null, siteId: null },
    period: { fromUtc: '2026-01-01T00:00:00Z', toUtc: '2026-01-02T00:00:00Z', windowHours: 24 },
    agents: { total: 5, online: 4, offline: 1, stale: 0, maintenance: 0, error: 0, onlineGraceSeconds: 300 },
    commands: { total: 10, pending: 1, sent: 0, running: 0, completed: 8, failed: 1, successRate: 88.9 },
    tickets: { total: 4, open: 2, closed: 2, slaBreachedOpen: 0 },
    logs: { total: 3, error: 0, warn: 1, info: 2 },
    automation: {
      total: 6,
      dispatched: 1,
      acknowledged: 0,
      completed: 3,
      failed: 1,
      cancelled: 1,
      successRate: 75,
      ...overrides,
    },
    clients: { total: 1, active: 1 },
    sites: { total: 1 },
    generatedAtUtc: '2026-01-02T00:00:00Z',
  };
}

describe('DashboardSummaryCard', () => {
  afterEach(() => cleanup());

  it('mostra a contagem de execuções canceladas quando existe', () => {
    render(<DashboardSummaryCard data={summary()} title="Resumo" />);

    expect(screen.getByText('6 execuções')).toBeTruthy();
    expect(screen.getByText('1 cancelada(s)')).toBeTruthy();
  });

  it('não mostra canceladas quando não há nenhuma', () => {
    render(<DashboardSummaryCard data={summary({ cancelled: 0 })} title="Resumo" />);

    expect(screen.queryByText(/cancelada/)).toBeNull();
  });

  it('mantém o empty state quando não há execuções na janela', () => {
    render(
      <DashboardSummaryCard
        data={summary({ total: 0, completed: 0, failed: 0, cancelled: 0 })}
        title="Resumo"
      />,
    );

    expect(screen.getByText('Nenhuma')).toBeTruthy();
    expect(screen.queryByText(/cancelada/)).toBeNull();
  });
});
