import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomFieldSchemaItem } from '@/api';

import { AgentPinnedCustomFields } from './AgentPinnedCustomFields';

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
    valueJson: JSON.stringify('1602799292'),
    valueUpdatedAt: '2026-10-12T12:00:00Z',
    valueUpdatedBy: 'agent',
    ...overrides,
  };
}

describe('AgentPinnedCustomFields', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => cleanup());

  it('mostra apenas os campos destacados, no formato "Rótulo: valor"', () => {
    render(
      <AgentPinnedCustomFields
        items={[
          item(),
          item({ definitionId: 'd2', name: 'teamviewer_id', label: 'TeamViewer ID', isPinned: false, valueJson: JSON.stringify('999') }),
        ]}
      />,
    );

    expect(screen.getByText('Extras')).toBeTruthy();
    expect(screen.getByText('ID do anydesk:')).toBeTruthy();
    expect(screen.getByText('1602799292')).toBeTruthy();
    // Campo sem destaque fica fora do card (aparece na aba Extras).
    expect(screen.queryByText('TeamViewer ID:')).toBeNull();
    expect(screen.queryByText('999')).toBeNull();
  });

  it('não renderiza nada quando nenhum campo está destacado', () => {
    const { container } = render(
      <AgentPinnedCustomFields items={[item({ isPinned: false })]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('campo sem valor mostra "Não informado" e não oferece cópia', () => {
    render(<AgentPinnedCustomFields items={[item({ valueJson: 'null' })]} />);

    expect(screen.getByText('Não informado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Copiar valor/ })).toBeNull();
  });

  it('copia o valor textual do campo', async () => {
    render(<AgentPinnedCustomFields items={[item()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copiar valor de ID do anydesk' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('1602799292'));
  });

  it('segredo aparece mascarado e nunca é copiado', () => {
    render(<AgentPinnedCustomFields items={[item({ isSecret: true, valueJson: JSON.stringify('s3cr3t') })]} />);

    expect(screen.getByText('••••••')).toBeTruthy();
    expect(screen.queryByText('s3cr3t')).toBeNull();
    expect(screen.queryByRole('button', { name: /Copiar valor/ })).toBeNull();
  });

  it('segredo SEM valor aparece como "Não informado" (a API devolve valueJson null)', () => {
    render(<AgentPinnedCustomFields items={[item({ isSecret: true, valueJson: 'null' })]} />);

    expect(screen.getByText('Não informado')).toBeTruthy();
    expect(screen.queryByText('••••••')).toBeNull();
    expect(screen.queryByRole('button', { name: /Copiar valor/ })).toBeNull();
  });

  it('campo numérico/texto com valor zero ou "false" continua copiável', () => {
    render(
      <AgentPinnedCustomFields
        items={[
          item({ definitionId: 'd1', label: 'Serial', valueJson: JSON.stringify('0') }),
          item({ definitionId: 'd2', label: 'Ativo', valueJson: 'false' }),
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Copiar valor de Serial' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copiar valor de Ativo' })).toBeTruthy();
    expect(screen.getByText('false')).toBeTruthy();
  });
});
