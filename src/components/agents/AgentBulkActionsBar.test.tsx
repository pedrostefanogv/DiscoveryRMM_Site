import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentBulkActionsBar } from './AgentBulkActionsBar';
import type { AgentCardAgent } from './AgentCard';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// A barra roda de verdade; só os hooks de dados viram espiões controlados.
//
// Os espiões precisam nascer em vi.hoisted: as fábricas de vi.mock são içadas
// para o topo do arquivo, então um `const` comum ainda estaria em TDZ quando a
// fábrica roda.
const spies = vi.hoisted(() => ({
  notify: vi.fn(),
  restart: vi.fn(),
  shutdown: vi.fn(),
  wakeOnLan: vi.fn(),
  forceAgentCheck: vi.fn(),
  refreshData: vi.fn(),
  // Assinatura tipada com o argumento real: sem isso o TS infere () => boolean e
  // mockImplementation((perms: string[]) => ...) não compila.
  hasAnyPermission: vi.fn((_permissions: string[]) => true),
}));

vi.mock('@/hooks/useAgentAlerts', () => ({
  useSendAgentNotification: () => ({ mutateAsync: spies.notify, isPending: false }),
}));

vi.mock('@/hooks/useAgents', () => ({
  useRestartAgent: () => ({ mutateAsync: spies.restart, isPending: false }),
  useShutdownAgent: () => ({ mutateAsync: spies.shutdown, isPending: false }),
  useWakeOnLan: () => ({ mutateAsync: spies.wakeOnLan, isPending: false }),
}));

vi.mock('@/api', () => ({
  agentsApi: { refreshData: spies.refreshData },
  agentUpdatesApi: { forceAgentCheck: spies.forceAgentCheck },
}));

vi.mock('@/auth/authorization', () => ({
  useAuthorization: () => ({ hasAnyPermission: spies.hasAnyPermission }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// O compositor real tem teste próprio e é pesado; aqui basta um gatilho que
// dispara onConfirm com um payload válido.
vi.mock('@/components/notifications/NotificationComposerModal', () => ({
  default: ({
    onConfirm,
  }: {
    onConfirm: (payload: {
      title: string;
      message: string;
      alertType: number;
      timeoutSeconds: number | null;
      icon: 'info';
    }) => Promise<void>;
  }) => (
    <button
      type="button"
      onClick={() => {
        void onConfirm({
          title: 'Aviso',
          message: 'Mensagem',
          alertType: 0,
          timeoutSeconds: null,
          icon: 'info',
        });
      }}
    >
      confirmar-notificacao
    </button>
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-11-23T12:00:00.000Z').getTime();
const AGORA = new Date(NOW - 10_000).toISOString();
const ANTIGO = new Date(NOW - 30 * 60_000).toISOString();

function agent(overrides: Partial<AgentCardAgent> = {}): AgentCardAgent {
  return {
    id: 'a1',
    hostname: 'HOST-01',
    displayName: 'HOST-01',
    siteId: 's1',
    clientId: 'c1',
    clientName: 'Cliente Um',
    siteName: 'Site Matriz',
    status: 'Online',
    lastSeenAt: AGORA,
    ...overrides,
  } as unknown as AgentCardAgent;
}

const ONLINE_A = agent({ id: 'a1', hostname: 'HOST-01', displayName: 'HOST-01' });
const ONLINE_B = agent({ id: 'a2', hostname: 'HOST-02', displayName: 'HOST-02' });
const OFFLINE = agent({ id: 'a3', hostname: 'HOST-03', displayName: 'HOST-03', lastSeenAt: ANTIGO, status: 'Offline' });

function renderBar(agents: readonly AgentCardAgent[], onClear = vi.fn()) {
  return {
    onClear,
    ...render(
      <AgentBulkActionsBar agents={agents} now={NOW} scopeLabel="cliente" onClear={onClear} />,
    ),
  };
}

/** Abre o modal de energia e confirma digitando a palavra de segurança. */
function confirmarEnergia(word: string, label: RegExp) {
  fireEvent.change(screen.getByLabelText(new RegExp(`Digite ${word}`)), { target: { value: word } });
  fireEvent.click(screen.getByRole('button', { name: label }));
}

beforeEach(() => {
  vi.clearAllMocks();
  spies.notify.mockImplementation(() => Promise.resolve({ success: true }));
  spies.restart.mockImplementation(() => Promise.resolve({ commandId: 'cmd' }));
  spies.shutdown.mockImplementation(() => Promise.resolve({ commandId: 'cmd' }));
  spies.wakeOnLan.mockImplementation(() => Promise.resolve({ dispatchId: 'dsp' }));
  spies.forceAgentCheck.mockImplementation(() => Promise.resolve({ success: true }));
  spies.refreshData.mockImplementation(() => Promise.resolve({ success: true, commandId: 'cmd' }));
  spies.hasAnyPermission.mockReturnValue(true);
});

afterEach(() => cleanup());

describe('AgentBulkActionsBar — renderização', () => {
  it('não renderiza nada sem seleção', () => {
    renderBar([]);
    expect(screen.queryByRole('region', { name: /Ações em massa/ })).toBeNull();
  });

  it('resume a seleção e mostra todas as ações', () => {
    renderBar([ONLINE_A, ONLINE_B, OFFLINE]);
    const bar = screen.getByRole('region', { name: /Ações em massa/ });
    expect(bar.textContent).toContain('3 selecionado(s)');
    expect(bar.textContent).toContain('2 online');
    expect(bar.textContent).toContain('1 offline');
  });

  it('desabilita todas as ações de execução sem permissão', () => {
    spies.hasAnyPermission.mockReturnValue(false);
    renderBar([ONLINE_A, OFFLINE]);

    for (const label of [
      'Notificar',
      'Reiniciar',
      'Desligar',
      'Ligar',
      'Atualizar agente',
      'Atualizar inventário',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toHaveProperty('disabled', true);
    }
    // Limpar seleção é puramente local.
    expect(screen.getByRole('button', { name: /Limpar seleção/ })).toHaveProperty('disabled', false);
  });

  it('separa a permissão de Agents.* da de Deployment (force-update)', () => {
    // Só Agents.*: executa no agente, mas não dispara auto-update (Deployment.Edit).
    spies.hasAnyPermission.mockImplementation((perms: string[]) =>
      perms.some((p) => p.startsWith('Agents')),
    );
    renderBar([ONLINE_A]);
    expect(screen.getByRole('button', { name: /Notificar/ })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: /Atualizar inventário/ })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: /Atualizar agente/ })).toHaveProperty('disabled', true);

    cleanup();
    // Só Deployment.*: o inverso.
    spies.hasAnyPermission.mockImplementation((perms: string[]) =>
      perms.some((p) => p.startsWith('Deployment')),
    );
    renderBar([ONLINE_A]);
    expect(screen.getByRole('button', { name: /Atualizar agente/ })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: /Notificar/ })).toHaveProperty('disabled', true);
  });

  it('desabilita energia quando nenhum selecionado está online e WoL quando todos estão', () => {
    renderBar([OFFLINE]);
    expect(screen.getByRole('button', { name: /Reiniciar/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /Desligar/ })).toHaveProperty('disabled', true);
    // Offline é justamente quem o Wake-on-LAN acorda.
    expect(screen.getByRole('button', { name: /Ligar/ })).toHaveProperty('disabled', false);

    cleanup();
    renderBar([ONLINE_A, ONLINE_B]);
    expect(screen.getByRole('button', { name: /Reiniciar/ })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: /Ligar/ })).toHaveProperty('disabled', true);
  });
});

describe('AgentBulkActionsBar — notificação', () => {
  it('notifica TODOS os selecionados (inclusive offline) e limpa a seleção', async () => {
    const { onClear } = renderBar([ONLINE_A, ONLINE_B, OFFLINE]);

    fireEvent.click(screen.getByRole('button', { name: /Notificar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'confirmar-notificacao' }));

    await waitFor(() => expect(spies.notify).toHaveBeenCalledTimes(3));
    expect(spies.notify.mock.calls.map((call) => call[0].agentId).sort()).toEqual(['a1', 'a2', 'a3']);
    expect(onClear).toHaveBeenCalled();
  });
});

describe('AgentBulkActionsBar — energia', () => {
  it('reinicia apenas os agentes online', async () => {
    const { onClear } = renderBar([ONLINE_A, ONLINE_B, OFFLINE]);

    fireEvent.click(screen.getByRole('button', { name: /Reiniciar/ }));
    confirmarEnergia('REINICIAR', /Reiniciar 2 agente\(s\)/);

    await waitFor(() => expect(spies.restart).toHaveBeenCalledTimes(2));
    expect(spies.restart.mock.calls.map((call) => call[0].id).sort()).toEqual(['a1', 'a2']);
    expect(spies.shutdown).not.toHaveBeenCalled();
    expect(onClear).toHaveBeenCalled();
  });

  it('desliga apenas os agentes online', async () => {
    renderBar([ONLINE_A, OFFLINE]);

    fireEvent.click(screen.getByRole('button', { name: /Desligar/ }));
    confirmarEnergia('DESLIGAR', /Desligar 1 agente\(s\)/);

    await waitFor(() => expect(spies.shutdown).toHaveBeenCalledTimes(1));
    expect(spies.shutdown.mock.calls[0][0].id).toBe('a1');
    expect(spies.restart).not.toHaveBeenCalled();
  });

  it('não confirma enquanto a palavra de segurança não bate', () => {
    renderBar([ONLINE_A]);
    fireEvent.click(screen.getByRole('button', { name: /Reiniciar/ }));

    fireEvent.change(screen.getByLabelText(/Digite REINICIAR/), { target: { value: 'reiniciar' } });
    // Case-insensitive: a validacao normaliza para maiusculas.
    expect(screen.getByRole('button', { name: /Reiniciar 1 agente/ })).toHaveProperty('disabled', false);

    fireEvent.change(screen.getByLabelText(/Digite REINICIAR/), { target: { value: 'outra coisa' } });
    expect(screen.getByRole('button', { name: /Reiniciar 1 agente/ })).toHaveProperty('disabled', true);
  });
});

describe('AgentBulkActionsBar — demais ações', () => {
  it('envia Wake-on-LAN apenas para os selecionados offline', async () => {
    const { onClear } = renderBar([ONLINE_A, ONLINE_B, OFFLINE]);

    fireEvent.click(screen.getByRole('button', { name: /Ligar/ }));

    await waitFor(() => expect(spies.wakeOnLan).toHaveBeenCalledTimes(1));
    expect(spies.wakeOnLan.mock.calls[0][0].id).toBe('a3');
    expect(onClear).toHaveBeenCalled();
  });

  it('força a verificação de atualização do binário', async () => {
    renderBar([ONLINE_A, ONLINE_B]);

    fireEvent.click(screen.getByRole('button', { name: /Atualizar agente/ }));

    await waitFor(() => expect(spies.forceAgentCheck).toHaveBeenCalledTimes(2));
    expect(spies.forceAgentCheck.mock.calls.flat().sort()).toEqual(['a1', 'a2']);
  });

  it('pede re-coleta de inventário com todos os flags', async () => {
    renderBar([ONLINE_A]);

    fireEvent.click(screen.getByRole('button', { name: /Atualizar inventário/ }));

    await waitFor(() => expect(spies.refreshData).toHaveBeenCalledTimes(1));
    const [agentId, flags] = spies.refreshData.mock.calls[0] as unknown as [string, Record<string, boolean>];
    expect(agentId).toBe('a1');
    expect(flags).toMatchObject({ hardware: true, software: true, listeningPorts: true, openConnections: true });
  });

  it('expõe um contador de falhas sem quebrar o lote', async () => {
    spies.restart.mockRejectedValueOnce(new Error('agente recusou'));
    const { onClear } = renderBar([ONLINE_A, ONLINE_B]);

    fireEvent.click(screen.getByRole('button', { name: /Reiniciar/ }));
    confirmarEnergia('REINICIAR', /Reiniciar 2 agente\(s\)/);

    await waitFor(() => expect(spies.restart).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onClear).toHaveBeenCalled());
  });
});