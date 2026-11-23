import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon } from './Icon';
import { BatteryGauge } from './BatteryGauge';

afterEach(() => cleanup());

/** Path do glifo renderizado direto, para comparar sem fixar dados do ícone. */
function glyphPath(name: 'battery_charging_80'): string | null {
  const { container, unmount } = render(<Icon name={name} />);
  const d = container.querySelector('svg path')?.getAttribute('d') ?? null;
  unmount();
  return d;
}

/**
 * Duas formas, um ícone cada:
 *
 * - NA TOMADA: um único glifo de bateria CARREGANDO (Material), que já tem o
 *   raio embutido. O nível vai no percentual ao lado — por isso não precisamos
 *   de várias variantes de nível nem de dois ícones.
 * - NA BATERIA: a bateria desenhada, com preenchimento proporcional ao nível.
 */
describe('BatteryGauge — na tomada (bateria carregando)', () => {
  it('mostra UM ícone só: a bateria carregando do Material', () => {
    const { container } = render(<BatteryGauge percent={80} onAc />);

    const expected = glyphPath('battery_charging_80');
    const paths = Array.from(container.querySelectorAll('svg path'));
    expect(paths.some((path) => path.getAttribute('d') === expected)).toBe(true);

    // Nada de bateria desenhada em CSS junto: é um ícone só.
    expect(container.querySelector('.border-border')).toBeNull();
    expect(screen.getByText('Na tomada')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
  });

  it('carregando também usa o mesmo glifo único', () => {
    const { container } = render(<BatteryGauge percent={41} onAc charging />);

    const expected = glyphPath('battery_charging_80');
    const paths = Array.from(container.querySelectorAll('svg path'));
    expect(paths.some((path) => path.getAttribute('d') === expected)).toBe(true);
    expect(screen.getByText('Carregando')).toBeTruthy();
  });

  it('o texto cru do SO (On AC) também vale quando o booleano não veio', () => {
    const { container } = render(<BatteryGauge percent={64} onAc={null} state="On AC" />);

    const expected = glyphPath('battery_charging_80');
    const paths = Array.from(container.querySelectorAll('svg path'));
    expect(paths.some((path) => path.getAttribute('d') === expected)).toBe(true);
    expect(screen.getByText('Na tomada')).toBeTruthy();
  });

  /** A cor segue a faixa do percentual: mantém o alerta de bateria baixa. */
  it('colore o glifo pela faixa do percentual', () => {
    const { container: ok } = render(<BatteryGauge percent={80} onAc />);
    expect(ok.querySelector('svg')?.getAttribute('class') ?? '').toContain('text-success');
    cleanup();

    const { container: atencao } = render(<BatteryGauge percent={25} onAc />);
    expect(atencao.querySelector('svg')?.getAttribute('class') ?? '').toContain('text-warning');
    cleanup();

    const { container: critico } = render(<BatteryGauge percent={8} onAc />);
    expect(critico.querySelector('svg')?.getAttribute('class') ?? '').toContain('text-danger');
  });
});

describe('BatteryGauge — na bateria (bateria desenhada)', () => {
  it('desenha a bateria com preenchimento e sem glifo de carregando', () => {
    const { container } = render(<BatteryGauge percent={63} onAc={false} />);

    expect(screen.getByText('Na bateria')).toBeTruthy();
    expect(screen.getByText('63%')).toBeTruthy();
    // Bateria desenhada presente e nenhum glifo Material.
    expect(container.querySelector('.border-border')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('pinta o percentual pela faixa', () => {
    render(<BatteryGauge percent={63} onAc={false} />);
    expect(screen.getByText('63%').className).toContain('text-success');
    cleanup();

    render(<BatteryGauge percent={25} onAc={false} />);
    expect(screen.getByText('25%').className).toContain('text-warning');
    cleanup();

    render(<BatteryGauge percent={8} onAc={false} />);
    expect(screen.getByText('8%').className).toContain('text-danger');
    cleanup();

    render(<BatteryGauge percent={null} onAc={null} />);
    expect(screen.getByText('—').className).toContain('text-muted');
  });
});
