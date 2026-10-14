import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownField } from './MarkdownField';

afterEach(cleanup);

/** Campo controlado: o onChange do editor alimenta o próprio value (como na tela). */
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MarkdownField label="Descrição" value={value} onChange={setValue} />;
}

function field(): HTMLTextAreaElement {
  return screen.getByLabelText('Descrição') as HTMLTextAreaElement;
}

function clickToolbar(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('MarkdownField', () => {
  // Regressão: com o cursor apenas ao lado do placeholder, digitar depois do
  // botão produzia "**textoNegrito**" (o texto de exemplo permanecia).
  it('insere negrito e deixa o placeholder selecionado para digitar por cima', async () => {
    render(<Harness />);

    clickToolbar('Negrito');

    const el = field();
    expect(el.value).toBe('**texto**');
    await waitFor(() => {
      expect(el.selectionStart).toBe(2);
      expect(el.selectionEnd).toBe(7);
      expect(el.value.slice(el.selectionStart, el.selectionEnd)).toBe('texto');
    });
  });

  // Regressão: o prefixo era inserido no ponto do cursor, gerando "a- bc".
  it('aplica lista de marcadores na linha do cursor, mesmo no meio da linha', () => {
    render(<Harness initial="abc" />);

    const el = field();
    el.setSelectionRange(1, 1);
    clickToolbar('Lista com marcadores');

    expect(field().value).toBe('- abc');
  });

  it('aplica lista numerada em todas as linhas da seleção', () => {
    render(<Harness initial={'um\ndois'} />);

    field().setSelectionRange(0, 'um\ndois'.length);
    clickToolbar('Lista numerada');

    expect(field().value).toBe('1. um\n1. dois');
  });

  // Regressão: o cursor caía sobre a quebra de linha e digitar colava o texto
  // nas cercas ("```meu código```").
  it('bloco de código insere o placeholder selecionado', async () => {
    render(<Harness />);

    clickToolbar('Bloco de código');

    const el = field();
    expect(el.value).toBe('```\ncódigo\n```');
    await waitFor(() => {
      expect(el.value.slice(el.selectionStart, el.selectionEnd)).toBe('código');
    });
  });

  it('link insere o texto do link com a URL de exemplo', () => {
    render(<Harness />);

    clickToolbar('Link');

    expect(field().value).toBe('[texto do link](https://)');
  });

  it('envolve a seleção existente sem mexer no texto escolhido', () => {
    render(<Harness initial="texto escolhido" />);

    field().setSelectionRange(0, 5);
    clickToolbar('Negrito');

    expect(field().value).toBe('**texto** escolhido');
  });
});
