import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, updateMock, deleteMock, fieldsRef } = vi.hoisted(() => ({
  createMock: vi.fn().mockResolvedValue({}),
  updateMock: vi.fn().mockResolvedValue({}),
  deleteMock: vi.fn().mockResolvedValue(undefined),
  fieldsRef: { current: [] as Array<Record<string, unknown>> },
}));

vi.mock('@/hooks/useDepartmentCustomFields', () => ({
  useDepartmentCustomFields: () => ({
    data: fieldsRef.current,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateDepartmentCustomField: () => ({ mutateAsync: createMock, isPending: false }),
  useUpdateDepartmentCustomField: () => ({ mutateAsync: updateMock, isPending: false }),
  useDeleteDepartmentCustomField: () => ({ mutateAsync: deleteMock, isPending: false }),
}));

vi.mock('@/hooks/useCustomFieldTemplates', () => ({
  useCustomFieldTemplates: () => ({ data: [], isLoading: false, isError: false }),
}));

import { DepartmentCustomFieldsSection } from './DepartmentCustomFieldsSection';

function departmentField(overrides: Record<string, unknown>) {
  return {
    id: 'f1',
    name: 'tipo_solicitacao',
    label: 'Tipo de Solicitação',
    description: null,
    scopeType: 1,
    dataType: 0,
    isRequired: false,
    isActive: true,
    isSecret: false,
    isInternal: false,
    departmentId: 'dep1',
    optionsJson: null,
    validationRegex: null,
    inputMask: null,
    minLength: null,
    maxLength: null,
    minValue: null,
    maxValue: null,
    ...overrides,
  };
}

beforeEach(() => {
  fieldsRef.current = [];
  createMock.mockClear();
  updateMock.mockClear();
});

describe('DepartmentCustomFieldsSection — máscara por tipo', () => {
  afterEach(() => cleanup());

  it('mostra o campo de máscara apenas nos tipos aplicáveis', () => {
    render(<DepartmentCustomFieldsSection departmentId="dep1" />);

    fireEvent.click(screen.getByRole('button', { name: /Adicionar Campo/ }));

    // Texto (padrão): aplica máscara.
    expect(screen.getByLabelText(/Máscara de entrada/)).toBeTruthy();

    // Múltipla escolha (ListBox = 7): não aplica.
    fireEvent.change(screen.getByLabelText(/Tipo do Campo/), { target: { value: '7' } });
    expect(screen.queryByLabelText(/Máscara de entrada/)).toBeNull();

    // Booleano (3): não aplica.
    fireEvent.change(screen.getByLabelText(/Tipo do Campo/), { target: { value: '3' } });
    expect(screen.queryByLabelText(/Máscara de entrada/)).toBeNull();

    // Inteiro (1): aplica.
    fireEvent.change(screen.getByLabelText(/Tipo do Campo/), { target: { value: '1' } });
    expect(screen.getByLabelText(/Máscara de entrada/)).toBeTruthy();

    // Seleção única (Dropdown = 6): não aplica.
    fireEvent.change(screen.getByLabelText(/Tipo do Campo/), { target: { value: '6' } });
    expect(screen.queryByLabelText(/Máscara de entrada/)).toBeNull();
  });
});

describe('DepartmentCustomFieldsSection — Título/Chave', () => {
  afterEach(() => cleanup());

  it('usa a nomenclatura padronizada Título/Chave', () => {
    render(<DepartmentCustomFieldsSection departmentId="dep1" />);

    fireEvent.click(screen.getByRole('button', { name: /Adicionar Campo/ }));

    expect(screen.getByLabelText(/Título/)).toBeTruthy();
    expect(screen.getByLabelText(/Chave/)).toBeTruthy();
    expect(screen.queryByLabelText(/Nome do Campo/)).toBeNull();
    expect(screen.queryByLabelText(/Label/)).toBeNull();
  });

  it('gera a chave a partir do título e preserva a chave editada à mão', () => {
    render(<DepartmentCustomFieldsSection departmentId="dep1" />);

    fireEvent.click(screen.getByRole('button', { name: /Adicionar Campo/ }));

    const title = screen.getByLabelText(/Título/) as HTMLInputElement;
    const key = screen.getByLabelText(/Chave/) as HTMLInputElement;

    fireEvent.change(title, { target: { value: 'Tipo de Solicitação' } });
    expect(key.value).toBe('tipo_de_solicitacao');

    // Depois de editar a chave à mão, o título não a sobrescreve mais.
    fireEvent.change(key, { target: { value: 'minha_chave' } });
    fireEvent.change(title, { target: { value: 'Outro Título' } });
    expect(key.value).toBe('minha_chave');
  });

  it('avisa quando a chave já existe no departamento', () => {
    fieldsRef.current = [departmentField({ id: 'f1', name: 'tipo_de_solicitacao', label: 'Tipo' })];
    render(<DepartmentCustomFieldsSection departmentId="dep1" />);

    fireEvent.click(screen.getByRole('button', { name: /Adicionar Campo/ }));
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'Tipo de Solicitação' } });

    expect(
      screen.getByText('Já existe um campo com esta chave neste departamento.'),
    ).toBeTruthy();
  });

  it('não acusa duplicidade ao reeditar o próprio campo', () => {
    fieldsRef.current = [departmentField({ id: 'f1', name: 'tipo_solicitacao', label: 'Tipo' })];
    render(<DepartmentCustomFieldsSection departmentId="dep1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    // A chave é imutável depois de criada.
    expect((screen.getByLabelText(/Chave/) as HTMLInputElement).disabled).toBe(true);

    expect(
      screen.queryByText('Já existe um campo com esta chave neste departamento.'),
    ).toBeNull();
  });
});
