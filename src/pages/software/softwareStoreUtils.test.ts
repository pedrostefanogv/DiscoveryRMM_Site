import { describe, expect, it } from 'vitest';
import { formatBytes, formatEta, slugifyPackageId } from './softwareStoreUtils';

/**
 * formatEta alimenta a estimativa de tempo restante do envio no card do
 * instalador — onde o upload pode levar minutos. Um valor errado (ou "NaN min")
 * passa a ser visto pelo operador a cada envio.
 */
describe('formatEta', () => {
  it('mostra segundos abaixo de um minuto (nunca 0 s)', () => {
    expect(formatEta(45)).toBe('45 s');
    expect(formatEta(0.4)).toBe('1 s');
    // 59,6 s não pode virar "60 s" (pareceria um minuto com rótulo de segundos).
    expect(formatEta(59.6)).toBe('59 s');
  });

  it('não arredonda minutos para 60 min', () => {
    expect(formatEta(3599)).toBe('59 min');
  });

  it('mostra minutos entre 1 e 59', () => {
    expect(formatEta(60)).toBe('1 min');
    expect(formatEta(600)).toBe('10 min');
    expect(formatEta(3540)).toBe('59 min');
  });

  it('mostra horas e minutos acima de uma hora', () => {
    expect(formatEta(3600)).toBe('1 h');
    expect(formatEta(3900)).toBe('1 h 5 min');
    expect(formatEta(23 * 3600)).toBe('23 h');
  });

  it('mostra dias em links muito lentos (nunca "50 h")', () => {
    expect(formatEta(24 * 3600)).toBe('1 dia');
    expect(formatEta(48 * 3600)).toBe('2 dias');
  });

  it('devolve null quando não há estimativa confiável', () => {
    expect(formatEta(undefined)).toBeNull();
    expect(formatEta(null)).toBeNull();
    expect(formatEta(0)).toBeNull();
    expect(formatEta(-10)).toBeNull();
    expect(formatEta(Number.NaN)).toBeNull();
    expect(formatEta(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('formatBytes', () => {
  it('formata bytes legíveis e vazio para valores inválidos', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(undefined)).toBe('');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });
});

describe('slugifyPackageId', () => {
  it('remove acentos e espaços', () => {
    expect(slugifyPackageId('Sistema de Gestão XPTO')).toBe('sistema-de-gestao-xpto');
  });
});
