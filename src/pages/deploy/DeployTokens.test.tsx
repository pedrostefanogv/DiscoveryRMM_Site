import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useClientsMock,
  useSitesMock,
  useDeployTokensMock,
  createAndDownloadMutateMock,
  downloadMutateMock,
  revokeMutateMock,
  toastErrorMock,
  toastSuccessMock,
  refetchTokensMock,
} = vi.hoisted(() => ({
  useClientsMock: vi.fn(),
  useSitesMock: vi.fn(),
  useDeployTokensMock: vi.fn(),
  createAndDownloadMutateMock: vi.fn(),
  downloadMutateMock: vi.fn(),
  revokeMutateMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  refetchTokensMock: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock('@/hooks/useClients', () => ({
  useClients: useClientsMock,
}));

vi.mock('@/hooks/useSites', () => ({
  useSites: useSitesMock,
}));

vi.mock('@/hooks/useNowTick', () => ({
  useNowTick: () => Date.parse('2026-11-21T20:00:00Z'),
}));

vi.mock('@/hooks/useDeployTokens', () => ({
  useDeployTokens: useDeployTokensMock,
  useCreateDeployTokenAndDownload: () => ({
    mutate: createAndDownloadMutateMock,
    isPending: false,
  }),
  useDownloadDeployInstaller: () => ({
    mutate: downloadMutateMock,
    isPending: false,
  }),
  useRevokeDeployToken: () => ({
    mutate: revokeMutateMock,
    isPending: false,
  }),
  useCreateDeployToken: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    data: null,
  }),
}));

vi.mock('@/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  agentUpdatesApi: { refreshBuild: vi.fn() },
  deployTokensApi: { probeGenericInstaller: vi.fn() },
}));

vi.mock('@/api/deploy-tokens', () => ({
  genericInstallerUrl: () => '/api/v1/deploy-tokens/generic-installer',
}));

import DeployTokens from './DeployTokens';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderPage(initialPath = '/deploy') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <DeployTokens />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const TOKEN_ACTIVE = {
  id: 't1',
  tokenPrefix: 'dpt_active1',
  description: 'Onboarding Matriz',
  createdAt: '2026-11-21T19:00:00Z',
  expiresAt: '2026-11-22T19:00:00Z',
  isRevoked: false,
  isExpired: false,
  usedCount: 0,
};

const TOKEN_EXPIRED = {
  id: 't2',
  tokenPrefix: 'dpt_expired2',
  description: 'Lote Antigo',
  createdAt: '2026-11-10T10:00:00Z',
  expiresAt: '2026-11-11T10:00:00Z',
  isRevoked: false,
  isExpired: true,
  usedCount: 3,
};

describe('DeployTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useClientsMock.mockReturnValue({
      data: [{ id: 'c1', name: 'TNG Placas', isActive: true }],
      isLoading: false,
    });
    useSitesMock.mockReturnValue({
      data: [{ id: 's1', name: 'Matriz', isActive: true }],
      isLoading: false,
    });
    useDeployTokensMock.mockReturnValue({
      data: [TOKEN_ACTIVE, TOKEN_EXPIRED],
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: refetchTokensMock,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('auto-seleciona cliente e site únicos e carrega tokens automaticamente ao trocar de aba', async () => {
    renderPage();

    await waitFor(() => {
      const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
      expect(search.get('client')).toBe('c1');
      expect(search.get('site')).toBe('s1');
    });

    fireEvent.click(screen.getByRole('tab', { name: /Gerenciar tokens/ }));

    await waitFor(() => {
      expect(useDeployTokensMock).toHaveBeenLastCalledWith(
        { clientId: 'c1', siteId: 's1' },
        { enabled: true },
      );
    });

    expect(screen.getByText('Onboarding Matriz')).toBeTruthy();
    expect(screen.getByText('Lote Antigo')).toBeTruthy();
  });

  it('lê client, site e tab da URL e permite filtrar por KPI clicável', async () => {
    renderPage('/deploy?client=c1&site=s1&tab=manage');

    expect(await screen.findByText('Onboarding Matriz')).toBeTruthy();
    expect(screen.getByText('Lote Antigo')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Expirados/i }));

    expect(screen.queryByText('Onboarding Matriz')).toBeNull();
    expect(screen.getByText('Lote Antigo')).toBeTruthy();
  });

  it('mantém o modal de download por token aberto quando ocorre erro e fecha apenas no sucesso', async () => {
    const { ApiError } = await import('@/api');
    renderPage('/deploy?client=c1&site=s1&tab=manage');

    const downloadButtons = await screen.findAllByRole('button', { name: /Baixar instalador mínimo/i });
    fireEvent.click(downloadButtons[0]);

    const tokenInput = screen.getByLabelText('Token');
    fireEvent.change(tokenInput, { target: { value: 'raw-secret-token' } });

    downloadMutateMock.mockImplementationOnce((_vars: unknown, callbacks: { onError?: (err: unknown) => void; onSettled?: () => void }) => {
      callbacks.onError?.(new ApiError(401, 'Token inválido'));
      callbacks.onSettled?.();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }));

    expect(toastErrorMock).toHaveBeenCalledWith('Token inválido, expirado, revogado ou sem usos disponíveis.');
    // Modal continua aberto para correção do token
    expect(screen.getByLabelText('Token')).toBeTruthy();

    const revokeUrlMock = vi.fn();
    const createObjectUrlMock = vi.fn(() => 'blob:mock');
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectUrlMock, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeUrlMock, configurable: true });

    downloadMutateMock.mockImplementationOnce((_vars: unknown, callbacks: { onSuccess?: (res: { fileName: string; blob: Blob }) => void; onSettled?: () => void }) => {
      callbacks.onSuccess?.({ fileName: 'agent.exe', blob: new Blob(['exe']) });
      callbacks.onSettled?.();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('Token')).toBeNull();
    });
    expect(toastSuccessMock).toHaveBeenCalledWith('Download iniciado com sucesso.');
  });

  it('bloqueia criação e download quando expiresInHours é menor ou igual a zero', async () => {
    renderPage('/deploy?client=c1&site=s1');

    const hoursInput = screen.getByLabelText('Expira em (horas)');
    fireEvent.change(hoursInput, { target: { value: '0' } });

    fireEvent.click(screen.getByRole('button', { name: /Baixar instalador mínimo/i }));

    expect(toastErrorMock).toHaveBeenCalledWith('Informe uma validade entre 1 e 8760 horas.');
    expect(createAndDownloadMutateMock).not.toHaveBeenCalled();
  });
});
