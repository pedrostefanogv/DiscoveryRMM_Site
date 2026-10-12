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

function setFocus(focused: boolean) {
  Object.defineProperty(document, "hasFocus", { configurable: true, value: () => focused });
}

function dispatchVisibilityChange() {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("useTicketChatPresence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setPresenceMock.mockResolvedValue(undefined);
    setVisibility("visible");
    setFocus(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
    setFocus(true);
  });

  it("marca presenca ao montar e limpa ao desmontar", () => {
    const { unmount } = renderHook(() => useTicketChatPresence("ticket-1", true));

    expect(setPresenceMock).toHaveBeenCalledWith("ticket-1", true, expect.any(String));

    unmount();

    expect(setPresenceMock).toHaveBeenCalledWith("ticket-1", false, expect.any(String));
  });

  it("usa o MESMO clientId no toque e na limpeza", () => {
    const { unmount } = renderHook(() => useTicketChatPresence("ticket-1", true));
    const touchedWith = setPresenceMock.mock.calls[0][2];

    unmount();

    const clearedCall = setPresenceMock.mock.calls.find((call) => call[1] === false);
    expect(clearedCall?.[2]).toBe(touchedWith);
  });

  it("renova por heartbeat enquanto a janela esta visivel e em foco", () => {
    renderHook(() => useTicketChatPresence("ticket-1", true));
    setPresenceMock.mockClear();

    act(() => {
      vi.advanceTimersByTime(TICKET_CHAT_PRESENCE_HEARTBEAT_MS);
    });

    expect(setPresenceMock).toHaveBeenCalledWith("ticket-1", true, expect.any(String));
  });

  it("limpa a presenca quando a aba fica oculta e retoma ao voltar", () => {
    renderHook(() => useTicketChatPresence("ticket-1", true));
    setPresenceMock.mockClear();

    setVisibility("hidden");
    dispatchVisibilityChange();

    expect(setPresenceMock).toHaveBeenCalledWith("ticket-1", false, expect.any(String));

    setPresenceMock.mockClear();
    setVisibility("visible");
    dispatchVisibilityChange();

    expect(setPresenceMock).toHaveBeenCalledWith("ticket-1", true, expect.any(String));
  });

  it("limpa a presenca quando a janela perde o foco e retoma ao focar", () => {
    renderHook(() => useTicketChatPresence("ticket-1", true));
    setPresenceMock.mockClear();

    setFocus(false);
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    expect(setPresenceMock).toHaveBeenCalledWith("ticket-1", false, expect.any(String));

    setPresenceMock.mockClear();
    setFocus(true);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(setPresenceMock).toHaveBeenCalledWith("ticket-1", true, expect.any(String));
  });

  it("nao faz nada quando desabilitado", () => {
    renderHook(() => useTicketChatPresence("ticket-1", false));

    expect(setPresenceMock).not.toHaveBeenCalled();
  });
});