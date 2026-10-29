import { describe, expect, it } from 'vitest';

import {
  EMPTY_VALUE,
  formatBytes,
  formatDate,
  formatDateCompact,
  formatDateTime,
} from './format';

describe('utils/format', () => {
  it('formatDate devolve dd/mm/aaaa e "-" para ausente', () => {
    expect(formatDate('2026-10-21T12:00:00Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(formatDate(null)).toBe('-');
    expect(formatDate('nao-e-data')).toBe('-');
  });

  it('formatDateTime usa traço como fallback padrão', () => {
    expect(formatDateTime(null)).toBe(EMPTY_VALUE);
    expect(formatDateTime('invalida')).toBe(EMPTY_VALUE);
    expect(formatDateTime(null, '')).toBe('');
    expect(formatDateTime('2026-10-21T12:00:00Z')).toContain('/');
  });

  it('formatDateCompact devolve dia/mês + hora', () => {
    const out = formatDateCompact('2026-10-21T12:00:00Z');
    expect(out).toMatch(/^\d{2}\/\d{2},? \d{2}:\d{2}$/);
    expect(formatDateCompact(null, 'valor-original')).toBe('valor-original');
  });

  it('formatBytes converte unidades e respeita fallback', () => {
    expect(formatBytes(0)).toBe(EMPTY_VALUE);
    expect(formatBytes(null)).toBe(EMPTY_VALUE);
    expect(formatBytes(0, '0 B')).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB');
    expect(formatBytes(12 * 1024 ** 3)).toBe('12 GB');
  });
});
