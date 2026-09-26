import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Quem acompanha (watchers): seção embutida no Resumo geral do chamado.
 */
const { addMock, removeMock, watchersState, usersState } = vi.hoisted(() => ({
  addMock: vi.fn(),
  removeMock: vi.fn(),
  watchersState: {
    data: [
      { id: 'w1', ticketId: 't1', userId: 'u2', createdAt: '2026-01-01T00:00:00Z' },
    ],
    isLoading: false,
    isError: false,
  },
  usersState: {
    data: [
      { id: 'u1', fullName: 'Ana Souza', login: 'ana', email: 'ana@empresa.com', isActive: true },
      { id: 'u2', fullName: 'Bruno Lima', login: 'bruno', email: 'bruno@empresa.com', isActive: true },
    ],
    isLoading: false,
    isError: false,
  },
}));

vi.mock('@/hooks/useTickets', () => ({
  useTicketWatchers: () => watchersState,
  useAddTicketWatcher: () => ({ mutate: addMock, isPending: false }),
  useRemoveTicketWatcher: () => ({ mutate: removeMock, isPending: false }),
}));
vi.mock('@/hooks/useIdentity', () => ({ useIamUsers: () => usersState }));

import { WatchersSection } from './WatchersSection';

describe('WatchersSection', () => {
  beforeEach(() => {
    addMock.mockClear();
    removeMock.mockClear();
    // Restaura a fixture (um teste zera a lista para o estado vazio).
    watchersState.data = [
      { id: 'w1', ticketId: 't1', userId: 'u2', createdAt: '2026-01-01T00:00:00Z' },
    ];
  });

  afterEach(() => cleanup());

  it('mostra o título, o contador e quem acompanha', () => {
    render(<WatchersSection ticketId="t1" assignedToUserId="u2" />);

    expect(screen.getByText('Quem acompanha')).toBeTruthy();
    expect(screen.getByText('1 acompanhando')).toBeTruthy();
    expect(screen.getByText('Bruno Lima')).toBeTruthy();
    expect(screen.getByText('Responsavel')).toBeTruthy();
  });

  it('avisa quando ninguém acompanha', () => {
    watchersState.data = [];
    render(<WatchersSection ticketId="t1" assignedToUserId={null} />);

    expect(screen.getByText('Ninguém acompanhando ainda')).toBeTruthy();
  });

  it('adiciona um watcher pela busca (mínimo 3 caracteres, com pausa)', async () => {
    render(<WatchersSection ticketId="t1" assignedToUserId={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar watcher' }));
    const search = screen.getByLabelText('Pesquisar usuário');

    // Com 2 caracteres ainda não busca.
    fireEvent.change(search, { target: { value: 'an' } });
    expect(screen.getByText(/ao menos 3 caracteres/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ana Souza/ })).toBeNull();

    // 3+ caracteres: a lista aparece depois da pausa (debounce).
    fireEvent.change(search, { target: { value: 'ana' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Ana Souza/ })).toBeTruthy(), {
      timeout: 2000,
    });

    fireEvent.click(screen.getByRole('button', { name: /Ana Souza/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(addMock).toHaveBeenCalledWith(
      { ticketId: 't1', data: { userId: 'u1' } },
      expect.anything(),
    );
  });

  it('remove um watcher', () => {
    render(<WatchersSection ticketId="t1" assignedToUserId={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover watcher Bruno Lima' }));
    expect(removeMock).toHaveBeenCalledWith(
      { ticketId: 't1', userId: 'u2' },
      expect.anything(),
    );
  });
});
