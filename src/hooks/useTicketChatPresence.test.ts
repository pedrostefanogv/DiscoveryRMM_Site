import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setPresenceMock } = vi.hoisted(() => ({ setPresenceMock: vi.fn() }));

vi.mock("@/api/ticket-chat", () => ({
  ticketChatApi: { setPresence: setPresenceMock },
}));

import {
  TICKET_CHAT_PRESENCE_HEARTBEAT_MS,
  useTicketChatPresence,
} from "./useTicketChatPresence";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

describe("useTicketChatPresence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setPresenceMock.mockResolvedValue(undefined);
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  it("marca presenca ao montar e limpa ao desmontar", () => {
    const { unmount } = renderHook(() => useTicketChatPresence("ticket-1", true));

    expect(setPresenceMock).toHaveBeenCalledWith("ticket-1", true);

    unmount();

    expect(setPresenceMock).toHaveBeenCalledWith("ticket-1", false);
  });

  it("renova por heartbeat enquanto a janela esta visivel", () => {
    renderHook(() => useTicketChatPresence("ticket-1", true));
    setPresenceMock.mockClear();

    act(() => {
      vi.advanceTimersByTime(TICKET_CHAT_PRESENCE_HEARTBEAT_MS);
    });

    expect(setPresenceMock).toHaveBeenCalledWith("ticket-1", true);
  });

  it("limpa a presenca quando a aba fica oculta e retoma ao voltar", () => {
    renderHook(() => useTicketChatPresence("ticket-1", true));
    setPresenceMock.mockClear();

    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(setPresenceMock).toHaveBeenCalledWith("ticket-1", false);

    setPresenceMock.mockClear();
    setVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(setPresenceMock).toHaveBeenCalledWith("ticket-1", true);
  });

  it("nao faz nada quando desabilitado", () => {
    renderHook(() => useTicketChatPresence("ticket-1", false));

    expect(setPresenceMock).not.toHaveBeenCalled();
  });
});