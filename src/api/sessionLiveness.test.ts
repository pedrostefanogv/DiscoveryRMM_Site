import { describe, expect, it } from "vitest";
import {
  buildViewerControlEnvelope,
  CONTROL_PROTOCOL_VERSION,
  CONTROL_ROLE_AGENT,
  CONTROL_ROLE_VIEWER,
  decodeControlEnvelope,
  encodeControlEnvelope,
  isControlType,
  isOwnControlEnvelope,
  MAX_CONTROL_BYTES,
  resolveLivenessParams,
} from "./sessionLiveness";

describe("sessionLiveness (nucleo do canal de controle)", () => {
  it("monta o envelope do viewer com versao, tipo e papel", () => {
    const env = buildViewerControlEnvelope("ping", "sess-1", 7);
    expect(env.v).toBe(CONTROL_PROTOCOL_VERSION);
    expect(env.type).toBe("ping");
    expect(env.sessionId).toBe("sess-1");
    expect(env.from).toBe(CONTROL_ROLE_VIEWER);
    expect(env.sequence).toBe(7);
    expect(env.timestampUtc).toBeTruthy();
  });

  it("serializa e desserializa um frame valido", () => {
    const env = buildViewerControlEnvelope("ping", "sess-1", 1);
    const raw = encodeControlEnvelope(env);
    const decoded = decodeControlEnvelope(new TextDecoder().decode(raw));
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe("ping");
    expect(decoded?.sessionId).toBe("sess-1");
  });

  it("rejeita tipo fora da allow-list", () => {
    expect(isControlType("exec")).toBe(false);
    expect(isControlType("ping")).toBe(true);
    expect(
      decodeControlEnvelope({ type: "exec", from: "viewer", sessionId: "s" }),
    ).toBeNull();
  });

  it("rejeita from desconhecido e sessionId ausente", () => {
    expect(
      decodeControlEnvelope({ type: "ping", from: "root", sessionId: "s" }),
    ).toBeNull();
    expect(decodeControlEnvelope({ type: "ping", from: "viewer" })).toBeNull();
  });

  it("rejeita envelope acima do limite de bytes", () => {
    const huge = buildViewerControlEnvelope("ping", "sess-1", 1, {
      blob: "x".repeat(MAX_CONTROL_BYTES),
    });
    expect(() => encodeControlEnvelope(huge)).toThrow();
  });

  it("detecta o eco do proprio papel", () => {
    const own = buildViewerControlEnvelope("ping", "sess-1", 1);
    expect(isOwnControlEnvelope(own, CONTROL_ROLE_VIEWER)).toBe(true);
    expect(isOwnControlEnvelope(own, CONTROL_ROLE_AGENT)).toBe(false);
  });

  it("aplica defaults de liveness e respeita overrides", () => {
    expect(resolveLivenessParams({})).toEqual({
      pingIntervalMs: 5000,
      missedPingsBeforeClose: 3,
      initialGraceMs: 60000,
      keepAliveMs: 60000,
    });

    expect(
      resolveLivenessParams({
        pingIntervalSeconds: 10,
        missedPingsBeforeClose: 4,
        initialGraceSeconds: 30,
        keepAliveSeconds: 20,
      }),
    ).toEqual({
      pingIntervalMs: 10000,
      missedPingsBeforeClose: 4,
      initialGraceMs: 30000,
      keepAliveMs: 20000,
    });
  });
});
