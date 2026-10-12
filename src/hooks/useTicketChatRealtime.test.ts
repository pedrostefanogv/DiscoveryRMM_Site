import { describe, expect, it } from "vitest";
import {
  isTicketChatEventForSession,
  isTicketChatEventForTicket,
  TICKET_CHAT_EVENT_TYPE,
} from "./useTicketChatRealtime";

describe("isTicketChatEventForTicket", () => {
  const ticketId = "01a12af7-c958-7c37-a15a-f78493022277";

  it("aceita o sinal do chat do próprio chamado", () => {
    expect(
      isTicketChatEventForTicket(
        {
          eventType: TICKET_CHAT_EVENT_TYPE,
          data: { ticketId, sessionId: "s1", authorKind: "enduser", sequence: 4 },
        },
        ticketId,
      ),
    ).toBe(true);
  });

  it("ignora eventos de outros chamados", () => {
    expect(
      isTicketChatEventForTicket(
        { eventType: TICKET_CHAT_EVENT_TYPE, data: { ticketId: "outro" } },
        ticketId,
      ),
    ).toBe(false);
  });

  it("ignora outros eventType do dashboard", () => {
    expect(
      isTicketChatEventForTicket(
        { eventType: "AgentHeartbeat", data: { ticketId } },
        ticketId,
      ),
    ).toBe(false);
  });

  it("ignora evento sem ticketId (nada de invalidar por engano)", () => {
    expect(isTicketChatEventForTicket({ eventType: TICKET_CHAT_EVENT_TYPE, data: {} }, ticketId)).toBe(false);
    expect(isTicketChatEventForTicket(null, ticketId)).toBe(false);
  });
});

describe("isTicketChatEventForSession", () => {
  const sessionId = "9d2c1f4a-1111-4b2c-8d3e-222233334444";

  it("aceita o sinal da conversa avulsa (sem ticketId)", () => {
    expect(
      isTicketChatEventForSession(
        {
          eventType: TICKET_CHAT_EVENT_TYPE,
          data: { ticketId: null, sessionId, authorKind: "enduser", sequence: 2 },
        },
        sessionId,
      ),
    ).toBe(true);
  });

  it("ignora sinais de outra sessão", () => {
    expect(
      isTicketChatEventForSession(
        { eventType: TICKET_CHAT_EVENT_TYPE, data: { sessionId: "outra" } },
        sessionId,
      ),
    ).toBe(false);
  });

  it("ignora evento sem sessionId", () => {
    expect(isTicketChatEventForSession({ eventType: TICKET_CHAT_EVENT_TYPE, data: {} }, sessionId)).toBe(false);
    expect(isTicketChatEventForSession(null, sessionId)).toBe(false);
  });
});
