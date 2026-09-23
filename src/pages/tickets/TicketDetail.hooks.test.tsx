import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Regressao do React #310 ("Rendered more hooks than during the previous
 * render") em /tickets/:id.
 *
 * Cenario real que quebrava a pagina:
 *  1. Primeiro render: o ticket ainda esta carregando, entao a resolucao da
 *     config de anexos acontece com siteId/clientId nulos (fallback servidor).
 *  2. Render seguinte: o ticket chega COM siteId/clientId e a cadeia
 *     Site > Cliente > Servidor passa a resolver por outro ramo.
 *
 * Se esse caminho mudar a QUANTIDADE/ORDEM de hooks entre os renders, o React
 * aborta a arvore com o erro #310. O teste monta o cenario e exige que a tela
 * conclua sem esse erro.
 */

const getTicketMock = vi.fn();
const getSiteEffectiveMock = vi.fn();
const getClientEffectiveMock = vi.fn();
const getTicketAttachmentSettingsMock = vi.fn();

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();

  return {
    ...actual,
    ticketsApi: {
      ...actual.ticketsApi,
      get: (...args: unknown[]) => getTicketMock(...args),
    },
    configurationApi: {
      ...actual.configurationApi,
      getTicketAttachmentSettings: (...args: unknown[]) =>
        getTicketAttachmentSettingsMock(...args),
      getSiteEffective: (...args: unknown[]) => getSiteEffectiveMock(...args),
      getClientEffective: (...args: unknown[]) => getClientEffectiveMock(...args),
    },
  };
});

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ session: { accessToken: null } }),
}));

vi.mock("@/auth/jwt", () => ({
  getUserIdFromJwt: () => null,
}));

import TicketDetail from "./TicketDetail";

function makeTicket(siteId: string | null, clientId: string | null) {
  return {
    id: "ticket-1",
    title: "Chamado de teste",
    description: "Descricao do chamado de teste",
    priority: "Medium",
    category: "Suporte",
    status: "Open",
    workflowStateId: null,
    assignedToUserId: null,
    siteId,
    clientId,
    agentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
    rating: null,
    ratingFeedback: null,
    ratedAt: null,
    ratedBy: null,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/tickets/ticket-1"]}>
          <Routes>
            <Route path="/tickets/:id" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

/** Coleta mensagens de console.error que indiquem violacao de ordem de hooks. */
function hookViolations(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls
    .map((call: unknown[]) => call.map((value: unknown) => String(value)).join(" "))
    .filter(
      (message: string) =>
        message.includes("Rendered more hooks") ||
        message.includes("Rendered fewer hooks") ||
        message.includes("change in the order of Hooks"),
    );
}

describe("TicketDetail hook order", () => {
  const consoleError = vi.spyOn(console, "error");

  beforeEach(() => {
    consoleError.mockReset();
    getTicketMock.mockReset();
    getSiteEffectiveMock.mockReset().mockResolvedValue({});
    getClientEffectiveMock.mockReset().mockResolvedValue({});
    getTicketAttachmentSettingsMock
      .mockReset()
      .mockResolvedValue({ enabled: true });
  });

  afterEach(() => {
    consoleError.mockReset();
  });

  it("renderiza com escopo de site/cliente sem violar a ordem de hooks", async () => {
    getTicketMock.mockResolvedValue(makeTicket("site-1", "client-1"));

    render(<TicketDetail />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Chamado de teste")).toBeTruthy();
    });

    // A aba de Anexos depende da config efetiva herdada (Site > Cliente > Servidor).
    expect(screen.getByText("Anexos")).toBeTruthy();
    expect(hookViolations(consoleError)).toEqual([]);
  });

  it("nao dispara React #310 ao passar de ticket sem escopo para ticket com escopo", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // Primeiro render: ticket sem siteId/clientId (ramo de fallback do servidor).
    getTicketMock.mockResolvedValueOnce(makeTicket(null, null));

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/tickets/ticket-1"]}>
            <Routes>
              <Route path="/tickets/:id" element={children} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    }

    const { rerender } = render(<TicketDetail />, { wrapper: Wrapper });

    // Aguarda o primeiro render concluir (ticket sem escopo, fallback servidor).
    await waitFor(() => {
      expect(getTicketAttachmentSettingsMock).toHaveBeenCalled();
    });

    // O ticket agora traz escopo de site: o ramo de resolucao muda. Era exatamente
    // aqui que a contagem de hooks divergia e o React abortava com #310.
    getTicketMock.mockResolvedValue(makeTicket("site-1", "client-1"));
    await queryClient.invalidateQueries();
    rerender(<TicketDetail />);

    await waitFor(() => {
      expect(getSiteEffectiveMock).toHaveBeenCalledWith("site-1");
    });

    expect(hookViolations(consoleError)).toEqual([]);
  });
});
