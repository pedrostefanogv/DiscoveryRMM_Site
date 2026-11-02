import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Soft delete de pacote custom exige a confirmação DIGITADA (o operador
 * reproduz o packageId). Sem o texto exato o botão fica bloqueado — um clique
 * não basta porque as aprovações são apagadas definitivamente.
 */

const mocks = vi.hoisted(() => ({
  deleteMutate: vi.fn(),
  onDeleted: vi.fn(),
}));

vi.mock('@/hooks/useAppStore', () => ({
  useDeleteCustomPackage: () => ({ mutateAsync: mocks.deleteMutate, isPending: false }),
}));

import { DeleteCustomPackageModal } from './DeleteCustomPackageModal';

beforeEach(() => {
  mocks.deleteMutate.mockReset();
  mocks.deleteMutate.mockResolvedValue(undefined);
  mocks.onDeleted.mockReset();
});

afterEach(() => cleanup());

function renderModal() {
  return render(
    <DeleteCustomPackageModal
      open
      packageId="foxit_editor"
      name="Foxit Editor"
      onClose={() => undefined}
      onDeleted={mocks.onDeleted}
    />,
  );
}

describe('DeleteCustomPackageModal — confirmação digitada', () => {
  it('bloqueia o botão enquanto a confirmação não casa (mesmo case-insensitivo)', () => {
    renderModal();

    const confirmar = screen.getByRole('button', { name: /Excluir pacote/ });
    expect(confirmar).toBeTruthy();
    expect(confirmar.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('foxit_editor'), { target: { value: 'foxit' } });
    expect(confirmar.hasAttribute('disabled')).toBe(true);

    // Avisos: aprovações excluídas definitivamente + campo de motivo opcional.
    expect(screen.getByText(/As aprovações deste pacote serão EXCLUÍDAS definitivamente/)).toBeTruthy();
    expect(screen.getByLabelText('Motivo (opcional)')).toBeTruthy();
  });

  it('case-insensitivo: aceita a confirmação em caixa diferente e envia o packageId', async () => {
    renderModal();

    fireEvent.change(screen.getByPlaceholderText('foxit_editor'), { target: { value: '  FOXIT_EDITOR ' } });
    fireEvent.change(screen.getByLabelText('Motivo (opcional)'), { target: { value: 'substituído' } });
    fireEvent.click(screen.getByRole('button', { name: /Excluir pacote/ }));

    await waitFor(() => expect(mocks.deleteMutate).toHaveBeenCalled());
    expect(mocks.deleteMutate).toHaveBeenCalledWith({
      packageId: 'foxit_editor',
      confirm: 'FOXIT_EDITOR',
      reason: 'substituído',
    });
    await waitFor(() => expect(mocks.onDeleted).toHaveBeenCalled());
  });

  it('rejeitado (400 da API): mantém o modal aberto e não notifica o pai', async () => {
    mocks.deleteMutate.mockRejectedValue(new Error('Confirmação não corresponde ao packageId.'));
    renderModal();

    fireEvent.change(screen.getByPlaceholderText('foxit_editor'), { target: { value: 'foxit_editor' } });
    fireEvent.click(screen.getByRole('button', { name: /Excluir pacote/ }));

    await waitFor(() => expect(mocks.deleteMutate).toHaveBeenCalled());
    // O modal permanece aberto (o botão segue na tela) e o sucesso não chegou ao pai.
    expect(screen.getByRole('button', { name: /Excluir pacote/ })).toBeTruthy();
    expect(mocks.onDeleted).not.toHaveBeenCalled();
  });
});
