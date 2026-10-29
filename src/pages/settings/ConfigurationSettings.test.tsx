import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import ConfigurationSettings from "./ConfigurationSettings";

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfigurationSettings />
    </MemoryRouter>,
  );
}

describe("ConfigurationSettings (índice)", () => {
  it("lista os módulos agrupados por tema", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Configurações" })).toBeTruthy();
    for (const group of [
      "Hierarquia de configuração",
      "Operação de tickets",
      "Dados e governança",
      "Identidade visual",
    ]) {
      expect(screen.getByText(group)).toBeTruthy();
    }
    expect(screen.getByText("Configuração do Servidor")).toBeTruthy();
  });

  it("filtra por termo e mostra a contagem", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Buscar configuração"), {
      target: { value: "nats" },
    });

    expect(screen.queryByText("Configuração de Cliente")).toBeNull();
    expect(screen.getByText(/de \d+ itens/)).toBeTruthy();
  });

  it("mostra estado vazio quando nada corresponde", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Buscar configuração"), {
      target: { value: "zzzz-inexistente" },
    });

    expect(screen.getByText("Nenhuma configuração encontrada")).toBeTruthy();
  });

  it("limpa a busca pelo botão", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Buscar configuração"), {
      target: { value: "workflow" },
    });
    fireEvent.click(screen.getByRole("button", { name: "limpar busca" }));

    expect(screen.getByText("Configuração do Servidor")).toBeTruthy();
  });
});
