import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * SiteDetail segue o mesmo sistema de abas do ClientDetail, sem a aba Sites
 * (não se aplica a um site). Default: Info (resumo/notas/informações).
 */

vi.mock('@/api', () => ({
  // Enums de valor consumidos por @/utils/labels e pelos handlers de notificação.
  LogLevel: { Trace: 0, Debug: 1, Info: 2, Warn: 3, Warning: 3, Error: 4, Fatal: 5, Critical: 5 },
  AlertScopeType: { Agent: 0, Site: 1, Client: 2, Label: 3 },
  // Usados só dentro dos handlers das ações em massa (AgentBulkActionsBar).
  agentsApi: { refreshData: vi.fn() },
  agentUpdatesApi: { forceAgentCheck: vi.fn() },
}));

// O card de campos customizados tem teste próprio e depende de react-query/API.
vi.mock('@/components/custom-fields/SiteCustomFieldsCard', () => ({
  SiteCustomFieldsCard: () => null,
}));

vi.mock('@/hooks/useClients', () => ({
  useClient: () => ({
    data: { id: 'c1', name: 'Acme', isActive: true, notes: null },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSites', () => ({
  useSite: () => ({
    data: {
      id: 's1',
      clientId: 'c1',
      name: 'Site Matriz',
      isActive: true,
      notes: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useDeleteSite: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useAgents', () => ({
  useAgentsBySite: () => ({
    data: [
      {
        id: 'a1',
        clientId: 'c1',
        siteId: 's1',
        hostname: 'HOST-01',
        displayName: 'HOST-01',
        operatingSystem: 'Windows 11',
        isOnline: true,
        lastSeen: '2026-01-01T00:00:00Z',
        lastSeenAt: '2026-01-01T00:00:00Z',
      },
    ],
    isLoading: false,
  }),
  // Ações em massa da aba Agentes (barra só monta com seleção).
  useRestartAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useShutdownAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWakeOnLan: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useTickets', () => ({
  useTicketsBySite: () => ({
    data: [{ id: 't1', title: 'Chamado Um', priority: 1, category: 'Rede' }],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useLogs', () => ({
  useLogs: () => ({
    data: [{ id: 'l1', level: 1, message: 'Log do site' }],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useSoftwareInventory', () => ({
  useSoftwareInventorySnapshot: () => ({
    data: { totalInstalled: 5, distinctSoftware: 3, distinctAgents: 1 },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useDashboardSummary', () => ({
  useDashboardSummary: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/hooks/useDashboardRealtime', () => ({ useDashboardRealtime: vi.fn() }));
vi.mock('@/hooks/useNowTick', () => ({ useNowTick: () => Date.now() }));
vi.mock('@/hooks/useAgentAlerts', () => ({
  useSendScopeNotification: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSendAgentNotification: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/auth/authorization', () => ({
  useAuthorization: () => ({ hasAnyPermission: () => true }),
}));

vi.mock('@/components/notes/NotesPanel', () => ({ NotesPanel: () => null }));
vi.mock('@/components/entity/SiteFormModal', () => ({ SiteFormModal: () => null }));
vi.mock('@/components/entity/DashboardSummaryCard', () => ({ DashboardSummaryCard: () => null }));
vi.mock('@/components/notifications/NotificationComposerModal', () => ({ default: () => null }));
vi.mock('@/components/agents/TransferBeforeDeleteModal', () => ({ TransferBeforeDeleteModal: () => null }));

import SiteDetail from './SiteDetail';

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/clients/c1/sites/s1${search}`]}>
      <Routes>
        <Route path="/clients/:id/sites/:siteId" element={<SiteDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe('SiteDetail — abas de recursos', () => {
  it('inicia na aba Info e não renderiza as demais', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /Info/ }).getAttribute('aria-selected')).toBe('true');
    // Conteúdo da aba Info: card "Informações" (o resumo e as notas são mockados).
    expect(screen.getByText('Inventário de software')).toBeTruthy();
    expect(screen.queryByText('Chamado Um')).toBeNull();
    expect(screen.queryByText('HOST-01')).toBeNull();
  });

  it('troca para a aba Chamados ao clicar', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Chamados/ }));
    expect(screen.getByText('Chamado Um')).toBeTruthy();
    expect(screen.queryByText('Inventário de software')).toBeNull();
  });

  it('troca para a aba Agentes ao clicar', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Agentes/ }));
    expect(screen.getByText('HOST-01')).toBeTruthy();
    expect(screen.queryByText('Chamado Um')).toBeNull();
  });

  it('abre direto na aba de logs pela querystring', () => {
    renderPage('?tab=logs');
    expect(screen.getByText('Log do site')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Logs/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('cai em Info quando o ?tab= é inválido', () => {
    renderPage('?tab=nao-existe');
    expect(screen.getByText('Inventário de software')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Info/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('usa o StatCard de Logs para trocar de aba', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Logs/ }));
    expect(screen.getByText('Log do site')).toBeTruthy();
  });
});

describe('SiteDetail — ações em massa na aba Agentes', () => {
  it('mostra a barra de ações ao selecionar um agente', () => {
    renderPage('?tab=agentes');
    expect(screen.queryByRole('region', { name: /Ações em massa/ })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar HOST-01' }));

    const bar = screen.getByRole('region', { name: /Ações em massa/ });
    expect(bar.textContent).toContain('1 selecionado(s)');
    // Escopo na barra: o cabeçalho da página também tem um botão "Notificar"
    // (broadcast para o site inteiro).
    expect(within(bar).getByRole('button', { name: /Notificar/ })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: /Desligar/ })).toBeTruthy();
  });
});
