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

function createConnectionMock(closedPromise?: Promise<unknown>) {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    closed: vi.fn().mockReturnValue(closedPromise ?? new Promise(() => {})),
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

  it("connect em auth_token não chama endpoint de credenciais", async () => {
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

  it("connect em jwt_credentials envia o JWT escopado como auth_token", async () => {
    // O auth callout roda em modo config, onde o nats-server descarta o campo
    // "jwt" do CONNECT. A credencial escopada da sessão precisa ir como
    // auth_token para chegar ao callout (que reemite o JWT vinculado à chave
    // efêmera da conexão).
    wsconnectMock.mockResolvedValue(createConnectionMock());

    const natsService = getNatsService({
      url: "ws://localhost:9222",
      enabled: true,
      authMode: "jwt_credentials",
      credentialsProvider: async () => ({
        jwt: "scoped-nats-user-jwt",
        nkeySeed: "SUANDKJUZCC3KC5KRUNDKWXDKXTTCP7Y3TSHD52IKH4RF4HTXJJ7WU3IX4",
        publicKey: "",
        expiresAtUtc: new Date(Date.now() + 600_000).toISOString(),
        publishSubjects: [],
        subscribeSubjects: ["tenant.c.site.s.agent.a.remote-debug.log"],
      }),
    });

    const connected = await natsService.connect();

    expect(connected).toBe(true);
    expect(tokenAuthenticatorMock).toHaveBeenCalledWith("scoped-nats-user-jwt");
    expect(credsAuthenticatorMock).not.toHaveBeenCalled();
    expect(getApiAccessTokenMock).not.toHaveBeenCalled();
  });

  it("connect em auth_error não agenda reconexao infinita", async () => {
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

  it("subscribe com connectIfNeeded false não dispara connect extra", async () => {
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

  it("passa reconnect: false para o cliente NATS para controlar rotação de credenciais", async () => {
    wsconnectMock.mockResolvedValue(createConnectionMock());

    const natsService = getNatsService({
      url: "ws://localhost:9222",
      enabled: true,
      authMode: "auth_token",
    });

    await natsService.connect();

    expect(wsconnectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reconnect: false,
      }),
    );
  });

  it("renova credenciais proativamente antes da expiração sem cair em auth_error", async () => {
    vi.useFakeTimers();
    try {
      const firstConn = createConnectionMock();
      const secondConn = createConnectionMock();
      wsconnectMock
        .mockResolvedValueOnce(firstConn)
        .mockResolvedValueOnce(secondConn);

      let issuanceCount = 0;
      const natsService = getNatsService({
        url: "ws://localhost:9222",
        enabled: true,
        authMode: "jwt_credentials",
        credentialsProvider: async () => {
          issuanceCount += 1;
          return {
            jwt: `scoped-jwt-${issuanceCount}`,
            nkeySeed: "SUANDKJUZCC3KC5KRUNDKWXDKXTTCP7Y3TSHD52IKH4RF4HTXJJ7WU3IX4",
            publicKey: "",
            expiresAtUtc: new Date(Date.now() + 5 * 60_000).toISOString(),
            publishSubjects: [],
            subscribeSubjects: ["tenant.global.dashboard.events"],
          };
        },
      });

      await natsService.subscribe("tenant.global.dashboard.events", vi.fn());
      expect(issuanceCount).toBe(1);

      // Avança além da margem de 2 minutos antes da expiração de 5 minutos (3 min = 180s)
      await vi.advanceTimersByTimeAsync(185_000);

      expect(issuanceCount).toBe(2);
      expect(firstConn.close).toHaveBeenCalled();
      expect(natsService.getConnectionState()).toBe("connected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("tenta renovar credenciais uma vez quando conexão já aberta fecha com AuthorizationError", async () => {
    let resolveClosed!: (err: unknown) => void;
    const firstClosed = new Promise((resolve) => {
      resolveClosed = resolve;
    });
    const firstConn = createConnectionMock(firstClosed);
    const secondConn = createConnectionMock();
    wsconnectMock
      .mockResolvedValueOnce(firstConn)
      .mockResolvedValueOnce(secondConn);

    let issuanceCount = 0;
    const natsService = getNatsService({
      url: "ws://localhost:9222",
      enabled: true,
      authMode: "jwt_credentials",
      credentialsProvider: async () => {
        issuanceCount += 1;
        return {
          jwt: `scoped-jwt-${issuanceCount}`,
          nkeySeed: "SUANDKJUZCC3KC5KRUNDKWXDKXTTCP7Y3TSHD52IKH4RF4HTXJJ7WU3IX4",
          publicKey: "",
          expiresAtUtc: new Date(Date.now() + 30 * 60_000).toISOString(),
          publishSubjects: [],
          subscribeSubjects: ["tenant.global.dashboard.events"],
        };
      },
    });

    await natsService.subscribe("tenant.global.dashboard.events", vi.fn());
    expect(natsService.getConnectionState()).toBe("connected");

    const authErr = new Error("Authorization Violation");
    authErr.name = "AuthorizationError";
    resolveClosed(authErr);

    await vi.waitFor(() => {
      expect(issuanceCount).toBe(2);
      expect(natsService.getConnectionState()).toBe("connected");
    });
  });
});
