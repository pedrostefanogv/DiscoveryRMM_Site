import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Regressao do layout de conversa da aba Comentarios: o comentario do proprio
 * usuario logado fica a direita (bg-primary / items-end) e os demais (agent,
 * outros tecnicos) a esquerda (bg-surface-light / items-start), como no agent
 * desktop.
 *
 * O "proprio" e resolvido pelo login: claim unique_name do JWT e, quando o
 * token nao o traz, pelo login do usuario na lista do IAM.
 */

/** Monta um JWT sintaticamente valido (so o payload importa). */
function makeToken(payload: Record<string, unknown>): string {
  const base64url = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `header.${base64url}.sig`;
}

const IAM_USERS = [
  {
    id: "user-2",
    login: "pedro.stefano",
    email: "pedro@example.com",
    fullName: "Pedro Stefano",
    isActive: true,
    mfaRequired: false,
  },
];

// MUTAVEL: cada teste escolhe o token da sessao (o mock de useAuth le daqui).
let CURRENT_TOKEN = makeToken({ unique_name: "pedro.stefano", sub: "user-1" });

const COMMENTS = [
  {
    id: "c-1",
    ticketId: "ticket-1",
    author: "pedro.stefano",
    content: "Comentario proprio",
    isInternal: false,
    createdAt: "2026-09-27T21:52:00.000Z",
  },
  {
    id: "c-2",
    ticketId: "ticket-1",
    author: "Agent",
    content: "Comentario do agent",
    isInternal: false,
    createdAt: "2026-09-27T20:00:00.000Z",
  },
  {
    id: "c-3",
    ticketId: "ticket-1",
    author: "outro.tecnico",
    content: "Comentario interno de teste",
    isInternal: true,
    createdAt: "2026-09-26T10:00:00.000Z",
  },
];

function makeTicket() {
  return {
    id: "ticket-1",
    title: "Chamado de teste",
    description: "Descricao",
    priority: "Medium",
    category: "Suporte",
    status: "Open",
    workflowStateId: null,
    assignedToUserId: null,
    siteId: null,
    clientId: null,
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

// Identidades ESTAVEIS: se a query devolvesse um objeto novo a cada render, o
// useEffect de paginacao do CommentsPanel entraria em loop infinito.
const TICKET_QUERY = { data: makeTicket(), isLoading: false, isError: false };
const COMMENTS_QUERY = {
  data: { items: COMMENTS, hasMore: false },
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: () => undefined,
};

vi.mock("@/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api")>();

  return {
    ...actual,
    ticketsApi: {
      ...actual.ticketsApi,
      get: () => Promise.resolve(makeTicket()),
    },
    departmentsApi: {
      ...actual.departmentsApi,
      list: () => Promise.resolve([]),
    },
    iamApi: {
      ...actual.iamApi,
      listUsers: () => Promise.resolve(IAM_USERS),
    },
  };
});

vi.mock("@/services/configurationApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/configurationApi")>();

  return {
    ...actual,
    getTicketAttachmentSettings: () => Promise.resolve({ enabled: false }),
  };
});

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ session: { accessToken: CURRENT_TOKEN } }),
}));

vi.mock("@/hooks/useTickets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTickets")>();

  return {
    ...actual,
    useTicket: () => TICKET_QUERY,
    useTicketComments: () => COMMENTS_QUERY,
    useAddComment: () => ({ mutate: () => undefined, isPending: false }),
  };
});

import TicketDetail from "./TicketDetail";

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

describe("TicketDetail comentarios em baloes", () => {
  it("alinha proprio a direita e os demais a esquerda, com autor + data/hora", () => {
    render(<TicketDetail />, { wrapper: createWrapper() });

    const ownBubble = screen.getByText("Comentario proprio");
    expect(ownBubble.className).toContain("bg-primary");
    expect(ownBubble.parentElement?.className).toContain("items-end");
    // Autor + data/hora no meta, logo abaixo do balao.
    expect(ownBubble.parentElement?.textContent).toContain("pedro.stefano");
    expect(ownBubble.parentElement?.textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);

    const agentBubble = screen.getByText("Comentario do agent");
    expect(agentBubble.className).toContain("bg-surface-light");
    expect(agentBubble.parentElement?.className).toContain("items-start");

    const internalBubble = screen.getAllByText("Comentario interno de teste")[0];
    expect(internalBubble.className).toContain("border-warning/40");
    expect(screen.getAllByText("Interno").length).toBeGreaterThan(0);
  });

  it("usa o login do IAM quando o JWT nao traz unique_name", async () => {
    // Token sem unique_name: so o fallback pelo IAM pode identificar o autor.
    CURRENT_TOKEN = makeToken({ sub: "user-2" });

    render(<TicketDetail />, { wrapper: createWrapper() });

    await waitFor(() => {
      const ownBubble = screen.getByText("Comentario proprio");
      expect(ownBubble.className).toContain("bg-primary");
      expect(ownBubble.parentElement?.className).toContain("items-end");
    });

    const agentBubble = screen.getByText("Comentario do agent");
    expect(agentBubble.parentElement?.className).toContain("items-start");
  });
});
