import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ServiceBoardPage, { formatAge } from './ServiceBoardPage';
import type { ServiceBoardDto } from '@/api/serviceBoard';

vi.mock('@/hooks/useClients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Cliente Um' }], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useSites', () => ({
  useSites: () => ({ data: [{ id: 's1', name: 'Site Um' }], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useServiceBoard', () => ({
  useServiceBoard: vi.fn(),
}));

import { useServiceBoard } from '@/hooks/useServiceBoard';

const SAMPLE: ServiceBoardDto = {
  generatedAtUtc: '2026-10-21T12:00:00Z',
  counts: { ticket: 1, automation: 1, patch: 0, alert: 1 },
  items: [
    { kind: 'ticket', id: 't1', title: 'Impressora não responde', status: 'Aberto', priority: 'Alta', ageHours: 3, clientId: 'c1', clientName: 'Cliente Um', siteId: null, deepLink: '/tickets/t1' },
    { kind: 'automation', id: 'a1', title: 'Backup falhou', status: 'Failed', priority: 'Crítica', ageHours: 30, clientId: 'c1', clientName: null, siteId: null, deepLink: '/automation/operations' },
    { kind: 'alert', id: 'al1', title: 'CPU acima de 90%', status: 'Active', priority: null, ageHours: 1, clientId: null, clientName: null, siteId: null, deepLink: '/agents/x' },
  ],
};

describe('ServiceBoardPage', () => {
  it('renderiza as 4 colunas com counts e cards com idade relativa', () => {
    (useServiceBoard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: SAMPLE, isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
    });
    render(
      <MemoryRouter>
        <ServiceBoardPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Chamados')).toBeTruthy();
    expect(screen.getByText('Automação')).toBeTruthy();
    expect(screen.getByText('Patches')).toBeTruthy();
    expect(screen.getByText('Alertas')).toBeTruthy();
    expect(screen.getByText('Impressora não responde')).toBeTruthy();
    // "+3h" para o ticket e "+1d" para a automação (30h)
    expect(screen.getByText('+3h')).toBeTruthy();
    expect(screen.getByText('+1d')).toBeTruthy();
  });

  it('formatAge usa horas abaixo de 24 e dias acima', () => {
    expect(formatAge(3)).toBe('+3h');
    expect(formatAge(23.4)).toBe('+23h');
    expect(formatAge(48)).toBe('+2d');
  });

  it('mostra loading enquanto carrega', () => {
    (useServiceBoard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: undefined, isLoading: true, isError: false, isFetching: true, refetch: vi.fn(),
    });
    render(
      <MemoryRouter>
        <ServiceBoardPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Service Board')).toBeTruthy();
  });
});
