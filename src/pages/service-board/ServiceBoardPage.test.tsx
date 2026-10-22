import { fireEvent, render, screen } from '@testing-library/react';
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

function mockBoard(data: ServiceBoardDto | undefined, extra: Record<string, unknown> = {}) {
  (useServiceBoard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    data, isLoading: false, isError: false, isFetching: false, refetch: vi.fn(), ...extra,
  });
}

function renderBoard() {
  return render(
    <MemoryRouter>
      <ServiceBoardPage />
    </MemoryRouter>,
  );
}

describe('ServiceBoardPage', () => {
  it('renderiza resumo por tipo e a fila priorizada com idade relativa', () => {
    mockBoard(SAMPLE);
    renderBoard();
    // Rótulo aparece no cartão-resumo e (para itens presentes) na tag da linha.
    for (const label of ['Chamados', 'Automação', 'Patches', 'Alertas']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // Fila única: os três itens aparecem como linhas.
    expect(screen.getByTestId('service-board-item-ticket')).toBeTruthy();
    expect(screen.getByTestId('service-board-item-automation')).toBeTruthy();
    expect(screen.getByTestId('service-board-item-alert')).toBeTruthy();
    expect(screen.getByText('Impressora não responde')).toBeTruthy();
    // "+3h" para o ticket e "+1d" para a automação (30h)
    expect(screen.getByText('+3h')).toBeTruthy();
    expect(screen.getByText('+1d')).toBeTruthy();
  });

  it('ordena por prioridade: Crítica antes de Alta antes de sem prioridade', () => {
    mockBoard(SAMPLE);
    renderBoard();
    const rows = screen.getAllByTestId(/service-board-item-/);
    expect(rows[0].getAttribute('data-testid')).toBe('service-board-item-automation');
    expect(rows[1].getAttribute('data-testid')).toBe('service-board-item-ticket');
    expect(rows[2].getAttribute('data-testid')).toBe('service-board-item-alert');
  });

  it('clicar no cartão de resumo filtra a fila pelo tipo', () => {
    mockBoard(SAMPLE);
    renderBoard();
    fireEvent.click(screen.getByText('Chamados'));
    expect(screen.queryByTestId('service-board-item-automation')).toBeNull();
    expect(screen.getByTestId('service-board-item-ticket')).toBeTruthy();
  });

  it('fila vazia com filtros mostra estado vazio', () => {
    mockBoard({ ...SAMPLE, items: [] });
    renderBoard();
    expect(screen.getByText('Fila vazia')).toBeTruthy();
  });

  it('avisa quando o limite da API oculta itens', () => {
    mockBoard(SAMPLE);
    // counts somam 3 e items têm 3: sem ocultos. Simula truncamento com counts maiores.
    (useServiceBoard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        ...SAMPLE,
        counts: { ticket: 5, automation: 4, patch: 2, alert: 1 },
      },
      isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
    });
    renderBoard();
    expect(screen.getByText(/ocultados pelo limite/)).toBeTruthy();
  });

  it('formatAge usa horas abaixo de 24 e dias acima', () => {
    expect(formatAge(3)).toBe('+3h');
    expect(formatAge(23.4)).toBe('+23h');
    expect(formatAge(48)).toBe('+2d');
  });

  it('mostra loading enquanto carrega', () => {
    mockBoard(undefined, { isLoading: true, isFetching: true });
    renderBoard();
    expect(screen.getByText('Service Board')).toBeTruthy();
  });
});
