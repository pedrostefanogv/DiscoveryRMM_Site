import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createNatsServiceMock,
  connectMock,
  subscribeMock,
  unsubscribeMock,
  publishMock,
  disconnectMock,
  disposeMock,
  stateMock,
  setPreSuppliedCredentialsMock,
  renewSessionMock,
  getSessionCredentialsMock,
} = vi.hoisted(() => ({
  createNatsServiceMock: vi.fn(),
  connectMock: vi.fn(),
  subscribeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  publishMock: vi.fn(),
  disconnectMock: vi.fn(),
  disposeMock: vi.fn(),
  stateMock: vi.fn(),
  setPreSuppliedCredentialsMock: vi.fn(),
  renewSessionMock: vi.fn(),
  getSessionCredentialsMock: vi.fn(),
}));

vi.mock("@/api/nats", () => ({
  createNatsService: createNatsServiceMock,
}));

vi.mock("@/api/remote-sessions", () => ({
  remoteSessionsApi: {
    renewSession: renewSessionMock,
    getSessionCredentials: getSessionCredentialsMock,
  },
}));

import { useRemoteSessionLiveness } from "./useRemoteSessionLiveness";

const NATS_SUBJECT = "tenant.client.site.agent.remote.session.sess1";
const CONTROL_SUBJECT = NATS_SUBJECT + ".control";

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    agentId: "agent-1",
    sessionId: "sess1",
    natsSubject: NATS_SUBJECT,
    natsUrl: "wss://nats.example/",
    jwt: "jwt-token",
    nkeySeed: "seed",
    credsExpiresAtUtc: new Date(Date.now() + 60 * 60_000).toISOString(),
    pingIntervalSeconds: 0.02,
    keepAliveSeconds: 0.02,
    ...overrides,
  };
}

describe("useRemoteSessionLiveness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectMock.mockResolvedValue(true);
    subscribeMock.mockResolvedValue(true);
    publishMock.mockResolvedValue(undefined);
    disconnectMock.mockResolvedValue(undefined);
    disposeMock.mockResolvedValue(undefined);
    stateMock.mockImplementation((listener: (state: string) => void) => {
      listener("connected");
      return () => {};
    });
    renewSessionMock.mockResolvedValue({
      sessionId: "sess1",
      status: "active",
      expiresAtUtc: new Date(Date.now() + 30 * 60_000).toISOString(),
      maxExpiresAtUtc: new Date(Date.now() + 120 * 60_000).toISOString(),
      sessionActive: true,
      endReason: null,
    });
    getSessionCredentialsMock.mockResolvedValue({
      jwt: "jwt-token",
      nkeySeed: "seed",
      expiresAtUtc: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    createNatsServiceMock.mockReturnValue({
      connect: connectMock,
      subscribe: subscribeMock,
      unsubscribe: unsubscribeMock,
      publish: publishMock,
      disconnect: disconnectMock,
      dispose: disposeMock,
      onConnectionStateChange: stateMock,
      setPreSuppliedCredentials: setPreSuppliedCredentialsMock,
    });
  });

  it("cria conexao isolada, assina o .control e publica ping", async () => {
    const { result } = renderHook(() => useRemoteSessionLiveness(baseOptions()));

    await waitFor(() => expect(subscribeMock).toHaveBeenCalled());
    expect(createNatsServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ authMode: "jwt_credentials", enabled: true }),
    );
    expect(setPreSuppliedCredentialsMock).toHaveBeenCalled();
    expect(subscribeMock.mock.calls[0][0]).toBe(CONTROL_SUBJECT);

    await waitFor(() =>
      expect(publishMock).toHaveBeenCalledWith(
        CONTROL_SUBJECT,
        expect.objectContaining({ type: "ping", from: "viewer" }),
      ),
    );
    expect(result.current.connectionState).toBe("connected");
  });

  it("pong do agente marca a sessao como viva", async () => {
    const { result } = renderHook(() => useRemoteSessionLiveness(baseOptions()));
    await waitFor(() => expect(subscribeMock).toHaveBeenCalled());

    const onControl = subscribeMock.mock.calls[0][1] as (
      message: unknown,
    ) => void;
    act(() => {
      onControl({ v: 1, type: "pong", sessionId: "sess1", from: "agent" });
    });

    await waitFor(() => expect(result.current.status).toBe("alive"));
  });

  it("ignora o eco do proprio viewer e sessoes diferentes", async () => {
    const { result } = renderHook(() => useRemoteSessionLiveness(baseOptions()));
    await waitFor(() => expect(subscribeMock).toHaveBeenCalled());
    const onControl = subscribeMock.mock.calls[0][1] as (message: unknown) => void;

    act(() => {
      onControl({ v: 1, type: "pong", sessionId: "sess1", from: "viewer" });
      onControl({ v: 1, type: "pong", sessionId: "outra", from: "agent" });
    });

    expect(result.current.status).not.toBe("alive");
  });

  it("renova a sessao no servidor e propaga o teto absoluto", async () => {
    const onKeepAlive = vi.fn();
    renderHook(() =>
      useRemoteSessionLiveness(baseOptions({ onKeepAlive })),
    );

    await waitFor(() => expect(renewSessionMock).toHaveBeenCalled());
    await waitFor(() => expect(onKeepAlive).toHaveBeenCalled());
    expect(onKeepAlive.mock.calls[0][0]).toBeTruthy();
    expect(onKeepAlive.mock.calls[0][1]).toBeTruthy();
  });

  it("closed do agente dispara onExpired com o motivo", async () => {
    const onExpired = vi.fn();
    renderHook(() => useRemoteSessionLiveness(baseOptions({ onExpired })));
    await waitFor(() => expect(subscribeMock).toHaveBeenCalled());
    const onControl = subscribeMock.mock.calls[0][1] as (message: unknown) => void;

    act(() => {
      onControl({
        v: 1,
        type: "closed",
        sessionId: "sess1",
        from: "agent",
        payload: { reason: "max-duration" },
      });
    });

    await waitFor(() => expect(onExpired).toHaveBeenCalledWith("max-duration"));
  });

  it("nao conecta quando desabilitado", () => {
    renderHook(() => useRemoteSessionLiveness(baseOptions({ enabled: false })));
    expect(createNatsServiceMock).not.toHaveBeenCalled();
  });
});
