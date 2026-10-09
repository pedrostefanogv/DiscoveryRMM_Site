import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import McpToolsSettings from "./McpToolsSettings";
import { mcpToolsApi } from "@/api/mcp-tools";

vi.mock("@/hooks/useClients", () => ({ useClients: () => ({ data: [] }) }));
vi.mock("@/hooks/useSites", () => ({ useSites: () => ({ data: [] }) }));
vi.mock("@/hooks/useAgents", () => ({ useAgentsBySite: () => ({ data: [] }) }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/api/mcp-tools", () => ({
  mcpToolsApi: {
    catalog: vi.fn(),
    save: vi.fn(),
    reset: vi.fn(),
    impact: vi.fn(),
  },
}));

const catalog = {
  scope: { level: "global" as const, isGlobal: true },
  tools: [
    {
      name: "knowledge_search",
      source: "server",
      description: "Busca na base de conhecimento.",
      isEnabled: true,
      overriddenHere: false,
      locked: false,
      maxCallsPerMinute: 10,
      timeoutSeconds: 30,
      lowerScopeOverrides: 0,
      category: "Base de conhecimento",
      whenToUse: "Use para políticas e procedimentos internos.",
      recommendedTimeoutSeconds: 30,
      timeoutApplies: true,
    },
    {
      name: "service_control",
      source: "agent",
      description: "Controla serviços do Windows.",
      isEnabled: false,
      overriddenHere: true,
      locked: false,
      maxCallsPerMinute: 10,
      timeoutSeconds: 120,
      lowerScopeOverrides: 0,
      category: "Sistema",
      whenToUse: "Use para consultar/iniciar/parar serviços.",
      recommendedTimeoutSeconds: 120,
      timeoutApplies: true,
    },
    {
      name: "power_action",
      source: "agent",
      description: "Reinicia ou desliga o computador.",
      isEnabled: true,
      overriddenHere: false,
      locked: true,
      maxCallsPerMinute: 5,
      timeoutSeconds: 30,
      lowerScopeOverrides: 2,
      category: "Sistema",
      whenToUse: "Use para reiniciar/desligar com aviso cancelável.",
      recommendedTimeoutSeconds: 30,
      timeoutApplies: true,
    },
    {
      name: "ask_user",
      source: "agent",
      description: "Pergunta ao usuário e aguarda a resposta.",
      isEnabled: true,
      overriddenHere: false,
      locked: false,
      maxCallsPerMinute: 20,
      timeoutSeconds: 60,
      lowerScopeOverrides: 0,
      category: "Interação",
      whenToUse: "Use quando precisar de uma decisão do usuário.",
      recommendedTimeoutSeconds: 0,
      timeoutApplies: false,
    },
    {
      // Capacidade não executável: sem rate limit e sem timeout. A API não
      // envia `isCapability`, então a tela infere por maxCallsPerMinute = 0 +
      // timeoutApplies = false.
      name: "a2ui",
      source: "server",
      description: "Interface rica (A2UI) no chat.",
      isEnabled: true,
      overriddenHere: false,
      locked: false,
      maxCallsPerMinute: 0,
      timeoutSeconds: 0,
      lowerScopeOverrides: 0,
      category: "Interface do chat",
      whenToUse: "Ligue/desligue as interfaces ricas geradas pela IA.",
      recommendedTimeoutSeconds: 0,
      timeoutApplies: false,
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <McpToolsSettings />
    </QueryClientProvider>,
  );
}

function openEditor(toolName: string) {
  fireEvent.click(screen.getByTestId(`mcp-edit-${toolName}`));
}

describe("McpToolsSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mcpToolsApi.catalog).mockResolvedValue(catalog);
    vi.mocked(mcpToolsApi.save).mockResolvedValue(catalog);
  });

  it("lista as ferramentas com origem, herança e estado habilitado", async () => {
    renderPage();

    expect(screen.getByText("Ferramentas de IA (MCP)")).toBeTruthy();

    await waitFor(() => expect(screen.getByText("knowledge_search")).toBeTruthy());

    // Origem ("Agente" também aparece como opção do seletor de escopo)
    expect(screen.getAllByText("Servidor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Agente").length).toBeGreaterThan(0);

    // Herança: as linhas sem sobrescrita local aparecem como "Herdado"
    // (duas agora, incluindo a bloqueada), e a segunda como sobrescrita.
    expect(screen.getAllByText("Herdado").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Sobrescrito aqui")).toBeTruthy();

    // Estado desabilitado visível (badge + resumo)
    expect(screen.getByText("Desabilitado")).toBeTruthy();
    expect(screen.getByText("Desabilitada")).toBeTruthy();

    // Bloqueio de herança: badge visível.
    expect(screen.getByText("Bloqueado")).toBeTruthy();

    // Escopo global carrega sem seleção adicional
    expect(mcpToolsApi.catalog).toHaveBeenCalled();
  });

  it("substitui os controles da linha por um resumo e um único botão Editar", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("knowledge_search")).toBeTruthy());

    // A grade de controles saiu da linha: nada de checkbox/campos inline.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByLabelText("Chamadas/min")).toBeNull();

    const row = screen.getByTestId("mcp-tool-knowledge_search");
    // Resumo da política em chips padronizados.
    expect(within(row).getByText("Habilitada")).toBeTruthy();
    expect(within(row).getByText("10/min")).toBeTruthy();
    expect(within(row).getByText("Timeout 30s")).toBeTruthy();

    // Uma única ação de política por linha: Editar (o botão de detalhes fica
    // no bloco de texto, à esquerda).
    expect(within(row).getAllByRole("button")).toHaveLength(2);
    expect(within(row).getByRole("button", { name: /Editar/ })).toBeTruthy();
    expect(within(row).getByRole("button", { name: /O que faz e quando usar/i })).toBeTruthy();
  });

  it("edita a política em um modal e salva pelo modal", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("knowledge_search")).toBeTruthy());

    openEditor("knowledge_search");
    expect(screen.getByText("Editar política — knowledge_search")).toBeTruthy();

    const enabled = screen.getByLabelText(/^Habilitada/) as HTMLInputElement;
    const calls = screen.getByLabelText("Chamadas/min") as HTMLInputElement;
    const timeout = screen.getByLabelText("Timeout (s)") as HTMLInputElement;
    expect(enabled.checked).toBe(true);
    expect(calls.value).toBe("10");
    expect(timeout.value).toBe("30");

    // Salvar fica inativo enquanto nada mudou.
    const save = screen.getByRole("button", { name: /Salvar/ });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(calls, { target: { value: "25" } });
    // Checkbox controlado: click (não change) é o que alterna o estado.
    fireEvent.click(enabled);
    expect(enabled.checked).toBe(false);
    expect((save as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(save);

    await waitFor(() => expect(mcpToolsApi.save).toHaveBeenCalledTimes(1));
    expect(mcpToolsApi.save).toHaveBeenCalledWith("knowledge_search", {
      isEnabled: false,
      maxCallsPerMinute: 25,
      timeoutSeconds: 30,
      locked: false,
    });
  });

  it("marca como somente leitura a política bloqueada por um nível superior", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("power_action")).toBeTruthy());

    openEditor("power_action");

    // Bloqueada pela herança (locked=true e sem sobrescrita local).
    expect(screen.getByText(/bloqueada por um nível superior/i)).toBeTruthy();
    const controls = [
      screen.getByLabelText(/^Habilitada/),
      screen.getByLabelText(/^Bloquear herança/),
      screen.getByLabelText("Chamadas/min"),
      screen.getByLabelText("Timeout (s)"),
    ] as HTMLInputElement[];
    expect(controls.every((control) => control.disabled)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    expect(mcpToolsApi.save).not.toHaveBeenCalled();
  });

  it("mostra 'Não se aplica' no timeout de ferramentas que aguardam o usuário", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("ask_user")).toBeTruthy());

    // ask_user aguarda o usuário: o timeout não se aplica.
    expect(screen.getByText("Sem timeout")).toBeTruthy();

    openEditor("ask_user");
    expect(screen.getByText("Editar política — ask_user")).toBeTruthy();
    expect(screen.getByText("Não se aplica")).toBeTruthy();
    expect(screen.queryByLabelText("Timeout (s)")).toBeNull();
    // Ainda é uma ferramenta executável: o rate limit continua editável.
    expect(screen.getByLabelText("Chamadas/min")).toBeTruthy();
  });

  it("trata o A2UI como capacidade: só habilitar/desabilitar e bloquear", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("a2ui")).toBeTruthy());

    const row = screen.getByTestId("mcp-tool-a2ui");
    expect(within(row).getByText("Sem limites")).toBeTruthy();
    expect(within(row).queryByText(/\/min$/)).toBeNull();

    openEditor("a2ui");
    expect(screen.getByText(/não uma ferramenta executável/i)).toBeTruthy();

    // Nenhum limite de chamadas nem timeout é oferecido.
    expect(screen.queryByLabelText("Chamadas/min")).toBeNull();
    expect(screen.queryByLabelText("Timeout (s)")).toBeNull();

    const enabled = screen.getByLabelText(/^Habilitada/) as HTMLInputElement;
    const locked = screen.getByLabelText(/^Bloquear herança/) as HTMLInputElement;
    expect(enabled.checked).toBe(true);

    fireEvent.click(enabled);
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));

    await waitFor(() => expect(mcpToolsApi.save).toHaveBeenCalledTimes(1));
    // Sem limites: os campos vão nulos para a API.
    expect(mcpToolsApi.save).toHaveBeenCalledWith("a2ui", {
      isEnabled: false,
      maxCallsPerMinute: null,
      timeoutSeconds: null,
      locked: false,
    });
    expect(locked.disabled).toBe(false);
  });

  it("remove a sobrescrita local pelo botão Herdar", async () => {
    vi.mocked(mcpToolsApi.reset).mockResolvedValue(catalog);
    renderPage();
    await waitFor(() => expect(screen.getByText("service_control")).toBeTruthy());

    const row = screen.getByTestId("mcp-tool-service_control");
    fireEvent.click(within(row).getByRole("button", { name: /Herdar/ }));

    await waitFor(() => expect(mcpToolsApi.reset).toHaveBeenCalledTimes(1));
    expect(mcpToolsApi.reset).toHaveBeenCalledWith("service_control", {});
  });

  it("filtra por texto, origem e categoria", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("knowledge_search")).toBeTruthy());

    // Busca por nome
    fireEvent.change(screen.getByLabelText("Buscar ferramenta"), { target: { value: "power" } });
    expect(screen.queryByText("knowledge_search")).toBeNull();
    expect(screen.getByText("power_action")).toBeTruthy();

    // Busca por descrição
    fireEvent.change(screen.getByLabelText("Buscar ferramenta"), { target: { value: "serviços do windows" } });
    expect(screen.getByText("service_control")).toBeTruthy();
    expect(screen.queryByText("power_action")).toBeNull();

    // Limpar e filtrar por origem (só servidor)
    fireEvent.change(screen.getByLabelText("Buscar ferramenta"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Origem"), { target: { value: "server" } });
    expect(screen.getByText("knowledge_search")).toBeTruthy();
    expect(screen.queryByText("service_control")).toBeNull();
    expect(screen.queryByText("power_action")).toBeNull();

    // Categoria "Sistema" com origem agente
    fireEvent.change(screen.getByLabelText("Origem"), { target: { value: "agent" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "Sistema" } });
    expect(screen.getByText("service_control")).toBeTruthy();
    expect(screen.getByText("power_action")).toBeTruthy();
    expect(screen.queryByText("ask_user")).toBeNull();
  });

  it("explica o que a ferramenta faz e marca timeout inaplicável", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("knowledge_search")).toBeTruthy());

    // Detalhe expandido traz "o que faz" e "quando usar"
    fireEvent.click(screen.getAllByRole("button", { name: /O que faz e quando usar/i })[0]);
    expect(screen.getByText("Quando usar:")).toBeTruthy();
    expect(screen.getByText(/O que faz:/i)).toBeTruthy();

    // Recomendação de timeout segue no detalhe expandido.
    expect(screen.getAllByText(/Timeout recomendado:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/30s/).length).toBeGreaterThan(0);
  });
});
