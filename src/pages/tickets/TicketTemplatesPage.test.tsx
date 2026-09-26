import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Listagem de templates: catálogo (ativos/inativos), lixeira e restauração.
 * O mock da query imita o servidor aplicando includeInactive/includeDeleted,
 * de modo que alternar os filtros na tela tenha efeito real no teste.
 */
const { restoreMock, deleteMock, purgeMock, templates } = vi.hoisted(() => {
  const base = {
    clientId: null,
    departmentId: null,
    description: 'd',
    priority: null,
    category: null,
    customFieldDefaultsJson: '{}',
    questionsJson: '[]',
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    deletedBy: null,
  };

  return {
    restoreMock: vi.fn(),
    deleteMock: vi.fn(),
    purgeMock: vi.fn(),
    templates: {
      active: { ...base, id: 'a1', name: 'Template ativo', title: 'Abrir', isActive: true },
      inactive: { ...base, id: 'a2', name: 'Template inativo', title: 'Abrir', isActive: false },
      deleted: { ...base, id: 'a3', name: 'Template excluído', title: 'Abrir', isActive: true, deletedAt: '2026-09-20T10:00:00Z', deletedBy: 'admin' },
      clientScoped: { ...base, id: 'a4', name: 'Template do cliente', title: 'Abrir', isActive: true, clientId: 'c1' },
    },
  };
});

vi.mock('@/hooks/useSupportProductivity', () => ({
  useAdminTicketTemplates: (params: { includeInactive?: boolean; includeDeleted?: boolean } = {}) => {
    const all = [templates.active, templates.inactive, templates.deleted, templates.clientScoped];
    const data = all.filter((t) => {
      if (!params.includeDeleted && t.deletedAt !== null) return false;
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

  it('mostra o catálogo ativo, incluindo templates por cliente, sem inativos/excluídos', () => {
    renderPage();

    expect(screen.getByText('Template ativo')).toBeTruthy();
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

  it('excluir do catálogo pede confirmação e move para a lixeira', () => {
    renderPage();

    fireEvent.click(screen.getAllByLabelText('Excluir')[0]);
    expect(screen.getByText('Mover template para a lixeira')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mover para a lixeira' }));
    expect(deleteMock).toHaveBeenCalledWith({ id: 'a1' }, expect.anything());
  });
});
