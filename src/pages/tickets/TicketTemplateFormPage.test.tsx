import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Verifica os caminhos de render da página de template, o payload enviado ao
 * salvar e o aviso de alterações não salvas. A página lê o DTO da listagem
 * administrativa (não existe GET por id), então os hooks de dados são mockados.
 */
const { updateMock, createMock, restoreMock, templatesState } = vi.hoisted(() => {
  const template = {
    id: 't1',
    clientId: null,
    departmentId: null,
    name: 'suporte_padrao',
    title: 'Abrir chamado de suporte',
    description: 'Descrição do template',
    priority: 'Medium',
    category: 'Suporte',
    customFieldDefaultsJson: '{}',
    questionsJson: '[]',
    isActive: true,
    deletedAt: null,
    deletedBy: null,
  };

  const deleted = {
    ...template,
    id: 't2',
    name: 'template_na_lixeira',
    deletedAt: '2026-09-20T10:00:00Z',
    deletedBy: 'admin',
  };

  return {
    updateMock: vi.fn(),
    createMock: vi.fn(),
    restoreMock: vi.fn(),
    templatesState: {
      data: [template, deleted],
      isLoading: false,
      isFetching: false,
      isError: false,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    },
  };
});

vi.mock('@/hooks/useSupportProductivity', () => ({
  useTicketTemplates: () => templatesState,
  useAdminTicketTemplates: () => templatesState,
  useCreateTicketTemplate: () => ({ mutate: createMock, isPending: false }),
  useUpdateTicketTemplate: () => ({ mutate: updateMock, isPending: false }),
  useRestoreTicketTemplate: () => ({ mutate: restoreMock, isPending: false }),
  useDeleteTicketTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  usePurgeTicketTemplate: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useClients', () => ({ useClients: () => ({ data: [] }) }));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useDepartmentCustomFields', () => ({
  useDepartmentTicketSchema: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useCustomFieldTemplates', () => ({
  useCustomFieldTemplates: () => ({ data: [] }),
}));

import TicketTemplateFormPage from './TicketTemplateFormPage';

function renderPage(entry: string) {
  const router = createMemoryRouter(
    [
      { path: '/tickets/templates/new', element: <TicketTemplateFormPage /> },
      { path: '/tickets/templates/:id/edit', element: <TicketTemplateFormPage /> },
      { path: '/tickets/templates/:id', element: <p>VISUALIZAR TEMPLATE</p> },
      { path: '/tickets/templates', element: <p>LISTA DE TEMPLATES</p> },
    ],
    { initialEntries: [entry] },
  );
  return render(<RouterProvider router={router} />);
}

describe('TicketTemplateFormPage', () => {
  beforeEach(() => {
    updateMock.mockClear();
    createMock.mockClear();
    restoreMock.mockClear();
  });

  afterEach(() => cleanup());

  it('preenche o formulário no modo edição e envia o PUT com o id da rota', () => {
    const { container } = renderPage('/tickets/templates/t1/edit');

    expect(screen.getByDisplayValue('suporte_padrao')).toBeTruthy();
    expect(screen.getByDisplayValue('Abrir chamado de suporte')).toBeTruthy();

    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(
      {
        id: 't1',
        data: expect.objectContaining({
          name: 'suporte_padrao',
          title: 'Abrir chamado de suporte',
          customFieldDefaultsJson: '{}',
          questionsJson: '[]',
        }),
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('cria um template quando a rota é /new', () => {
    const { container } = renderPage('/tickets/templates/new');

    // Título é o nome exibido; a Chave é derivada dele (slug).
    fireEvent.change(screen.getByLabelText('Título *'), { target: { value: 'Novo modelo' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: 'novo_modelo', title: 'Novo modelo' }),
    );
  });

  it('mostra estado de não encontrado para um id fora do catálogo', () => {
    renderPage('/tickets/templates/inexistente/edit');

    expect(screen.getByText('Template não encontrado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull();
  });

  it('bloqueia a edição de template na lixeira e oferece restaurar', () => {
    renderPage('/tickets/templates/t2/edit');

    expect(screen.getByText('Template excluído')).toBeTruthy();
    expect(screen.getByText(/por admin/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Restaurar template/ }));
    expect(restoreMock).toHaveBeenCalledWith({ id: 't2' }, expect.anything());
  });

  it('sai direto para a listagem quando não há alterações pendentes', () => {
    renderPage('/tickets/templates/t1/edit');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('VISUALIZAR TEMPLATE')).toBeTruthy();
  });

  it('pede confirmação ao sair com alterações e respeita continuar editando', () => {
    renderPage('/tickets/templates/t1/edit');

    // Editar o TÍTULO não mexe na chave (já existente no modo edição).
    fireEvent.change(screen.getByLabelText('Título *'), { target: { value: 'Nome alterado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByText('Descartar alterações?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByDisplayValue('Nome alterado')).toBeTruthy();
    expect(screen.queryByText('VISUALIZAR TEMPLATE')).toBeNull();
  });

  it('descartar e sair confirma a navegação para a listagem', () => {
    renderPage('/tickets/templates/t1/edit');

    fireEvent.change(screen.getByLabelText('Título *'), { target: { value: 'Nome alterado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar e sair' }));

    expect(screen.getByText('VISUALIZAR TEMPLATE')).toBeTruthy();
  });
});
