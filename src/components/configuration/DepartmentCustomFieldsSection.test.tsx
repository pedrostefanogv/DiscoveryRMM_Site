import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { createMock, updateMock, deleteMock } = vi.hoisted(() => ({
  createMock: vi.fn().mockResolvedValue({}),
  updateMock: vi.fn().mockResolvedValue({}),
  deleteMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/useDepartmentCustomFields', () => ({
  useDepartmentCustomFields: () => ({
    data: [],
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
