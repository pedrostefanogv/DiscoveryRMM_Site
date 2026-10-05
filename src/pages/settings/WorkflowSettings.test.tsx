import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Página de Workflow: selo de "SLA ignorado", contagem de chamados por estado
 * (KPI byState), seletor de cliente e ajudas de campo nos modais.
 */
const mocks = vi.hoisted(() => ({
  statesState: { data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() },
  transitionsState: { data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() },
  clientsState: { data: [] as unknown[] },
  kpiState: { data: undefined as unknown, isSuccess: false },
  mutation: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
}));

vi.mock('@/hooks/useWorkflow', () => ({
  useWorkflowStates: () => mocks.statesState,
  useWorkflowTransitions: () => mocks.transitionsState,
  useCreateWorkflowState: () => mocks.mutation,
  useUpdateWorkflowState: () => mocks.mutation,
  useDeleteWorkflowState: () => mocks.mutation,
  useCreateWorkflowTransition: () => mocks.mutation,
  useDeleteWorkflowTransition: () => mocks.mutation,
}));

vi.mock('@/hooks/useClients', () => ({
  useClients: () => mocks.clientsState,
}));

vi.mock('@/hooks/useTicketKpi', () => ({
  useTicketKpi: () => mocks.kpiState,
}));

import WorkflowSettings from './WorkflowSettings';

const state = (over: Record<string, unknown>) => ({
  id: 's1',
  clientId: null,
  name: 'Aberto',
  color: '#3b82f6',
  isInitial: true,
  isFinal: false,
  sortOrder: 1,
  pausesSla: false,
  ...over,
});

describe('WorkflowSettings', () => {
  beforeEach(() => {
    mocks.statesState.data = [
      state({ id: 's1', name: 'Aberto', sortOrder: 1 }),
      state({ id: 's2', name: 'Aguardando cliente', sortOrder: 2, pausesSla: true }),
    ];
    mocks.transitionsState.data = [];
    mocks.clientsState.data = [{ id: 'c1', name: 'Cliente TNG' }];
    mocks.kpiState.data = { byState: [{ workflowStateId: 's2', count: 3 }] };
    mocks.kpiState.isSuccess = true;
    mocks.mutation.mutate.mockClear();
    mocks.mutation.mutateAsync.mockClear();
  });

  it('marca o estado que pausa SLA e mostra a contagem de chamados', () => {
    render(<WorkflowSettings />);

    expect(screen.getByText('Aguardando cliente')).toBeTruthy();
    expect(screen.getByText('SLA ignorado')).toBeTruthy();
    expect(screen.getByText('3 chamados')).toBeTruthy();
    expect(screen.getAllByText('Global')).toHaveLength(2);
  });

  it('oferece o filtro por cliente', () => {
    render(<WorkflowSettings />);

    const select = screen.getByLabelText('Cliente') as HTMLSelectElement;
    const options = Array.from(select.options).map((option) => option.textContent);
    expect(options).toContain('Estados globais (todos os clientes)');
    expect(options).toContain('Cliente TNG');
  });

  it('explica cada campo no modal de novo estado', () => {
    render(<WorkflowSettings />);

    fireEvent.click(screen.getByText('Novo Estado'));

    const toggle = screen.getByLabelText('Desconsiderar SLA neste estado') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.getByText(/Como o estado aparece no chamado/)).toBeTruthy();
    expect(screen.getByText(/Enquanto o chamado estiver neste estado, o prazo de SLA/)).toBeTruthy();
    expect(screen.getByText(/Marque apenas um estado como inicial/)).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
  });

  it('abre o modal de edição com o toggle de SLA refletindo o estado', () => {
    render(<WorkflowSettings />);

    fireEvent.click(screen.getAllByLabelText('Editar estado')[1]);

    const toggle = screen.getByLabelText('Desconsiderar SLA neste estado') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(screen.getByText(/Cor do selo do estado/)).toBeTruthy();
    expect(screen.getByText(/Encerra o chamado/)).toBeTruthy();
  });

  it('explica os campos no modal de nova transição', () => {
    render(<WorkflowSettings />);

    fireEvent.click(screen.getByText('Nova Transição'));

    expect(screen.getByText(/Rótulo da transição, exibido como opção/)).toBeTruthy();
    expect(screen.getByText(/Estado de origem: onde o chamado precisa estar/)).toBeTruthy();
    expect(screen.getByText(/Estado de destino: para onde o chamado vai/)).toBeTruthy();
  });
});
