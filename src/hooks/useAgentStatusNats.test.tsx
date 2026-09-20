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

  it("não dispara múltiplos bootstrap_start em oscilação curta de escopo", async () => {
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

describe("useAgentStatusNats invalidação de queries", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();

    connectMock.mockReset().mockResolvedValue(true);
    subscribeMock.mockReset().mockResolvedValue(true);
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
      .mockImplementation(() => () => {});

    getNatsServiceMock.mockReset().mockReturnValue({
      connect: connectMock,
      subscribe: subscribeMock,
      unsubscribe: unsubscribeMock,
      canSubscribeToSubject: canSubscribeToSubjectMock,
      onConnectionStateChange: onConnectionStateChangeMock,
      getConnectionDiagnostics: getConnectionDiagnosticsMock,
    });
  });

  /**
   * Regressão: invalidar o prefixo ["agents"] a cada heartbeat refetchava o
   * lote completo da página do agente (detail + hardware + softwarePage +
   * softwareSnapshot) de forma intermitente — principalmente a aba
   * Aplicativos (software/page). O heartbeat já é aplicado otimisticamente;
   * só o detail pode ser reconciliado, no máximo 1x por minuto.
   */
  it("heartbeat NÃO invalida o prefixo ['agents'] — aplica otimista e reconcilia só o detail", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const handlers: Array<(event: unknown) => void> = [];
    subscribeMock.mockImplementation(
      (_subject: string, handler: (event: unknown) => void) => {
        handlers.push(handler);
        return Promise.resolve(true);
      },
    );

    queryClient.setQueryData(["agents", "detail", "agent-1"], {
      id: "agent-1",
      hostname: "host-01",
      status: "Online",
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    }

    const { unmount } = renderHook(
      () =>
        useAgentStatusNats(true, {
          level: "agent",
          agentId: "agent-1",
        } as AgentRealtimeScope),
      { wrapper: Wrapper },
    );

    await vi.advanceTimersByTimeAsync(350);
    expect(handlers.length).toBeGreaterThan(0);

    handlers.forEach((handler) => {
      handler({
        eventType: "AgentHeartbeat",
        data: {
          agentId: "agent-1",
          timestampUtc: "2026-01-01T00:00:00Z",
          cpuPercent: 12,
          memoryPercent: 40,
        },
      });
    });

    // Update otimista aplicado no cache do detail
    const detail = queryClient.getQueryData<{
      id: string;
      status: string;
      heartbeatMetrics?: { cpuPercent?: number };
    }>(["agents", "detail", "agent-1"]);
    expect(detail?.status).toBe("Online");
    expect(detail?.heartbeatMetrics?.cpuPercent).toBe(12);

    // Nenhuma invalidação com o prefixo ["agents"] puro
    const prefixOnly = invalidateSpy.mock.calls.filter((call) => {
      const opts = call[0] as { queryKey?: unknown[] } | undefined;
      return (
        Array.isArray(opts?.queryKey) &&
        opts.queryKey.length === 1 &&
        opts.queryKey[0] === "agents"
      );
    });
    expect(prefixOnly).toHaveLength(0);

    // Reconciliação estreita do detail presente (throttle de 60s)
    const detailInvalidations = invalidateSpy.mock.calls.filter((call) => {
      const opts = call[0] as { queryKey?: unknown[] } | undefined;
      return (
        Array.isArray(opts?.queryKey) &&
        opts.queryKey.length === 3 &&
        opts.queryKey[0] === "agents" &&
        opts.queryKey[1] === "detail" &&
        opts.queryKey[2] === "agent-1"
      );
    });
    expect(detailInvalidations).toHaveLength(1);

    unmount();
  });

  it("heartbeats repetidos dentro de 60s não re-invalidam o detail (throttle)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const handlers: Array<(event: unknown) => void> = [];
    subscribeMock.mockImplementation(
      (_subject: string, handler: (event: unknown) => void) => {
        handlers.push(handler);
        return Promise.resolve(true);
      },
    );

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    }

    const { unmount } = renderHook(
      () =>
        useAgentStatusNats(true, {
          level: "agent",
          agentId: "agent-1",
        } as AgentRealtimeScope),
      { wrapper: Wrapper },
    );

    await vi.advanceTimersByTimeAsync(350);

    const heartbeatEvent = {
      eventType: "AgentHeartbeat",
      data: { agentId: "agent-1", timestampUtc: "2026-01-01T00:00:00Z" },
    };
    handlers.forEach((handler) => handler(heartbeatEvent));
    handlers.forEach((handler) => handler(heartbeatEvent));
    handlers.forEach((handler) => handler(heartbeatEvent));

    const detailInvalidations = invalidateSpy.mock.calls.filter((call) => {
      const opts = call[0] as { queryKey?: unknown[] } | undefined;
      return (
        Array.isArray(opts?.queryKey) &&
        opts.queryKey.length === 3 &&
        opts.queryKey[0] === "agents" &&
        opts.queryKey[1] === "detail"
      );
    });
    expect(detailInvalidations).toHaveLength(1);

    unmount();
  });
});
