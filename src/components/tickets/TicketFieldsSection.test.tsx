import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TicketSchemaField } from '@/api';

const { valuesState, definitionsState, schemaState, upsertMock } = vi.hoisted(() => ({
  upsertMock: vi.fn().mockResolvedValue({}),
  valuesState: {
    data: [
      {
        definitionId: 'd1',
        entityId: 't1',
        scopeType: 5, // Department
        value: '1024',
        isSecret: false,
        updatedAt: '2026-01-01T00:00:00Z',
        label: 'Ramal',
        name: 'ramal',
      },
    ],
    isLoading: false,
  },
  definitionsState: { data: [], isLoading: false, isError: false },
  schemaState: {
    data: [
      {
        definitionId: 'd1',
        name: 'ramal',
        label: 'Ramal',
        description: null,
        dataType: 0, // Text
        isRequired: true,
        isInternal: false,
        isActive: true,
        options: [],
        validationRegex: null,
        inputMask: null,
        minLength: null,
        maxLength: null,
        minValue: null,
        maxValue: null,
        currentValueJson: null,
      },
    ] as TicketSchemaField[],
    isLoading: false,
  },
}));

vi.mock('@/hooks/useTicketCustomFields', () => ({
  useTicketCustomFields: () => valuesState,
  useUpsertTicketCustomFieldValue: () => ({ mutateAsync: upsertMock, isPending: false }),
}));
vi.mock('@/hooks/useCustomFields', () => ({
  useCustomFieldDefinitions: () => definitionsState,
}));
vi.mock('@/hooks/useDepartmentCustomFields', () => ({
  useDepartmentTicketSchema: () => schemaState,
}));

import { TicketFieldsSection } from './TicketFieldsSection';

describe('TicketFieldsSection', () => {
  beforeEach(() => upsertMock.mockClear());

  afterEach(() => {
    valuesState.data = [
      {
        definitionId: 'd1',
        entityId: 't1',
        scopeType: 5,
        value: '1024',
        isSecret: false,
        updatedAt: '2026-01-01T00:00:00Z',
        label: 'Ramal',
        name: 'ramal',
      },
    ];
    cleanup();
  });

  it('mostra os campos do departamento editáveis, com tipo e obrigatoriedade', () => {
    render(<TicketFieldsSection ticketId="t1" departmentId="dep1" />);

    expect(screen.getByText('Campos do departamento')).toBeTruthy();
    expect(screen.getByText('Ramal')).toBeTruthy();
    expect(screen.getByText('Texto')).toBeTruthy();
    expect(screen.getByText('Obrigatório')).toBeTruthy();
    expect(screen.getByDisplayValue('1024')).toBeTruthy();
  });

  it('salva o campo do departamento alterado', async () => {
    render(<TicketFieldsSection ticketId="t1" departmentId="dep1" />);

    fireEvent.change(screen.getByLabelText(/Ramal/), { target: { value: '2048' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(upsertMock).toHaveBeenCalledWith({
        ticketId: 't1',
        definitionId: 'd1',
        value: '2048',
      }),
    );
  });

  it('marca como "Não informado" quando o campo obrigatório está vazio', () => {
    valuesState.data = [];
    render(<TicketFieldsSection ticketId="t1" departmentId="dep1" />);

    expect(screen.getByDisplayValue('')).toBeTruthy();
    expect(screen.getByText('Não informado')).toBeTruthy();
  });

  it('avisa quando o chamado não tem departamento', () => {
    valuesState.data = [];
    schemaState.data = [];
    schemaState.isLoading = false;
    render(<TicketFieldsSection ticketId="t1" />);

    expect(screen.getByText(/Chamado sem departamento/)).toBeTruthy();
  });
});
