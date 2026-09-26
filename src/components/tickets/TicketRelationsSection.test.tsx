import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, searchMock, relationsState, ticketsState } = vi.hoisted(() => ({
  createMock: vi.fn(),
  searchMock: vi.fn(),
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
  useTickets: (params: unknown, options: unknown) => {
    searchMock(params, options);
    return ticketsState;
  },
}));

import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TicketRelationsSection } from './TicketRelationsSection';

/** O componente usa useNavigate: precisa de um router. */
function renderSection(entry = '/tickets/t1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/tickets/t1" element={<TicketRelationsSection ticketId="t1" />} />
        <Route path="/tickets/:id" element={<p>OUTRO CHAMADO</p>} />
        <Route path="/tickets/t1" element={<TicketRelationsSection ticketId="t1" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TicketRelationsSection', () => {
  beforeEach(() => {
    createMock.mockClear();
    searchMock.mockClear();
  });
  afterEach(() => cleanup());

  it('lista os vínculos com tipo amigável, título e status (não o GUID)', () => {
    renderSection();

    // "Bloqueia" também aparece como opção do seletor de tipo.
    expect(screen.getAllByText('Bloqueia').length).toBeGreaterThan(0);
    expect(screen.getByText('Impressora não imprime')).toBeTruthy();
    expect(screen.getByText('Aberto')).toBeTruthy();
    expect(screen.getByText('t2')).toBeTruthy(); // identificador curto
  });

  it('busca por texto, seleciona e cria o vínculo', () => {
    renderSection();

    // O formulário de vínculo abre pelo ícone do cabeçalho.
    expect(screen.queryByLabelText('Buscar chamado')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Novo vínculo' }));
    fireEvent.change(screen.getByLabelText('Buscar chamado'), { target: { value: 'VPN' } });
    fireEvent.click(screen.getByRole('button', { name: /VPN caiu/ }));

    expect(screen.getByText(/Selecionado:/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Vincular chamado/ }));

    expect(createMock).toHaveBeenCalledWith(
      { id: 't1', data: { targetTicketId: 't3', relationType: 'RelatesTo' } },
      expect.anything(),
    );
  });

  it('colapsa a lista e mostra "Ver todos" quando passa de 3 vínculos', () => {
    const base = relationsState.data[0];
    relationsState.data = Array.from({ length: 5 }, (_, index) => ({
      ...base,
      id: `r${index}`,
      otherTicketId: `t${index}`,
      otherTicketTitle: `Chamado ${index}`,
    }));

    renderSection();

    expect(screen.getByText('Chamado 0')).toBeTruthy();
    expect(screen.queryByText('Chamado 4')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Ver todos \(5\)/ }));
    expect(screen.getByText('Chamado 4')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar menos' }));
    expect(screen.queryByText('Chamado 4')).toBeNull();

    // Restaura a fixture para os demais testes.
    relationsState.data = [base];
  });

  it('abre o chamado vinculado ao clicar no item', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: /Abrir chamado Impressora não imprime/ }));

    expect(screen.getByText('OUTRO CHAMADO')).toBeTruthy();
  });

  it('só busca com 3+ caracteres e depois de uma pausa na digitação', async () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Novo vínculo' }));
    const input = screen.getByLabelText('Buscar chamado');

    // 2 caracteres: ainda não busca (nem habilita a query).
    fireEvent.change(input, { target: { value: 'VP' } });
    expect(screen.getByText(/ao menos 3 caracteres/)).toBeTruthy();
    expect(searchMock.mock.calls.every(([, options]) => (options as { enabled?: boolean })?.enabled === false)).toBe(true);

    // 3 caracteres: a busca dispara depois da pausa (debounce).
    fireEvent.change(input, { target: { value: 'VPN' } });
    await waitFor(
      () =>
        expect(
          searchMock.mock.calls.some(
            ([params, options]) =>
              (options as { enabled?: boolean })?.enabled === true &&
              (params as { text?: string })?.text === 'VPN',
          ),
        ).toBe(true),
      { timeout: 2000 },
    );
  });

  it('explica como funciona dentro do formulário de vínculo', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Novo vínculo' }));
    expect(screen.getByText('Como funciona?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('Como funciona?')).toBeNull();
  });
});