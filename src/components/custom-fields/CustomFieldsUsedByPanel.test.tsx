import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { queryState } = vi.hoisted(() => ({
  queryState: { data: [] as unknown[], isError: false },
}));

vi.mock('@/hooks/useCustomFields', () => ({
  useCustomFieldsBoundToExecution: () => queryState,
}));

import { CustomFieldsUsedByPanel } from './CustomFieldsUsedByPanel';

describe('CustomFieldsUsedByPanel', () => {
  afterEach(() => {
    cleanup();
    queryState.data = [];
    queryState.isError = false;
  });

  it('mostra os campos vinculados e o que a execução pode fazer', () => {
    queryState.data = [
      {
        id: 'd1',
        name: 'anydesk',
        label: 'ID do anydesk',
        scopeType: 3,
        runtimeAccessMode: 2,
        accessBindings: [{ taskId: 't1', scriptId: null, canRead: true, canWrite: true }],
      },
    ];
    render(<CustomFieldsUsedByPanel taskId="t1" />);
    expect(screen.getByText('ID do anydesk')).toBeTruthy();
    expect(screen.getByText('Pode ler')).toBeTruthy();
    expect(screen.getByText('Pode gravar')).toBeTruthy();
    expect(screen.getByText(/MDZ_CUSTOM_FIELDS/)).toBeTruthy();
  });

  it('sem vínculo não renderiza nada', () => {
    render(<CustomFieldsUsedByPanel taskId="t1" />);
    expect(screen.queryByText(/Campos customizados desta tarefa/)).toBeNull();
  });

  it('erro de permissão é silencioso', () => {
    queryState.isError = true;
    render(<CustomFieldsUsedByPanel scriptId="s1" />);
    expect(screen.queryByText(/Campos customizados deste script/)).toBeNull();
  });
});
