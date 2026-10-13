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
  // Usado pelo resumo de campos customizados (customFieldSchemaValue).
  formatCustomFieldValue: (value: unknown) =>
    value === null || value === undefined ? '' : String(value),
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
      loggedUser: 'CORP\\pedro',
      loggedUserSince: '2026-04-10T20:48:36Z',
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
    // Contagens distintas de propósito: o badge da aba unificada deve refletir
    // a sub-aba ativa (não a soma 3).
    data: { printers: [], startupItems: [{}, {}], scheduledTasks: [{}] },
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

// O card de campos customizados tem teste próprio e depende de react-query/API;
// aqui ele é substituído para o teste da página continuar focado nas abas.
vi.mock('@/components/custom-fields/AgentCustomFieldsCard', () => ({
  AgentCustomFieldsCard: () => null,
}));

// Schema dos campos do agente: um destacado (aparece no card "Informações") e um
// comum (aparece somente na aba "Extras").
vi.mock('@/hooks/useCustomFields', () => ({
  useAgentCustomFieldSchema: () => ({
    data: [
      {
        definitionId: 'd1',
        name: 'anydesk',
        label: 'ID do anydesk',
        isPinned: true,
        isSecret: false,
        valueJson: JSON.stringify('1602799292'),
      },
      {
        definitionId: 'd2',
        name: 'teamviewer_id',
        label: 'TeamViewer ID',
        isPinned: false,
        isSecret: false,
        valueJson: 'null',
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useUpsertAgentCustomFieldValue: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useAutomation', () => ({
  useForceAutomationSync: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAgentAutomationPolicies: () => ({
    data: {
      agentId: 'a1',
      policyFingerprint: 'abc123def4567890',
      generatedAt: '2026-10-08T00:00:00Z',
      taskCount: 3,
      tasks: [],
      preloadPackages: [],
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
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
vi.mock('@/components/agents/AgentPoliciesPanel', () => ({ default: () => null }));
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
    const infoTab = screen.getByRole('tab', { name: /^Info$/ });
    expect(infoTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('192.168.10.77')).toBeTruthy();
    expect(screen.getByTestId('pinned-notes')).toBeTruthy();
    expect(screen.queryByTestId('notes-panel')).toBeNull();
    // Os contadores por aba foram preservados na nova barra.
    expect(screen.getByRole('tab', { name: /Aplicativos/ }).textContent).toContain('42');
    expect(screen.getByRole('tab', { name: /^Labels/ }).textContent).toContain('1');
    // Portas/Conexões e Inicialização/Tarefas saíram da barra principal: 11 abas
    // (incluindo a nova "Extras").
    expect(screen.getAllByRole('tab')).toHaveLength(11);
  });

  it('mostra o usuário logado no card Informações', async () => {
    await renderPage();

    expect(screen.getByText('Usuário logado')).toBeTruthy();
    expect(screen.getByText('CORP\\pedro')).toBeTruthy();
    // Início da sessão também aparece ("· desde ...").
    expect(screen.getByText(/desde/)).toBeTruthy();
  });

  it('troca para a aba Anotações ao clicar', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Anotações/ }));
    expect(screen.getByTestId('notes-panel')).toBeTruthy();
    expect(screen.queryByTestId('pinned-notes')).toBeNull();
  });

  it('troca para a aba Labels ao clicar', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /^Labels/ }));
    expect(await screen.findByText('Windows')).toBeTruthy();
  });

  it('abre direto na aba informada pela querystring', async () => {
    await renderPage('?tab=anotacoes');
    expect(screen.getByRole('tab', { name: /Anotações/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('notes-panel')).toBeTruthy();
  });

  it('cai na aba Info quando o ?tab= é inválido', async () => {
    await renderPage('?tab=nao-existe');
    expect(screen.getByRole('tab', { name: /^Info$/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('pinned-notes')).toBeTruthy();
  });

  it('mantém os deep links antigos das abas de dados', async () => {
    await renderPage('?tab=aplicativos');
    expect(screen.getByRole('tab', { name: /Aplicativos/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByTestId('pinned-notes')).toBeNull();
  });

  it('unifica adaptadores, portas e conexões na aba Rede', async () => {
    await renderPage('?tab=rede');

    expect(screen.getByRole('tab', { name: /^Rede/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Adaptadores/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Portas em Escuta/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Conexões Abertas/ })).toBeTruthy();
    expect(screen.getByText('Nenhum adaptador de rede coletado para este agente.')).toBeTruthy();
  });

  it('abre a sub-aba de portas pelo deep link legado', async () => {
    await renderPage('?tab=portas-em-escuta');

    expect(screen.getByRole('tab', { name: /^Rede/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Portas em Escuta/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Portas em Escuta' })).toBeTruthy();
  });

  it('troca para Conexões Abertas dentro da aba Rede', async () => {
    await renderPage('?tab=rede');
    fireEvent.click(screen.getByRole('tab', { name: /Conexões Abertas/ }));

    expect(screen.getByRole('tab', { name: /Conexões Abertas/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Conexões Abertas' })).toBeTruthy();
  });

  it('unifica inicialização e tarefas agendadas na aba Autoruns', async () => {
    await renderPage('?tab=execucao-automatica');

    expect(screen.getByRole('tab', { name: /Autoruns/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /^Inicialização/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Tarefas Agendadas/ })).toBeTruthy();
  });

  it('abre a sub-aba de tarefas pelo deep link legado ?tab=tarefas-agendadas', async () => {
    await renderPage('?tab=tarefas-agendadas');

    expect(screen.getByRole('tab', { name: /Autoruns/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Tarefas Agendadas/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /^Inicialização/ }).getAttribute('aria-selected')).toBe('false');
  });

  it('abre a sub-aba de inicialização pelo deep link legado ?tab=inicializacao', async () => {
    await renderPage('?tab=inicializacao');

    expect(screen.getByRole('tab', { name: /Autoruns/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /^Inicialização/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('badge da aba unificada reflete a sub-aba de tarefas quando ativa', async () => {
    await renderPage('?tab=tarefas-agendadas');

    const badge = screen.getByRole('tab', { name: /Autoruns/ }).textContent ?? '';
    expect(badge).toContain('1');
    expect(badge).not.toContain('2');
  });

  it('badge da aba unificada reflete a sub-aba de inicialização quando ativa', async () => {
    await renderPage('?tab=inicializacao');

    const badge = screen.getByRole('tab', { name: /Autoruns/ }).textContent ?? '';
    expect(badge).toContain('2');
    expect(badge).not.toContain('1');
  });

  it('abre a aba Políticas pelo deep link com o contador de políticas', async () => {
    await renderPage('?tab=politicas');

    const tab = screen.getByRole('tab', { name: /Políticas/ });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(tab.textContent).toContain('3');
  });

  it('troca para Tarefas Agendadas dentro da aba Autoruns', async () => {
    await renderPage('?tab=execucao-automatica');
    fireEvent.click(screen.getByRole('tab', { name: /Tarefas Agendadas/ }));

    expect(screen.getByRole('tab', { name: /Tarefas Agendadas/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /^Inicialização/ }).getAttribute('aria-selected')).toBe('false');
  });

  it('resume no card Informações apenas os campos customizados destacados', async () => {
    await renderPage();

    expect(screen.getByText('ID do anydesk:')).toBeTruthy();
    expect(screen.getByText('1602799292')).toBeTruthy();
    // Campo sem destaque fica fora do card (aparece na aba completa).
    expect(screen.queryByText('TeamViewer ID:')).toBeNull();
  });

  it('abre a aba Extras pelo deep link, com o contador de campos', async () => {
    await renderPage('?tab=campos-customizados');

    const tab = screen.getByRole('tab', { name: /Extras/ });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(tab.textContent).toContain('2');
    expect(screen.queryByTestId('pinned-notes')).toBeNull();
  });

  it('a aba Extras não deixa card vazio pendurado', async () => {
    const { container } = await renderPage('?tab=campos-customizados');

    expect(screen.getByRole('tab', { name: /Extras/ }).getAttribute('aria-selected')).toBe('true');
    // O wrapper ".surface-card" das abas de tabela não deve ser montado nesta aba.
    expect(container.querySelector('#agent-tabs-panel .surface-card')).toBeNull();

    // Controle: nas abas de tabela o wrapper existe — garante que o seletor
    // acima realmente detectaria o card vazio (regressão pega de verdade).
    cleanup();
    const tableTab = await renderPage('?tab=aplicativos');
    expect(tableTab.container.querySelector('#agent-tabs-panel .surface-card')).not.toBeNull();
  });

  it('navega para a aba Extras e atualiza a URL', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Extras/ }));

    expect(screen.getByRole('tab', { name: /Extras/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('location').textContent).toContain('tab=campos-customizados');
  });
});
