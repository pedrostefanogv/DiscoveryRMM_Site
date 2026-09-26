import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, relationsState, ticketsState } = vi.hoisted(() => ({
  createMock: vi.fn(),
  relationsState: {
    data: [
      {
        id: 'r1',
        sourceTicketId: 't1',
        targetTicketId: 't2',
        relationType: 'Blocks',
        createdBy: 'ana',
        createdAt: '2026-01-01T00:00:00Z',
        direction: 'source',
        otherTicketId: 't2',
        otherTicketTitle: 'Impressora não imprime',
        otherTicketIsClosed: false,
      },
    ],
    isLoading: false,
  },
  ticketsState: {
    data: { items: [{ id: 't3', title: 'VPN caiu', closedAt: '2026-02-01T00:00:00Z' }] },
    isFetching: false,
  },
}));

vi.mock('@/hooks/useTickets', () => ({
  useTicketRelations: () => relationsState,
  useCreateTicketRelation: () => ({ mutate: createMock, isPending: false }),
  useDeleteTicketRelation: () => ({ mutate: vi.fn(), isPending: false }),
  useTickets: () => ticketsState,
}));

import { TicketRelationsSection } from './TicketRelationsSection';

describe('TicketRelationsSection', () => {
  beforeEach(() => createMock.mockClear());
  afterEach(() => cleanup());

  it('lista os vínculos com tipo amigável, título e status (não o GUID)', () => {
    render(<TicketRelationsSection ticketId="t1" />);

    // "Bloqueia" também aparece como opção do seletor de tipo.
    expect(screen.getAllByText('Bloqueia').length).toBeGreaterThan(0);
    expect(screen.getByText('Impressora não imprime')).toBeTruthy();
    expect(screen.getByText('Aberto')).toBeTruthy();
    expect(screen.getByText('t2')).toBeTruthy(); // identificador curto
  });

  it('busca por texto, seleciona e cria o vínculo', () => {
    render(<TicketRelationsSection ticketId="t1" />);

    fireEvent.change(screen.getByLabelText('Buscar chamado'), { target: { value: 'VPN' } });
    fireEvent.click(screen.getByRole('button', { name: /VPN caiu/ }));

    expect(screen.getByText(/Selecionado:/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Vincular chamado/ }));

    expect(createMock).toHaveBeenCalledWith(
      { id: 't1', data: { targetTicketId: 't3', relationType: 'RelatesTo' } },
      expect.anything(),
    );
  });

  it('explica como funciona', () => {
    render(<TicketRelationsSection ticketId="t1" />);
    expect(screen.getByText('Como funciona?')).toBeTruthy();
  });
});
