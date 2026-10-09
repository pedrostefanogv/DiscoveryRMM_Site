import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AGENT_HOME_TAB_OPTIONS } from "@/utils/configurationEditors";
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

describe("ConfigurationFieldEditor - Página Inicial do Agent", () => {
  const selectProps = {
    ...baseProps,
    fieldLabel: "Página Inicial do Agent",
    fieldKey: "agentHomeTab",
    fieldKind: "select" as const,
    value: "status",
    effectiveValue: "status",
  };

  it("renderiza as opções de aba usando os ids exatos da API", () => {
    render(<ConfigurationFieldEditor {...selectProps} />);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("status");
    expect(Array.from(select.options).map((option) => option.value)).toEqual(
      AGENT_HOME_TAB_OPTIONS.map((option) => option.value),
    );
  });

  it("propaga o id escolhido pelo usuário", () => {
    const onValueChange = vi.fn();
    render(
      <ConfigurationFieldEditor {...selectProps} onValueChange={onValueChange} />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "support" } });

    expect(onValueChange).toHaveBeenCalledWith("support");
  });

  it("mantém visível um valor salvo fora do catálogo para o admin corrigir", () => {
    render(<ConfigurationFieldEditor {...selectProps} value="logs" />);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("logs");
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      ...AGENT_HOME_TAB_OPTIONS.map((option) => option.value),
      "logs",
    ]);
  });

  it("prioriza as opções publicadas pelo servidor", () => {
    render(
      <ConfigurationFieldEditor
        {...selectProps}
        value="chat"
        options={[
          { value: "chat", label: "Chat IA" },
          { value: "futureTab", label: "futureTab" },
        ]}
      />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "chat",
      "futureTab",
    ]);
  });
});
