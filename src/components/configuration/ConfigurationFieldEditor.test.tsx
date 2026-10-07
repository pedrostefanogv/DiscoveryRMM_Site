import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfigurationFieldEditor } from "./ConfigurationFieldEditor";

const baseProps = {
  fieldLabel: "Política da Loja de Aplicativos",
  fieldKey: "appStorePolicy",
  fieldKind: "policy" as const,
  value: "1",
  inherited: false,
  effectiveValue: 1,
  origin: "Server" as const,
  onValueChange: vi.fn(),
  onToggleInherit: vi.fn(),
  onSavePatch: vi.fn(),
  disableInheritance: true,
};

describe("ConfigurationFieldEditor - Política da Loja de Aplicativos", () => {
  it("renderiza as três opções sem os caracteres corrompidos (??)", () => {
    render(<ConfigurationFieldEditor {...baseProps} />);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("1");

    const labels = Array.from(select.options).map((option) => option.textContent ?? "");
    expect(labels).toEqual([
      "0 - Desativado (nenhum aplicativo autorizado)",
      "1 - Pré-aprovados (apenas aplicativos da lista)",
      "2 - Todos (qualquer aplicativo autorizado)",
    ]);
    expect(labels.some((label) => label.includes("?"))).toBe(false);
  });

  it("propaga a política escolhida como 0/1/2", () => {
    const onValueChange = vi.fn();
    render(
      <ConfigurationFieldEditor {...baseProps} onValueChange={onValueChange} />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    select.value = "2";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onValueChange).toHaveBeenCalledWith("2");
  });

  it("mostra o comparativo com rótulos legíveis (não o código bruto)", () => {
    render(<ConfigurationFieldEditor {...baseProps} />);

    fireEvent.click(screen.getByText("Comparar"));

    expect(screen.getAllByText("Pré-aprovados").length).toBeGreaterThan(0);
  });
});
