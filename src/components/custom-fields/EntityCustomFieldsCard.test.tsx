import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CustomFieldSchemaItem } from '@/api';

const { schemaCalls, upsertCalls, schemaState } = vi.hoisted(() => ({
  schemaCalls: [] as Array<{ scope: number; target: Record<string, unknown> }>,
  upsertCalls: [] as Array<{ scope: number; target: Record<string, unknown> }>,
  schemaState: { data: [] as CustomFieldSchemaItem[], isLoading: false, isError: false },
}));

vi.mock('@/hooks/useCustomFields', () => ({
  useEntityCustomFieldSchema: (scope: number, target: Record<string, unknown>) => {
    schemaCalls.push({ scope, target });
    return schemaState;
  },
  useUpsertEntityCustomFieldValue: (scope: number, target: Record<string, unknown>) => {
    upsertCalls.push({ scope, target });
    return { mutateAsync: vi.fn(), isPending: false };
  },
  useCustomFieldsBoundToExecution: () => ({ data: [], isError: false }),
}));

import { ClientCustomFieldsCard } from './ClientCustomFieldsCard';
import { SiteCustomFieldsCard } from './SiteCustomFieldsCard';

function item(overrides: Partial<CustomFieldSchemaItem> = {}): CustomFieldSchemaItem {
  return {
    definitionId: 'd1',
    name: 'contrato',
    label: 'Contrato',
    description: null,
    scopeType: 1,
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
    allowRuntimeRead: false,
    allowAgentWrite: false,
    runtimeAccessMode: 0,
    accessBindings: [],
    allowWebRead: true,
    allowWebEdit: false,
    isPinned: false,
    entityId: 'c1',
    valueJson: JSON.stringify('CONTRATO-1'),
    valueUpdatedAt: null,
    valueUpdatedBy: null,
    ...overrides,
  };
}

describe('cards de campos por entidade', () => {
  it('cliente usa o escopo Client com o clientId', () => {
    schemaCalls.length = 0;
    schemaState.data = [item()];
    render(<ClientCustomFieldsCard clientId="c1" canEdit />);
    expect(screen.getByText('Contrato')).toBeTruthy();
    expect(schemaCalls[0]).toEqual({ scope: 1, target: { entityId: 'c1' } });
  });

  it('site usa o escopo Site com siteId e clientId juntos', () => {
    schemaCalls.length = 0;
    schemaState.data = [];
    render(<SiteCustomFieldsCard clientId="c1" siteId="s1" canEdit />);
    expect(screen.getByText(/Nenhum campo customizado visível para este site/)).toBeTruthy();
    expect(schemaCalls[0]).toEqual({ scope: 2, target: { entityId: 's1', clientId: 'c1' } });
  });
});
