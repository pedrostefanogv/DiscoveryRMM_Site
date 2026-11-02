import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Lixeira de pacotes custom:
 *  (a) formatação da lista — nome, versão, arquivo com tamanho, quem/quando
 *      excluiu, motivo e badge de falha de purge;
 *  (b) restauração mostra a mensagem EXATA da API ("recadastre as aprovações");
 *  (c) exclusão definitiva trata 409 de purge com a opção force=true.
 */

const mocks = vi.hoisted(() => ({
  trashData: undefined as unknown,
  restoreMutate: vi.fn(),
  purgeMutate: vi.fn(),
}));

vi.mock('@/hooks/useAppStore', () => ({
  useCustomTrash: (params: Record<string, unknown>) => ({
    data: mocks.trashData,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    // os params ficam visíveis para asserts de busca
    __params: params,
  }),
  useRestoreCustomPackage: () => ({ mutateAsync: mocks.restoreMutate, isPending: false, variables: null }),
  usePermanentDeleteCustomPackage: () => ({ mutateAsync: mocks.purgeMutate, isPending: false }),
}));

import { Toaster } from 'react-hot-toast';
import { CustomTrashPanel } from './CustomTrashPanel';
import { ApiError } from '@/api/client';

function trashItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    packageId: 'foxit_editor',
    name: 'Foxit Editor',
    version: '2024.2.0',
    fileName: 'foxit-installer.exe',
    fileSizeBytes: 7654321,
    hasFile: true,
    hasIcon: true,
    deletedAt: '2026-10-13T10:00:00Z',
    deletedBy: 'pedro.ti',
    deleteReason: 'Substituído por versão nova',
    ...overrides,
  };
}

function renderPanel() {
  // O Toaster monta o container dos toasts — os testes de mensagem (message da
  // API na restauração, erro da restauração) precisam dele.
  render(<><CustomTrashPanel /><Toaster /></>);
}

// O Toaster do react-hot-toast consulta matchMedia (jsdom não tem): stub.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

beforeEach(() => {
  mocks.restoreMutate.mockReset();
  mocks.purgeMutate.mockReset();
  mocks.restoreMutate.mockResolvedValue({ packageId: 'x', restored: true, message: 'ok' });
  mocks.purgeMutate.mockResolvedValue(undefined);
  mocks.trashData = { items: [trashItem()], nextCursor: null, hasMore: false };
});

afterEach(() => cleanup());

describe('CustomTrashPanel — formatação da lista', () => {
  it('mostra nome, versão, arquivo com tamanho e trilha da exclusão', () => {
    renderPanel();

    expect(screen.getByText('Foxit Editor')).toBeTruthy();
    expect(screen.getByText('2024.2.0')).toBeTruthy();
    // Arquivo com tamanho formatado (7.654.321 bytes ≈ 7,3 MB).
    expect(screen.getByText(/foxit-installer.exe/)).toBeTruthy();
    expect(screen.getByText(/7[.,]3 MB/)).toBeTruthy();
    expect(screen.getByText(/por pedro\.ti/)).toBeTruthy();
    expect(screen.getByText(/motivo: Substituído por versão nova/)).toBeTruthy();
    expect(screen.getByLabelText('Restaurar Foxit Editor')).toBeTruthy();
    expect(screen.getByLabelText('Excluir em definitivo Foxit Editor')).toBeTruthy();
    expect(screen.queryByText('Falha na limpeza do arquivo')).toBeNull();
  });

  it('mostra badge de falha de purge com o erro do storage', () => {
    mocks.trashData = {
      items: [
        trashItem({
          purgeFailedAt: '2026-10-13T11:00:00Z',
          purgeError: 'AccessDenied: sem permissão para app-store/custom/foxit-installer.exe',
        }),
      ],
      nextCursor: null,
      hasMore: false,
    };
    renderPanel();

    expect(screen.getByText('Falha na limpeza do arquivo')).toBeTruthy();
    expect(screen.getByText(/AccessDenied/)).toBeTruthy();
  });

  it('sem arquivo publicado mostra "sem instalador"', () => {
    mocks.trashData = { items: [trashItem({ hasFile: false, fileName: null, fileSizeBytes: null })], nextCursor: null, hasMore: false };
    renderPanel();

    expect(screen.getByText('sem instalador')).toBeTruthy();
  });
});

describe('CustomTrashPanel — restaurar', () => {
  it('mostra o message da API ("recadastre as aprovações")', async () => {
    mocks.restoreMutate.mockResolvedValue({
      packageId: 'foxit_editor',
      restored: true,
      message: 'Aprovações anteriores foram excluídas — recadastre as aprovações para este pacote.',
    });
    renderPanel();

    fireEvent.click(screen.getByLabelText('Restaurar Foxit Editor'));

    await waitFor(() => expect(screen.getByText(/recadastre as aprovações para este pacote/)).toBeTruthy());
  });

  it('mostra o erro da API quando a restauração falha', async () => {
    mocks.restoreMutate.mockRejectedValue(new Error('Pacote ainda não pode ser restaurado.'));
    renderPanel();

    fireEvent.click(screen.getByLabelText('Restaurar Foxit Editor'));
    await waitFor(() => expect(screen.getByText('Pacote ainda não pode ser restaurado.')).toBeTruthy());
  });
});

describe('CustomTrashPanel — exclusão definitiva (2 passos)', () => {
  it('exige a confirmação digitada e mostra o que será removido', async () => {
    renderPanel();

    fireEvent.click(screen.getByLabelText('Excluir em definitivo Foxit Editor'));

    const modalTitle = await screen.findByRole('heading', { name: 'Excluir em definitivo' });
    expect(modalTitle).toBeTruthy();
    expect(screen.getByText(/O instalador publicado/)).toBeTruthy();
    expect(screen.getByText(/ícone\/capa publicado/)).toBeTruthy();

    // Bloqueado sem a confirmação.
    const confirmar = screen.getByRole('button', { name: 'Excluir em definitivo' });
    expect(confirmar.hasAttribute('disabled')).toBe(true);
    expect(mocks.purgeMutate).not.toHaveBeenCalled();
  });

  it('confirma e chama a API com force=false primeiro', async () => {
    renderPanel();

    fireEvent.click(screen.getByLabelText('Excluir em definitivo Foxit Editor'));
    await screen.findByRole('heading', { name: 'Excluir em definitivo' });

    fireEvent.change(screen.getByPlaceholderText('foxit_editor'), { target: { value: 'foxit_editor' } });
    // Há dois botões com o mesmo texto: o rótulo da linha (não abriu o modal) e
    // o de confirmar. O clicável é o do modal.
    const confirmButton = screen.getAllByRole('button', { name: 'Excluir em definitivo' }).find(
      (button) => !button.hasAttribute('disabled'),
    );
    fireEvent.click(confirmButton!);

    await waitFor(() => expect(mocks.purgeMutate).toHaveBeenCalledWith({
      packageId: 'foxit_editor',
      confirm: 'foxit_editor',
      force: false,
    }));
  });

  it('409 de purge: oferece "forçar" e repete a chamada com force=true', async () => {
    mocks.purgeMutate
      .mockRejectedValueOnce(new ApiError(409, 'Falha ao remover o objeto do storage.'))
      .mockResolvedValueOnce(undefined);
    renderPanel();

    fireEvent.click(screen.getByLabelText('Excluir em definitivo Foxit Editor'));
    await screen.findByRole('heading', { name: 'Excluir em definitivo' });

    fireEvent.change(screen.getByPlaceholderText('foxit_editor'), { target: { value: 'foxit_editor' } });
    fireEvent.click(
      screen
        .getAllByRole('button', { name: 'Excluir em definitivo' })
        .find((button) => !button.hasAttribute('disabled'))!,
    );

    // A pergunta do 409 aparece com a alternativa de excluir somente no servidor.
    await waitFor(() =>
      expect(screen.getByText(/Falha ao remover o arquivo do storage — excluir somente no servidor?/)).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole('button', { name: /Forçar exclusão no servidor/ }));

    await waitFor(() =>
      expect(mocks.purgeMutate).toHaveBeenLastCalledWith({
        packageId: 'foxit_editor',
        confirm: 'foxit_editor',
        force: true,
      }),
    );
  });
});
