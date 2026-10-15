import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CatalogTab — regressões que a revisão de bugs cobriu:
 *  1. o tipo do catálogo vive na URL (`?tipo=custom`): era estado local e a loja
 *     voltava na listagem Winget depois de salvar um pacote custom;
 *  2. Editar/Excluir saíram da listagem e passaram para o menu de contexto
 *     (botão direito), aparecendo só em pacote custom.
 */

const mocks = vi.hoisted(() => ({
  catalog: {
    data: undefined as unknown,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  catalogCalls: [] as Array<Record<string, unknown>>,
  getSyncStatus: vi.fn(),
}));

vi.mock('@/hooks/useAppStore', () => ({
  useAppStoreCatalog: (params: Record<string, unknown>) => {
    mocks.catalogCalls.push(params);
    return mocks.catalog;
  },
  useAppStorePackage: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCustomPackage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSyncCatalog: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useClients', () => ({ useClients: () => ({ data: [] }) }));
vi.mock('@/hooks/useSites', () => ({ useSites: () => ({ data: [] }) }));
vi.mock('@/api/app-store', () => ({
  appStoreApi: { getSyncStatus: mocks.getSyncStatus },
}));

import { CatalogTab } from './CatalogTab';
import { AppInstallationType } from '@/api/types';

function packageItem(
  packageId: string,
  installationType: AppInstallationType,
  name = packageId,
) {
  return {
    packageId,
    name,
    publisher: null,
    description: null,
    version: '1.0.0',
    architecture: null,
    installationType,
    installCommand: null,
    uninstallCommand: null,
    extractZip: false,
    fileName: null,
    fileSizeBytes: null,
    fileContentType: null,
    fileChecksum: null,
    hasFile: false,
    lastUpdated: null,
    installerUrlsByArch: {},
    icon: null,
    homepage: null,
    license: null,
    category: null,
    tags: null,
  };
}

function renderCatalog(initialEntry: string) {
  const router = createMemoryRouter([{ path: '/software/store', element: <CatalogTab /> }], {
    initialEntries: [initialEntry],
  });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  mocks.catalogCalls.length = 0;
  mocks.getSyncStatus.mockReset();
  mocks.getSyncStatus.mockResolvedValue({ running: false, lastResult: null });
  mocks.catalog.data = {
    installationType: AppInstallationType.Custom,
    items: [packageItem('foxit_editor', AppInstallationType.Custom, 'Foxit Editor')],
    nextCursor: null,
    hasMore: false,
    totalPackagesInSource: 1,
    search: null,
    architecture: null,
  };
});

afterEach(() => cleanup());

describe('CatalogTab — tipo na URL', () => {
  it('abre no tipo do deep link e consulta o catálogo com ele', async () => {
    renderCatalog('/software/store?tipo=custom');

    const select = screen.getByLabelText('Tipo') as HTMLSelectElement;
    expect(select.value).toBe(String(AppInstallationType.Custom));

    await waitFor(() =>
      expect(mocks.catalogCalls.some((p) => p.installationType === AppInstallationType.Custom)).toBe(true),
    );
  });

  it('troca o tipo gravando na URL e preserva os outros params', async () => {
    const router = renderCatalog('/software/store?tipo=custom&outro=1');

    fireEvent.change(screen.getByLabelText('Tipo'), {
      target: { value: String(AppInstallationType.Winget) },
    });

    await waitFor(() => expect(router.state.location.search).toContain('tipo=winget'));
    expect(router.state.location.search).toContain('outro=1');
    // Query reexecuta com o tipo novo (não fica presa no Custom).
    await waitFor(() =>
      expect(mocks.catalogCalls.at(-1)?.installationType).toBe(AppInstallationType.Winget),
    );
  });

  it('sem param cai no padrão Winget', () => {
    renderCatalog('/software/store');

    expect((screen.getByLabelText('Tipo') as HTMLSelectElement).value).toBe(
      String(AppInstallationType.Winget),
    );
  });
});

describe('CatalogTab — editar/excluir no menu de contexto', () => {
  it('não mostra Editar/Excluir na linha e sim no botão direito (custom)', async () => {
    renderCatalog('/software/store?tipo=custom');

    expect(screen.queryByText('Editar')).toBeNull();
    expect(screen.queryByText('Excluir')).toBeNull();

    // firedEvent devolve false quando o handler chamou preventDefault.
    expect(fireEvent.contextMenu(screen.getByText('Foxit Editor'))).toBe(false);

    // O botão "Detalhes" da própria linha também tem esse texto: restringe ao menu.
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Detalhes')).toBeTruthy();
    expect(within(menu).getByText('Editar')).toBeTruthy();
    expect(within(menu).getByText('Excluir')).toBeTruthy();
  });

  it('em pacote Winget não intercepta o botão direito (menu nativo preservado)', async () => {
    mocks.catalog.data = {
      installationType: AppInstallationType.Winget,
      items: [packageItem('Microsoft.VSCode', AppInstallationType.Winget, 'Visual Studio Code')],
      nextCursor: null,
      hasMore: false,
      totalPackagesInSource: 1,
      search: null,
      architecture: null,
    };
    renderCatalog('/software/store?tipo=winget');

    // Sem preventDefault: o navegador segue com o menu nativo.
    expect(fireEvent.contextMenu(screen.getByText('Visual Studio Code'))).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByText('Editar')).toBeNull();
    expect(screen.queryByText('Excluir')).toBeNull();
  });

  it('botão "⋯" abre o mesmo menu (caminho acessível sem botão direito)', async () => {
    renderCatalog('/software/store?tipo=custom');

    const actions = screen.getByLabelText('Mais ações de Foxit Editor');
    fireEvent.mouseDown(actions);
    fireEvent.click(actions);

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Editar')).toBeTruthy();
    expect(within(menu).getByText('Excluir')).toBeTruthy();

    // Segunda ativação fecha (toggle), em vez de reabrir.
    fireEvent.mouseDown(actions);
    fireEvent.click(actions);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('não mostra o botão "⋯" em pacote Winget', () => {
    mocks.catalog.data = {
      installationType: AppInstallationType.Winget,
      items: [packageItem('Microsoft.VSCode', AppInstallationType.Winget, 'Visual Studio Code')],
      nextCursor: null,
      hasMore: false,
      totalPackagesInSource: 1,
      search: null,
      architecture: null,
    };
    renderCatalog('/software/store?tipo=winget');

    expect(screen.queryByLabelText('Mais ações de Visual Studio Code')).toBeNull();
  });
});
