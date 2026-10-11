import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomFieldDefinition, TicketSchemaField } from '@/api';

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
  definitionsState: { data: [] as CustomFieldDefinition[], isLoading: false, isError: false },
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
    schemaState.data = [
      {
        definitionId: 'd1',
        name: 'ramal',
        label: 'Ramal',
        description: null,
        dataType: 0,
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
    ] as TicketSchemaField[];
    definitionsState.data = [];
    cleanup();
  });

  it('mostra os campos do departamento editáveis, com tipo e obrigatoriedade', () => {
    const { container } = render(<TicketFieldsSection ticketId="t1" departmentId="dep1" />);

    // Sem cabeçalho de seção: os campos entram na mesma grade do resumo.
    expect(screen.queryByText('Campos do departamento')).toBeNull();
    expect(screen.queryByText('Campos adicionais do chamado')).toBeNull();
    expect(container.querySelector('dl')).toBeTruthy();
    // O rótulo aparece UMA vez (no dt); o controle usa aria-label, não repete.
    // (regex: o rótulo antigo do controle era "Ramal *", então um match exato
    // por 'Ramal' não pegaria a duplicação de volta)
    expect(screen.getAllByText(/Ramal/)).toHaveLength(1);
    // O controle continua acessível pelo nome do campo.
    expect(screen.getByLabelText(/Ramal/)).toBeTruthy();
    // Selo de tipo removido da apresentação (aparecia "Texto" após o rótulo).
    expect(screen.queryByText('Texto')).toBeNull();
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

  it('renderiza campo de departamento interno como editável, com selo "Interno"', () => {
    valuesState.data = [];
    schemaState.isLoading = false;
    schemaState.data = [
      {
        definitionId: 'd1',
        name: 'aprovado_por',
        label: 'Aprovador por',
        description: null,
        dataType: 0,
        isRequired: false,
        isInternal: true,
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
    ] as TicketSchemaField[];

    render(<TicketFieldsSection ticketId="t1" departmentId="dep1" />);

    // Editável: o input existe (não caiu no fallback somente leitura).
    expect(screen.getByLabelText('Aprovador por')).toBeTruthy();
    // Marcado como interno.
    expect(screen.getByText('Interno')).toBeTruthy();
  });

  it('campos adicionais: rótulo sem selo de tipo e Salvar só aparece com alteração', () => {
    schemaState.data = [];
    valuesState.data = [];
    definitionsState.data = [
      {
        id: 'd9',
        name: 'interno',
        label: 'Interno',
        description: 'Observação interna',
        scopeType: 4, // Ticket
        dataType: 0, // Text
        isActive: true,
        options: [],
        createdAt: null,
        updatedAt: null,
      },
    ];

    render(<TicketFieldsSection ticketId="t1" departmentId="dep1" />);

    expect(screen.getByText('Interno')).toBeTruthy();
    expect(screen.getByText('Observação interna')).toBeTruthy();
    // Selo de tipo removido da apresentação ("Texto" ao lado do rótulo).
    expect(screen.queryByText('Texto')).toBeNull();
    // Nada alterado: sem botão Salvar.
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Interno'), { target: { value: 'oi' } });

    // Com alteração pendente o botão aparece.
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeTruthy();
  });
});
