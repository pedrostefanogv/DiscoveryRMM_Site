import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  apiPostMock,
  getApiAccessTokenMock,
  wsconnectMock,
  tokenAuthenticatorMock,
  credsAuthenticatorMock,
} = vi.hoisted(() => ({
  apiPostMock: vi.fn(),
  getApiAccessTokenMock: vi.fn(),
  wsconnectMock: vi.fn(),
  tokenAuthenticatorMock: vi.fn(),
  credsAuthenticatorMock: vi.fn(),
}));

vi.mock("./client", () => ({
  api: {
    post: apiPostMock,
  },
  ApiError: class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  },
  getApiAccessToken: getApiAccessTokenMock,
}));

vi.mock("@nats-io/nats-core", () => ({
  wsconnect: wsconnectMock,
  tokenAuthenticator: tokenAuthenticatorMock,
  credsAuthenticator: credsAuthenticatorMock,
}));

import { getNatsService, resetNatsService } from "./nats";

function createConnectionMock() {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    closed: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
    publish: vi.fn(),
    subscribe: vi.fn(),
  };
}

describe("NatsService auth mode", () => {
  beforeEach(() => {
    resetNatsService();
    apiPostMock.mockReset();
    getApiAccessTokenMock.mockReset().mockReturnValue("access-token");
    wsconnectMock.mockReset();
    tokenAuthenticatorMock.mockReset().mockReturnValue(vi.fn());
    credsAuthenticatorMock.mockReset().mockReturnValue(vi.fn());
  });

  it("connect em auth_token nao chama endpoint de credenciais", async () => {
    wsconnectMock.mockResolvedValue(createConnectionMock());

    const natsService = getNatsService({
      url: "ws://localhost:9222",
      enabled: true,
      authMode: "auth_token",
    });

    const connected = await natsService.connect();

    expect(connected).toBe(true);
    expect(getApiAccessTokenMock).toHaveBeenCalled();
    expect(tokenAuthenticatorMock).toHaveBeenCalledWith("access-token");
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(credsAuthenticatorMock).not.toHaveBeenCalled();
  });

  it("connect em auth_error nao agenda reconexao infinita", async () => {
    const authorizationError = new Error("Authorization Violation");
    authorizationError.name = "AuthorizationError";
    wsconnectMock.mockRejectedValue(authorizationError);

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const natsService = getNatsService({
      url: "ws://localhost:9222",
      enabled: true,
      authMode: "auth_token",
    });

    const connected = await natsService.connect();

    expect(connected).toBe(false);
    expect(natsService.getConnectionState()).toBe("auth_error");
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it("subscribe com connectIfNeeded false nao dispara connect extra", async () => {
    const natsService = getNatsService({
      url: "ws://localhost:9222",
      enabled: true,
      authMode: "auth_token",
    });

    const connectSpy = vi.spyOn(natsService, "connect");

    const subscribed = await natsService.subscribe(
      "tenant.global.dashboard.events",
      vi.fn(),
      { connectIfNeeded: false },
    );

    expect(subscribed).toBe(false);
    expect(connectSpy).not.toHaveBeenCalled();
  });
});
