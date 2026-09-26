import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Listagem de templates: catálogo (ativos/inativos), lixeira, restauração e
 * detalhe somente-leitura.
 *
 * Importante: o mock imita a API real, que serializa com
 * JsonIgnoreCondition.WhenWritingNull — templates NÃO excluídos vêm SEM a
 * propriedade deletedAt (e não com deletedAt: null).
 */
const { restoreMock, deleteMock, purgeMock, templates } = vi.hoisted(() => {
  const base = {
    clientId: null,
    departmentId: null,
    description: 'Descrição do template',
    priority: null,
    category: null,
    customFieldDefaultsJson: '{}',
    questionsJson: '[]',
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  return {
    restoreMock: vi.fn(),
    deleteMock: vi.fn(),
    purgeMock: vi.fn(),
    templates: {
      active: { ...base, id: 'a1', name: 'Template ativo', title: 'Abrir', isActive: true },
      inactive: { ...base, id: 'a2', name: 'Template inativo', title: 'Abrir', isActive: false },
      clientScoped: { ...base, id: 'a4', name: 'Template do cliente', title: 'Abrir', isActive: true, clientId: 'c1' },
      deleted: {
        ...base,
        id: 'a3',
        name: 'Template excluído',
        title: 'Abrir',
        isActive: true,
        deletedAt: '2026-09-20T10:00:00Z',
        deletedBy: 'admin',
      },
    },
  };
});

vi.mock('@/hooks/useSupportProductivity', () => ({
  useAdminTicketTemplates: (params: { includeInactive?: boolean; includeDeleted?: boolean } = {}) => {
    // deletedAt é opcional: a API omite a propriedade quando não há exclusão.
    const all = [templates.active, templates.inactive, templates.deleted, templates.clientScoped] as Array<{
      deletedAt?: string | null;
      isActive: boolean;
    }>;
    const data = all.filter((t) => {
      if (!params.includeDeleted && Boolean(t.deletedAt)) return false;
      if (!params.includeInactive && !t.isActive) return false;
      return true;
    });
    return { data, isLoading: false, isFetching: false, isError: false, dataUpdatedAt: Date.now(), refetch: vi.fn() };
  },
  useTicketTemplates: () => ({ data: [], isLoading: false, isFetching: false, isError: false, dataUpdatedAt: 0, refetch: vi.fn() }),
  useDeleteTicketTemplate: () => ({ mutate: deleteMock, isPending: false }),
  usePurgeTicketTemplate: () => ({ mutate: purgeMock, isPending: false }),
  useRestoreTicketTemplate: () => ({ mutate: restoreMock, isPending: false }),
  useUpdateTicketTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateTicketTemplate: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useClients', () => ({ useClients: () => ({ data: [{ id: 'c1', name: 'Acme' }] }) }));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [{ id: 'd1', name: 'TI' }], isLoading: false }) }));
vi.mock('@/hooks/useDepartmentCustomFields', () => ({
  useDepartmentTicketSchema: () => ({ data: [], isLoading: false }),
}));

import TicketTemplatesPage from './TicketTemplatesPage';

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/tickets/templates', element: <TicketTemplatesPage /> },
      { path: '/tickets/templates/new', element: <p>NOVO TEMPLATE</p> },
      { path: '/tickets/templates/:id/edit', element: <p>EDITAR TEMPLATE</p> },
    ],
    { initialEntries: ['/tickets/templates'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('TicketTemplatesPage', () => {
  beforeEach(() => {
    restoreMock.mockClear();
    deleteMock.mockClear();
    purgeMock.mockClear();
  });

  afterEach(() => cleanup());

  it('não marca como excluído um template sem deletedAt (a API omite a propriedade)', () => {
    renderPage();

    expect(screen.getByText('Template ativo')).toBeTruthy();
    expect(screen.queryByText(/^Excluído/)).toBeNull();
  });

  it('mostra o catálogo ativo, incluindo templates por cliente, sem inativos/excluídos', () => {
    renderPage();

    expect(screen.getByText('Template do cliente')).toBeTruthy();
    expect(screen.queryByText('Template inativo')).toBeNull();
    expect(screen.queryByText('Template excluído')).toBeNull();
  });

  it('mostra inativos ao marcar o filtro', () => {
    renderPage();

    fireEvent.click(screen.getByLabelText('Mostrar inativos'));
    expect(screen.getByText('Template inativo')).toBeTruthy();
    expect(screen.getByText('Inativo')).toBeTruthy();
  });

  it('na lixeira lista apenas excluídos e restaura o template', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Lixeira/ }));

    expect(screen.getByText('Templates excluídos')).toBeTruthy();
    expect(screen.getByText('Template excluído')).toBeTruthy();
    expect(screen.queryByText('Template ativo')).toBeNull();
    // Novo template não faz sentido dentro da lixeira.
    expect(screen.queryByRole('button', { name: /Novo template/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Restaurar/ }));
    expect(restoreMock).toHaveBeenCalledWith({ id: 'a3' }, expect.anything());
  });

  it('abre o detalhe somente-leitura sem entrar no formulário de edição', () => {
    renderPage();

    fireEvent.click(screen.getAllByLabelText('Ver dados')[0]);

    // O nome aparece na lista e no modal; a rota continua na listagem.
    expect(screen.getAllByText('Template ativo').length).toBeGreaterThan(1);
    expect(screen.getByText('Título do chamado')).toBeTruthy();
    expect(screen.getByText('Questionário do modelo (0)')).toBeTruthy();
    expect(screen.queryByText('EDITAR TEMPLATE')).toBeNull();
  });

  it('permite ver os dados de um template excluído', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Lixeira/ }));
    fireEvent.click(screen.getAllByLabelText('Ver dados')[0]);

    expect(screen.getByText(/Excluído em/)).toBeTruthy();
    expect(screen.getByText('Título do chamado')).toBeTruthy();
  });

  it('excluir do catálogo pede confirmação e move para a lixeira', () => {
    renderPage();

    fireEvent.click(screen.getAllByLabelText('Excluir')[0]);
    expect(screen.getByText('Mover template para a lixeira')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mover para a lixeira' }));
    expect(deleteMock).toHaveBeenCalledWith({ id: 'a1' }, expect.anything());
  });
});
