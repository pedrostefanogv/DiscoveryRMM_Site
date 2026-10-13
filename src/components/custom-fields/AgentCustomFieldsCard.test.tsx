import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomFieldDataType, type CustomFieldSchemaItem } from '@/api';

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

  it('lista os campos visíveis e esconde os metadados atrás do ícone de informação', () => {
    render(<AgentCustomFieldsCard agentId="a1" canEdit />);
    expect(screen.getByText('ID do anydesk')).toBeTruthy();

    // Chave, tipo, permissões e última atualização ficam no aria-label do ⓘ —
    // não são mais renderizados como texto solto (nem no DOM antes do hover).
    const info = screen.getByRole('button', { name: /Chave: anydesk/ });
    expect(info.getAttribute('aria-label')).toContain('Tipo: Texto');
    expect(info.getAttribute('aria-label')).toContain('Lido por scripts');
    expect(info.getAttribute('aria-label')).toContain('Atualizado pelo agente');
    expect(info.getAttribute('aria-label')).toMatch(/Atualizado em .*· agent/);

    expect(screen.queryByText('Chave: anydesk')).toBeNull();
    expect(screen.queryByText('Lido por scripts')).toBeNull();
    expect(screen.queryByText('Atualizado pelo agente')).toBeNull();
    // O rótulo "Valor" repetido acima de cada input saiu de cena.
    expect(screen.queryByText('Valor')).toBeNull();
  });

  it('usa o título compacto "Extras" (não "Campos customizados")', () => {
    render(<AgentCustomFieldsCard agentId="a1" canEdit />);
    expect(screen.getByText('Extras')).toBeTruthy();
    expect(screen.queryByText('Campos customizados')).toBeNull();
  });

  it('campo com allowWebEdit=false aparece somente leitura', () => {
    schemaState.data = [item({ allowWebEdit: false })];
    render(<AgentCustomFieldsCard agentId="a1" canEdit />);
    expect(screen.getByRole('button', { name: /Somente leitura no portal/ })).toBeTruthy();
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

  it('o ícone de informação revela os metadados no hover (chave, tipo, permissões e data)', async () => {
    render(<AgentCustomFieldsCard agentId="a1" canEdit />);
    const info = screen.getByRole('button', { name: /Chave: anydesk/ });

    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(info.parentElement as Element);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain('anydesk');
    expect(tooltip.textContent).toContain('Texto');
    expect(tooltip.textContent).toContain('Atualizado em');
  });

  it('campo de lista expõe as opções na descrição do ícone ⓘ', () => {
    schemaState.data = [item({ dataType: CustomFieldDataType.ListBox, options: ['A', 'B'] })];
    render(<AgentCustomFieldsCard agentId="a1" canEdit />);
    expect(screen.getByRole('button', { name: /Opções: A, B/ })).toBeTruthy();
  });

  it('campo DateTime com valor abre o input já preenchido (sem segundos)', () => {
    schemaState.data = [
      item({ dataType: CustomFieldDataType.DateTime, valueJson: JSON.stringify('2026-10-13T20:37:25') }),
    ];
    render(<AgentCustomFieldsCard agentId="a1" canEdit />);

    const input = screen.getByLabelText('ID do anydesk') as HTMLInputElement;
    expect(input.value).toBe('2026-10-13T20:37');
    // Sem alteração real, "Salvar" continua desabilitado (comparação normalizada).
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('campo Date somente leitura é exibido em pt-BR, sem deslocar o dia', () => {
    schemaState.data = [
      item({ dataType: CustomFieldDataType.Date, allowWebEdit: false, valueJson: JSON.stringify('2026-10-13') }),
    ];
    render(<AgentCustomFieldsCard agentId="a1" canEdit />);
    expect(screen.getByText('13/10/2026')).toBeTruthy();
    expect(screen.queryByText('2026-10-13')).toBeNull();
  });

  it('inputs de campos diferentes não compartilham o mesmo id (sem rótulo "Valor" duplicado)', () => {
    schemaState.data = [
      item({ definitionId: 'd1', label: 'Campo A' }),
      item({ definitionId: 'd2', label: 'Campo B' }),
    ];
    const { container } = render(<AgentCustomFieldsCard agentId="a1" canEdit />);
    const ids = Array.from(container.querySelectorAll<HTMLElement>('input, select')).map(el => el.id);
    expect(ids.length).toBeGreaterThan(1);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
