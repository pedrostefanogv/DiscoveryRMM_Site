import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

/** O projeto não usa jest-dom: checamos o atributo nativo do botão. */
function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLButtonElement).disabled;
}

describe('ConfirmDialog', () => {
  it('confirma direto quando não exige texto', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Mover"
        message="mensagem"
        confirmLabel="Confirmar"
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );

    const button = screen.getByRole('button', { name: 'Confirmar' });
    expect(isDisabled(button)).toBe(false);
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('exige o texto digitado (trim + case-insensitive) antes de confirmar', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Mover e desinstalar"
        message="mensagem"
        confirmLabel="Mover e desinstalar"
        requireText="PC-01"
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );

    const button = screen.getByRole('button', { name: 'Mover e desinstalar' });
    expect(isDisabled(button)).toBe(true);

    const input = screen.getByLabelText(/PC-01/);
    fireEvent.change(input, { target: { value: 'pc-01 ' } });
    expect(isDisabled(button)).toBe(false);

    fireEvent.change(input, { target: { value: 'pc-0' } });
    expect(isDisabled(button)).toBe(true);

    fireEvent.change(input, { target: { value: 'PC-01' } });
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
