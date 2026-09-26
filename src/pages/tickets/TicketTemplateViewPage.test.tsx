import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Página de visualização do template: somente leitura, com as ações (editar,
 * ativar/desativar, lixeira/restaurar). O clique na listagem leva para cá.
 */
const { restoreMock, deleteMock, updateMock, templatesState } = vi.hoisted(() => {
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

  const active = {
    ...base,
    id: 't1',
    name: 'criacao_de_login',
    title: 'Criação de Login',
    isActive: true,
  };

  return {
    restoreMock: vi.fn(),
    deleteMock: vi.fn(),
    updateMock: vi.fn(),
    templatesState: {
      // Record: o teste ajusta deletedAt/deletedBy no caso da lixeira.
      data: [active] as Array<Record<string, unknown>>,
      isLoading: false,
      isFetching: false,
      isSuccess: true,
      isError: false,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    },
  };
});

vi.mock('@/hooks/useSupportProductivity', () => ({
  useTicketTemplates: () => templatesState,
  useUpdateTicketTemplate: () => ({ mutate: updateMock, isPending: false }),
  useDeleteTicketTemplate: () => ({ mutate: deleteMock, isPending: false }),
  usePurgeTicketTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreTicketTemplate: () => ({ mutate: restoreMock, isPending: false }),
  useCreateTicketTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useAdminTicketTemplates: () => templatesState,
}));

vi.mock('@/hooks/useClients', () => ({ useClients: () => ({ data: [] }) }));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useDepartmentCustomFields', () => ({
  useDepartmentTicketSchema: () => ({ data: [], isLoading: false }),
}));

import TicketTemplateViewPage from './TicketTemplateViewPage';

function renderPage(entry: string) {
  const router = createMemoryRouter(
    [
      { path: '/tickets/templates/:id', element: <TicketTemplateViewPage /> },
      { path: '/tickets/templates', element: <p>LISTA DE TEMPLATES</p> },
      { path: '/tickets/templates/:id/edit', element: <p>EDITAR TEMPLATE</p> },
    ],
    { initialEntries: [entry] },
  );
  return render(<RouterProvider router={router} />);
}

describe('TicketTemplateViewPage', () => {
  beforeEach(() => {
    restoreMock.mockClear();
    deleteMock.mockClear();
    updateMock.mockClear();
  });

  afterEach(() => cleanup());

  it('mostra os dados em modo leitura, com a chave e o botão de editar', () => {
    renderPage('/tickets/templates/t1');

    expect(screen.getByRole('heading', { name: 'Criação de Login' })).toBeTruthy();
    expect(screen.getByText('criacao_de_login')).toBeTruthy();
    expect(screen.getByText('Somente leitura — use Editar para alterar.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Editar/ })).toBeTruthy();
  });

  it('leva para a edição pelo botão Editar', () => {
    renderPage('/tickets/templates/t1');

    fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
    expect(screen.getByText('EDITAR TEMPLATE')).toBeTruthy();
  });

  it('ativa/desativa o template pelo botão', () => {
    renderPage('/tickets/templates/t1');

    fireEvent.click(screen.getByRole('button', { name: /Desativar/ }));
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', data: expect.objectContaining({ isActive: false }) }),
      expect.anything(),
    );
  });

  it('na lixeira, oferece restaurar em vez de editar', () => {
    templatesState.data = [
      { ...templatesState.data[0], deletedAt: '2026-09-20T10:00:00Z', deletedBy: 'admin' },
    ];
    renderPage('/tickets/templates/t1');

    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Restaurar/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Excluir definitivamente/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Restaurar/ }));
    expect(restoreMock).toHaveBeenCalledWith({ id: 't1' }, expect.anything());
  });

  it('mostra estado de não encontrado para id fora do catálogo', () => {
    renderPage('/tickets/templates/inexistente');

    expect(screen.getByText('Template não encontrado')).toBeTruthy();
  });
});
