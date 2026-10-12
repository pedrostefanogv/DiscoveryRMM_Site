import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomFieldSchemaItem } from '@/api';

const { schemaState, upsertMock } = vi.hoisted(() => ({
  upsertMock: vi.fn().mockResolvedValue(undefined),
  schemaState: {
    data: [] as CustomFieldSchemaItem[],
    isLoading: false,
    isError: false,
  },
}));

vi.mock('@/hooks/useCustomFields', () => ({
  useAgentCustomFieldSchema: () => schemaState,
  useUpsertAgentCustomFieldValue: () => ({ mutateAsync: upsertMock, isPending: false }),
}));

import { AgentCustomFieldsCard } from './AgentCustomFieldsCard';

function item(overrides: Partial<CustomFieldSchemaItem> = {}): CustomFieldSchemaItem {
  return {
    definitionId: 'd1',
    name: 'anydesk',
    label: 'ID do anydesk',
    description: null,
    scopeType: 3,
    dataType: 0,
    isRequired: false,
    isActive: true,
    isSecret: false,
    options: [],
    inputMask: null,
    minLength: null,
    maxLength: null,
    minValue: null,
    maxValue: null,
    allowRuntimeRead: true,
    allowAgentWrite: true,
    runtimeAccessMode: 1,
    accessBindings: [],
    allowWebRead: true,
    allowWebEdit: true,
    isPinned: true,
    entityId: 'a1',
    valueJson: JSON.stringify('123 456 789'),
    valueUpdatedAt: '2026-10-12T12:00:00Z',
    valueUpdatedBy: 'agent',
    ...overrides,
  };
}

describe('AgentCustomFieldsCard', () => {
  beforeEach(() => {
    upsertMock.mockClear();
    schemaState.data = [item()];
    schemaState.isLoading = false;
    schemaState.isError = false;
  });

  afterEach(() => cleanup());

  it('lista os campos visíveis e informa origem da última alteração', () => {
    render(<AgentCustomFieldsCard agentId="a1" canEdit />);
    expect(screen.getByText('ID do anydesk')).toBeTruthy();
    expect(screen.getByText('Lido por scripts')).toBeTruthy();
    expect(screen.getByText('Atualizado pelo agente')).toBeTruthy();
    expect(screen.getByText(/Atualizado em .*· agent/)).toBeTruthy();
  });

  it('campo com allowWebEdit=false aparece somente leitura', () => {
    schemaState.data = [item({ allowWebEdit: false })];
    render(<AgentCustomFieldsCard agentId="a1" canEdit />);
    expect(screen.getByText('Somente leitura')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
  });

  it('salvar envia o valor convertido pelo tipo do campo', async () => {
    render(<AgentCustomFieldsCard agentId="a1" canEdit />);
    const input = screen.getByLabelText('ID do anydesk') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    expect(upsertMock).toHaveBeenCalledWith({ definitionId: 'd1', value: '999' });
  });

  it('sem permissão de edição do agente, nada é editável', () => {
    render(<AgentCustomFieldsCard agentId="a1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
  });

  it('sem campos, mostra o estado vazio', () => {
    schemaState.data = [];
    render(<AgentCustomFieldsCard agentId="a1" canEdit />);
    expect(screen.getByText(/Nenhum campo customizado visível/)).toBeTruthy();
  });
});
