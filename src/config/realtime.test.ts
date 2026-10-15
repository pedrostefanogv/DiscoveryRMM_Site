import { describe, expect, it } from "vitest";
import { resolveNatsWsUrl } from "./realtime";

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
