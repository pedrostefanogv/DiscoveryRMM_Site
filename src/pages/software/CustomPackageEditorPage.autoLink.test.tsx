import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vínculo automático do instalador/ícone ao pacote custom.
 *
 * O envio termina e o vínculo é gravado NA HORA (mesma gravação do "Salvar"),
 * sem exigir o clique — e sem sair da tela, porque o operador ainda pode enviar
 * o ícone, marcar "é um ZIP" ou ajustar metadados (o Salvar segue disponível).
 */

const mocks = vi.hoisted(() => ({
  uploadCustomAsset: vi.fn(),
  discardUnlinkedAsset: vi.fn(),
  forgetUploadedAsset: vi.fn(),
  upsert: vi.fn(),
  refetch: vi.fn(),
  deleteFile: vi.fn(),
  deleteIcon: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  // Pacote carregado que o hook mockado devolve (mutável por teste).
  loadedPackage: {
    packageId: "setup-zip",
    name: "Setup ZIP",
    version: "1.0.0",
    publisher: "Discovery",
    description: "Pacote de teste",
    icon: "",
    installCommand: "setup.exe /silent",
    installCommandKind: 0,
    uninstallCommand: "",
    uninstallCommandKind: 0,
    extractZip: false,
    detectionMode: 0,
    inventorySoftwareId: "",
    detectionName: "",
    detectionPublisher: "",
    detectionMinVersion: "",
    detectionCommand: "",
    fileName: null as string | null,
    fileSizeBytes: null as number | null,
    fileContentType: null as string | null,
    fileChecksum: null as string | null,
  } as Record<string, unknown>,
}));

vi.mock("@/api/app-store", () => ({
  ASSET_MULTIPART_MIN_BYTES: 10 * 1024 * 1024,
  appStoreApi: { uploadCustomAsset: mocks.uploadCustomAsset },
  discardUnlinkedAsset: mocks.discardUnlinkedAsset,
  forgetUploadedAsset: mocks.forgetUploadedAsset,
}));

vi.mock("@/hooks/useAppStore", () => ({
  useAppStorePackage: () => ({
    data: mocks.loadedPackage,
    isLoading: false,
    isError: false,
    refetch: mocks.refetch,
  }),
  useUpsertCustomPackage: () => ({ mutateAsync: mocks.upsert, isPending: false }),
  useDeleteCustomPackageFile: () => ({ mutateAsync: mocks.deleteFile, isPending: false }),
  useDeleteCustomPackageIcon: () => ({ mutateAsync: mocks.deleteIcon, isPending: false }),
}));

// O editor de Markdown e o seletor de inventário não fazem parte do fluxo testado.
vi.mock("./components/MarkdownField", () => ({ MarkdownField: () => null }));
vi.mock("./components/SoftwareInventoryPicker", () => ({
  SoftwareInventoryPicker: () => null,
}));

vi.mock("react-hot-toast", () => {
  const toast = vi.fn();
  return {
    default: Object.assign(toast, {
      success: mocks.toastSuccess,
      error: mocks.toastError,
    }),
  };
});

import CustomPackageEditorPage from "./CustomPackageEditorPage";

const installerAsset = {
  objectKey: "app-store/custom/installers/setup/Setup.zip",
  bucket: "discovery-files",
  fileName: "Setup.zip",
  sizeBytes: 2_145_443_974,
  contentType: "application/x-zip-compressed",
  checksum: "7a9a6c447e321a5d8",
};

const iconAsset = {
  objectKey: "app-store/custom/icons/setup/logo.png",
  bucket: "discovery-files",
  fileName: "logo.png",
  sizeBytes: 2048,
  contentType: "image/png",
  checksum: "hash-do-icone",
};

function renderEditor() {
  const router = createMemoryRouter(
    [
      { path: "/software/store/custom/:packageId/edit", element: <CustomPackageEditorPage /> },
      // Destino do "Cancelar" — a rota precisa existir para o router não reclamar.
      { path: "/software/store", element: <div>loja</div> },
    ],
    { initialEntries: ["/software/store/custom/setup-zip/edit"] },
  );

  render(<RouterProvider router={router} />);
  return router;
}

/**
 * Ordem dos inputs de arquivo na página: o Ícone/capa fica no card unificado do
 * topo (coluna direita) e o Instalador vem no card seguinte.
 */
const FILE_INPUT_INDEX = { icon: 0, installer: 1 } as const;

function fileInput(kind: keyof typeof FILE_INPUT_INDEX): HTMLInputElement {
  const input = document.querySelectorAll('input[type="file"]')[FILE_INPUT_INDEX[kind]];
  if (!input) throw new Error(`input de arquivo de ${kind} não encontrado`);
  return input as HTMLInputElement;
}

function choose(kind: keyof typeof FILE_INPUT_INDEX, name: string, type: string) {
  fireEvent.change(fileInput(kind), { target: { files: [new File(["conteudo"], name, { type })] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom não (sempre) implementa a pré-visualização do ícone.
  URL.createObjectURL = vi.fn(() => "blob:preview") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  mocks.loadedPackage.name = "Setup ZIP";
  mocks.loadedPackage.icon = "";
  // Comando único por padrão: os testes de script sobrescrevem estes dois.
  mocks.loadedPackage.installCommand = "setup.exe /silent";
  mocks.loadedPackage.installCommandKind = 0;
  // O mesmo mock serve os dois inputs: ícone e instalador.
  mocks.uploadCustomAsset.mockImplementation(async (_file: File, kind: string) =>
    kind === "icon" ? iconAsset : installerAsset,
  );
  mocks.upsert.mockResolvedValue({});
  mocks.deleteFile.mockResolvedValue(true);
  mocks.deleteIcon.mockResolvedValue(true);
  mocks.refetch.mockImplementation(async () => ({ data: mocks.loadedPackage }));
});

describe("editor de pacote custom — vínculo automático pós-upload", () => {
  it("vincula o instalador ao pacote quando o envio termina, sem sair da tela", async () => {
    const router = renderEditor();

    choose("installer", "Setup.zip", "application/zip");

    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));

    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({
      packageId: "setup-zip",
      name: "Setup ZIP",
      fileObjectKey: installerAsset.objectKey,
      fileBucket: installerAsset.bucket,
      fileName: installerAsset.fileName,
      fileSizeBytes: installerAsset.sizeBytes,
      fileChecksum: installerAsset.checksum,
    });

    // Vinculado = o estado de upload deixa de existir (não pode mais ser
    // descartado como órfão no storage).
    expect(mocks.forgetUploadedAsset).toHaveBeenCalledWith(expect.any(File), "installer");

    // O operador CONTINUA na tela de edição (o Salvar segue para o resto).
    expect(router.state.location.pathname).toBe("/software/store/custom/setup-zip/edit");

    // O card só volta ao normal depois de recarregar o pacote e limpar o estado.
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Arquivo vinculado ao pacote automaticamente."),
    );
    expect(screen.queryByText("será vinculado ao salvar")).toBeNull();
    expect(screen.queryByText("Remover seleção")).toBeNull();
  });

  it("mantém a pré-visualização do ícone vinculado (URL derivada pela API)", async () => {
    // A API deriva /custom/{id}/icon quando o ícone vai para o object storage.
    mocks.refetch.mockImplementation(async () => {
      mocks.loadedPackage.icon = "/api/v1/app-store/custom/setup-zip/icon";
      return { data: mocks.loadedPackage };
    });
    mocks.uploadCustomAsset.mockResolvedValue(iconAsset);

    renderEditor();
    choose("icon", "logo.png", "image/png");

    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({
      iconObjectKey: iconAsset.objectKey,
      iconUrl: null,
    });

    await waitFor(() => {
      const preview = screen.getByAltText("Pré-visualização do ícone") as HTMLImageElement;
      expect(preview.getAttribute("src")).toBe("/api/v1/app-store/custom/setup-zip/icon");
    });
  });

  it("Cancelar após o vínculo automático oferece excluir o arquivo (pacote + object storage)", async () => {
    const router = renderEditor();

    choose("installer", "Setup.zip", "application/zip");
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Arquivo vinculado ao pacote automaticamente."),
    );

    // "Cancelar" não sai calado: o vínculo já está gravado, então ele pergunta.
    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" })[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Excluir e sair" })).toBeTruthy());

    expect(mocks.deleteFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Excluir e sair" }));

    // Exclusão = mesmo endpoint do "Excluir instalador" (limpa o vínculo e apaga
    // o objeto no object storage, no servidor) e só então sai da tela.
    await waitFor(() => expect(mocks.deleteFile).toHaveBeenCalledWith("setup-zip"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/software/store"));
  });

  it("Cancelar sem vínculo nesta sessão sai direto, sem diálogo nem exclusão", async () => {
    const router = renderEditor();

    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" })[0]);

    await waitFor(() => expect(router.state.location.pathname).toBe("/software/store"));
    expect(mocks.deleteFile).not.toHaveBeenCalled();
    expect(screen.queryByText(/vinculado ao pacote automaticamente/)).toBeNull();
  });

  it("Excluir ícone apaga o ícone publicado do pacote e do object storage", async () => {
    mocks.loadedPackage.icon = "/api/v1/app-store/custom/setup-zip/icon";
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Excluir ícone" }));
    // O diálogo de confirmação acrescenta um segundo botão com o mesmo rótulo.
    const confirmButtons = await screen.findAllByRole("button", { name: "Excluir ícone" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(mocks.deleteIcon).toHaveBeenCalledWith("setup-zip"));
    // O instalador NÃO é tocado por essa ação.
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it("Cancelar com instalador E ícone enviados oferece excluir os dois", async () => {
    const router = renderEditor();

    choose("installer", "Setup.zip", "application/zip");
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    choose("icon", "logo.png", "image/png");
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" })[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Excluir e sair" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Excluir e sair" }));

    await waitFor(() => expect(mocks.deleteFile).toHaveBeenCalledWith("setup-zip"));
    await waitFor(() => expect(mocks.deleteIcon).toHaveBeenCalledWith("setup-zip"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/software/store"));
  });

  it("não grava nada quando o pacote tem campo pendente — o Salvar resolve depois", async () => {
    // O formulário é preenchido a partir do pacote carregado; sem título ele não
    // valida e a gravação automática não pode acontecer.
    mocks.loadedPackage.name = "";

    renderEditor();
    choose("installer", "Setup.zip", "application/zip");

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("campos a corrigir"));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("bloqueia o salvamento quando o script PowerShell tem erro de sintaxe", async () => {
    mocks.loadedPackage.installCommandKind = 2; // AppCommandKind.PowerShellScript
    mocks.loadedPackage.installCommand = "Write-Output 'ok'";
    renderEditor();

    // Chave aberta e não fechada: o texto iria inteiro para o agent.
    const editor = screen.getByLabelText("Script de instalação");
    fireEvent.change(editor, { target: { value: "if ($true) {\n  Write-Output 'quebrado'" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(screen.getByText(/Erro de sintaxe na linha/)).toBeTruthy());
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("aceita script PowerShell longo (mais de 9 mil caracteres)", async () => {
    mocks.loadedPackage.installCommandKind = 2; // AppCommandKind.PowerShellScript
    mocks.loadedPackage.installCommand = "Write-Output 'ok'";
    renderEditor();

    // Sem newline no fim: o editor salva com trim(), então o tamanho bate exato.
    const longScript = Array.from({ length: 600 }, (_, index) => '# linha de teste ' + index).join('\n');
    const editor = screen.getByLabelText("Script de instalação");
    fireEvent.change(editor, { target: { value: longScript } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    expect(mocks.upsert.mock.calls[0][0].installCommand).toHaveLength(longScript.length);
  });
});
