import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import PatchesCompliance, { scoreBadgeColor } from './PatchesCompliance';
import type { PatchComplianceDto } from '@/api/patchCompliance';

vi.mock('@/hooks/useClients', () => ({
  useClients: () => ({
    data: [{ id: 'c1', name: 'Cliente Um' }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePatchCompliance', () => ({
  usePatchCompliance: vi.fn(),
}));

import { usePatchCompliance } from '@/hooks/usePatchCompliance';

const SAMPLE: PatchComplianceDto = {
  generatedAtUtc: '2026-10-21T12:00:00Z',
  scope: { clientId: null, siteId: null },
  totals: { agents: 30, compliant: 25, score: 83.3, pendingPatches: 12, failedPatches: 3 },
  rows: [
    { clientId: 'c1', clientName: 'Bom', agents: 10, compliant: 10, score: 100, pendingPatches: 0, failedPatches: 0, lastScanUtc: '2026-10-21T11:00:00Z' },
    { clientId: 'c2', clientName: 'Ruim', siteId: 's1', siteName: 'Filial', agents: 10, compliant: 4, score: 40, pendingPatches: 9, failedPatches: 3, lastScanUtc: null },
  ],
};

const mockQuery = (data?: PatchComplianceDto) => {
  (usePatchCompliance as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
};

describe('PatchesCompliance', () => {
  it('ordena as linhas por score ascendente (piores primeiro) e mostra os cards', () => {
    mockQuery(SAMPLE);
    render(
      <MemoryRouter>
        <PatchesCompliance />
      </MemoryRouter>,
    );
    // Score global no header
    expect(screen.getByText('83.3')).toBeTruthy();
    // Cards
    expect(screen.getByText('Patches pendentes')).toBeTruthy();
    // Piores primeiro: "Ruim" aparece antes de "Bom" na tabela
    const bad = screen.getByText('Ruim').compareDocumentPosition(screen.getByText('Bom'));
    // Node.DOCUMENT_POSITION_FOLLOWING = 4 (bad vem antes de bom)
    expect(bad & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('mostra vazio quando não há dados', () => {
    mockQuery(undefined);
    render(
      <MemoryRouter>
        <PatchesCompliance />
      </MemoryRouter>,
    );
    expect(screen.getByText('Conformidade de patches')).toBeTruthy();
  });

  it('badge de score: >=90 verde, >=70 amarelo, <70 vermelho', () => {
    expect(scoreBadgeColor(90)).toBe('success');
    expect(scoreBadgeColor(70)).toBe('warning');
    expect(scoreBadgeColor(69.9)).toBe('danger');
  });
});
