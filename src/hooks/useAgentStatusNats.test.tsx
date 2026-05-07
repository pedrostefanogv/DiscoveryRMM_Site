import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const {
  connectMock,
  subscribeMock,
  unsubscribeMock,
  canSubscribeToSubjectMock,
  onConnectionStateChangeMock,
  getConnectionDiagnosticsMock,
  getNatsServiceMock,
} = vi.hoisted(() => ({
  connectMock: vi.fn(),
  subscribeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  canSubscribeToSubjectMock: vi.fn(),
  onConnectionStateChangeMock: vi.fn(),
  getConnectionDiagnosticsMock: vi.fn(),
  getNatsServiceMock: vi.fn(),
}));

vi.mock("@/api/nats", () => ({
  getNatsService: getNatsServiceMock,
}));

import { useAgentStatusNats, type AgentRealtimeScope } from "./useAgentStatusNats";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useAgentStatusNats bootstrap stabilization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();

    connectMock.mockReset().mockResolvedValue(false);
    subscribeMock.mockReset().mockResolvedValue(false);
    unsubscribeMock.mockReset();
    canSubscribeToSubjectMock.mockReset().mockReturnValue(true);
    getConnectionDiagnosticsMock
      .mockReset()
      .mockReturnValue({
        lastErrorType: null,
        lastErrorMessage: null,
        lastErrorAtUtc: null,
      });

    onConnectionStateChangeMock
      .mockReset()
      .mockImplementation((listener: (state: string) => void) => {
        listener("disconnected");
        return () => {};
      });

    getNatsServiceMock.mockReset().mockReturnValue({
      connect: connectMock,
      subscribe: subscribeMock,
      unsubscribe: unsubscribeMock,
      canSubscribeToSubject: canSubscribeToSubjectMock,
      onConnectionStateChange: onConnectionStateChangeMock,
      getConnectionDiagnostics: getConnectionDiagnosticsMock,
    });
  });

  it("nao dispara multiplos bootstrap_start em oscilacao curta de escopo", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const wrapper = createWrapper();

    const { rerender, unmount } = renderHook(
      ({ scope }) => useAgentStatusNats(true, scope),
      {
        wrapper,
        initialProps: {
          scope: { level: "agent", agentId: "agent-1" } as AgentRealtimeScope,
        },
      },
    );

    rerender({
      scope: {
        level: "agent",
        agentId: "agent-1",
        clientId: "client-1",
        siteId: "site-1",
      } as AgentRealtimeScope,
    });

    await vi.advanceTimersByTimeAsync(350);

    const bootstrapStarts = infoSpy.mock.calls.filter((call) => {
      const [tag, payload] = call;
      if (tag !== "[NATS][telemetry]") return false;
      if (!payload || typeof payload !== "object") return false;
      return (
        (payload as Record<string, unknown>).event === "bootstrap_start"
      );
    });

    expect(bootstrapStarts).toHaveLength(1);

    unmount();
  });
});
