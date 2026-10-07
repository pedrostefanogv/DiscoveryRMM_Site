import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getConfigMock, subscribeMock, unsubscribeMock, sendTestMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  subscribeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  sendTestMock: vi.fn(),
}));

vi.mock("@/api/push", () => ({
  pushApi: {
    getConfig: getConfigMock,
    subscribe: subscribeMock,
    unsubscribe: unsubscribeMock,
    sendTest: sendTestMock,
  },
}));

type WebPushModule = typeof import("@/services/webPush");

async function loadWebPush(): Promise<WebPushModule> {
  vi.resetModules();
  return await import("@/services/webPush");
}

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";
// Chave publica VAPID real (ponto P-256 nao comprimido, 65 bytes).
const VAPID_PUBLIC_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

function removeEnvironment(): void {
  delete (window as unknown as Record<string, unknown>).PushManager;
  delete (window as unknown as Record<string, unknown>).Notification;
  delete (window.navigator as unknown as Record<string, unknown>).serviceWorker;
}

function enableEnvironment(options: {
  supported: boolean;
  permission?: NotificationPermission;
  hasSubscription?: boolean;
}): void {
  if (!options.supported) {
    removeEnvironment();
    return;
  }

  const subscription = {
    endpoint: ENDPOINT,
    toJSON: () => ({ keys: { p256dh: "p256dh-value", auth: "auth-value" } }),
    unsubscribe: vi.fn(async () => true),
  };

  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => (options.hasSubscription === false ? null : subscription)),
      subscribe: vi.fn(async () => subscription),
    },
  };

  Object.defineProperty(window, "PushManager", { value: class PushManager {}, configurable: true });
  Object.defineProperty(window, "Notification", {
    value: {
      permission: options.permission ?? "granted",
      requestPermission: vi.fn(async () => options.permission ?? "granted"),
    },
    configurable: true,
  });
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: {
      getRegistration: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
    configurable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockResolvedValue({
    enabled: true,
    vapidPublicKey: VAPID_PUBLIC_KEY,
    subscriptionCount: 0,
  });
});

afterEach(() => {
  removeEnvironment();
});

describe("webPush — deteccao de estado", () => {
  it("reporta 'unsupported' quando a Push API nao existe", async () => {
    enableEnvironment({ supported: false });
    const webPush = await loadWebPush();

    await webPush.refreshWebPushState();

    expect(webPush.getWebPushSnapshot().status).toBe("unsupported");
  });

  it("reporta 'server-disabled' quando o servidor nao tem VAPID", async () => {
    enableEnvironment({ supported: true });
    getConfigMock.mockResolvedValue({ enabled: false, vapidPublicKey: "", subscriptionCount: 0 });
    const webPush = await loadWebPush();

    await webPush.refreshWebPushState();

    expect(webPush.getWebPushSnapshot().status).toBe("server-disabled");
  });

  it("reporta 'denied' quando a permissao esta bloqueada", async () => {
    enableEnvironment({ supported: true, permission: "denied" });
    const webPush = await loadWebPush();

    await webPush.refreshWebPushState();

    expect(webPush.getWebPushSnapshot().status).toBe("denied");
  });

  it("reporta 'prompt' quando nao ha inscricao no navegador", async () => {
    enableEnvironment({ supported: true, permission: "default", hasSubscription: false });
    const webPush = await loadWebPush();

    await webPush.refreshWebPushState();

    expect(webPush.getWebPushSnapshot().status).toBe("prompt");
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("sincroniza (upsert) uma inscricao ja existente", async () => {
    enableEnvironment({ supported: true, permission: "granted" });
    const webPush = await loadWebPush();

    await webPush.refreshWebPushState();

    expect(webPush.getWebPushSnapshot().status).toBe("subscribed");
    expect(subscribeMock).toHaveBeenCalledWith({
      endpoint: ENDPOINT,
      p256dh: "p256dh-value",
      auth: "auth-value",
      userAgent: expect.any(String),
    });
  });
});

describe("webPush — ativacao", () => {
  it("inscreve e registra no servidor quando a permissao e concedida", async () => {
    enableEnvironment({ supported: true, permission: "granted", hasSubscription: false });
    const webPush = await loadWebPush();

    await webPush.enableWebPush();

    expect(webPush.getWebPushSnapshot().status).toBe("subscribed");
    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });
});

describe("webPush — chave VAPID", () => {
  it("decodifica base64url para bytes do ponto nao comprimido", async () => {
    const webPush = await loadWebPush();

    const bytes = webPush.urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });
});
