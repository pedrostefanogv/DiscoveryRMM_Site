import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { AgentAppInstallModal } from './AgentAppInstallModal';
import { ApiError, agentsApi } from '@/api';
import { useAppStoreCatalog } from '@/hooks/useAppStore';
import {
  AppInstallationType,
  type AgentSoftwareInventoryItem,
  type AppStoreCatalogPage,
  type AppStoreCatalogPackage,
} from '@/api/types';

vi.mock('@/api', () => ({
  ApiError: class ApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
  agentsApi: {
    getSoftware: vi.fn(),
    installSoftware: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/useAppStore', () => ({
  useAppStoreCatalog: vi.fn(),
}));

const softwareMock = vi.mocked(agentsApi.getSoftware);
const installMock = vi.mocked(agentsApi.installSoftware);
const catalogMock = vi.mocked(useAppStoreCatalog);
const toastSuccess = vi.mocked(toast.success);
const toastError = vi.mocked(toast.error);

type CatalogQuery = ReturnType<typeof useAppStoreCatalog>;

function catalogResult(overrides: Record<string, unknown> = {}): CatalogQuery {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as CatalogQuery;
}

function catalogPage(items: AppStoreCatalogPackage[]) {
  return {
    items,
    count: items.length,
    cursor: null,
    nextCursor: null,
    hasMore: false,
  } as unknown as AppStoreCatalogPage;
}

function pkg(overrides: Partial<AppStoreCatalogPackage> = {}): AppStoreCatalogPackage {
  return {
    packageId: 'Git.Git',
    name: 'Git',
    publisher: 'Git Project',
    description: null,
    version: '2.47.0',
    architecture: null,
    installationType: AppInstallationType.Winget,
    ...overrides,
  };
}

function inventoryItem(overrides: Partial<AgentSoftwareInventoryItem> = {}) {
  return {
    inventoryId: 'inv-1',
    agentId: 'a1',
    softwareId: 'sw-1',
    name: 'Git',
    version: '2.47.0',
    publisher: 'Git Project',
    installId: 'Git.Git',
    ...overrides,
  } as unknown as AgentSoftwareInventoryItem;
}

function softwarePage(items: AgentSoftwareInventoryItem[]) {
  return {
    items,
    count: items.length,
    cursor: null,
    nextCursor: null,
    hasMore: false,
  } as unknown as Awaited<ReturnType<typeof agentsApi.getSoftware>>;
}

// Catálogo devolvido pelo mock quando a busca tem 2+ caracteres.
let currentCatalog: AppStoreCatalogPackage[] | null = null;

function renderModal() {
  const onClose = vi.fn();
  const onInstalled = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AgentAppInstallModal agentId="a1" open onClose={onClose} onInstalled={onInstalled} />
    </QueryClientProvider>,
  );
  return { onClose, onInstalled };
}

async function searchAndPick(catalog: AppStoreCatalogPackage[], pickName: string) {
  currentCatalog = catalog;
  fireEvent.change(screen.getByPlaceholderText('Ex.: Firefox, 7-Zip, VLC'), {
    target: { value: 'git' },
  });
  fireEvent.click(await screen.findByText(pickName, { selector: 'span span' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentCatalog = null;
  softwareMock.mockResolvedValue(softwarePage([]));
  installMock.mockResolvedValue({ success: true, dispatched: true });
  catalogMock.mockImplementation((params) =>
    catalogResult(
      (params?.search ?? '').trim().length >= 2 && currentCatalog
        ? { data: catalogPage(currentCatalog) }
        : {},
    ),
  );
});

describe('AgentAppInstallModal', () => {
  it('renderiza o modal aberto com formulário e rodapé', () => {
    renderModal();

    expect(screen.getByRole('dialog', { name: 'Instalar aplicativo' })).toBeTruthy();
    expect(screen.getByText('Digite ao menos 2 caracteres para buscar na loja.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    // Sem pacote selecionado o botão principal fica desabilitado.
    expect((screen.getByRole('button', { name: 'Instalar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('não consulta a loja com menos de 2 caracteres', async () => {
    renderModal();

    expect(catalogMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: '', limit: 25 }),
      { enabled: false },
    );

    fireEvent.change(screen.getByPlaceholderText('Ex.: Firefox, 7-Zip, VLC'), {
      target: { value: 'g' },
    });
    await waitFor(() =>
      expect(catalogMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'g', limit: 25 }),
        { enabled: false },
      ),
    );
    expect(screen.getByText('Digite ao menos 2 caracteres para buscar na loja.')).toBeTruthy();
  });

  it('marca apps já instalados e impede nova seleção', async () => {
    softwareMock.mockResolvedValue(
      softwarePage([inventoryItem({ name: 'Git', publisher: 'Git Project', installId: 'Git.Git' })]),
    );
    // Catálogo com Git (já instalado no inventário) e VLC (disponível para instalação).
    currentCatalog = [pkg(), pkg({ packageId: 'VLC.VLC', name: 'VLC', publisher: 'VideoLAN' })];
    renderModal();

    fireEvent.change(screen.getByPlaceholderText('Ex.: Firefox, 7-Zip, VLC'), {
      target: { value: 'git' },
    });
    await screen.findByText('VLC');

    expect(screen.getByText('Já instalado')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Git\.Git/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Selecionado:/)).toBeNull();

    // Clicar no pacote já instalado não seleciona nada.
    fireEvent.click(screen.getByRole('button', { name: /Git\.Git/ }));
    expect(screen.queryByText(/Selecionado:/)).toBeNull();

    // O pacote disponível continua selecionável.
    fireEvent.click(screen.getByRole('button', { name: /VLC\.VLC/ }));
    expect(screen.getByText(/Selecionado:/).textContent).toContain('VLC.VLC');
  });

  it('em 409 pede confirmação e reenvia com confirmUnapproved', async () => {
    installMock.mockReset();
    installMock
      .mockRejectedValueOnce(new ApiError(409, 'Pacote não aprovado na loja.'))
      .mockResolvedValueOnce({ success: true, dispatched: true });
    renderModal();

    await searchAndPick([pkg()], 'Git');
    fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));

    await screen.findByText(/não está aprovado na política da loja/);
    // O 409 não é um erro para o operador: é um pedido de confirmação.
    expect(toastError).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Instalar mesmo assim' }));
    await waitFor(() => expect(installMock).toHaveBeenCalledTimes(2));
    expect(installMock).toHaveBeenLastCalledWith('a1', {
      packageId: 'Git.Git',
      installationType: AppInstallationType.Winget,
      confirmUnapproved: true,
    });
    expect(toastSuccess).toHaveBeenCalledWith('Instalação de "Git" enviada ao agente.');
  });

  it('envia a instalação com sucesso e fecha o modal', async () => {
    const { onClose, onInstalled } = renderModal();

    await searchAndPick([pkg()], 'Git');
    fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));

    await waitFor(() => expect(installMock).toHaveBeenCalledTimes(1));
    expect(installMock).toHaveBeenCalledWith('a1', {
      packageId: 'Git.Git',
      installationType: AppInstallationType.Winget,
    });
    expect(toastSuccess).toHaveBeenCalledWith('Instalação de "Git" enviada ao agente.');
    expect(toastError).not.toHaveBeenCalled();
    expect(onInstalled).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mostra o ícone do app em cada resultado da loja', async () => {
    currentCatalog = [
      pkg({ packageId: '7zip.7zip', name: '7-Zip', icon: 'https://cdn.example.com/7zip.png' }),
      pkg({ packageId: 'NanaZip.NanaZip', name: 'NanaZip', icon: 'https://cdn.example.com/nanazip.png' }),
    ];
    renderModal();

    fireEvent.change(screen.getByPlaceholderText('Ex.: Firefox, 7-Zip, VLC'), {
      target: { value: '7zip' },
    });
    const sevenZipButton = await screen.findByRole('button', { name: /7zip\.7zip/ });

    // A loja devolve o ícone: a linha renderiza a imagem correspondente.
    const img = sevenZipButton.querySelector('img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/7zip.png');
    // Decorativo: o nome acessível do botão vem do texto, não da imagem.
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('loading')).toBe('lazy');

    const nanaZipButton = screen.getByRole('button', { name: /NanaZip\.NanaZip/ });
    expect(nanaZipButton.querySelector('img')).toBeTruthy();
  });

  it('sem ícone na loja cai nas iniciais do app', async () => {
    currentCatalog = [pkg({ packageId: '7zip.7zip', name: '7-Zip' })];
    renderModal();

    fireEvent.change(screen.getByPlaceholderText('Ex.: Firefox, 7-Zip, VLC'), {
      target: { value: '7zip' },
    });
    const button = await screen.findByRole('button', { name: /7zip\.7zip/ });

    expect(button.querySelector('img')).toBeNull();
    expect(button.textContent).toContain('7Z');
  });

  it('usa as iniciais quando a imagem do ícone falha ao carregar', async () => {
    currentCatalog = [
      pkg({ packageId: '7zip.7zip', name: '7-Zip', icon: 'https://cdn.example.com/quebrado.png' }),
    ];
    renderModal();

    fireEvent.change(screen.getByPlaceholderText('Ex.: Firefox, 7-Zip, VLC'), {
      target: { value: '7zip' },
    });
    const button = await screen.findByRole('button', { name: /7zip\.7zip/ });
    const img = button.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();

    // Erro de carregamento troca a imagem pelas iniciais (sem espaço vazio).
    fireEvent.error(img);
    await waitFor(() => expect(button.querySelector('img')).toBeNull());
    expect(button.textContent).toContain('7Z');
  });
});
