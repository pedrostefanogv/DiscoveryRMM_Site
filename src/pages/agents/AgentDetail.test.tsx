import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * AgentDetail: a página do agente ganhou a mesma barra de abas de
 * Clientes/Sites (DetailTabs). A aba principal é "Info" e deve abrir por
 * padrão, em duas colunas (dados do host + anotações fixadas). O antigo card
 * "Histórico de labels" virou aba. Aqui garantimos a aba inicial, a troca por
 * clique e o deep-link por ?tab= para as novas abas.
 */

vi.mock('@/api', () => ({
  ApiError: class ApiError extends Error {},
  agentUpdatesApi: {},
  agentsApi: {},
}));

vi.mock('@/utils/labels', () => ({
  getLogLevelMeta: () => ({ label: 'Info', color: 'slate' }),
  getTicketPriorityMeta: () => ({ label: 'Baixa', color: 'slate' }),
}));

vi.mock('@/hooks/useAgents', () => ({
  useAgent: () => ({
    data: {
      id: 'a1',
      hostname: 'AORUSAXV2',
      displayName: 'AORUSAXV2',
      operatingSystem: 'Windows 11 Pro',
      osVersion: '10.0 (25H2)',
      agentVersion: '1.2.1',
      commitHash: '1b1b344',
      lastIpAddress: '192.168.10.77',
      lastSeen: '2026-04-10T20:48:36Z',
      lastSeenAt: '2026-04-10T20:48:36Z',
      isOnline: true,
      zeroTouchPending: false,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAgentHardware: () => ({
    data: {
      disks: [],
      networkAdapters: [],
      memoryModules: [],
      hardware: {
        manufacturer: 'Gigabyte Technology Co., Ltd.',
        model: 'B650 AORUS ELITE AX V2',
        processor: 'AMD Ryzen',
        processorCores: 8,
        processorThreads: 16,
      },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAgentHardwareComponents: () => ({
    data: { printers: [], startupItems: [], scheduledTasks: [] },
    isFetching: false,
    refetch: vi.fn(),
  }),
  useAgentListeningPortsPage: () => ({ data: { items: [], totalCount: 0, hasMore: false } }),
  useAgentOpenSocketsPage: () => ({ data: { items: [], totalCount: 0, hasMore: false } }),
  useAgentSoftwarePage: () => ({ data: { items: [], totalCount: 42, totalPages: 1 } }),
  useAgentSoftwareSnapshot: () => ({
    data: { totalInstalled: 0, updateAvailableCount: 0, lastCollectedAt: null },
    isLoading: false,
  }),
  useApproveZeroTouch: () => ({ isPending: false, mutate: vi.fn() }),
  useDeleteAgent: () => ({ isPending: false, mutate: vi.fn() }),
  useRestartAgent: () => ({ isPending: false, mutate: vi.fn() }),
  useShutdownAgent: () => ({ isPending: false, mutate: vi.fn() }),
  useWakeOnLan: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock('@/hooks/useTickets', () => ({ useTickets: () => ({ data: { items: [] }, isLoading: false }) }));
vi.mock('@/hooks/useLogs', () => ({ useLogs: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useNowTick', () => ({ useNowTick: () => Date.now() }));
vi.mock('@/hooks/useAgentAlerts', () => ({
  useSendAgentNotification: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock('@/auth/authorization', () => ({
  useAuthorization: () => ({ hasAnyPermission: () => true }),
}));
vi.mock('@/stores/heartbeatStore', () => ({
  useAgentHeartbeat: () => null,
  isHeartbeatTimestampFresh: () => false,
}));
vi.mock('@/modules/agent-labels/api', () => ({
  agentLabelsApi: {
    getAgentLabels: vi.fn().mockResolvedValue([]),
    getRules: vi.fn().mockResolvedValue([]),
    getDistinctLabels: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([
      {
        id: 'h1',
        label: 'Windows',
        action: 'Applied',
        occurredAt: '2026-04-10T20:48:36Z',
        ruleName: 'Servidores',
        actor: 'system',
        reason: null,
      },
    ]),
    addManualLabel: vi.fn(),
    removeManualLabel: vi.fn(),
  },
}));

vi.mock('./remoteDebugLauncher', () => ({ openRemoteDebugPopup: vi.fn() }));
vi.mock('./remoteSessionLauncher', () => ({ openRemoteSessionPopup: vi.fn() }));
vi.mock('@/components/agents/PowerActionModal', () => ({ default: () => null }));
vi.mock('@/components/agents/AgentNotificationModal', () => ({ default: () => null }));
vi.mock('@/components/agents/WakeOnLanModal', () => ({ default: () => null }));
vi.mock('@/components/agents/AgentStartupItemsPanel', () => ({ default: () => null }));
vi.mock('@/components/agents/AgentScheduledTasksPanel', () => ({ default: () => null }));
vi.mock('@/components/notes/NotesPanel', () => ({
  NotesPanel: () => <div data-testid="notes-panel">Notas</div>,
}));
vi.mock('@/components/notes/PinnedNotesCard', () => ({
  PinnedNotesCard: () => <div data-testid="pinned-notes">Anotações fixadas</div>,
}));

import AgentDetail from './AgentDetail';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

async function renderPage(search = '') {
  const result = render(
    <MemoryRouter initialEntries={[`/agents/a1${search}`]}>
      <Routes>
        <Route
          path="/agents/:id"
          element={
            <>
              <AgentDetail />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  // Drena o carregamento assíncrono das labels para evitar updates fora de act().
  await act(async () => {});
  return result;
}

afterEach(() => cleanup());

describe('AgentDetail — abas do agente', () => {
  it('abre na aba principal Info com os dados do host e as anotações fixadas', async () => {
    await renderPage();
    const infoTab = screen.getByRole('tab', { name: /Info/ });
    expect(infoTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('192.168.10.77')).toBeTruthy();
    expect(screen.getByTestId('pinned-notes')).toBeTruthy();
    expect(screen.queryByTestId('notes-panel')).toBeNull();
    // Os contadores por aba foram preservados na nova barra.
    expect(screen.getByRole('tab', { name: /Aplicativos/ }).textContent).toContain('42');
    expect(screen.getByRole('tab', { name: /Histórico de Labels/ }).textContent).toContain('1');
  });

  it('troca para a aba Anotações ao clicar', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Anotações/ }));
    expect(screen.getByTestId('notes-panel')).toBeTruthy();
    expect(screen.queryByTestId('pinned-notes')).toBeNull();
  });

  it('troca para a aba Histórico de Labels ao clicar', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Histórico de Labels/ }));
    expect(await screen.findByText('Windows')).toBeTruthy();
  });

  it('abre direto na aba informada pela querystring', async () => {
    await renderPage('?tab=anotacoes');
    expect(screen.getByRole('tab', { name: /Anotações/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('notes-panel')).toBeTruthy();
  });

  it('cai na aba Info quando o ?tab= é inválido', async () => {
    await renderPage('?tab=nao-existe');
    expect(screen.getByRole('tab', { name: /Info/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('pinned-notes')).toBeTruthy();
  });

  it('mantém os deep links antigos das abas de dados', async () => {
    await renderPage('?tab=aplicativos');
    expect(screen.getByRole('tab', { name: /Aplicativos/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByTestId('pinned-notes')).toBeNull();
  });
});
