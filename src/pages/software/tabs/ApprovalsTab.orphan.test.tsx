import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Badge "Pacote inexistente" na aba Aprovações: regras de pacotes CUSTOM que
 * não existem mais. Usa os flags hasPackage/orphanPackage do servidor quando
 * vêm; sem eles, compara com a listagem do catálogo Custom carregada.
 */

const mocks = vi.hoisted(() => ({
  catalogData: undefined as unknown,
}));

vi.mock('@/hooks/useAppStore', () => ({
  useAppStoreResolvedApprovals: () => ({
    data: {
      scopeType: 0,
      scopeId: null,
      installationType: 2,
      count: 2,
      policy: 'PreApproved',
      items: [
        {
          // Órfã pelo flag do servidor.
          packageId: 'app_removido',
          packageName: 'App Removido',
          installationType: 2,
          action: 0,
          autoUpdateEnabled: false,
          effectiveScopeType: 0,
          effectiveScopeId: null,
          inherited: false,
          overridden: false,
          hasPackage: false,
          sources: [],
        },
        {
          // Órfã SEM flag: o servidor não mandou o enriquecimento —
          // a comparação com o catálogo carregado decide.
          packageId: 'app_desconhecido',
          packageName: 'App Desconhecido',
          installationType: 2,
          action: 0,
          autoUpdateEnabled: false,
          effectiveScopeType: 0,
          effectiveScopeId: null,
          inherited: false,
          overridden: false,
          sources: [],
        },
        {
          // Existe no catálogo: sem badge.
          packageId: 'foxit_editor',
          packageName: 'Foxit Editor',
          installationType: 2,
          action: 0,
          autoUpdateEnabled: false,
          effectiveScopeType: 0,
          effectiveScopeId: null,
          inherited: false,
          overridden: false,
          sources: [],
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAppStoreCatalog: () => ({ data: mocks.catalogData, isLoading: false }),
  useDeleteApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAppStoreUpdateIntent: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
  useCleanupOrphanApprovalRules: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAppStorePackage: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useClients', () => ({ useClients: () => ({ data: [] }) }));
vi.mock('@/hooks/useSites', () => ({ useSites: () => ({ data: [] }) }));

import { ApprovalsTab } from './ApprovalsTab';
import { AppInstallationType } from '@/api/types';

beforeEach(() => {
  mocks.catalogData = {
    items: [
      { packageId: 'foxit_editor', name: 'Foxit Editor', installationType: AppInstallationType.Custom },
      { packageId: 'outro_pacote', name: 'Outro', installationType: AppInstallationType.Custom },
    ],
    count: 2,
  };
});

afterEach(() => cleanup());

describe('ApprovalsTab — badge "Pacote inexistente"', () => {
  it('marca regras órfãs por flag do servidor e por comparação com o catálogo', () => {
    render(<ApprovalsTab />);

    fireEvent.change(screen.getByLabelText('Tipo'), {
      target: { value: String(AppInstallationType.Custom) },
    });

    const badges = screen.getAllByText('Pacote inexistente');
    expect(badges).toHaveLength(2);
  });

  it('não marca a regra cujo pacote existe no catálogo', () => {
    render(<ApprovalsTab />);

    fireEvent.change(screen.getByLabelText('Tipo'), {
      target: { value: String(AppInstallationType.Custom) },
    });

    const row = screen.getByText('foxit_editor');
    expect(row).toBeTruthy();
    expect(row.closest('div')?.querySelector('[class*="text-danger"]')).toBeNull();
  });

  it('botão "Limpar regras órfãs" aparece quando o tipo é Custom', () => {
    render(<ApprovalsTab />);

    fireEvent.change(screen.getByLabelText('Tipo'), {
      target: { value: String(AppInstallationType.Custom) },
    });

    expect(screen.getByRole('button', { name: 'Limpar regras órfãs' })).toBeTruthy();
  });
});
