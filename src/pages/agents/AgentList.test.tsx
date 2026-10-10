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
// Mantém os agentes de teste online para exercitar o submenu "Energia".
vi.mock('@/utils/agentStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/agentStatus')>();
  return { ...actual, isAgentOnlineNow: () => true };
});
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

/** "Excluídos" agora é uma opção do filtro (select), não mais um botão. */
function selectDeletedView() {
  fireEvent.change(screen.getByDisplayValue('Todos'), { target: { value: 'deleted' } });
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

  it('"Todos" não mostra excluídos e a opção "Excluídos" abre a lixeira', async () => {
    renderPage();

    expect(screen.getByText('ATIVO-01')).toBeTruthy();
    expect(screen.queryByText('EXCLUIDO-01')).toBeNull();
    // O botão antigo de excluídos foi removido; agora só existe o select.
    expect(screen.queryByRole('button', { name: /Excluídos/ })).toBeNull();

    selectDeletedView();

    expect(await screen.findByText('EXCLUIDO-01')).toBeTruthy();
    expect(screen.queryByText('ATIVO-01')).toBeNull();

    fireEvent.change(screen.getByDisplayValue('Excluídos'), { target: { value: 'all' } });

    expect(screen.getByText('ATIVO-01')).toBeTruthy();
    expect(screen.queryByText('EXCLUIDO-01')).toBeNull();
  });

  it('clicar em Online sai da lixeira e volta ao catálogo ativo', async () => {
    renderPage();

    selectDeletedView();
    expect(await screen.findByText('EXCLUIDO-01')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Online/ }));

    expect(screen.getByText('ATIVO-01')).toBeTruthy();
    expect(screen.queryByText('EXCLUIDO-01')).toBeNull();
  });

  it('abre a lixeira, mostra o excluído e restaura', async () => {
    renderPage();

    selectDeletedView();

    expect(await screen.findByText('EXCLUIDO-01')).toBeTruthy();
    expect(screen.queryByText('ATIVO-01')).toBeNull();
    expect(screen.getByText('Excluído')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Restaurar/ }));

    await waitFor(() => expect(restoreMock).toHaveBeenCalledWith('a3'));
  });

  it('exige digitar o nome e confirma a exclusão definitiva', async () => {
    renderPage();

    selectDeletedView();
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

    selectDeletedView();
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

    selectDeletedView();
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

describe('AgentList — menu de contexto e submenu de energia', () => {
  beforeEach(() => {
    restoreMock.mockReset().mockResolvedValue(undefined);
    purgeMock.mockReset().mockResolvedValue(undefined);
    deleteMock.mockReset().mockResolvedValue(undefined);
    deletedParamsMock.mockReset();
  });

  afterEach(() => cleanup());

  function openContextMenuFor(name: string, clientX: number, clientY: number) {
    const card = screen.getByText(name).closest('[role="button"]');
    expect(card).not.toBeNull();
    fireEvent.contextMenu(card as Element, { clientX, clientY });
    return screen.getByRole('menu');
  }

  function energyTrigger() {
    // O rótulo "Energia" é texto direto do <button>, então o wrapper com os
    // handlers de hover é o elemento pai.
    const label = screen.getByText('Energia');
    const wrapper = label.closest('div.relative.flex');
    expect(wrapper).not.toBeNull();
    return wrapper as HTMLElement;
  }

  it('fecha o submenu de energia ao abrir o menu de contexto de outro agente', () => {
    renderPage();

    openContextMenuFor('ATIVO-01', 40, 40);
    fireEvent.mouseOver(energyTrigger());
    expect(screen.getByText('Reiniciar')).toBeTruthy();

    // Botão direito em outro agente: o submenu não deve continuar aberto.
    openContextMenuFor('ATIVO-02', 120, 80);

    expect(screen.queryByText('Reiniciar')).toBeNull();
    expect(screen.queryByText('Desligar')).toBeNull();
  });

  it('fecha o submenu de energia quando o menu de contexto fecha', () => {
    renderPage();

    openContextMenuFor('ATIVO-01', 40, 40);
    fireEvent.mouseOver(energyTrigger());
    expect(screen.getByText('Reiniciar')).toBeTruthy();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByText('Reiniciar')).toBeNull();
  });

  it('mantém o menu de contexto dentro da viewport ao abrir junto à borda', () => {
    renderPage();

    const menu = openContextMenuFor('ATIVO-01', window.innerWidth - 5, window.innerHeight - 5);

    // O clique foi a 5px das bordas; o menu deve ser trazido para dentro com a
    // margem de 8px (e não para um deslocamento fixo como no código antigo).
    expect(menu.style.left).toBe(`${window.innerWidth - 8}px`);
    expect(menu.style.top).toBe(`${window.innerHeight - 8}px`);
  });

  it('abre o submenu de energia por clique (touch/teclado)', () => {
    renderPage();

    openContextMenuFor('ATIVO-01', 40, 40);
    fireEvent.click(screen.getByText('Energia'));

    expect(screen.getByText('Reiniciar')).toBeTruthy();
  });

  it('posiciona o submenu de energia dentro da viewport', () => {
    renderPage();

    openContextMenuFor('ATIVO-01', window.innerWidth - 30, window.innerHeight - 30);
    fireEvent.mouseOver(energyTrigger());

    const submenu = screen.getByRole('menu', { name: 'Opções de energia' });
    // O submenu agora é posicionado via coordenadas no viewport (position: fixed),
    // em vez de ficar escondido fora da tela com left-full.
    expect(submenu.className).toContain('fixed');
    expect(submenu.style.left).toBe('8px');
    expect(submenu.style.top).toBe('8px');
  });

  it('exige digitar o nome antes de mover um agente ONLINE para a lixeira', async () => {
    renderPage();

    openContextMenuFor('ATIVO-01', 40, 40);
    fireEvent.click(screen.getByText('Mover para a lixeira'));

    // isAgentOnlineNow está mockado para true neste arquivo: a confirmação vira
    // destrutiva (o backend também desinstala o agente do PC).
    const confirmButton = await screen.findByRole('button', { name: 'Mover e desinstalar' });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/ATIVO-01/), { target: { value: 'ATIVO-01' } });
    expect((confirmButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(confirmButton);

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('a1'));
  });
});
