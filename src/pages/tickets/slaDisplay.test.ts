import { describe, expect, it } from 'vitest';
import { describeSlaPause, formatPausedDuration, hasPausedShift, resolveSlaExpiryDisplay } from './slaDisplay';

describe('resolveSlaExpiryDisplay', () => {
  it('prefere o prazo efetivo (com pausas) ao prazo original', () => {
    expect(resolveSlaExpiryDisplay({ slaExpiresAt: '2026-01-01T10:00:00Z', effectiveSlaExpiresAt: '2026-01-01T12:00:00Z' }))
      .toBe('2026-01-01T12:00:00Z');
  });

  it('cai no prazo original quando o efetivo não vem', () => {
    expect(resolveSlaExpiryDisplay({ slaExpiresAt: '2026-01-01T10:00:00Z' })).toBe('2026-01-01T10:00:00Z');
  });

  it('devolve null sem SLA', () => {
    expect(resolveSlaExpiryDisplay({})).toBeNull();
  });
});

describe('hasPausedShift', () => {
  it('detecta deslocamento por pausa', () => {
    expect(hasPausedShift({ slaExpiresAt: 'A', effectiveSlaExpiresAt: 'B' })).toBe(true);
    expect(hasPausedShift({ slaExpiresAt: 'A', effectiveSlaExpiresAt: 'A' })).toBe(false);
    expect(hasPausedShift({ slaExpiresAt: 'A' })).toBe(false);
  });
});

describe('formatPausedDuration', () => {
  it('formata horas/minutos/segundos', () => {
    expect(formatPausedDuration(0)).toBe('');
    expect(formatPausedDuration(-5)).toBe('');
    expect(formatPausedDuration(30)).toBe('30s');
    expect(formatPausedDuration(90)).toBe('1min');
    expect(formatPausedDuration(8100)).toBe('2h 15min');
    expect(formatPausedDuration(7200)).toBe('2h');
  });
});

describe('describeSlaPause', () => {
  it('devolve null quando o SLA não está pausado', () => {
    expect(describeSlaPause({ onHold: false, slaPausedSeconds: 120 })).toBeNull();
    expect(describeSlaPause({})).toBeNull();
  });

  it('descreve a pausa em andamento com início e tempo acumulado', () => {
    const text = describeSlaPause({ onHold: true, slaHoldStartedAt: '2026-01-01T10:00:00Z', slaPausedSeconds: 3600 });
    expect(text).toMatch(/^SLA pausado desde /);
    expect(text).toContain('1h já descontados');
  });

  it('descreve a pausa sem data de início', () => {
    expect(describeSlaPause({ onHold: true, slaPausedSeconds: 0 })).toBe('SLA pausado');
  });
});
