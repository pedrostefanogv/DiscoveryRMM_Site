import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfigurationFieldEditor } from "./ConfigurationFieldEditor";

// Variante "plain" (usada no card de Armazenamento S3/MinIO): vários campos
// agrupados dentro de um painel, sem um mini-card por campo.
const baseProps = {
  inherited: false,
  effectiveValue: null,
  origin: "Server" as const,
  disableInheritance: true,
  hideSaveButton: true,
  variant: "plain" as const,
  onValueChange: vi.fn(),
  onToggleInherit: vi.fn(),
  onSavePatch: vi.fn(),
};

describe("ConfigurationFieldEditor - variante plain", () => {
  it("usa o rótulo do campo como label do controle, sem repetir 'Valor local'", () => {
    const { container } = render(
      <ConfigurationFieldEditor
        {...baseProps}
        fieldLabel="Endpoint S3"
        fieldKey="objectStorageEndpoint"
        fieldKind="string"
        value=""
        description="URL base do servidor S3-compatível."
      />,
    );

    expect(screen.getByText("Endpoint S3")).toBeTruthy();
    expect(screen.getByText("URL base do servidor S3-compatível.")).toBeTruthy();
    expect(screen.queryByText("Valor local")).toBeNull();
    expect(screen.getByRole("textbox")).toBeTruthy();

    // Sem o mini-card do campo (borda/fundo próprios) — o painel do grupo é que
    // desenha a caixa.
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain("border-border");
    expect(root.className).not.toContain("bg-surface-light");
  });

  it("não renderiza ações de salvar quando hideSaveButton está ativo", () => {
    render(
      <ConfigurationFieldEditor
        {...baseProps}
        fieldLabel="Bucket"
        fieldKey="objectStorageBucketName"
        fieldKind="string"
        value=""
      />,
    );

    expect(screen.queryByText("Salvar")).toBeNull();
    expect(screen.queryByText("Comparar")).toBeNull();
  });

  it("exibe a unidade no rótulo do campo (campo numérico)", () => {
    render(
      <ConfigurationFieldEditor
        {...baseProps}
        fieldLabel="TTL de URLs Assinadas"
        fieldKey="objectStorageUrlTtlHours"
        fieldKind="number"
        value="4"
        unit="horas"
      />,
    );

    expect(screen.getByText(/TTL de URLs Assinadas/).textContent).toContain("(horas)");
    expect(screen.queryByText(/Valor local/)).toBeNull();
  });

  it("mantém o placeholder do segredo já configurado", () => {
    render(
      <ConfigurationFieldEditor
        {...baseProps}
        fieldLabel="Secret Key"
        fieldKey="objectStorageSecretKey"
        fieldKind="string"
        value=""
        secret
        secretConfigured
      />,
    );

    expect(screen.getByPlaceholderText(/configurado/)).toBeTruthy();
    expect(screen.queryByText("Valor local")).toBeNull();
  });

  it("mostra as ações de salvar na variante plain quando não estão ocultas", () => {
    render(
      <ConfigurationFieldEditor
        {...baseProps}
        hideSaveButton={false}
        fieldLabel="Região"
        fieldKey="objectStorageRegion"
        fieldKind="string"
        value=""
      />,
    );

    expect(screen.getByText("Salvar")).toBeTruthy();
    expect(screen.getByText("Comparar")).toBeTruthy();
  });
});
