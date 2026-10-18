import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const {
  connectMock,
  subscribeMock,
  unsubscribeMock,
  canSubscribeToSubjectMock,
  getNatsServiceMock,
} = vi.hoisted(() => ({
  connectMock: vi.fn(),
  subscribeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  canSubscribeToSubjectMock: vi.fn(),
  getNatsServiceMock: vi.fn(),
}));

vi.mock("@/api/nats", () => ({ getNatsService: getNatsServiceMock }));

vi.mock("@/config/realtime", () => ({
  realtimeConfig: {
    provider: "nats",
    useNats: true,
    natsUrl: "wss://nats.test",
    natsEnabled: true,
    natsAuthMode: "auth_token",
  },
}));

import { useDashboardRealtime } from "./useDashboardRealtime";

/**
 * Regressão do "storm" de requisições na página inicial.
 *
 * O dashboard global era refetchado a cada evento NATS, sem nenhum limite, e
 * ainda por cima o useAgentStatusNats (montado no MainLayout) invalidava o
 * prefixo `["dashboard"]` em paralelo. Resultado: /dashboard/global/summary a
 * cada poucos segundos (o HAR mostrava ciclos de ~15 s com o MESMO corpo, porque
 * o backend responde de um cache de 45 s).
 */
describe("useDashboardRealtime — coalescência de invalidações", () => {
  let queryClient: QueryClient;
  let handlers: Array<(event: unknown) => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    handlers = [];

    connectMock.mockReset().mockResolvedValue(true);
    unsubscribeMock.mockReset();
    canSubscribeToSubjectMock.mockReset().mockReturnValue(true);
    subscribeMock.mockReset().mockImplementation(
      (_subject: string, handler: (event: unknown) => void) => {
        handlers.push(handler);
        return Promise.resolve(true);
      },
    );
    getNatsServiceMock.mockReset().mockReturnValue({
      connect: connectMock,
      subscribe: subscribeMock,
      unsubscribe: unsubscribeMock,
      canSubscribeToSubject: canSubscribeToSubjectMock,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  it("rajada de eventos NATS gera uma única invalidação dentro da janela", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { unmount } = renderHook(
      () => useDashboardRealtime("global", "24h"),
      { wrapper },
    );

    await vi.advanceTimersByTimeAsync(10);
    expect(handlers.length).toBeGreaterThan(0);

    // 20 eventos em rajada (heartbeats de 5 agentes em 4 assinaturas).
    for (let index = 0; index < 20; index += 1) {
      handlers[0]({
        eventType: "AgentHeartbeat",
        data: { agentId: `agent-${index % 5}` },
      });
    }

    const dashboardCalls = () =>
      invalidateSpy.mock.calls.filter((call) => {
        const opts = call[0] as { queryKey?: unknown[]; refetchType?: string } | undefined;
        return (
          Array.isArray(opts?.queryKey) &&
          opts.queryKey[0] === "dashboard" &&
          opts.refetchType !== "none"
        );
      });

    // Uma invalidação imediata (leading edge) por todo o burst...
    expect(dashboardCalls()).toHaveLength(1);

    // ...e a última da janela não é perdida (trailing edge).
    await vi.advanceTimersByTimeAsync(30_000);
    expect(dashboardCalls()).toHaveLength(2);

    unmount();
  });

  it("evento de outro cliente não invalida o dashboard daquele cliente", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { unmount } = renderHook(
      () => useDashboardRealtime({ clientId: "client-1" }, "24h"),
      { wrapper },
    );

    await vi.advanceTimersByTimeAsync(10);

    handlers[0]({
      eventType: "AgentHeartbeat",
      data: { agentId: "agent-1", clientId: "client-2" },
    });

    expect(invalidateSpy).not.toHaveBeenCalled();

    // Já o evento do próprio cliente invalida.
    handlers[0]({
      eventType: "AgentHeartbeat",
      data: { agentId: "agent-1", clientId: "client-1" },
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["dashboard", "client", "client-1", "24h"],
      refetchType: "active",
    });

    unmount();
  });
});
