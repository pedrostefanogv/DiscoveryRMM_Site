import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * ClientDetail: os cards de Sites, Chamados, Logs e Agentes viraram abas no
 * estilo de Departamentos. Aqui garantimos a aba inicial, a troca por clique,
 * o deep-link por ?tab= e a coexistência com ?window=.
 */

vi.mock('@/api', () => ({
  // Enums de valor consumidos por @/utils/labels e pelos handlers de notificação.
  LogLevel: { Trace: 0, Debug: 1, Info: 2, Warn: 3, Warning: 3, Error: 4, Fatal: 5, Critical: 5 },
  AlertScopeType: { Agent: 0, Site: 1, Client: 2, Label: 3 },
}));

vi.mock('@/hooks/useClients', () => ({
  useClient: () => ({
    data: {
      id: 'c1',
      name: 'Acme',
      isActive: true,
      notes: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useDeleteClient: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useSites', () => ({
  useSites: () => ({
    data: [{ id: 's1', name: 'Site Matriz', isActive: true, notes: null }],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useAgents', () => ({
  useAgentsByClient: () => ({
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
}));

vi.mock('@/hooks/useTickets', () => ({
  useTicketsByClient: () => ({
    data: [{ id: 't1', title: 'Chamado Um', priority: 1, category: 'Rede' }],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useLogs', () => ({
  useLogs: () => ({
    data: [{ id: 'l1', level: 1, message: 'Log do cliente' }],
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
}));
vi.mock('@/auth/authorization', () => ({
  useAuthorization: () => ({ hasAnyPermission: () => true }),
}));

vi.mock('@/components/notes/NotesPanel', () => ({ NotesPanel: () => null }));
vi.mock('@/components/entity/ClientFormModal', () => ({ ClientFormModal: () => null }));
vi.mock('@/components/entity/SiteFormModal', () => ({ SiteFormModal: () => null }));
vi.mock('@/components/entity/CreateDeployTokenModal', () => ({ CreateDeployTokenModal: () => null }));
vi.mock('@/components/entity/DashboardSummaryCard', () => ({ DashboardSummaryCard: () => null }));
vi.mock('@/components/notifications/NotificationComposerModal', () => ({ default: () => null }));
vi.mock('@/components/agents/TransferBeforeDeleteModal', () => ({ TransferBeforeDeleteModal: () => null }));

import ClientDetail from './ClientDetail';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/clients/c1${search}`]}>
      <Routes>
        <Route
          path="/clients/:id"
          element={
            <>
              <ClientDetail />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe('ClientDetail — abas de recursos', () => {
  it('inicia na aba Sites e não renderiza agentes', () => {
    renderPage();
    expect(screen.getByText('Site Matriz')).toBeTruthy();
    expect(screen.queryByText('HOST-01')).toBeNull();
    expect(screen.getByRole('tab', { name: /Sites/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('troca para a aba Agentes ao clicar', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Agentes/ }));
    expect(screen.getByText('HOST-01')).toBeTruthy();
    expect(screen.queryByText('Site Matriz')).toBeNull();
  });

  it('mostra os logs ao selecionar a aba Logs', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Logs/ }));
    expect(screen.getByText('Log do cliente')).toBeTruthy();
    expect(screen.queryByText('Site Matriz')).toBeNull();
  });

  it('abre direto na aba informada pela querystring', () => {
    renderPage('?tab=agentes');
    expect(screen.getByText('HOST-01')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Agentes/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('Site Matriz')).toBeNull();
  });

  it('cai em Sites quando o ?tab= é inválido', () => {
    renderPage('?tab=nao-existe');
    expect(screen.getByText('Site Matriz')).toBeTruthy();
  });

  it('usa o StatCard para trocar de aba', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Agentes/ }));
    expect(screen.getByText('HOST-01')).toBeTruthy();
  });

  it('preserva ?window= ao trocar de aba', () => {
    renderPage('?window=7d');
    fireEvent.click(screen.getByRole('tab', { name: /Chamados/ }));
    const location = screen.getByTestId('location').textContent ?? '';
    expect(location).toContain('window=7d');
    expect(location).toContain('tab=chamados');
  });
});
