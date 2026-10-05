import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * NotesPanel é compartilhado por Cliente/Site/Agente. O substantivo agora é
 * parametrizável para a tela do agente falar "anotação"; os defaults precisam
 * continuar iguais ao texto histórico de Clientes/Sites.
 */

vi.mock('@/hooks/useNotes', () => {
  const emptyPage = () => ({
    data: { pages: [{ items: [], hasMore: false }] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  });
  const mutation = () => ({ mutate: vi.fn(), isPending: false });

  return {
    useClientNotesPage: emptyPage,
    useSiteNotesPage: emptyPage,
    useAgentNotesPage: emptyPage,
    useCreateClientNote: mutation,
    useCreateSiteNote: mutation,
    useCreateAgentNote: mutation,
    useUpdateNote: mutation,
    useDeleteNote: mutation,
  };
});

import { NotesPanel } from './NotesPanel';

describe('NotesPanel — terminologia', () => {
  it('usa "nota" por padrão (Clientes/Sites)', () => {
    render(<NotesPanel entityType="client" entityId="c1" title="Notas do Cliente" />);
    expect(screen.getByText('Nenhuma nota cadastrada')).toBeTruthy();
    expect(screen.getByText('Nova nota')).toBeTruthy();
    expect(screen.getByText('Salvar nota')).toBeTruthy();
  });

  it('usa "anotação" quando a tela informa o substantivo', () => {
    render(
      <NotesPanel
        entityType="agent"
        entityId="a1"
        title="Anotações do Agente"
        singular="anotação"
        plural="anotações"
      />,
    );
    expect(screen.getByText('Nenhuma anotação cadastrada')).toBeTruthy();
    expect(screen.getByText('Nova anotação')).toBeTruthy();
    expect(screen.getByText('Salvar anotação')).toBeTruthy();
  });
});
