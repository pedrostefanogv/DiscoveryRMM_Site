import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
      timeoutSeconds: 10,
      lowerScopeOverrides: 0,
    },
    {
      name: "service_control",
      source: "agent",
      description: "Controla serviços do Windows.",
      isEnabled: false,
      overriddenHere: true,
      locked: false,
      maxCallsPerMinute: 10,
      timeoutSeconds: 60,
      lowerScopeOverrides: 0,
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
});
