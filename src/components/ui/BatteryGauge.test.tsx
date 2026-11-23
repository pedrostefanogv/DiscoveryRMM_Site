import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BatteryGauge } from './BatteryGauge';

afterEach(() => cleanup());

/**
 * Indicador desenhado em CSS (contorno de 1 px), a pedido: os glifos do Material
 * Symbols têm parede de ~2 px neste tamanho e pareciam "em negrito" ao lado dos
 * outros ícones, que são de linha fina.
 *
 * Travado aqui: contorno 1 px preto/branco, preenchimento proporcional ao nível,
 * raio DENTRO da bateria quando na tomada (um ícone só) e o mesmo tamanho nos
 * dois estados.
 */
describe('BatteryGauge — na bateria (contorno fino)', () => {
  it('desenha a bateria com contorno de 1px, sem peso de glifo', () => {
    const { container } = render(<BatteryGauge percent={63} onAc={false} />);

    const root = container.querySelector('[data-state="battery"]');
    expect(root).toBeTruthy();
    expect(root?.querySelector('svg')).toBeNull();

    // Contorno de 1px na cor do contexto: mesma espessura/cor do wifi do selo.
    const body = root?.querySelector('.border-current');
    expect(body).toBeTruthy();
    expect(body?.className ?? '').toContain('border-current');
    expect(body?.className ?? '').not.toContain('border-[1.5px]');
    expect(body?.className ?? '').not.toContain('border-black');
    expect(body?.className ?? '').toContain('h-3');

    expect(screen.getByText('Na bateria')).toBeTruthy();
    expect(screen.getByText('63%')).toBeTruthy();
  });

  it('o preenchimento acompanha o percentual', () => {
    const { container } = render(<BatteryGauge percent={50} onAc={false} />);

    const fill = container.querySelector('[data-state="battery"] span[style]');
    // O navegador serializa o inline style sem o calc() interno: "50% - 2px".
    expect(fill?.getAttribute('style') ?? '').toContain('50% - 2px');
    expect(fill?.className ?? '').toContain('bg-success');
  });

  it('colore o preenchimento pela faixa do percentual', () => {
    const { container: ok } = render(<BatteryGauge percent={63} onAc={false} />);
    expect(ok.querySelector('span[style]')?.className ?? '').toContain('bg-success');
    cleanup();

    const { container: atencao } = render(<BatteryGauge percent={25} onAc={false} />);
    expect(atencao.querySelector('span[style]')?.className ?? '').toContain('bg-warning');
    cleanup();

    const { container: critico } = render(<BatteryGauge percent={8} onAc={false} />);
    expect(critico.querySelector('span[style]')?.className ?? '').toContain('bg-danger');
  });

  it('percentual desconhecido: preenchimento zerado e rótulo "—"', () => {
    const { container } = render(<BatteryGauge percent={null} onAc={null} />);

    expect(container.querySelector('span[style]')?.getAttribute('style') ?? '').toContain('0% - 2px');
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('BatteryGauge — na tomada (raio dentro, um ícone só)', () => {
  it('mostra o raio dentro da bateria, sem ícone extra', () => {
    const { container } = render(<BatteryGauge percent={80} onAc />);

    const root = container.querySelector('[data-state="charging"]');
    expect(root).toBeTruthy();
    expect(container.querySelectorAll('svg')).toHaveLength(1);

    // O raio fica DENTRO do corpo (o elemento com o contorno).
    const body = root?.querySelector('.border-current');
    expect(body?.querySelector('svg')).toBeTruthy();
    // Com carga alta o raio é branco sobre o preenchimento.
    expect(body?.querySelector('svg')?.getAttribute('class') ?? '').toContain('text-white');

    expect(screen.getByText('Na tomada')).toBeTruthy();
  });

  it('com carga baixa o raio usa a cor do contorno (não some)', () => {
    const { container } = render(<BatteryGauge percent={10} onAc charging />);

    expect(container.querySelector('.border-current svg')?.getAttribute('class') ?? '').toContain('text-foreground');
    expect(screen.getByText('Carregando')).toBeTruthy();
  });

  it('o texto cru do SO (On AC) também vale quando o booleano não veio', () => {
    const { container } = render(<BatteryGauge percent={64} onAc={null} state="On AC" />);

    expect(container.querySelector('[data-state="charging"]')).toBeTruthy();
    expect(screen.getByText('Na tomada')).toBeTruthy();
  });
});

describe('BatteryGauge — tamanho padronizado entre os estados', () => {
  it('mesmas classes de tamanho em md e sm', () => {
    const { container: plugado } = render(<BatteryGauge percent={80} onAc size="md" />);
    const { container: naBateria } = render(<BatteryGauge percent={80} onAc={false} size="md" />);
    for (const container of [plugado, naBateria]) {
      const body = container.querySelector('.border-current');
      expect(body?.className ?? '').toContain('h-4');
      expect(body?.className ?? '').toContain('w-[29px]');
    }
    cleanup();

    const { container: plugadoSm } = render(<BatteryGauge percent={80} onAc size="sm" />);
    const { container: naBateriaSm } = render(<BatteryGauge percent={80} onAc={false} size="sm" />);
    for (const container of [plugadoSm, naBateriaSm]) {
      const body = container.querySelector('.border-current');
      expect(body?.className ?? '').toContain('h-3');
      expect(body?.className ?? '').toContain('w-[21px]');
    }
  });
});
