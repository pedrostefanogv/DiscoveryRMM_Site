import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveNatsWsUrl } from "./realtime";

const ORIGINAL_AUTH_MODE = import.meta.env.VITE_NATS_AUTH_MODE;

/**
 * O default do modo de autenticação precisa ser `jwt_credentials`.
 *
 * BUG 2026-11-21 (tupa.pstefano.com.br): o instalador não definia
 * VITE_NATS_AUTH_MODE, o build caía no default `auth_token` e o dashboard
 * exibia "Falha de rede NATS"/"Offline". O nats-server deste produto autentica
 * via auth_callout (JWT); sem JWT ele não roteia para o callout e a conexão
 * expira no `timeout: 30` do bloco authorization. Estes testes travam o
 * default para que a regressão não volte silenciosamente.
 */
async function loadRealtimeConfig() {
  const mod = await import("./realtime");
  return mod.realtimeConfig;
}

describe("realtimeConfig.natsAuthMode", () => {
  afterEach(() => {
    if (ORIGINAL_AUTH_MODE === undefined) {
      vi.stubEnv("VITE_NATS_AUTH_MODE", "");
      vi.unstubAllEnvs();
    } else {
      vi.stubEnv("VITE_NATS_AUTH_MODE", ORIGINAL_AUTH_MODE);
      vi.unstubAllEnvs();
    }
    vi.resetModules();
  });

  it("usa jwt_credentials quando VITE_NATS_AUTH_MODE não está definida", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_NATS_AUTH_MODE", undefined as unknown as string);

    const config = await loadRealtimeConfig();

    expect(config.natsAuthMode).toBe("jwt_credentials");
  });

  it("respeita auth_token quando explicitamente configurado", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_NATS_AUTH_MODE", "auth_token");

    const config = await loadRealtimeConfig();

    expect(config.natsAuthMode).toBe("auth_token");
  });

  it("normaliza valores em caixa alta", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_NATS_AUTH_MODE", "JWT_CREDENTIALS");

    const config = await loadRealtimeConfig();

    expect(config.natsAuthMode).toBe("jwt_credentials");
  });
});

describe("resolveNatsWsUrl", () => {
  it("usa o valor configurado no painel e garante a barra final", () => {
    expect(resolveNatsWsUrl("wss://nats.exemplo.com/nats")).toBe("wss://nats.exemplo.com/nats/");
    expect(resolveNatsWsUrl("wss://nats.exemplo.com/nats/")).toBe("wss://nats.exemplo.com/nats/");
  });

  it("deriva do próprio endpoint do site quando o campo está vazio", () => {
    expect(resolveNatsWsUrl("", "https://discovery.pstefano.com.br")).toBe(
      "wss://discovery.pstefano.com.br/nats/",
    );
    expect(resolveNatsWsUrl(null, "http://192.168.10.82")).toBe("ws://192.168.10.82/nats/");
    expect(resolveNatsWsUrl("   ", "https://host")).toBe("wss://host/nats/");
  });

  it("retorna vazio quando não há configuração nem origem disponível", () => {
    expect(resolveNatsWsUrl("", "")).toBe("");
    expect(resolveNatsWsUrl(undefined, "")).toBe("");
  });
});
