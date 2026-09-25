import { describe, expect, it } from "vitest";
import {
  buildViewerRemoteControlEnvelope,
  decodeRemoteControlEnvelope,
  encodeRemoteControlEnvelope,
  isOwnRemoteControlEnvelope,
  isRemoteSessionControlType,
  REMOTE_SESSION_CONTROL_VERSION,
  REMOTE_SESSION_MAX_CONTROL_BYTES,
  toLivenessConnectionState,
} from "./remoteSessionControl";

describe("remoteSessionControl (canal .control do acesso remoto)", () => {
  it("monta o envelope do viewer com versao, tipo e papel", () => {
    const env = buildViewerRemoteControlEnvelope("ping", "sess-1", 7);
    expect(env.v).toBe(REMOTE_SESSION_CONTROL_VERSION);
    expect(env.type).toBe("ping");
    expect(env.sessionId).toBe("sess-1");
    expect(env.from).toBe("viewer");
    expect(env.sequence).toBe(7);
    expect(env.timestampUtc).toBeTruthy();
  });

  it("serializa e desserializa um frame valido", () => {
    const env = buildViewerRemoteControlEnvelope("keyframe", "sess-1", 1);
    const raw = encodeRemoteControlEnvelope(env);
    const decoded = decodeRemoteControlEnvelope(new TextDecoder().decode(raw));
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe("keyframe");
    expect(decoded?.sessionId).toBe("sess-1");
  });

  it("aceita o keyframe legado (action) sem sessionId", () => {
    const decoded = decodeRemoteControlEnvelope({ action: "keyframe" });
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe("keyframe");
    expect(decoded?.from).toBe("viewer");
    expect(decoded?.sessionId).toBe("");
  });

  it("rejeita tipo fora da allow-list (inclui setLevel do debug)", () => {
    expect(isRemoteSessionControlType("setLevel")).toBe(false);
    expect(isRemoteSessionControlType("ping")).toBe(true);
    expect(
      decodeRemoteControlEnvelope({
        type: "setLevel",
        from: "agent",
        sessionId: "s",
      }),
    ).toBeNull();
  });

  it("rejeita from desconhecido e sessionId ausente", () => {
    expect(
      decodeRemoteControlEnvelope({ type: "ping", from: "root", sessionId: "s" }),
    ).toBeNull();
    expect(decodeRemoteControlEnvelope({ type: "ping", from: "viewer" })).toBeNull();
  });

  it("rejeita envelope acima do limite de bytes", () => {
    const huge = buildViewerRemoteControlEnvelope("ping", "sess-1", 1, {
      blob: "x".repeat(REMOTE_SESSION_MAX_CONTROL_BYTES),
    });
    expect(() => encodeRemoteControlEnvelope(huge)).toThrow();
  });

  it("detecta o eco do proprio papel", () => {
    const own = buildViewerRemoteControlEnvelope("ping", "sess-1", 1);
    expect(isOwnRemoteControlEnvelope(own, "viewer")).toBe(true);
    expect(isOwnRemoteControlEnvelope(own, "agent")).toBe(false);
  });

  it("mapeia o estado da conexao NATS para a liveness", () => {
    expect(toLivenessConnectionState("connected")).toBe("connected");
    expect(toLivenessConnectionState("reconnecting")).toBe("reconnecting");
    expect(toLivenessConnectionState("connecting")).toBe("connecting");
    expect(toLivenessConnectionState("auth_error")).toBe("closed");
    expect(toLivenessConnectionState("disconnected")).toBe("closed");
  });
});
