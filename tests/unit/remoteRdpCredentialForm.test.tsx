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

  it('mostra o formulário ANTES de tentar conectar (RDP exige credenciais)', async () => {
    render(
      <RemoteRdp
        sessionId="11111111-1111-1111-1111-111111111111"
        agentId="22222222-2222-2222-2222-222222222222"
        natsSubject="tenant.t.site.s.agent.a.remote.session.11111111111111111111111111111111"
        natsUrl="wss://exemplo/nats"
        jwt="jwt-fake"
      />,
    );

    // O formulário aparece IMEDIATAMENTE: sem usuário não faz sentido tentar.
    // Tentar às cegas produzia um ciclo NTLM fadado a falhar e deixava o
    // operador sem feedback (tela em "Negociando RDP…" indefinidamente).
    await waitFor(
      () => {
        expect(screen.getByText(/Informe as credenciais/i)).toBeTruthy();
      },
      { timeout: 4000 },
    );

    // E NÃO deve ter chamado o IronRDP sem credenciais.
    expect(connectIronRdp).not.toHaveBeenCalled();

    // Campos essenciais presentes.
    expect(screen.getByPlaceholderText(/usuario ou usuario@dominio/i)).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: /conectar/i })).toBeTruthy();
  });

  it('o botão Conectar fica desabilitado sem usuário', async () => {
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

    // Sem usuário o submit não tem o que enviar: fica desabilitado.
    const btn = screen.getByRole('button', { name: /^conectar$/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // E não há erro de conexão ainda (nada foi tentado).
    expect(screen.queryByText(/username missing/i)).toBeNull();
  });

  it('sem credenciais: não exibe erro cru nem fica preso em "Negociando"', async () => {
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

    const txt = document.body.textContent ?? '';
    // Nunca vazar detalhe interno do WASM nem objeto cru.
    expect(txt).not.toContain('[object Object]');
    expect(txt).not.toContain('__wbg_ptr');
    // E não deve ter começado a negociação sem credenciais.
    expect(txt).not.toContain('Negociando RDP');
  });
});
