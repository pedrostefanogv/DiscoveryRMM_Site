import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MetricBar } from './MetricBar';

const labelSpans = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('span')).filter((el) => el.className.includes('min-w-[2rem]'));

describe('MetricBar — modo compacto (tabelas)', () => {
  afterEach(() => cleanup());

  it('sem rótulo não reserva o espaço do label', () => {
    const { container } = render(<MetricBar label="" value={42} compact />);
    expect(labelSpans(container)).toHaveLength(0);
    expect(container.textContent).toBe('42%');
  });

  it('com rótulo mantém o label à esquerda', () => {
    const { container } = render(<MetricBar label="CPU" value={42} compact />);
    expect(labelSpans(container)).toHaveLength(1);
    expect(container.textContent).toBe('CPU42%');
  });

  it('valor compacto tem largura fixa (trilhas alinhadas entre linhas)', () => {
    const { container } = render(<MetricBar label="" value={7} compact />);
    const value = Array.from(container.querySelectorAll('span')).find((el) => el.textContent === '7%');
    expect(value?.className).toContain('w-8');
    expect(value?.className).toContain('text-right');
  });

  it('hideValue não renderiza o número (respeitado por consumidores antigos)', () => {
    const { container } = render(<MetricBar label="" value={7} compact hideValue />);
    expect(container.textContent).toBe('');
  });

  it('tooltip não começa com separador quando não há rótulo', () => {
    const { container } = render(<MetricBar label="" value={7} compact />);
    expect(container.firstElementChild?.getAttribute('title')).toBe('7%');
  });
});
