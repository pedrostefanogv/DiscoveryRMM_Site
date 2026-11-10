import { describe, expect, it } from 'vitest';
import {
  AGENT_OFFLINE_FALLBACK_MS,
  isAgentOnlineNow,
  isAgentPossiblyOnline,
} from './agentStatus';

const NOW = new Date('2026-01-01T12:00:00Z').getTime();

describe('isAgentOnlineNow — janela de frescor', () => {
  it('usa 120s por padrão, alinhado ao grace period do servidor', () => {
    // ServerConfiguration.AgentOnlineGraceSeconds = 120: o console não pode dizer
    // "Offline" antes do servidor. (A env VITE_AGENT_OFFLINE_FALLBACK_MS, quando
    // definida, continua tendo precedência.)
    expect(AGENT_OFFLINE_FALLBACK_MS).toBe(120 * 1000);
  });

  it('heartbeat de 100s na faixa 90s-120s aparece Online (bug corrigido)', () => {
    const agente = { status: 'Offline' as const, lastSeenAt: new Date(NOW - 100_000).toISOString() };
    expect(isAgentOnlineNow(agente, NOW)).toBe(true);
  });

  it('fronteira: 120s ainda é Online; 130s já é Offline', () => {
    expect(isAgentOnlineNow({ lastSeenAt: new Date(NOW - 120_000).toISOString() }, NOW)).toBe(true);
    expect(isAgentOnlineNow({ lastSeenAt: new Date(NOW - 130_000).toISOString() }, NOW)).toBe(false);
  });
});

describe('isAgentOnlineNow — campo autoritativo isOnline', () => {
  it('sem lastSeenAt válido, decide pelo isOnline do servidor', () => {
    expect(isAgentOnlineNow({ isOnline: true, status: 'Offline' }, NOW)).toBe(true);
    expect(isAgentOnlineNow({ isOnline: false, status: 'Online' }, NOW)).toBe(false);
    // null = campo presente mas sem resposta do servidor (payload antigo/indefinido).
    expect(isAgentOnlineNow({ isOnline: null, status: 'Online' }, NOW)).toBe(true);
  });

  it('o FRESCOR continua vindo primeiro quando existe lastSeenAt válido', () => {
    // Preserva o comportamento das telas que recebem lastSeenAt ao vivo
    // (AgentListView, AgentCard): o heartbeat local é mais novo que o campo do servidor.
    expect(
      isAgentOnlineNow(
        { isOnline: true, lastSeenAt: new Date(NOW - 130_000).toISOString() },
        NOW,
      ),
    ).toBe(false);
    expect(
      isAgentOnlineNow(
        { isOnline: false, lastSeenAt: new Date(NOW - 10_000).toISOString() },
        NOW,
      ),
    ).toBe(true);
  });

  it('lastSeenAt inválido (string corrompida) cai no isOnline, não no status', () => {
    expect(isAgentOnlineNow({ isOnline: true, status: 'Offline', lastSeenAt: 'nao-e-data' }, NOW)).toBe(true);
  });

  it('sem nenhum sinal continua false', () => {
    expect(isAgentOnlineNow({}, NOW)).toBe(false);
    expect(isAgentOnlineNow({ isOnline: null }, NOW)).toBe(false);
  });
});

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
