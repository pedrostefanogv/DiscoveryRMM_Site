import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * useAccessibleAgents: a fonte de dados do seletor de agente do preview de
 * consentimento remoto. Protege o recorte de escopo:
 *  - agentes vêm por cliente para clientes acessíveis;
 *  - sites cujo cliente NÃO está acessível são consultados por site (perfil
 *    com acesso apenas a sites específicos);
 *  - clientes já cobertos não geram consulta por site (evita N+1 no perfil global);
 *  - agentes repetidos entre as duas fontes são deduplicados.
 */

const mocks = vi.hoisted(() => ({
  clients: [
    { id: "c1", name: "Acme" },
    { id: "c2", name: "Globex" },
  ],
  sites: [
    { id: "s1", clientId: "c1", name: "Matriz", clientName: "Acme" },
    { id: "s2", clientId: "c2", name: "Filial", clientName: "Globex" },
    { id: "s3", clientId: "c3", name: "Loja", clientName: "Initech" },
  ],
  clientsLoading: false,
  clientsError: false,
  listByClient: vi.fn(),
  listBySite: vi.fn(),
}));

vi.mock("./useClients", () => ({
  // Espelha o React Query: enquanto carrega não há data.
  useClients: () => ({
    data: mocks.clientsLoading ? undefined : mocks.clients,
    isLoading: mocks.clientsLoading,
    isError: mocks.clientsError,
  }),
}));

vi.mock("./useSites", () => ({
  useAllSites: () => ({ data: mocks.sites, isLoading: false, isError: false }),
}));

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();
  return {
    ...actual,
    agentsApi: {
      ...actual.agentsApi,
      listByClient: mocks.listByClient,
      listBySite: mocks.listBySite,
    },
  };
});

import { useAccessibleAgents } from "./useAgents";

function agent(id: string, hostname: string, siteId: string) {
  return { id, hostname, displayName: null, isOnline: true, siteId } as never;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useAccessibleAgents", () => {
  beforeEach(() => {
    mocks.clientsLoading = false;
    mocks.clientsError = false;
    mocks.listByClient.mockReset();
    mocks.listBySite.mockReset();
    mocks.listByClient.mockImplementation((clientId: string) =>
      Promise.resolve(
        clientId === "c1"
          ? [agent("a1", "SRV-ACME", "s1")]
          : [agent("a2", "SRV-GLOBEX", "s2")],
      ),
    );
    // s3 devolve um agente próprio e repete a1 (que veio por cliente): o hook
    // deve deduplicar pelo id.
    mocks.listBySite.mockImplementation((siteId: string) =>
      Promise.resolve(
        siteId === "s3" ? [agent("a3", "SRV-LOJA", "s3"), agent("a1", "SRV-ACME", "s1")] : [],
      ),
    );
  });

  it("carrega por cliente e só consulta por site o cliente fora do escopo", async () => {
    const { result } = renderHook(() => useAccessibleAgents(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.agents).toHaveLength(3));

    const ids = result.current.agents.map((a) => a.id).sort();
    expect(ids).toEqual(["a1", "a2", "a3"]);
    expect(mocks.listByClient).toHaveBeenCalledTimes(2);
    // s1 e s2 pertencem a clientes acessíveis; só s3 (cliente Initech) é por site.
    expect(mocks.listBySite).toHaveBeenCalledTimes(1);
    expect(mocks.listBySite).toHaveBeenCalledWith("s3", expect.anything());
  });

  it("não consulta por site enquanto /clients não carregou (evita rajada)", () => {
    mocks.clientsLoading = true;

    const { result } = renderHook(() => useAccessibleAgents(), {
      wrapper: createWrapper(),
    });

    expect(result.current.agents).toHaveLength(0);
    expect(mocks.listByClient).not.toHaveBeenCalled();
    // Sem /clients, todos os sites pareceriam "descobertos" — a trava impede
    // que isso vire uma consulta by-site por site.
    expect(mocks.listBySite).not.toHaveBeenCalled();
  });

  it("resolve nome do cliente/site a partir da lista de sites", async () => {
    const { result } = renderHook(() => useAccessibleAgents(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.agents).toHaveLength(3));

    const byId = new Map(result.current.agents.map((a) => [a.id, a]));
    expect(byId.get("a1")?.clientName).toBe("Acme");
    expect(byId.get("a1")?.siteName).toBe("Matriz");
    expect(byId.get("a3")?.clientName).toBe("Initech");
    expect(byId.get("a3")?.siteName).toBe("Loja");
  });
});
