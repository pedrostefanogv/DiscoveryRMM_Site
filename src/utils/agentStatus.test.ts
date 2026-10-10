import { describe, expect, it } from 'vitest';
import { isAgentOnlineNow, isAgentPossiblyOnline } from './agentStatus';

const NOW = new Date('2026-01-01T12:00:00Z').getTime();

describe('isAgentPossiblyOnline', () => {
  it('é true quando o heartbeat UI está fresco', () => {
    expect(
      isAgentPossiblyOnline({ lastSeenAt: new Date(NOW - 30_000).toISOString() }, NOW),
    ).toBe(true);
  });

  it('é true quando o STATUS do servidor diz Online mesmo com heartbeat velho', () => {
    // Janela crítica: a UI já considera offline, mas o servidor ainda envia o
    // comando de desinstalação. A confirmação destrutiva não pode ser pulada.
    expect(
      isAgentPossiblyOnline(
        { status: 'Online', lastSeenAt: new Date(NOW - 10 * 60_000).toISOString() },
        NOW,
      ),
    ).toBe(true);
  });

  it('é false quando os dois sinais dizem offline', () => {
    expect(
      isAgentPossiblyOnline(
        { status: 'Offline', lastSeen: new Date(NOW - 10 * 60_000).toISOString() },
        NOW,
      ),
    ).toBe(false);
  });

  it('não contradiz isAgentOnlineNow (é um superconjunto)', () => {
    const candidates = [
      { lastSeenAt: new Date(NOW - 30_000).toISOString() },
      { status: 'Online' as const, lastSeenAt: new Date(NOW - 10 * 60_000).toISOString() },
      { status: 'Offline' as const, isOnline: true },
      { status: 'Offline' as const, lastSeenAt: new Date(NOW - 10 * 60_000).toISOString() },
      {},
    ];

    for (const candidate of candidates) {
      if (isAgentOnlineNow(candidate, NOW)) {
        expect(isAgentPossiblyOnline(candidate, NOW)).toBe(true);
      }
    }
  });
});
