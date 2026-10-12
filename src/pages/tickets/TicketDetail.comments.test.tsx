import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
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

// Quando definido, segura a resolucao do blob do anexo (teste de clique antes
// de a imagem carregar). null = resolve imediatamente.
let blobGate: Promise<void> | null = null;
let releaseBlobGate: (() => void) | null = null;

const COMMENTS = [
  {
    id: "c-1",
    ticketId: "ticket-1",
    author: "pedro.stefano",
    content: "Comentario proprio",
    isInternal: false,
    createdAt: "2026-09-27T21:52:00.000Z",
    attachments: [
      { id: "att-1", fileName: "print.png", contentType: "image/png", sizeBytes: 1024 },
    ],
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

// jsdom não implementa Object URLs; o componente cria a miniatura com elas.
beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:mock-image"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

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
      // Anexo de conversao: devolve um blob local (sem rede) para o preview.
      downloadCommentAttachment: async () => {
        if (blobGate) await blobGate;
        return { blob: new Blob(["fake"], { type: "image/png" }), fileName: "print.png" };
      },
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
  it("alinha proprio a direita e os demais a esquerda, com autor + data/hora", async () => {
    render(<TicketDetail />, { wrapper: createWrapper() });
    // Espera o blob da miniatura resolver: sem isso o setState fica fora do act.
    await screen.findByAltText("print.png");

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

  it("permite anexar arquivo/print direto do composer de comentario", async () => {
    render(<TicketDetail />, { wrapper: createWrapper() });
    await screen.findByAltText("print.png");

    // Antes só havia o painel "Anexos": quem comentava precisava sair do
    // composer. Agora o comentário aceita arquivo (seletor) e print (Ctrl+V).
    expect(screen.getByRole("button", { name: /anexar/i })).toBeTruthy();
    expect(screen.getByTitle(/Anexar arquivo ou print/i)).toBeTruthy();
  });

  it("usa o login do IAM quando o JWT nao traz unique_name", async () => {
    // Token sem unique_name: so o fallback pelo IAM pode identificar o autor.
    CURRENT_TOKEN = makeToken({ sub: "user-2" });

    render(<TicketDetail />, { wrapper: createWrapper() });
    await screen.findByAltText("print.png");

    await waitFor(() => {
      const ownBubble = screen.getByText("Comentario proprio");
      expect(ownBubble.className).toContain("bg-primary");
      expect(ownBubble.parentElement?.className).toContain("items-end");
    });

    const agentBubble = screen.getByText("Comentario do agent");
    expect(agentBubble.parentElement?.className).toContain("items-start");
  });

  it("abre a imagem do comentario em modal, sem baixar o arquivo", async () => {
    render(<TicketDetail />, { wrapper: createWrapper() });

    // Espera o blob autenticado virar a miniatura antes de clicar.
    const thumb = await screen.findByAltText("print.png");
    fireEvent.click(thumb.closest("button") as HTMLButtonElement);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe("blob:mock-image");
  });

  it("abre o modal mesmo clicando antes de a imagem carregar", async () => {
    blobGate = new Promise<void>((resolve) => {
      releaseBlobGate = resolve;
    });

    render(<TicketDetail />, { wrapper: createWrapper() });

    // O blob ainda nao chegou: antes isso baixava o arquivo em vez de abrir.
    fireEvent.click(screen.getByRole("button", { name: /print\.png/i }));
    releaseBlobGate?.();
    expect(await screen.findByRole("dialog")).toBeTruthy();

    blobGate = null;
    releaseBlobGate = null;
  });

  it("exibe uma miniatura maior no hover do anexo de imagem", async () => {
    render(<TicketDetail />, { wrapper: createWrapper() });

    const thumb = await screen.findByAltText("print.png");
    fireEvent.mouseEnter(thumb.closest("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(document.querySelectorAll("img.max-h-72").length).toBe(1);
    });
  });
});
