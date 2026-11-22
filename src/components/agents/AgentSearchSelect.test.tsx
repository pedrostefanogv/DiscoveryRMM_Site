import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Seletor de agente da "Política efetiva (preview)" do Acesso Remoto.
 *
 * Protege:
 *  - a lista carrega dos agentes instalados que o perfil pode ver;
 *  - a busca só filtra a partir de 3 caracteres;
 *  - a busca casa por hostname e também por cliente/site;
 *  - clicar numa linha devolve o id do agente.
 */

const mocks = vi.hoisted(() => ({
  agents: [
    {
      id: "a1",
      hostname: "NOTE-DIRETORIA",
      displayName: "Notebook da Diretoria",
      isOnline: true,
      siteId: "s1",
      clientId: "c1",
      clientName: "Acme",
      siteName: "Matriz",
    },
    {
      id: "a2",
      hostname: "SRV-BANCO",
      displayName: null,
      isOnline: false,
      siteId: "s2",
      clientId: "c2",
      clientName: "Globex",
      siteName: "Filial",
    },
  ],
  isLoading: false,
  isError: false,
}));

vi.mock("@/hooks/useAgents", () => ({
  useAccessibleAgents: () => ({
    agents: mocks.agents,
    isLoading: mocks.isLoading,
    isError: mocks.isError,
  }),
}));

import { AgentSearchSelect, AGENT_SEARCH_MIN_LENGTH } from "./AgentSearchSelect";

const searchBox = () => screen.getByRole("combobox") as HTMLInputElement;
const originalAgents = [...mocks.agents];

describe("AgentSearchSelect", () => {
  afterEach(() => {
    cleanup();
    mocks.agents = originalAgents;
    mocks.isLoading = false;
    mocks.isError = false;
  });

  it("lista os agentes instalados do escopo com o contexto de cliente/site", () => {
    render(<AgentSearchSelect value="" onChange={vi.fn()} />);

    expect(AGENT_SEARCH_MIN_LENGTH).toBe(3);
    expect(screen.getByText("Notebook da Diretoria")).toBeTruthy();
    expect(screen.getByText("SRV-BANCO")).toBeTruthy();
    expect(screen.getByText("Acme · Matriz")).toBeTruthy();
    expect(screen.getByText("Globex · Filial")).toBeTruthy();
    expect(screen.getByText("2 agente(s) no seu escopo.")).toBeTruthy();
  });

  it("não filtra com menos de 3 caracteres e avisa o mínimo", () => {
    render(<AgentSearchSelect value="" onChange={vi.fn()} />);
    fireEvent.change(searchBox(), { target: { value: "no" } });

    expect(
      screen.getByText("Digite ao menos 3 caracteres para filtrar."),
    ).toBeTruthy();
    expect(screen.getByText("Notebook da Diretoria")).toBeTruthy();
    expect(screen.getByText("SRV-BANCO")).toBeTruthy();
  });

  it("filtra por hostname a partir de 3 caracteres", () => {
    render(<AgentSearchSelect value="" onChange={vi.fn()} />);
    fireEvent.change(searchBox(), { target: { value: "srv" } });

    expect(screen.queryByText("Notebook da Diretoria")).toBeNull();
    expect(screen.getByText("SRV-BANCO")).toBeTruthy();
    expect(screen.getByText("1 agente(s) encontrado(s).")).toBeTruthy();
  });

  it("filtra também por cliente e por site", () => {
    const { unmount } = render(<AgentSearchSelect value="" onChange={vi.fn()} />);
    fireEvent.change(searchBox(), { target: { value: "globex" } });
    expect(screen.getByText("SRV-BANCO")).toBeTruthy();
    expect(screen.queryByText("Notebook da Diretoria")).toBeNull();
    unmount();

    render(<AgentSearchSelect value="" onChange={vi.fn()} />);
    fireEvent.change(searchBox(), { target: { value: "matriz" } });
    expect(screen.getByText("Notebook da Diretoria")).toBeTruthy();
    expect(screen.queryByText("SRV-BANCO")).toBeNull();
  });

  it("devolve o id do agente ao clicar na linha", () => {
    const onChange = vi.fn();
    render(<AgentSearchSelect value="" onChange={onChange} />);

    fireEvent.click(screen.getByText("SRV-BANCO"));
    expect(onChange).toHaveBeenCalledWith("a2");
  });

  it("mostra o agente selecionado e permite limpar", () => {
    const onChange = vi.fn();
    render(<AgentSearchSelect value="a1" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Limpar agente" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar agente" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("avisa quando não há agentes no escopo", () => {
    mocks.agents = [];
    render(<AgentSearchSelect value="" onChange={vi.fn()} />);

    expect(
      screen.getByText("Nenhum agente instalado disponível no seu escopo."),
    ).toBeTruthy();
  });
});
