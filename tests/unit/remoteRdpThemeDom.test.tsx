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

import { fireEvent } from '@testing-library/react';
import RemoteRdp from '@/modules/remote-rdp/RemoteRdp';

/**
 * Preenche o usuário e submete o formulário de credenciais.
 *
 * Necessário porque o componente passou a EXIGIR credenciais antes de tentar
 * conectar (RDP sempre precisa de logon do Windows). Sem isso o gate retém a
 * conexão e nenhum alerta chega a existir.
 */
async function submitCredentials(user = 'operador') {
  const input = await waitFor(
    () => screen.getByPlaceholderText(/usuario ou usuario@dominio/i),
    { timeout: 4000 },
  );
  fireEvent.change(input, { target: { value: user } });
  const btn = screen.getByRole('button', { name: /^conectar$/i });
  fireEvent.click(btn);
}

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
    connectIronRdp.mockRejectedValue(new Error('falha de conexão RDP'));
    mount();
    await submitCredentials();

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
    connectIronRdp.mockRejectedValue(new Error('falha de conexão RDP'));
    const { container } = mount();
    await submitCredentials();
    await waitFor(() => screen.getByRole('alert'), { timeout: 4000 });

    const html = container.innerHTML;
    expect(html).not.toContain('bg-black/40');
    // O canvas mantém o preto (letterbox do desktop).
    expect(container.querySelector('canvas')?.className).toContain('bg-black');
  });
});
