import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Lista de agentes: catálogo x lixeira (restaurar / excluir definitivamente),
 * confirmação por digitação e coerência da contagem de labels com a lista.
 */

const { restoreMock, purgeMock, deleteMock, deletedParamsMock } = vi.hoisted(() => ({
  restoreMock: vi.fn(),
  purgeMock: vi.fn(),
  deleteMock: vi.fn(),
  deletedParamsMock: vi.fn(),
}));

const activeAgent = {
  id: 'a1',
  clientId: 'c1',
  siteId: 's1',
  hostname: 'ATIVO-01',
  displayName: 'ATIVO-01',
  operatingSystem: 'Windows 11 Pro',
  osVersion: '10.0 (25H2)',
  agentVersion: '1.0.0',
  commitHash: null,
  isOnline: true,
  lastSeen: '2026-01-01T00:00:00Z',
  lastSeenAt: '2026-01-01T00:00:00Z',
  lastIpAddress: '10.0.0.1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const secondAgent = { ...activeAgent, id: 'a2', hostname: 'ATIVO-02', displayName: 'ATIVO-02', lastIpAddress: '10.0.0.2' };

const deletedAgent = {
  ...activeAgent,
  id: 'a3',
  hostname: 'EXCLUIDO-01',
  displayName: 'EXCLUIDO-01',
  isOnline: false,
  deletedAt: '2026-09-20T10:00:00Z',
};

vi.mock('@tanstack/react-query', () => ({
  // A lista monta uma query por cliente; devolvemos os mesmos agentes ativos.
  useQueries: (options: { queries: unknown[] }) =>
    options.queries.map(() => ({ data: [activeAgent, secondAgent], isLoading: false })),
}));

vi.mock('@/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  },
  agentsApi: { listByClient: vi.fn() },
  agentUpdatesApi: { forceAgentCheck: vi.fn() },
}));

vi.mock('@/hooks/useAgents', () => ({
  useDeleteAgent: () => ({ mutateAsync: deleteMock, isPending: false }),
  useRestoreAgent: () => ({ mutateAsync: restoreMock, isPending: false }),
  usePurgeAgent: () => ({ mutateAsync: purgeMock, isPending: false }),
  useDeletedAgents: (params: { page?: number }) => {
    deletedParamsMock(params);
    return {
      data: { items: [deletedAgent], total: 250, page: params?.page ?? 1, pageSize: 200 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
  },
  useApproveZeroTouch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRestartAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useShutdownAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWakeOnLan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  getDeleteAgentErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'erro'),
  getPurgeAgentErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'erro'),
}));

vi.mock('@/hooks/useClients', () => ({
  useClients: () => ({ data: [{ id: 'c1', name: 'Acme' }], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useSites', () => ({
  useAllSites: () => ({ data: [{ id: 's1', name: 'Site Matriz' }] }),
}));

vi.mock('@/hooks/useAgentLabels', () => ({
  useAgentLabelUsage: () => ({ data: [{ label: 'Windows', agentCount: 2 }] }),
  useAgentIdsByLabel: () => ({ data: { ids: ['a1', 'a2'], total: 2, truncated: false }, isLoading: false }),
  useAgentLabelsByAgentIds: () => new Map([['a1', ['Windows']], ['a2', ['Windows']]]),
}));

vi.mock('@/stores/heartbeatStore', () => ({
  useAllAgentHeartbeats: () => new Map(),
  isHeartbeatTimestampFresh: () => true,
}));

vi.mock('@/hooks/useNowTick', () => ({ useNowTick: () => Date.now() }));
vi.mock('@/auth/authorization', () => ({ useAuthorization: () => ({ hasAnyPermission: () => true }) }));
vi.mock('@/hooks/useAgentAlerts', () => ({ useSendAgentNotification: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('./remoteDebugLauncher', () => ({ openRemoteDebugPopup: vi.fn() }));
vi.mock('./remoteSessionLauncher', () => ({ openRemoteSessionPopup: vi.fn() }));
vi.mock('@/components/agents/TransferAgentModal', () => ({ TransferAgentModal: () => null }));
vi.mock('@/components/agents/PowerActionModal', () => ({ default: () => null }));
vi.mock('@/components/agents/AgentNotificationModal', () => ({ default: () => null }));
vi.mock('@/components/agents/WakeOnLanModal', () => ({ default: () => null }));

import AgentList from './AgentList';
import { ApiError } from '@/api';

function renderPage() {
  return render(
    <MemoryRouter>
      <AgentList />
    </MemoryRouter>,
  );
}

describe('AgentList — lixeira e filtros', () => {
  beforeEach(() => {
    restoreMock.mockReset().mockResolvedValue(undefined);
    purgeMock.mockReset().mockResolvedValue(undefined);
    deleteMock.mockReset().mockResolvedValue(undefined);
    deletedParamsMock.mockReset();
  });

  afterEach(() => cleanup());

  it('no catálogo não mostra o agente excluído', () => {
    renderPage();
    expect(screen.getByText('ATIVO-01')).toBeTruthy();
    expect(screen.queryByText('EXCLUIDO-01')).toBeNull();
  });

  it('abre a lixeira, mostra o excluído e restaura', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Excluídos/ }));

    expect(await screen.findByText('EXCLUIDO-01')).toBeTruthy();
    expect(screen.queryByText('ATIVO-01')).toBeNull();
    expect(screen.getByText('Excluído')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Restaurar/ }));

    await waitFor(() => expect(restoreMock).toHaveBeenCalledWith('a3'));
  });

  it('exige digitar o nome e confirma a exclusão definitiva', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Excluídos/ }));
    await screen.findByText('EXCLUIDO-01');

    fireEvent.click(screen.getByRole('button', { name: /Excluir definitivamente/ }));

    const confirmButton = screen.getAllByRole('button', { name: 'Excluir definitivamente' }).at(-1)!;
    expect(confirmButton.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('EXCLUIDO-01'), { target: { value: 'EXCLUIDO-01' } });
    expect(confirmButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(confirmButton);

    await waitFor(() => expect(purgeMock).toHaveBeenCalledWith({ id: 'a3', force: false }));
  });

  it('com 409 pede a confirmação reforçada (force)', async () => {
    renderPage();

    purgeMock.mockRejectedValueOnce(new ApiError(409, 'Agente vinculado a 1 chamado(s).'));

    fireEvent.click(screen.getByRole('button', { name: /Excluídos/ }));
    await screen.findByText('EXCLUIDO-01');

    fireEvent.click(screen.getByRole('button', { name: /Excluir definitivamente/ }));
    fireEvent.change(screen.getByPlaceholderText('EXCLUIDO-01'), { target: { value: 'EXCLUIDO-01' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir definitivamente' }).at(-1)!);

    expect(await screen.findByText('Agente vinculado a chamados')).toBeTruthy();

    const forceButton = screen.getAllByRole('button', { name: 'Excluir definitivamente' }).at(-1)!;
    fireEvent.click(forceButton);

    await waitFor(() => expect(purgeMock).toHaveBeenLastCalledWith({ id: 'a3', force: true }));
  });

  it('pagina a lixeira quando há mais de uma página', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Excluídos/ }));
    await screen.findByText('EXCLUIDO-01');

    expect(screen.getByText('Página 1 de 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));

    await waitFor(() =>
      expect(deletedParamsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
    );
    expect(screen.getByText('Página 2 de 2')).toBeTruthy();
  });

  it('a contagem da label bate com a lista exibida', async () => {
    renderPage();

    const labelSelect = screen.getByDisplayValue('Todas as labels');
    fireEvent.change(labelSelect, { target: { value: 'Windows' } });

    expect(await screen.findByText(/Label "Windows": 2 agente\(s\)/)).toBeTruthy();
    expect(screen.getByText(/2 agentes exibidos/)).toBeTruthy();
  });
});
