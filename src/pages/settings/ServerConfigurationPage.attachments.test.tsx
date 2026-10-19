import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TicketAttachmentSettings } from "@/api";

const SETTINGS: TicketAttachmentSettings = {
  enabled: true,
  maxFileSizeBytes: 10485760,
  maxLargeFileSizeBytes: 2147483648,
  allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  presignedUploadUrlTtlMinutes: 15,
};

const { mutateAsync, toastError, toastSuccess } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { error: toastError, success: toastSuccess },
}));

vi.mock("@/hooks/useConfigurationApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useConfigurationApi")>();
  return {
    ...actual,
    useTicketAttachmentSettings: () => ({ data: SETTINGS, isLoading: false }),
    useUpdateTicketAttachmentSettings: () => ({
      mutateAsync,
      isPending: false,
    }),
  };
});

import { TicketAttachmentSettingsCard } from "./ServerConfigurationPage";

function renderCard() {
  return render(
    <TicketAttachmentSettingsCard collapsed={false} onToggleCollapse={() => undefined} />,
  );
}

describe("TicketAttachmentSettingsCard", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it("agrupa os presets em Imagens, Office e documentos, Compactados e Outros", () => {
    renderCard();

    for (const title of ["Imagens", "Office e documentos", "Compactados", "Outros"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    // Default compatível: 4 tipos ativos.
    expect(screen.getByText(/Ativos \(4\)/)).toBeTruthy();
  });

  it("limpar um grupo remove só os presets daquele grupo", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Limpar Imagens" }));

    // Sobra apenas application/pdf (fora de Imagens).
    expect(screen.getByText(/Ativos \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Ativos \(1\): application\/pdf/)).toBeTruthy();
  });

  it("selecionar todos de um grupo liga todos os seus presets", () => {
    renderCard();

    fireEvent.click(
      screen.getByRole("button", { name: "Selecionar todos de Compactados" }),
    );

    // 4 default + 7 compactados (ZIP não estava ativo).
    expect(screen.getByText(/Ativos \(11\)/)).toBeTruthy();
  });

  it("mostra o limite de anexos grandes em GB com default 2", () => {
    renderCard();

    const input = screen.getByLabelText("Anexos grandes do chamado (GB)") as HTMLInputElement;
    expect(input.value).toBe("2");
    expect(screen.getByText(/2\.147\.483\.648 bytes/)).toBeTruthy();
  });

  it("rejeita limite de anexos grandes menor que o das conversas", async () => {
    renderCard();

    // Conversas 1024 MB x anexos grandes 0,5 GB (512 MB) => inválido.
    fireEvent.change(screen.getByLabelText("Tamanho máximo por arquivo (MB)"), {
      target: { value: "1024" },
    });
    fireEvent.change(screen.getByLabelText("Anexos grandes do chamado (GB)"), {
      target: { value: "0.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Salvar Configurações de Anexos/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "O limite de anexos grandes do chamado deve ser maior ou igual ao limite das conversas.",
      );
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
