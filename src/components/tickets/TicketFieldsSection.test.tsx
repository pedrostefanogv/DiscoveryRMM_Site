import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { valuesState, definitionsState } = vi.hoisted(() => ({
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
}));

vi.mock('@/hooks/useTicketCustomFields', () => ({
  useTicketCustomFields: () => valuesState,
  useUpsertTicketCustomFieldValue: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useCustomFields', () => ({
  useCustomFieldDefinitions: () => definitionsState,
}));

import { TicketFieldsSection } from './TicketFieldsSection';

describe('TicketFieldsSection', () => {
  afterEach(() => cleanup());

  it('mostra os campos do departamento (somente leitura)', () => {
    render(<TicketFieldsSection ticketId="t1" />);

    expect(screen.getByText('Campos do departamento')).toBeTruthy();
    expect(screen.getByText('Ramal')).toBeTruthy();
    expect(screen.getByText('1024')).toBeTruthy();
  });

  it('avisa quando não há campos do departamento', () => {
    valuesState.data = [];
    render(<TicketFieldsSection ticketId="t1" />);

    expect(screen.getByText(/Nenhum campo do departamento informado/)).toBeTruthy();
  });
});
