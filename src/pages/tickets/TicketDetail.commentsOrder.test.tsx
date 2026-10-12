import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Regressao da ORDEM da conversa do chamado: a aba Comentarios deve seguir a
 * linha do tempo (mais ANTIGO primeiro) e o botao de historico carrega as
 * paginas anteriores por CIMA das ja exibidas.
 *
 * A API pagina do mais novo para o mais antigo. Este teste cobre a ordem
 * dentro da pagina, entre paginas e o caso em que a pagina 0 MUDA de janela
 * (comentario novo): o item que sai dela nao pode sumir nem duplicar.
 */

/** Fase do mock: depois de "comentar", a pagina 0 muda de janela. */
let phase: "before" | "after" = "before";
const ADDED_COMMENT = {
  id: "novo",
  ticketId: "ticket-1",
  author: "tec",
  content: "Comentario novo",
  isInternal: false,
  createdAt: "2026-10-05T10:00:00.000Z",
};
const NEWER_PAGE = [
  { id: "n1", ticketId: "ticket-1", author: "tec", content: "Recente 1", isInternal: false, createdAt: "2026-10-04T10:00:00.000Z" },
  { id: "n2", ticketId: "ticket-1", author: "tec", content: "Recente 2", isInternal: false, createdAt: "2026-10-03T10:00:00.000Z" },
];
const OLDER_PAGE = [
  { id: "o1", ticketId: "ticket-1", author: "tec", content: "Antigo 1", isInternal: false, createdAt: "2026-10-02T10:00:00.000Z" },
  { id: "o2", ticketId: "ticket-1", author: "tec", content: "Antigo 2", isInternal: false, createdAt: "2026-10-01T10:00:00.000Z" },
];

/** Janela NOVA: o comentario novo entra e "Recente 2" sai da pagina 0. */
const NEWER_PAGE_AFTER_ADD = [ADDED_COMMENT, NEWER_PAGE[0]];

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

// Identidades ESTAVEIS: objeto novo a cada render faz o useEffect de paginacao
// do CommentsPanel entrar em loop.
const TICKET_QUERY = { data: makeTicket(), isLoading: false, isError: false };
const PAGE_NEWER = {
  data: { items: NEWER_PAGE, hasMore: true, nextCursor: "c2" },
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: () => undefined,
};
const PAGE_NEWER_AFTER_ADD_QUERY = {
  data: { items: NEWER_PAGE_AFTER_ADD, hasMore: true, nextCursor: "c2b" },
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: () => undefined,
};
const PAGE_OLDER = {
  data: { items: OLDER_PAGE, hasMore: false, nextCursor: null },
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
      listUsers: () => Promise.resolve([]),
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
  useAuth: () => ({ session: { accessToken: "header.eyJzdWIiOiJ1c2VyLTEifQ.sig" } }),
}));

vi.mock("@/hooks/useTickets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTickets")>();

  return {
    ...actual,
    useTicket: () => TICKET_QUERY,
    // cursor undefined = pagina mais NOVA; cursor "c2" = pagina mais ANTIGA.
    useTicketComments: (_id: string, params?: { cursor?: string }) => {
      if (params?.cursor === "c2") return PAGE_OLDER;
      return phase === "after" ? PAGE_NEWER_AFTER_ADD_QUERY : PAGE_NEWER;
    },
    useAddComment: () => ({
      isPending: false,
      mutate: (
        _vars: unknown,
        options?: { onSuccess?: (created: { commentId: string }) => void },
      ) => {
        phase = "after";
        options?.onSuccess?.({ commentId: "novo" });
      },
    }),
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

function bodyText() {
  return document.body.textContent ?? "";
}

describe("TicketDetail ordem cronologica dos comentarios", () => {
  it("exibe os comentarios da pagina do mais antigo para o mais novo", () => {
    render(<TicketDetail />, { wrapper: createWrapper() });

    const text = bodyText();
    expect(text.indexOf("Recente 2")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Recente 2")).toBeLessThan(text.indexOf("Recente 1"));
  });

  it("carrega o historico mais antigo por cima do que ja esta na tela", () => {
    render(<TicketDetail />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole("button", { name: /Carregar comentários mais antigos/i }));

    const text = bodyText();
    expect(text.indexOf("Antigo 2")).toBeLessThan(text.indexOf("Antigo 1"));
    expect(text.indexOf("Antigo 1")).toBeLessThan(text.indexOf("Recente 2"));
    expect(text.indexOf("Recente 2")).toBeLessThan(text.indexOf("Recente 1"));
  });

  it("nao perde nem duplica comentario quando a pagina 0 muda de janela", () => {
    phase = "before";
    render(<TicketDetail />, { wrapper: createWrapper() });

    // Historico antigo carregado antes de comentar.
    fireEvent.click(screen.getByRole("button", { name: /Carregar comentários mais antigos/i }));

    // Comenta: a pagina 0 refaz a janela e "Recente 2" sai dela.
    fireEvent.change(screen.getByPlaceholderText(/Escreva um comentário/i), {
      target: { value: "Comentario novo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));

    const text = bodyText();
    // Ordem cronologica completa, sem gap ("Recente 2" continua na tela).
    expect(text.indexOf("Antigo 2")).toBeLessThan(text.indexOf("Antigo 1"));
    expect(text.indexOf("Antigo 1")).toBeLessThan(text.indexOf("Recente 2"));
    expect(text.indexOf("Recente 2")).toBeLessThan(text.indexOf("Recente 1"));
    expect(text.indexOf("Recente 1")).toBeLessThan(text.indexOf("Comentario novo"));

    for (const label of ["Antigo 1", "Antigo 2", "Recente 1", "Recente 2", "Comentario novo"]) {
      expect(text.split(label).length - 1).toBe(1);
    }
  });
});
