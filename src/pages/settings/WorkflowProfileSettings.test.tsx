import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useDepartmentsMock,
  createMutateMock,
} = vi.hoisted(() => ({
  useDepartmentsMock: vi.fn(),
  createMutateMock: vi.fn(),
}));

vi.mock('@/hooks/useWorkflowProfiles', () => ({
  useWorkflowProfiles: () => ({
    data: [
      {
        id: 'wp-1',
        clientId: 'c1',
        departmentId: 'd-client',
        name: 'Perfil Cliente',
        description: null,
        slaHours: 8,
        slaCalendarId: 'cal-c1',
        slaWarningPercent: 80,
        defaultPriority: 'High',
        isActive: true,
      },
    ],
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateWorkflowProfile: () => ({ mutate: createMutateMock, isPending: false }),
  useUpdateWorkflowProfile: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteWorkflowProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useClients', () => ({
  useClients: () => ({
    data: [
      { id: 'c1', name: 'Cliente A' },
      { id: 'c2', name: 'Cliente B' },
    ],
  }),
}));

vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: useDepartmentsMock,
}));

vi.mock('@/hooks/useSlaCalendars', () => ({
  useSlaCalendars: () => ({
    data: [
      { id: 'cal-global', clientId: null, name: 'Global Padrão', isDefault: true },
      { id: 'cal-c1', clientId: 'c1', name: 'Calendário A', isDefault: false },
    ],
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

import WorkflowProfileSettings from './WorkflowProfileSettings';

describe('WorkflowProfileSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDepartmentsMock.mockReturnValue({
      data: [
        { id: 'd-global', clientId: null, name: 'Suporte Global', isActive: true },
        { id: 'd-client', clientId: 'c1', name: 'ERP Cliente A', isActive: true },
      ],
      refetch: vi.fn(),
    });
  });

  afterEach(() => cleanup());

  it('pede departamentos com allClients: true, traduz prioridade e exibe link para /tickets/sla', () => {
    render(
      <MemoryRouter>
        <WorkflowProfileSettings />
      </MemoryRouter>,
    );

    expect(useDepartmentsMock).toHaveBeenCalledWith({
      includeGlobal: true,
      activeOnly: true,
      allClients: true,
    });

    expect(screen.getByText(/ERP Cliente A/)).toBeTruthy();
    expect(screen.getByText('Prioridade: Alta')).toBeTruthy();
    expect(screen.queryByText(/High/)).toBeNull();

    const slaLink = screen.getByRole('link', { name: 'SLA e Calendários' });
    expect(slaLink.getAttribute('href')).toBe('/tickets/sla');
  });

  it('permite apagar e digitar SLA (horas) e limpa calendário incompatível ao trocar cliente', () => {
    render(
      <MemoryRouter>
        <WorkflowProfileSettings />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Novo Perfil' }));

    const slaInput = screen.getByLabelText('SLA (horas) *') as HTMLInputElement;
    fireEvent.change(slaInput, { target: { value: '' } });
    expect(slaInput.value).toBe('');
    fireEvent.change(slaInput, { target: { value: '12' } });
    expect(slaInput.value).toBe('12');

    const clientSelect = screen.getByLabelText('Cliente') as HTMLSelectElement;
    const calendarSelect = screen.getByLabelText('Calendário de SLA') as HTMLSelectElement;

    fireEvent.change(clientSelect, { target: { value: 'c1' } });
    fireEvent.change(calendarSelect, { target: { value: 'cal-c1' } });
    expect(calendarSelect.value).toBe('cal-c1');

    // Trocar para c2 deve limpar cal-c1 (que pertence a c1) e voltar ao padrão global
    fireEvent.change(clientSelect, { target: { value: 'c2' } });
    expect(calendarSelect.value).toBe('cal-global');
  });
});
