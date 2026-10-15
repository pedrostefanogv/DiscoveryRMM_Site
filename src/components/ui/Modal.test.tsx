import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Foco do Modal (componente compartilhado).
 *
 * O modal não prendia o foco: tabular navegava pelos campos que ficavam ATRÁS
 * do overlay (ex.: o seletor de agente da aba remontava e voltava ao valor do
 * prefill no meio do preenchimento). Agora o foco entra no diálogo, circula só
 * dentro dele e volta para o elemento anterior ao fechar.
 */

import { Modal } from './Modal';

function Harness({ open }: { open: boolean }) {
  return (
    <div>
      <button type="button">Fora</button>
      <Modal open={open} onClose={vi.fn()} title="Teste">
        <button type="button">Primeiro</button>
        <button type="button">Segundo</button>
      </Modal>
    </div>
  );
}

afterEach(() => cleanup());

describe('Modal — foco', () => {
  it('expõe diálogo modal e move o foco para dentro', () => {
    render(<Harness open />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    // Primeiro focável do diálogo é o botão de fechar do cabeçalho.
    expect(document.activeElement).toBe(screen.getByLabelText('Fechar'));
  });

  it('prende o Tab dentro do diálogo (ciclo nos dois sentidos)', () => {
    render(<Harness open />);

    const dialog = screen.getByRole('dialog');
    const close = within(dialog).getByLabelText('Fechar');
    const botoes = within(dialog).getAllByRole('button').filter((b) => b !== close);
    const segundo = botoes[botoes.length - 1];

    // Tab no último elemento volta para o primeiro.
    fireEvent.keyDown(segundo, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    // Shift+Tab no primeiro vai para o último.
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(segundo);
  });

  it('ignora focáveis invisíveis: o Tab não vaza para o que está atrás', () => {
    render(
      <Modal open onClose={vi.fn()} title="Teste">
        <button type="button">Visível</button>
        {/* display:none é o que a classe `hidden` do Tailwind faz. */}
        <div style={{ display: 'none' }}>
          <button type="button">Escondido</button>
        </div>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog');
    const visivel = within(dialog).getByText('Visível');

    // "Visível" é o último focável DE VERDADE: o Tab tem de voltar ao primeiro,
    // e não parar no botão escondido (que era o furo do filtro antigo).
    fireEvent.keyDown(visivel, { key: 'Tab' });
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Fechar'));
  });

  it('devolve o foco ao elemento anterior quando fecha', () => {
    const { rerender } = render(<Harness open={false} />);

    const outside = screen.getByText('Fora');
    outside.focus();
    expect(document.activeElement).toBe(outside);

    rerender(<Harness open />);
    expect(document.activeElement).toBe(screen.getByLabelText('Fechar'));

    rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(outside);
  });
});