import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon } from './Icon';
import { BatteryGauge } from './BatteryGauge';

afterEach(() => cleanup());

type Glyph =
  | 'battery_android_0'
  | 'battery_android_1'
  | 'battery_android_2'
  | 'battery_android_3'
  | 'battery_android_4'
  | 'battery_android_5'
  | 'battery_android_6'
  | 'battery_android_bolt';

/** Path do glifo renderizado direto, para comparar sem fixar dados do ícone. */
function glyphPath(name: Glyph): string | null {
  const { container, unmount } = render(<Icon name={name} />);
  const d = container.querySelector('svg path')?.getAttribute('d') ?? null;
  unmount();
  return d;
}

function renderGlyphPath(container: HTMLElement): string | null {
  return container.querySelector('svg path')?.getAttribute('d') ?? null;
}

/**
 * Um ícone só, da família battery_android_* (bateria horizontal):
 *
 * - NA BATERIA: o nível vai no próprio glifo (battery_android_0 vazio ..
 *   battery_android_6 cheio), como o preenchimento fazia antes;
 * - NA TOMADA: battery_android_bolt (bateria com raio), sem variantes de nível —
 *   o nível fica no percentual ao lado;
 * - os dois estados usam o MESMO recorte e as mesmas classes de tamanho, então o
 *   indicador não muda de tamanho ao conectar/desconectar.
 */
describe('BatteryGauge — na bateria (nível pelo glifo)', () => {
  it('usa battery_android_N conforme a faixa do percentual', () => {
    const cases: Array<[number, Glyph]> = [
      [5, 'battery_android_0'],
      [20, 'battery_android_1'],
      [30, 'battery_android_2'],
      [45, 'battery_android_3'],
      [70, 'battery_android_4'],
      [80, 'battery_android_5'],
      [95, 'battery_android_6'],
    ];

    for (const [percent, glyph] of cases) {
      const { container, unmount } = render(<BatteryGauge percent={percent} onAc={false} />);
      expect(renderGlyphPath(container), 'percentual ' + percent).toBe(glyphPath(glyph));
      expect(screen.getByText('Na bateria')).toBeTruthy();
      expect(screen.getByText(percent + '%')).toBeTruthy();
      unmount();
    }
  });

  it('percentual desconhecido usa o meio da escala (não afirma vazio nem cheio)', () => {
    const { container } = render(<BatteryGauge percent={null} onAc={false} />);

    expect(renderGlyphPath(container)).toBe(glyphPath('battery_android_3'));
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('colore o glifo pela faixa do percentual', () => {
    const { container: ok } = render(<BatteryGauge percent={63} onAc={false} />);
    expect(ok.querySelector('svg')?.getAttribute('class') ?? '').toContain('text-success');
    cleanup();

    const { container: atencao } = render(<BatteryGauge percent={25} onAc={false} />);
    expect(atencao.querySelector('svg')?.getAttribute('class') ?? '').toContain('text-warning');
    cleanup();

    const { container: critico } = render(<BatteryGauge percent={8} onAc={false} />);
    expect(critico.querySelector('svg')?.getAttribute('class') ?? '').toContain('text-danger');
  });
});

describe('BatteryGauge — na tomada (bateria com raio)', () => {
  it('usa o glifo battery_android_bolt, um ícone só', () => {
    const { container } = render(<BatteryGauge percent={80} onAc />);

    const root = container.querySelector('[data-state="charging"]');
    expect(root).toBeTruthy();
    expect(container.querySelector('[data-state="battery"]')).toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(renderGlyphPath(container)).toBe(glyphPath('battery_android_bolt'));
    expect(screen.getByText('Na tomada')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
  });

  it('carregando usa o mesmo glifo', () => {
    const { container } = render(<BatteryGauge percent={41} onAc charging />);

    expect(renderGlyphPath(container)).toBe(glyphPath('battery_android_bolt'));
    expect(screen.getByText('Carregando')).toBeTruthy();
  });

  it('o texto cru do SO (On AC) também vale quando o booleano não veio', () => {
    const { container } = render(<BatteryGauge percent={64} onAc={null} state="On AC" />);

    expect(container.querySelector('[data-state="charging"]')).toBeTruthy();
    expect(renderGlyphPath(container)).toBe(glyphPath('battery_android_bolt'));
    expect(screen.getByText('Na tomada')).toBeTruthy();
  });
});

describe('BatteryGauge — tamanho padronizado entre os estados', () => {
  it('mesmo viewBox recortado e mesmas classes de tamanho (md e sm)', () => {
    const { container: plugado } = render(<BatteryGauge percent={80} onAc size="md" />);
    const { container: naBateria } = render(<BatteryGauge percent={80} onAc={false} size="md" />);

    for (const container of [plugado, naBateria]) {
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('viewBox')).toBe('40 -720 880 480');
      expect(svg?.getAttribute('class') ?? '').toContain('h-5');
      expect(svg?.getAttribute('class') ?? '').toContain('w-[37px]');
    }
    cleanup();

    const { container: plugadoSm } = render(<BatteryGauge percent={80} onAc size="sm" />);
    const { container: naBateriaSm } = render(<BatteryGauge percent={80} onAc={false} size="sm" />);

    for (const container of [plugadoSm, naBateriaSm]) {
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('class') ?? '').toContain('h-3.5');
      expect(svg?.getAttribute('class') ?? '').toContain('w-[26px]');
    }
  });
});
