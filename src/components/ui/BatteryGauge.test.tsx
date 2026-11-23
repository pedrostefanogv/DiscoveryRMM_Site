import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BatteryGauge } from './BatteryGauge';

afterEach(() => cleanup());

/**
 * O indicador precisa comunicar DUAS coisas de relance: o nível (cor por faixa,
 * porque alto é bom) e se a máquina está na tomada/carregando. Sem isso o
 * operador não sabe se a máquina está fora da tomada nem se a bateria está
 * acabando.
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

  it('marca carregando com o raio e o rótulo', () => {
    const { container } = render(<BatteryGauge percent={41} onAc charging label="Carregando" />);
    expect(screen.getByText('Carregando')).toBeTruthy();
    // O glifo do raio é o bolt (dois paths no registry).
    expect(container.querySelectorAll('svg path').length).toBeGreaterThan(0);
    expect(container.querySelector('.border-success\\/60')).toBeTruthy();
  });

  it('na tomada sem carregar mostra o plugue e a borda destacada', () => {
    const { container } = render(<BatteryGauge percent={90} onAc label="Na tomada" />);
    expect(screen.getByText('Na tomada')).toBeTruthy();
    expect(container.querySelector('.border-success\\/60')).toBeTruthy();
  });

  it('na bateria não destaca a borda', () => {
    const { container } = render(<BatteryGauge percent={55} onAc={false} />);
    expect(container.querySelector('.border-success\\/60')).toBeNull();
  });
});
