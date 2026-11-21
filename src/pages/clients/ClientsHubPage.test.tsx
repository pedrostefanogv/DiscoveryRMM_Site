import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientsHubPage from './ClientsHubPage';

const mocks = vi.hoisted(() => ({
  clients: [
    { id: 'c1', name: 'Cliente Alpha', isActive: true, notes: 'Principal' },
    { id: 'c2', name: 'Cliente Beta', isActive: false, notes: 'Legado' },
  ],
  sites: [
    {
      id: 's1',
      clientId: 'c1',
      name: 'Matriz',
      isActive: true,
      agentCount: 12,
      agentOnlineCount: 9,
      updatedAt: '2026-11-20T10:00:00Z',
    },
    {
      id: 's2',
      clientId: 'c1',
      name: 'Filial',
      isActive: true,
      agentCount: 4,
      agentOnlineCount: 4,
      updatedAt: '2026-11-20T10:00:00Z',
    },
    {
      id: 's3',
      clientId: 'c2',
      name: 'Antiga',
      isActive: false,
      agentCount: 0,
      agentOnlineCount: 0,
      updatedAt: '2026-11-19T10:00:00Z',
    },
  ],
  refetchClients: vi.fn(),
  refetchSites: vi.fn(),
}));

vi.mock('@/auth/authorization', () => ({
  useAuthorization: () => ({
    hasAnyPermission: () => true,
  }),
}));

vi.mock('@/hooks/useClients', () => ({
  useClients: () => ({
    data: mocks.clients,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: mocks.refetchClients,
  }),
}));

vi.mock('@/hooks/useSites', () => ({
  useAllSites: () => ({
    data: mocks.sites,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: mocks.refetchSites,
  }),
  useDeleteSite: () => ({ mutate: vi.fn(), isPending: false }),
  useRestartSite: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useShutdownSite: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWakeOnLanSite: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useAgents', () => ({
  useAgentsBySite: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/components/entity/ClientFormModal', () => ({
  ClientFormModal: () => null,
}));

vi.mock('@/components/entity/SiteFormModal', () => ({
  SiteFormModal: () => null,
}));

function renderHub(initialTab: 'clients' | 'sites' = 'clients') {
  return render(
    <MemoryRouter initialEntries={[initialTab === 'clients' ? '/clients' : '/sites']}>
      <ClientsHubPage initialTab={initialTab} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('ClientsHubPage', () => {
  it('renderiza as abas Clientes e Sites e alterna entre elas', () => {
    renderHub('clients');

    const clientsTab = screen.getByRole('tab', { name: /Clientes/ });
    const sitesTab = screen.getByRole('tab', { name: /Sites/ });

    expect(clientsTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Cliente Alpha')).toBeTruthy();

    fireEvent.click(sitesTab);
    expect(sitesTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Matriz')).toBeTruthy();
    expect(screen.getByText('Filial')).toBeTruthy();
  });

  it('deriva contagens de sites e agentes a partir de useAllSites(true) sem fan-out', () => {
    renderHub('clients');

    // Cliente Alpha: 2 sites e 16 agentes (13 online).
    expect(screen.getByTitle('Ver sites de Cliente Alpha').textContent).toBe('2');
    expect(screen.getByText('16 agentes')).toBeTruthy();
    expect(screen.getByText('13 online')).toBeTruthy();
  });

  it('filtra clientes ativos/inativos ao clicar nos StatCards', () => {
    renderHub('clients');

    // Por padrão mostra apenas ativos (Cliente Beta é inativo).
    expect(screen.getByText('Cliente Alpha')).toBeTruthy();
    expect(screen.queryByText('Cliente Beta')).toBeNull();

    fireEvent.click(screen.getByText('Clientes inativos'));
    expect(screen.getByText('Cliente Beta')).toBeTruthy();
    expect(screen.queryByText('Cliente Alpha')).toBeNull();

    fireEvent.click(screen.getByText('Total de clientes'));
    expect(screen.getByText('Cliente Alpha')).toBeTruthy();
    expect(screen.getByText('Cliente Beta')).toBeTruthy();
  });
});
