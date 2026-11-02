import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Aprovações — herança de escopo e remoção de regra.
 *
 * A aba passou a usar a visão RESOLVIDA (/app-store/approvals/resolved): com um
 * cliente selecionado ela mostra também o que ele herda do Global, marcando a
 * linha como "Herdado" e trocando o botão de excluir por "Sobrescrever aqui"
 * (a regra herdada pertence a outro escopo).
 *
 * A API passou a responder 404 para regra inexistente (antes: 204 silencioso e
 * a UI dizia "Regra removida"). A aba precisa tratar esse caso como "já não
 * existia": fecha o modal e recarrega a lista, em vez de mostrar erro.
 */

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  deleteMutate: vi.fn(),
  resolvedCalls: [] as Array<{ params: Record<string, unknown>; options: { enabled?: boolean } }>,
}));

vi.mock('@/hooks/useAppStore', () => ({
  useAppStoreResolvedApprovals: (
    params: Record<string, unknown>,
    options: { enabled?: boolean },
  ) => {
    mocks.resolvedCalls.push({ params, options });
    return {
    data: {
      scopeType: 1,
      scopeId: 'c1',
      installationType: 0,
      count: 2,
      items: [
        {
          packageId: 'bleachbit',
          packageName: 'BleachBit',
          installationType: 0,
          action: 0,
          autoUpdateEnabled: false,
          effectiveScopeType: 0,
          effectiveScopeId: null,
          inherited: true,
          overridden: true,
          sources: [
            {
              ruleId: 'r0',
              scopeType: 0,
              scopeId: null,
              action: 0,
              autoUpdateEnabled: false,
              reason: 'Padrao da TI',
              updatedAt: '2026-10-13T10:00:00Z',
              isEffective: true,
              isOverridden: false,
            },
          ],
        },
        {
          packageId: 'foxit_editor',
          packageName: 'Foxit Editor',
          installationType: 0,
          action: 0,
          autoUpdateEnabled: false,
          effectiveScopeType: 1,
          effectiveScopeId: 'c1',
          inherited: false,
          overridden: false,
          sources: [
            {
              ruleId: 'r1',
              scopeType: 1,
              scopeId: 'c1',
              action: 0,
              autoUpdateEnabled: false,
              reason: null,
              updatedAt: '2026-10-13T10:00:00Z',
              isEffective: true,
              isOverridden: false,
            },
          ],
        },
      ],
    },
      isLoading: false,
      isError: false,
      refetch: mocks.refetch,
    };
  },
  useDeleteApproval: () => ({ mutateAsync: mocks.deleteMutate, isPending: false }),
  useAppStoreUpdateIntent: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
  useCleanupOrphanApprovalRules: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAppStoreCatalog: () => ({ data: { items: [], count: 0 }, isLoading: false }),
}));

vi.mock('@/hooks/useClients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Geral' }] }),
}));
vi.mock('@/hooks/useSites', () => ({ useSites: () => ({ data: [] }) }));

import { ApprovalsTab } from './ApprovalsTab';
import { ApiError } from '@/api/client';
import { AppApprovalScopeType } from '@/api/types';

beforeEach(() => {
  mocks.refetch.mockReset();
  mocks.deleteMutate.mockReset();
});

afterEach(() => cleanup());

/** Troca o escopo para Cliente e escolhe o cliente (é o cenário da herança). */
function selectClientScope() {
  fireEvent.change(screen.getByLabelText('Escopo'), {
    target: { value: String(AppApprovalScopeType.Client) },
  });
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'c1' } });
}

describe('ApprovalsTab — herança de escopo', () => {
  it('mostra regra herdada do Global com a cadeia e sem botão de excluir', () => {
    render(<ApprovalsTab />);
    fireEvent.change(screen.getByLabelText('Escopo'), {
      target: { value: String(AppApprovalScopeType.Client) },
    });

    expect(screen.getByText('Herdado')).toBeTruthy();
    // Cadeia de herança visível: nível + ação (+ auto-update quando houver).
    expect(screen.getByText(/Global: Permitido/)).toBeTruthy();
    // Regra herdada não pertence a este escopo: nada de excluir a regra do Global.
    expect(screen.queryByLabelText('Remover regra bleachbit')).toBeNull();
    expect(screen.getByLabelText('Sobrescrever bleachbit neste escopo')).toBeTruthy();
  });

  it('abre o modal já com o pacote herdado ao clicar em "Sobrescrever aqui"', () => {
    render(<ApprovalsTab />);
    fireEvent.change(screen.getByLabelText('Escopo'), {
      target: { value: String(AppApprovalScopeType.Client) },
    });

    fireEvent.click(screen.getByLabelText('Sobrescrever bleachbit neste escopo'));

    expect(screen.getByText('Nova Regra de Aprovação')).toBeTruthy();
    expect((screen.getByLabelText('Pacote') as HTMLInputElement).value).toBe('bleachbit');
  });
});

describe('ApprovalsTab — escopo sem id', () => {
  it('não consulta a API antes de escolher o cliente e pede a seleção', () => {
    render(<ApprovalsTab />);
    fireEvent.change(screen.getByLabelText('Escopo'), {
      target: { value: String(AppApprovalScopeType.Client) },
    });

    // Sem cliente não há cadeia a resolver: a consulta fica desligada (a API
    // responderia 400) e a tela orienta o operador.
    expect(mocks.resolvedCalls.at(-1)?.options.enabled).toBe(false);
    expect(screen.getByText(/Selecione o cliente/)).toBeTruthy();
  });

  it('liga a consulta assim que o cliente é escolhido', () => {
    render(<ApprovalsTab />);
    selectClientScope();

    expect(mocks.resolvedCalls.at(-1)?.options.enabled).toBe(true);
    expect(mocks.resolvedCalls.at(-1)?.params.scopeId).toBe('c1');
  });
});

describe('ApprovalsTab — remover regra', () => {
  it('trata 404 como "já não existia": fecha o modal e recarrega a lista', async () => {
    mocks.deleteMutate.mockRejectedValue(new ApiError(404, 'Regra nao encontrada.'));

    render(<ApprovalsTab />);
    selectClientScope();

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
    selectClientScope();

    fireEvent.click(screen.getByLabelText('Remover regra foxit_editor'));
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(mocks.deleteMutate).toHaveBeenCalled());
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(screen.getByText('Remover Regra')).toBeTruthy();
  });
});
