import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Aprovações — remoção de regra.
 *
 * A API passou a responder 404 para regra inexistente (antes: 204 silencioso e
 * a UI dizia "Regra removida"). A aba precisa tratar esse caso como "já não
 * existia": fecha o modal e recarrega a lista, em vez de mostrar erro.
 */

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  deleteMutate: vi.fn(),
}));

vi.mock('@/hooks/useAppStore', () => ({
  useAppStoreApprovals: () => ({
    data: {
      scopeType: 0,
      scopeId: null,
      installationType: 0,
      count: 1,
      items: [
        {
          ruleId: 'r1',
          id: 'r1',
          scopeType: 0,
          scopeId: null,
          installationType: 2,
          packageId: 'foxit_editor',
          packageName: 'Foxit Editor',
          action: 0,
          autoUpdateEnabled: false,
          reason: null,
          createdAt: '2026-10-13T10:00:00Z',
          updatedAt: '2026-10-13T10:00:00Z',
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: mocks.refetch,
  }),
  useDeleteApproval: () => ({ mutateAsync: mocks.deleteMutate, isPending: false }),
  useCreateApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useClients', () => ({ useClients: () => ({ data: [] }) }));
vi.mock('@/hooks/useSites', () => ({ useSites: () => ({ data: [] }) }));

import { ApprovalsTab } from './ApprovalsTab';
import { ApiError } from '@/api/client';

beforeEach(() => {
  mocks.refetch.mockReset();
  mocks.deleteMutate.mockReset();
});

afterEach(() => cleanup());

describe('ApprovalsTab — remover regra', () => {
  it('trata 404 como "já não existia": fecha o modal e recarrega a lista', async () => {
    mocks.deleteMutate.mockRejectedValue(new ApiError(404, 'Regra nao encontrada.'));

    render(<ApprovalsTab />);

    fireEvent.click(screen.getByLabelText('Remover regra foxit_editor'));
    expect(screen.getByText('Remover Regra')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(mocks.refetch).toHaveBeenCalled());
    expect(mocks.deleteMutate).toHaveBeenCalledWith({ ruleId: 'r1' });
    // O modal de confirmação fecha (não fica preso num erro que não é erro).
    await waitFor(() => expect(screen.queryByText('Remover Regra')).toBeNull());
  });

  it('mantém o modal aberto quando a falha não é 404', async () => {
    mocks.deleteMutate.mockRejectedValue(new ApiError(500, 'Erro interno'));

    render(<ApprovalsTab />);

    fireEvent.click(screen.getByLabelText('Remover regra foxit_editor'));
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(mocks.deleteMutate).toHaveBeenCalled());
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(screen.getByText('Remover Regra')).toBeTruthy();
  });
});
