import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTone, relativeLuminance } from './color';

describe('contrastRatio', () => {
  it('vai de 1 (cores iguais) a 21 (preto x branco)', () => {
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('é simétrico', () => {
    expect(contrastRatio('#2563eb', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#2563eb'), 5);
  });

  it('retorna 1 para valores inválidos em vez de quebrar', () => {
    expect(contrastRatio('nao-e-cor', '#ffffff')).toBe(1);
    expect(contrastRatio(null, null)).toBe(1);
  });
});

describe('relativeLuminance', () => {
  it('calcula preto e branco', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('aceita hex curto e sem #', () => {
    expect(relativeLuminance('fff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('fff')).toBeCloseTo(relativeLuminance('#ffffff') ?? 0, 5);
  });
});

describe('readableTone', () => {
  it('mantém a cor original quando já passa no contraste', () => {
    // azul-600 sobre branco tem ~5.2:1
    expect(readableTone('#2563eb', '#ffffff')).toBe('#2563eb');
  });

  it('escurece cores claras sobre fundo claro até atingir AA (4.5:1)', () => {
    const tone = readableTone('#facc15', '#ffffff');
    expect(tone).not.toBe('#facc15');
    expect(contrastRatio(tone, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('clareia cores escuras sobre fundo escuro até atingir AA', () => {
    const tone = readableTone('#1e3a8a', '#111d33');
    expect(tone).not.toBe('#1e3a8a');
    expect(contrastRatio(tone, '#111d33')).toBeGreaterThanOrEqual(4.5);
  });

  it('é conservador no extremo: preto puro sobre fundo escuro é clareado', () => {
    const tone = readableTone('#000000', '#111d33');
    expect(contrastRatio(tone, '#111d33')).toBeGreaterThanOrEqual(4.5);
  });

  it('cai no cinza neutro quando a cor é ausente ou inválida', () => {
    expect(readableTone(null, '#ffffff')).toBe('#64748b');
    expect(readableTone('xyz', '#ffffff')).toBe('#64748b');
  });

  it('ajusta o cinza de fallback para manter contraste em fundo escuro', () => {
    const tone = readableTone(null, '#111d33');
    expect(contrastRatio(tone, '#111d33')).toBeGreaterThanOrEqual(4.5);
  });
});
