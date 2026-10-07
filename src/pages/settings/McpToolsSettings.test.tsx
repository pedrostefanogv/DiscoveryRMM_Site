import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("McpToolsSettings", () => {
  beforeEach(() => {
    vi.mocked(mcpToolsApi.catalog).mockResolvedValue(catalog);
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

    // Estado desabilitado visível
    expect(screen.getByText("Desabilitado")).toBeTruthy();

    // Bloqueio de herança: badge e controles desabilitados (não dá para
    // sobrescrever uma política bloqueada em nível superior).
    expect(screen.getByText("Bloqueado")).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes.some((cb) => cb.disabled)).toBe(true);

    // Escopo global carrega sem seleção adicional
    expect(mcpToolsApi.catalog).toHaveBeenCalled();
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

    // ask_user aguarda o usuário: o timeout não se aplica
    expect(screen.getByText("Não se aplica")).toBeTruthy();

    // Recomendação de timeout visível na linha
    expect(screen.getAllByText(/Recomendado: 30s/).length).toBeGreaterThan(0);
  });
});
