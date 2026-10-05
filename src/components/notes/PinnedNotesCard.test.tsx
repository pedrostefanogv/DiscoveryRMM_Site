import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Card "Anotações fixadas" da aba Info: lista as fixadas e permite incluir
 * uma nova anotação direto pelo card.
 */

const { createMutate, notesState } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  notesState: {
    items: [] as Array<Record<string, unknown>>,
    hasNextPage: false,
  },
}));

vi.mock('@/hooks/useNotes', () => ({
  useAgentNotesAll: () => ({
    data: { pages: [{ items: notesState.items }] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasNextPage: notesState.hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useCreateAgentNote: () => ({ mutate: createMutate, isPending: false }),
}));

import { PinnedNotesCard } from './PinnedNotesCard';

beforeEach(() => {
  createMutate.mockClear();
  notesState.items = [];
  notesState.hasNextPage = false;
});

describe('PinnedNotesCard', () => {
  it('abre o formulário de inclusão quando não há fixadas', () => {
    render(<PinnedNotesCard agentId="a1" />);

    expect(
      screen.getByText('Nenhuma anotação fixada. Use o botão Incluir para criar uma anotação fixada.'),
    ).toBeTruthy();
    expect(screen.getByText('Incluir anotação')).toBeTruthy();
    expect(screen.getByText('Salvar anotação')).toBeTruthy();
  });

  it('cria uma anotação fixada a partir do card', () => {
    render(<PinnedNotesCard agentId="a1" />);

    fireEvent.change(screen.getByLabelText('Conteúdo'), {
      target: { value: 'Trocar HD em breve' },
    });
    fireEvent.click(screen.getByText('Salvar anotação'));

    expect(createMutate).toHaveBeenCalledWith(
      { agentId: 'a1', data: { content: 'Trocar HD em breve', isPinned: true } },
      expect.anything(),
    );
  });

  it('não envia conteúdo com menos de 3 caracteres', () => {
    render(<PinnedNotesCard agentId="a1" />);
    fireEvent.change(screen.getByLabelText('Conteúdo'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByText('Salvar anotação'));
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('abre o formulário pelo botão Incluir quando já existem fixadas', () => {
    notesState.items = [
      {
        id: 'n1',
        content: 'Nota fixa',
        author: 'ana',
        isPinned: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    render(<PinnedNotesCard agentId="a1" />);

    expect(screen.getByText('Nota fixa')).toBeTruthy();
    expect(screen.queryByText('Salvar anotação')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Incluir anotação' }));

    expect(screen.getByText('Salvar anotação')).toBeTruthy();
  });
});
