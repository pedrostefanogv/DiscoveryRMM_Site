import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon } from './Icon';
import { BatteryGauge } from './BatteryGauge';

afterEach(() => cleanup());

/** Path do glifo renderizado direto, para comparar sem fixar dados do ícone. */
function glyphPath(name: 'battery_charging_80_2'): string | null {
  const { container, unmount } = render(<Icon name={name} />);
  const d = container.querySelector('svg path')?.getAttribute('d') ?? null;
  unmount();
  return d;
}

/**
 * Ajustes finos travados aqui:
 *
 * 1. NA BATERIA a borda precisa APARECER nos dois temas — antes usava o token
 *    \'border\' (quase invisível), agora usa foreground/60 + fundo leve.
 * 2. Os DOIS estados têm o MESMO tamanho: o glifo de "na tomada" é recortado na
 *    caixa desenhada (viewBox medido do path) e ambos usam a mesma classe de
 *    altura, então o indicador não "pula" ao conectar/desconectar.
 */
describe('BatteryGauge — na tomada (um ícone, mesmo tamanho)', () => {
  it('usa só o glifo de bateria carregando, recortado na caixa desenhada', () => {
    const { container } = render(<BatteryGauge percent={80} onAc size="md" />);

    const root = container.querySelector('[data-state="charging"]');
    expect(root).toBeTruthy();
    // Nenhuma bateria desenhada em CSS junto: é um ícone só.
    expect(container.querySelector('[data-state="battery"]')).toBeNull();

    const svg = root?.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('80 -680 776.5 400');

    const expected = glyphPath('battery_charging_80_2');
    const paths = Array.from(container.querySelectorAll('svg path'));
    expect(paths.some((path) => path.getAttribute('d') === expected)).toBe(true);

    expect(screen.getByText('Na tomada')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
  });

  it('mantém a MESMA altura do corpo desenhado (md e sm)', () => {
    const { container: md } = render(<BatteryGauge percent={80} onAc size="md" />);
    expect(md.querySelector('svg')?.getAttribute('class') ?? '').toContain('h-5');
    cleanup();

    const { container: sm } = render(<BatteryGauge percent={80} onAc size="sm" />);
    expect(sm.querySelector('svg')?.getAttribute('class') ?? '').toContain('h-3.5');
  });

  it('carregando também usa o mesmo glifo único', () => {
    const { container } = render(<BatteryGauge percent={41} onAc charging />);

    const expected = glyphPath('battery_charging_80_2');
    const paths = Array.from(container.querySelectorAll('svg path'));
    expect(paths.some((path) => path.getAttribute('d') === expected)).toBe(true);
    expect(screen.getByText('Carregando')).toBeTruthy();
  });

  it('o texto cru do SO (On AC) também vale quando o booleano não veio', () => {
    const { container } = render(<BatteryGauge percent={64} onAc={null} state="On AC" />);

    expect(container.querySelector('[data-state="charging"]')).toBeTruthy();
    expect(screen.getByText('Na tomada')).toBeTruthy();
  });

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
  it('borda reforçada + fundo leve, na mesma altura do estado plugado', () => {
    const { container } = render(<BatteryGauge percent={63} onAc={false} size="md" />);

    const root = container.querySelector('[data-state="battery"]');
    expect(root).toBeTruthy();
    expect(root?.querySelector('svg')).toBeNull();

    const body = root?.querySelector('.border-foreground\\/60');
    expect(body).toBeTruthy();
    expect(body?.className ?? '').toContain('bg-surface-light');
    expect(body?.className ?? '').toContain('h-5');

    expect(screen.getByText('Na bateria')).toBeTruthy();
    expect(screen.getByText('63%')).toBeTruthy();
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
