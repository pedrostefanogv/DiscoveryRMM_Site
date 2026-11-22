import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  updateHolidayMutateAsyncMock,
  createRuleMutateAsyncMock,
  updateRuleMutateAsyncMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  updateHolidayMutateAsyncMock: vi.fn(),
  createRuleMutateAsyncMock: vi.fn(),
  updateRuleMutateAsyncMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

const CALENDAR_DETAIL = {
  id: 'cal-1',
  name: 'Comercial Brasil',
  clientId: null,
  timezone: 'America/Sao_Paulo',
  workDayStartHour: 8,
  workDayEndHour: 18,
  workDaysJson: '[1,2,3,4,5]',
  isDefault: true,
  holidayCount: 1,
  holidays: [
    {
      id: 'hol-1',
      name: 'Natal',
      date: '2026-12-25T00:00:00',
      holidayType: 1,
    },
  ],
};

const RULE_1 = {
  id: 'rule-1',
  workflowProfileId: 'wp-1',
  name: 'Escalar 80%',
  triggerAtSlaPercent: 80,
  triggerAtHoursBefore: 0,
  reassignToUserId: null,
  reassignToDepartmentId: null,
  bumpPriority: true,
  notifyAssignee: true,
  isActive: true,
  escalationCooldownMinutes: 360,
};

vi.mock('@/hooks', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'TNG Placas' }], isLoading: false, isError: false, refetch: vi.fn() }),
  useDepartments: () => ({ data: [{ id: 'd1', name: 'Suporte' }], isLoading: false, isError: false, refetch: vi.fn() }),
  useIamUsers: () => ({ data: [{ id: 'u1', fullName: 'Pedro' }], isLoading: false, isError: false, refetch: vi.fn() }),
  useWorkflowProfiles: () => ({
    data: [{ id: 'wp-1', name: 'Padrão', departmentId: 'd1', clientId: null }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSlaCalendars: () => ({ data: [CALENDAR_DETAIL], isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useSlaCalendar: (_id: string | null, enabled: boolean) => ({
    data: enabled ? CALENDAR_DETAIL : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useEscalationRules: () => ({ data: [RULE_1], isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useEscalationRulesByWorkflowProfile: () => ({ data: [RULE_1], isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
  useCreateSlaCalendar: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSlaCalendar: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSlaCalendar: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddSlaCalendarHoliday: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSlaCalendarHoliday: () => ({ mutateAsync: updateHolidayMutateAsyncMock, isPending: false }),
  useDeleteSlaCalendarHoliday: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateEscalationRule: () => ({ mutateAsync: createRuleMutateAsyncMock, isPending: false }),
  useUpdateEscalationRule: () => ({ mutateAsync: updateRuleMutateAsyncMock, isPending: false }),
  useDeleteEscalationRule: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import TicketSlaPage from './TicketSlaPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tickets/sla']}>
      <TicketSlaPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('TicketSlaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateHolidayMutateAsyncMock.mockResolvedValue(undefined);
    createRuleMutateAsyncMock.mockResolvedValue(undefined);
    updateRuleMutateAsyncMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('formata data do feriado sem deslocamento de timezone (25 de dezembro, nunca 24)', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Feriados' }));

    expect(screen.getByText(/25 de dezembro/i)).toBeTruthy();
    expect(screen.queryByText(/24 de dezembro/i)).toBeNull();
  });

  it('envia date: null ao converter feriado fixo/anual para relativo na edição', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Feriados' }));
    const editButtons = screen.getAllByRole('button', { name: 'Editar' });
    fireEvent.click(editButtons[editButtons.length - 1]);

    fireEvent.change(screen.getByLabelText('Tipo do feriado'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar feriado' }));

    await waitFor(() => {
      expect(updateHolidayMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cal-1',
          holidayId: 'hol-1',
          data: expect.objectContaining({
            holidayType: 2,
            date: null,
          }),
        }),
      );
    });
  });

  it('bloqueia criação de regra com triggerAtSlaPercent maior que 100', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Nova regra' }));
    fireEvent.change(screen.getByLabelText('Workflow profile'), { target: { value: 'wp-1' } });
    fireEvent.change(screen.getByLabelText('Nome da regra'), { target: { value: 'Regra inválida' } });
    fireEvent.change(screen.getByLabelText('Trigger em % SLA'), { target: { value: '120' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar regra' }));

    expect(toastErrorMock).toHaveBeenCalledWith('Percentual de disparo inválido (0 a 100).');
    expect(createRuleMutateAsyncMock).not.toHaveBeenCalled();
  });

  it('ao editar regra, desabilita Workflow profile e não altera o filtro principal ao cancelar', () => {
    renderPage();

    expect(screen.getByText('Cooldown 6h')).toBeTruthy();

    const editButtons = screen.getAllByRole('button', { name: 'Editar' });
    fireEvent.click(editButtons[1]);

    const profileSelect = screen.getByLabelText('Workflow profile') as HTMLSelectElement;
    expect(profileSelect.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Limpar formulário' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    const filterSelect = screen.getByLabelText('Filtrar por workflow profile') as HTMLSelectElement;
    expect(filterSelect.value).toBe('');
  });
});
