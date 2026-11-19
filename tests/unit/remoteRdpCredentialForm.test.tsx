import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

// Mocka o cliente IronRDP: connect rejeita com erro de credencial, como o WASM faz.
const connectIronRdp = vi.fn();
const preloadIronRdp = vi.fn().mockResolvedValue(undefined);
vi.mock('@/modules/remote-rdp/ironRdpClient', async (orig) => {
  const actual = await orig<typeof import('@/modules/remote-rdp/ironRdpClient')>();
  return {
    ...actual,
    connectIronRdp: (...args: unknown[]) => connectIronRdp(...args),
    preloadIronRdp: () => preloadIronRdp(),
  };
});

// Mocka a API: ticket + credenciais.
vi.mock('@/api/remote-sessions', () => ({
  remoteSessionsApi: {
    issueTunnelTicket: vi.fn().mockResolvedValue({ ticket: 'tk', expiresInSeconds: 60, expiresAtUtc: '' }),
  },
}));

// NATS não é o alvo deste teste: stub mínimo.
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

describe('RemoteRdp exibe o formulário de credenciais', () => {
  beforeEach(() => {
    connectIronRdp.mockReset();
    connectIronRdp.mockRejectedValue(new Error('username missing'));
  });

  afterEach(() => {
    cleanup();
  });

  it('mostra o formulário quando o IronRDP recusa por falta de usuário', async () => {
    render(
      <RemoteRdp
        sessionId="11111111-1111-1111-1111-111111111111"
        agentId="22222222-2222-2222-2222-222222222222"
        natsSubject="tenant.t.site.s.agent.a.remote.session.11111111111111111111111111111111"
        natsUrl="wss://exemplo/nats"
        jwt="jwt-fake"
      />,
    );

    // O formulário só aparece APÓS a falha de credencial ser detectada.
    await waitFor(
      () => {
        expect(screen.getByText(/Informe as credenciais/i)).toBeTruthy();
      },
      { timeout: 4000 },
    );

    // Campos essenciais presentes.
    expect(screen.getByPlaceholderText(/usuario ou usuario@dominio/i)).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: /conectar/i })).toBeTruthy();
  });

  it('NÃO oferece "Tentar novamente" quando faltam credenciais', async () => {
    render(
      <RemoteRdp
        sessionId="11111111-1111-1111-1111-111111111111"
        agentId="22222222-2222-2222-2222-222222222222"
        natsSubject="tenant.t.site.s.agent.a.remote.session.11111111111111111111111111111111"
        natsUrl="wss://exemplo/nats"
        jwt="jwt-fake"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Informe as credenciais/i)).toBeTruthy();
    }, { timeout: 4000 });

    // Com credencial faltando, o retry cego repetiria o mesmo erro em loop:
    // o caminho correto é o formulário.
    expect(screen.queryByRole('button', { name: /tentar novamente/i })).toBeNull();
  });

  it('mostra a mensagem de erro original em vez de [object Object]', async () => {
    render(
      <RemoteRdp
        sessionId="11111111-1111-1111-1111-111111111111"
        agentId="22222222-2222-2222-2222-222222222222"
        natsSubject="tenant.t.site.s.agent.a.remote.session.11111111111111111111111111111111"
        natsUrl="wss://exemplo/nats"
        jwt="jwt-fake"
      />,
    );

    await waitFor(() => {
      const txt = document.body.textContent ?? '';
      expect(txt).toContain('username missing');
      expect(txt).not.toContain('[object Object]');
      expect(txt).not.toContain('__wbg_ptr');
    }, { timeout: 4000 });
  });
});
