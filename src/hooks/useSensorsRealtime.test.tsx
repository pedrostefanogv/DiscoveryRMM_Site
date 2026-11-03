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

import { useSensorsRealtime, isSensorStatusChangedForAgent } from "./useSensorsRealtime";
import { SENSOR_KEYS } from "./useSensors";

/**
 * Realtime da aba "Sensores": o evento de dashboard (SensorStatusChanged) tem de
 * invalidar a query da ABA DAQUELE agente — e só ela. O polling de 30s continua
 * como fallback, então este hook nunca deve refazer o payload de outro agente.
 */
describe("useSensorsRealtime", () => {
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
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  /** Liga o painel e devolve o handler que o NATS chamaria. */
  async function mountAgent(agentId = "agent-1") {
    const rendered = renderHook(() => useSensorsRealtime(agentId), { wrapper });
    await vi.advanceTimersByTimeAsync(10);
    return { ...rendered, handler: handlers[0] };
  }

  it("assina os subjects do dashboard e invalida a query do agente", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { handler, unmount } = await mountAgent();

    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalled();
    expect(handler).toBeTypeOf("function");

    handler({
      eventType: "SensorStatusChanged",
      data: { agentId: "agent-1", sensorId: "s1", status: "Failing", severity: "Critical" },
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: SENSOR_KEYS.byAgent("agent-1"),
      refetchType: "active",
    });

    unmount();
  });

  it("não invalida a aba por eventos de outros tipos ou de outro agente", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { handler, unmount } = await mountAgent();

    handler({ eventType: "AgentHeartbeat", data: { agentId: "agent-1" } });
    handler({ eventType: "SensorStatusChanged", data: { agentId: "outro-agente" } });
    handler({ eventType: "PatchScanCompleted", data: { agentId: "agent-1" } });

    expect(invalidateSpy).not.toHaveBeenCalled();

    unmount();
  });

  it("faz throttle do burst de sensores do mesmo ciclo de coleta", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { handler, unmount } = await mountAgent();

    // Um agente com 4 sensores publica 4 eventos quase juntos.
    for (const sensorId of ["s1", "s2", "s3", "s4"]) {
      handler({ eventType: "SensorStatusChanged", data: { agentId: "agent-1", sensorId } });
    }
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    // A última invalidação da janela não é perdida (trailing edge).
    await vi.advanceTimersByTimeAsync(10_000);
    expect(invalidateSpy).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("não assina quando o agentId não foi informado", async () => {
    renderHook(() => useSensorsRealtime(null), { wrapper });
    await vi.advanceTimersByTimeAsync(10);

    expect(connectMock).not.toHaveBeenCalled();
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("cancela as assinaturas ao desmontar", async () => {
    const { unmount } = await mountAgent();
    const subscribedSubjects = subscribeMock.mock.calls.length;
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(subscribedSubjects);
  });
});

describe("isSensorStatusChangedForAgent", () => {
  it("aceita o evento do próprio agente (data aninhado ou achatado)", () => {
    expect(
      isSensorStatusChangedForAgent(
        { eventType: "SensorStatusChanged", data: { agentId: "a1" } },
        "a1",
      ),
    ).toBe(true);
    expect(
      isSensorStatusChangedForAgent({ eventType: "SensorStatusChanged", agentId: "a1" }, "a1"),
    ).toBe(true);
  });

  it("rejeita outros tipos de evento e outros agentes", () => {
    expect(
      isSensorStatusChangedForAgent({ eventType: "SensorStatusChanged", data: { agentId: "a2" } }, "a1"),
    ).toBe(false);
    expect(
      isSensorStatusChangedForAgent({ eventType: "AgentHeartbeat", data: { agentId: "a1" } }, "a1"),
    ).toBe(false);
  });

  it("aceita evento sem agentId (evita aba presa) e tolera entradas inválidas", () => {
    expect(isSensorStatusChangedForAgent({ eventType: "SensorStatusChanged" }, "a1")).toBe(true);
    expect(isSensorStatusChangedForAgent(null, "a1")).toBe(false);
    expect(isSensorStatusChangedForAgent(undefined, "a1")).toBe(false);
    expect(isSensorStatusChangedForAgent({} as never, "a1")).toBe(false);
  });
});
