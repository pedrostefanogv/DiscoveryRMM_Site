import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AiCostCockpit, { budgetPercent } from './AiCostCockpit';
import type { AiCostCockpitDto } from '@/api/aiCost';

vi.mock('@/hooks/useClients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Cliente Um' }], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useAiCostCockpit', () => ({
  useAiCostCockpit: vi.fn(),
}));

import { useAiCostCockpit } from '@/hooks/useAiCostCockpit';

const SAMPLE: AiCostCockpitDto = {
  fromUtc: '2026-10-01T00:00:00Z',
  toUtc: '2026-10-21T23:59:59Z',
  totals: { requests: 1234, inputTokens: 500000, outputTokens: 250000, costUsd: 42.5 },
  byClient: [
    { clientId: 'c1', clientName: 'Cliente Um', requests: 1000, inputTokens: 400000, outputTokens: 200000, costUsd: 35, budgetUsdMonthly: 30 },
    { clientId: 'c2', clientName: 'Sem orçamento', requests: 234, inputTokens: 100000, outputTokens: 50000, costUsd: 7.5 },
  ],
  topTools: [
    { tool: 'search_kb', calls: 400, costUsd: 20 },
    { tool: 'run_diagnostic', calls: 120, costUsd: 12.5 },
  ],
};

describe('AiCostCockpit', () => {
  it('renderiza totals, tabela por cliente e top tools com barra de orçamento', () => {
    (useAiCostCockpit as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: SAMPLE, isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
    });
    render(
      <MemoryRouter>
        <AiCostCockpit />
      </MemoryRouter>,
    );
    expect(screen.getByText('Requisições')).toBeTruthy();
    expect(screen.getByText('Custo total (USD)')).toBeTruthy();
    // Over-budget client (35/30 >= 100%) usa barra vermelha
    const overBar = document.querySelector('.bg-danger.h-full');
    expect(overBar).not.toBeNull();
    expect(screen.getByText('search_kb')).toBeTruthy();
    expect(screen.getByText('Sem orçamento')).toBeTruthy();
  });

  it('budgetPercent: null sem orçamento, 100% quando estoura', () => {
    expect(budgetPercent({ ...SAMPLE.byClient[0] })).toBeCloseTo(116.66, 1);
    expect(budgetPercent({ ...SAMPLE.byClient[1] })).toBeNull();
  });
});
