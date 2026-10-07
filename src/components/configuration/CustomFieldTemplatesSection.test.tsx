import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, updateMock, templatesRef } = vi.hoisted(() => ({
  createMock: vi.fn().mockResolvedValue({}),
  updateMock: vi.fn().mockResolvedValue({}),
  templatesRef: { current: [] as Array<Record<string, unknown>> },
}));

vi.mock('@/hooks/useCustomFieldTemplates', () => ({
  useCustomFieldTemplates: () => ({ data: templatesRef.current, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateCustomFieldTemplate: () => ({ mutateAsync: createMock, isPending: false }),
  useUpdateCustomFieldTemplate: () => ({ mutateAsync: updateMock, isPending: false }),
  useDeleteCustomFieldTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useClients', () => ({
  useClients: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [], isLoading: false }),
}));

import { CustomFieldTemplatesSection } from './CustomFieldTemplatesSection';

function template(overrides: Record<string, unknown>) {
  return {
    id: 'c1',
    clientId: null,
    departmentId: null,
    name: 'texto-curto',
    label: 'Texto curto',
    description: null,
    dataType: 0,
    options: [],
    validationRegex: null,
    inputMask: null,
    minLength: null,
    maxLength: null,
    minValue: null,
    maxValue: null,
    defaultIsRequired: false,
    isBuiltIn: true,
    isActive: true,
    sortOrder: 10,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('CustomFieldTemplatesSection — Título/Chave', () => {
  beforeEach(() => {
    templatesRef.current = [];
    createMock.mockClear();
    updateMock.mockClear();
  });

  afterEach(() => cleanup());

  it('usa a nomenclatura padronizada Título/Chave no modelo', () => {
    render(<CustomFieldTemplatesSection />);

    fireEvent.click(screen.getByRole('button', { name: /Novo modelo/ }));

    expect(screen.getByLabelText(/Título/)).toBeTruthy();
    expect(screen.getByLabelText(/Chave/)).toBeTruthy();
    expect(screen.queryByLabelText(/Rótulo/)).toBeNull();
    expect(screen.queryByLabelText(/^Nome/)).toBeNull();
  });

  it('gera a chave do modelo a partir do título e preserva edição manual', () => {
    render(<CustomFieldTemplatesSection />);

    fireEvent.click(screen.getByRole('button', { name: /Novo modelo/ }));

    const title = screen.getByLabelText(/Título/) as HTMLInputElement;
    const key = screen.getByLabelText(/Chave/) as HTMLInputElement;

    fireEvent.change(title, { target: { value: 'CPF do Cliente' } });
    expect(key.value).toBe('cpf_do_cliente');

    fireEvent.change(key, { target: { value: 'cpf_cliente' } });
    fireEvent.change(title, { target: { value: 'Documento' } });
    expect(key.value).toBe('cpf_cliente');
  });

  it('permite editar modelo built-in com hífen na chave (regressão)', async () => {
    templatesRef.current = [template({ id: 'c1', name: 'texto-curto', label: 'Texto curto' })];
    render(<CustomFieldTemplatesSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    // A chave é imutável depois de criada.
    expect((screen.getByLabelText(/Chave/) as HTMLInputElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'Texto curto editado' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const call = updateMock.mock.calls[0][0] as { id: string; data: { name: string; label: string } };
    expect(call.id).toBe('c1');
    // O hífen do built-in é preservado (a API aceita [a-z0-9_-] para modelos).
    expect(call.data.name).toBe('texto-curto');
    expect(call.data.label).toBe('Texto curto editado');
  });

  it('avisa quando a chave já existe no mesmo escopo', () => {
    templatesRef.current = [template({ id: 'c2', name: 'cpf', label: 'CPF', isBuiltIn: false })];
    render(<CustomFieldTemplatesSection />);

    fireEvent.click(screen.getByRole('button', { name: /Novo modelo/ }));
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'CPF' } });

    expect(screen.getByText('Já existe um modelo com esta chave neste escopo.')).toBeTruthy();
  });

  it('não acusa duplicidade quando o escopo é diferente', () => {
    templatesRef.current = [
      template({ id: 'c3', name: 'cpf', label: 'CPF', isBuiltIn: false, clientId: 'outro-cliente' }),
    ];
    render(<CustomFieldTemplatesSection />);

    fireEvent.click(screen.getByRole('button', { name: /Novo modelo/ }));
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'CPF' } });

    expect(screen.queryByText('Já existe um modelo com esta chave neste escopo.')).toBeNull();
  });
});
