import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const connectIronRdp = vi.fn();
vi.mock('@/modules/remote-rdp/ironRdpClient', async (orig) => {
  const actual = await orig<typeof import('@/modules/remote-rdp/ironRdpClient')>();
  return {
    ...actual,
    connectIronRdp: (...a: unknown[]) => connectIronRdp(...a),
    preloadIronRdp: () => Promise.resolve(),
  };
});
vi.mock('@/api/remote-sessions', () => ({
  remoteSessionsApi: {
    issueTunnelTicket: vi.fn().mockResolvedValue({ ticket: 'tk', expiresInSeconds: 60, expiresAtUtc: '' }),
  },
}));
vi.mock('@/api/nats', () => ({
  createNatsService: () => ({
    setPreSuppliedCredentials: () => {},
    onConnectionStateChange: () => () => {},
    onAuthError: () => () => {},
    connect: async () => true,
    subscribe: async () => {},
    subscribeRaw: async () => true,
    unsubscribeRaw: () => {},
    publish: async () => {},
    dispose: async () => {},
    isConnected: () => true,
  }),
  jwtExpiresAtUtc: () => '',
}));

import RemoteRdp from '@/modules/remote-rdp/RemoteRdp';

function mount() {
  return render(
    <RemoteRdp
      sessionId="11111111-1111-1111-1111-111111111111"
      agentId="22222222-2222-2222-2222-222222222222"
      natsSubject="tenant.t.site.s.agent.a.remote.session.11111111111111111111111111111111"
      natsUrl="wss://exemplo/nats"
      jwt="jwt-fake"
    />,
  );
}

describe('box de erro tem fundo sólido (verificação no DOM)', () => {
  afterEach(() => cleanup());

  it('a caixa de erro carrega bg-danger + text-white e nenhum fundo translúcido', async () => {
    connectIronRdp.mockReset();
    connectIronRdp.mockRejectedValue(new Error('username missing'));
    mount();

    const alert = await waitFor(() => screen.getByRole('alert'), { timeout: 4000 });
    const cls = alert.className;

    expect(cls).toContain('bg-danger');
    expect(cls).toContain('text-white');
    // Nenhum fundo semântico translúcido pode voltar.
    expect(cls).not.toMatch(/bg-danger\/\d+/);
    expect(cls).not.toMatch(/bg-success\/\d+/);
    expect(cls).not.toMatch(/bg-warning\/\d+/);
  });

  it('o container de status não tem backdrop escuro', async () => {
    connectIronRdp.mockReset();
    connectIronRdp.mockRejectedValue(new Error('username missing'));
    const { container } = mount();
    await waitFor(() => screen.getByRole('alert'), { timeout: 4000 });

    const html = container.innerHTML;
    expect(html).not.toContain('bg-black/40');
    // O canvas mantém o preto (letterbox do desktop).
    expect(container.querySelector('canvas')?.className).toContain('bg-black');
  });
});
