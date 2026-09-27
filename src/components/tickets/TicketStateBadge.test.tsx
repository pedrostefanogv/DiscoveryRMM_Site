import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/theme/color';
import { FALLBACK_STATE_COLOR, TicketStateBadge, stateColorVars } from './TicketStateBadge';

/** Cores típicas de estados de workflow (inclui as "difíceis": amarelo, ciano). */
const STATE_COLORS = [
  '#2563eb', // azul
  '#f59e0b', // âmbar
  '#facc15', // amarelo (ilegível sobre branco se usado cru)
  '#22c55e', // verde
  '#ef4444', // vermelho
  '#14b8a6', // teal
  '#64748b', // cinza
  '#000000', // preto
  '#ffffff', // branco
];

/** Superfícies reais das linhas da tabela / hover card de cada tema. */
const LIGHT_ROW_SURFACES = ['#ffffff', '#f1f5f9', '#e2e8f0'];
const DARK_ROW_SURFACES = ['#111d33', '#1a2840', '#1e293b'];

function vars(color: string | null) {
  return stateColorVars(color) as unknown as Record<string, string>;
}

describe('TicketStateBadge', () => {
  it('mostra o nome do estado e o ponto colorido', () => {
    render(<TicketStateBadge name="Open" color="#2563eb" />);
    const badge = screen.getByTitle('Open') as HTMLElement;

    expect(badge.textContent).toBe('Open');
    expect(badge.className).toContain('state-pill');
    expect(badge.querySelector('.bg-current')).toBeTruthy();
  });

  it('usa a cor do próprio estado como matiz (não a cor de branding)', () => {
    render(<TicketStateBadge name="Open" color="#2563eb" />);
    const badge = screen.getByTitle('Open') as HTMLElement;

    expect(badge.style.getPropertyValue('--state-color')).toBe('#2563eb');
    expect(badge.style.getPropertyValue('--state-bg-light')).not.toBe(
      badge.style.getPropertyValue('--state-color'),
    );
  });

  it('usa o cinza neutro quando o estado não tem cor', () => {
    render(<TicketStateBadge name="Sem cor" color={null} />);
    const badge = screen.getByTitle('Sem cor') as HTMLElement;

    expect(badge.style.getPropertyValue('--state-color')).toBe(FALLBACK_STATE_COLOR);
  });

  it('ignora cor inválida sem quebrar o layout', () => {
    render(<TicketStateBadge name="Inválido" color="cor-invalida" />);
    const badge = screen.getByTitle('Inválido') as HTMLElement;

    expect(badge.style.getPropertyValue('--state-color')).toBe(FALLBACK_STATE_COLOR);
  });
});

describe('stateColorVars — contraste', () => {
  it('normaliza hex curto', () => {
    expect(vars('#abc')['--state-color']).toBe('#aabbcc');
  });

  it.each(STATE_COLORS)('texto legível sobre o fundo do pill — claro (%s)', (color) => {
    const v = vars(color);
    expect(contrastRatio(v['--state-tone-light'], v['--state-bg-light'])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(STATE_COLORS)('texto legível sobre o fundo do pill — escuro (%s)', (color) => {
    const v = vars(color);
    expect(contrastRatio(v['--state-tone-dark'], v['--state-bg-dark'])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(STATE_COLORS)('ponto legível em qualquer linha da tabela — claro (%s)', (color) => {
    const v = vars(color);
    for (const surface of LIGHT_ROW_SURFACES) {
      expect(contrastRatio(v['--state-tone-light'], surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(STATE_COLORS)('ponto legível em qualquer linha da tabela — escuro (%s)', (color) => {
    const v = vars(color);
    for (const surface of DARK_ROW_SURFACES) {
      expect(contrastRatio(v['--state-tone-dark'], surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('preserva cores que já têm contraste suficiente (não "lava" a cor)', () => {
    // azul-700 passa com folga em todas as superfícies claras.
    expect(vars('#1d4ed8')['--state-tone-light']).toBe('#1d4ed8');
  });

  it('mantém a cor reconhecível mesmo quando precisa escurecer um pouco', () => {
    // azul-600 vs a linha em hover: ajuste mínimo, ainda visivelmente azul.
    const tone = vars('#2563eb')['--state-tone-light'];
    expect(contrastRatio(tone, '#2563eb')).toBeLessThan(1.2);
    expect(contrastRatio(tone, '#e2e8f0')).toBeGreaterThanOrEqual(4.5);
  });

  it('não usa a cor crua como fundo do pill (era o que ficava estranho)', () => {
    expect(vars('#facc15')['--state-bg-light']).not.toBe('#facc15');
    expect(vars('#facc15')['--state-bg-dark']).not.toBe('#facc15');
  });
});
