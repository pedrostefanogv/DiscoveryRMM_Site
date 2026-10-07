import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './ContextMenu';

function renderMenu(onClose = vi.fn()) {
  render(
    <ContextMenu
      position={{ x: 100, y: 100 }}
      onClose={onClose}
      items={[
        {
          key: 'power',
          label: 'Energia',
          children: [
            { key: 'restart', label: 'Reiniciar', onClick: vi.fn() },
            { key: 'shutdown', label: 'Desligar', onClick: vi.fn() },
          ],
        },
      ]}
    />,
  );
  return onClose;
}

function submenuVisibility() {
  return (screen.getByText('Reiniciar').closest('[role="menu"]') as HTMLElement).className;
}

describe('ContextMenu — submenu', () => {
  afterEach(() => cleanup());

  it('abre no hover e permanece aberto ao clicar no item', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: /Energia/ });

    fireEvent.mouseOver(trigger.parentElement as HTMLElement);
    expect(submenuVisibility()).toContain('visible');

    // O foco do mousedown dispara antes do click: o click não pode alternar/fechar.
    fireEvent.click(trigger);

    expect(submenuVisibility()).toContain('visible');
  });

  it('fecha o menu ao clicar fora dele', () => {
    const onClose = renderMenu();

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
