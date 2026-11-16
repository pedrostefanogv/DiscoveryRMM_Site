import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// react-hot-toast é mockado para inspecionar o que a UI anuncia no DESPACHO.
// vi.mock é hoisted: o mock precisa ser criado DENTRO da factory e recuperado
// depois via import (padrão exigido pelo Vitest).
vi.mock('react-hot-toast', () => {
  const fn = vi.fn() as unknown as {
    (...args: unknown[]): void;
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  fn.success = vi.fn();
  fn.error = vi.fn();
  return { default: fn };
});

import toast from 'react-hot-toast';
import PowerActionModal from './PowerActionModal';

const toastMock = toast as unknown as {
  (...args: unknown[]): void;
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  mock: { calls: unknown[][] };
};

const agent = {
  id: 'a1',
  hostname: 'DESKTOP-T37K9KU',
  displayName: 'DESKTOP-T37K9KU',
} as never;

describe('PowerActionModal — despacho não promete execução', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('usa mensagem neutra de envio e NÃO anuncia sucesso na confirmação', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <PowerActionModal agent={agent} action="restart" onClose={() => {}} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Reiniciar em/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));

    // Regressão: antes o modal chamava toast.success incondicionalmente, e o
    // toast de erro do desfecho real ("adiado para a janela de manutenção")
    // aparecia logo depois — a UI se contradizia na mesma operação.
    expect(toastMock.success).not.toHaveBeenCalled();

    const [message] = toastMock.mock.calls[0] as [string];
    expect(message).toMatch(/enviado para DESKTOP-T37K9KU/);
    expect(message).toMatch(/aguardando confirmação/i);
    // Não pode afirmar execução/êxito.
    expect(message).not.toMatch(/executad|sucesso|conclu[ií]d/i);
  });

  it('mantém toast de erro quando o envio falha', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('falha de rede'));
    render(
      <PowerActionModal agent={agent} action="shutdown" onClose={() => {}} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Desligar em/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('falha de rede'));
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
