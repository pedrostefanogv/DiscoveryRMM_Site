import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon } from './Icon';
import { BatteryGauge } from './BatteryGauge';

afterEach(() => cleanup());

/** Path do glifo renderizado direto, para comparar sem fixar dados do ícone. */
function glyphPath(name: 'bolt' | 'power_settings_new'): string | null {
  const { container, unmount } = render(<Icon name={name} />);
  const d = container.querySelector('svg path')?.getAttribute('d') ?? null;
  unmount();
  return d;
}

/**
 * O indicador precisa comunicar DUAS coisas de relance: o nível (cor por faixa,
 * porque alto é bom) e se a máquina está carregando / na tomada. O ícone de
 * estado fica FORA do corpo da bateria — dentro do preenchimento ele ficava
 * pequeno e apagado, e o operador não percebia que estava carregando.
 */
describe('BatteryGauge', () => {
  it('pinta de verde acima de 30%', () => {
    render(<BatteryGauge percent={63} onAc={false} />);
    expect(screen.getByText('63%').className).toContain('text-success');
  });

  it('pinta de âmbar na faixa de atenção (até 30%)', () => {
    render(<BatteryGauge percent={25} onAc={false} />);
    expect(screen.getByText('25%').className).toContain('text-warning');
  });

  it('pinta de vermelho em nível crítico (até 15%)', () => {
    render(<BatteryGauge percent={8} onAc={false} />);
    expect(screen.getByText('8%').className).toContain('text-danger');
  });

  it('mostra "—" e cor neutra quando o percentual não foi reportado', () => {
    render(<BatteryGauge percent={null} onAc={null} />);
    expect(screen.getByText('—').className).toContain('text-muted');
  });

  it('carregando: mostra o RAIO fora do corpo da bateria, com o rótulo', () => {
    const { container } = render(<BatteryGauge percent={41} onAc charging />);

    expect(screen.getByText('Carregando')).toBeTruthy();

    const boltPath = glyphPath('bolt');
    const paths = Array.from(container.querySelectorAll('svg path'));
    expect(paths.some((path) => path.getAttribute('d') === boltPath)).toBe(true);

    // O raio NÃO pode estar dentro do corpo (é o bug que deixava o estado
    // quase invisível): o corpo é o elemento com a borda destacada.
    const body = container.querySelector('.border-success\\/60');
    expect(body).toBeTruthy();
    expect(body?.querySelector('svg')).toBeNull();
  });

  it('na tomada sem carregar: mostra o PLUGUE e destaca a borda', () => {
    const { container } = render(<BatteryGauge percent={90} onAc />);

    expect(screen.getByText('Na tomada')).toBeTruthy();
    const plugPath = glyphPath('power_settings_new');
    const paths = Array.from(container.querySelectorAll('svg path'));
    expect(paths.some((path) => path.getAttribute('d') === plugPath)).toBe(true);
    expect(container.querySelector('.border-success\\/60')).toBeTruthy();
  });

  it('na bateria: sem ícone de estado e sem borda destacada', () => {
    const { container } = render(<BatteryGauge percent={55} onAc={false} />);

    expect(container.querySelector('.border-success\\/60')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('texto do SO ("On AC") também acende o plugue quando o booleano não veio', () => {
    const { container } = render(<BatteryGauge percent={64} onAc={null} state="On AC" />);

    expect(screen.getByText('Na tomada')).toBeTruthy();
    expect(container.querySelector('.border-success\\/60')).toBeTruthy();
  });
});
