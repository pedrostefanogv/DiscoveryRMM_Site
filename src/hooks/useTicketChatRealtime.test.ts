import { describe, expect, it } from "vitest";
import { isTicketChatEventForTicket, TICKET_CHAT_EVENT_TYPE } from "./useTicketChatRealtime";

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
