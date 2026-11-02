import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Geração automática do "ID do pacote" a partir do Título no cadastro de
 * pacotes custom: o ID acompanha o Título (slug seguro) até a primeira edição
 * manual; salvo, o campo fica travado (disabled no modo edição).
 */

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleteFile: vi.fn(),
  deleteIcon: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/api/app-store", () => ({
  ASSET_MULTIPART_MIN_BYTES: 10 * 1024 * 1024,
  appStoreApi: { uploadCustomAsset: vi.fn() },
  discardUnlinkedAsset: vi.fn(),
  forgetUploadedAsset: vi.fn(),
}));

vi.mock("@/hooks/useAppStore", () => ({
  // Sem packageId (rota /new) não há pacote carregado: o formulário começa vazio.
  useAppStorePackage: (packageId?: string) => ({
    data: packageId
      ? {
          packageId,
          name: "Setup ZIP",
          version: "1.0.0",
          publisher: "Discovery",
          description: "",
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
          fileName: null,
          fileSizeBytes: null,
          fileContentType: null,
          fileChecksum: null,
        }
      : undefined,
    isLoading: false,
    isError: false,
    refetch: mocks.refetch,
  }),
  useUpsertCustomPackage: () => ({ mutateAsync: mocks.upsert, isPending: false }),
  useDeleteCustomPackageFile: () => ({ mutateAsync: mocks.deleteFile, isPending: false }),
  useDeleteCustomPackageIcon: () => ({ mutateAsync: mocks.deleteIcon, isPending: false }),
}));

vi.mock("./components/MarkdownField", () => ({ MarkdownField: () => null }));
vi.mock("./components/SoftwareInventoryPicker", () => ({
  SoftwareInventoryPicker: () => null,
}));

vi.mock("react-hot-toast", () => {
  const toast = vi.fn();
  return { default: Object.assign(toast, { success: vi.fn(), error: vi.fn() }) };
});

import CustomPackageEditorPage from "./CustomPackageEditorPage";

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/software/store/custom/new", element: <CustomPackageEditorPage /> },
      { path: "/software/store/custom/:packageId/edit", element: <CustomPackageEditorPage /> },
      { path: "/software/store", element: <div>loja</div> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ID do pacote automático no cadastro custom", () => {
  it("gera o slug a partir do título e respeita a edição manual", () => {
    renderAt("/software/store/custom/new");

    const title = screen.getByLabelText("Título");
    const id = screen.getByLabelText("ID do pacote") as HTMLInputElement;

    // Digitar o título preenche o ID na hora, já no formato seguro.
    fireEvent.change(title, { target: { value: "Foxit PDF Editor" } });
    expect(id.value).toBe("foxit-pdf-editor");

    // Edição manual interrompe o acompanhamento do título.
    fireEvent.change(id, { target: { value: "meu-id-custom" } });
    fireEvent.change(title, { target: { value: "Outro Produto" } });
    expect(id.value).toBe("meu-id-custom");
  });

  it("normaliza o ID digitado à mão ao sair do campo", () => {
    renderAt("/software/store/custom/new");

    const id = screen.getByLabelText("ID do pacote") as HTMLInputElement;
    fireEvent.change(id, { target: { value: "Meu App 2.0!" } });
    fireEvent.blur(id);
    expect(id.value).toBe("meu-app-2.0");
  });

  it("não gera ID automático no modo edição (campo travado)", () => {
    renderAt("/software/store/custom/setup-zip/edit");

    const id = screen.getByLabelText("ID do pacote") as HTMLInputElement;
    expect(id.disabled).toBe(true);
    expect(id.value).toBe("setup-zip");

    const title = screen.getByLabelText("Título");
    fireEvent.change(title, { target: { value: "Nome Novo" } });
    expect(id.value).toBe("setup-zip");
  });
});
