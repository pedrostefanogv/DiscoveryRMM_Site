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

  // ── transport_info: o contrato que prendia o selo em "NATS" ──────────────

  it("aceita webrtcReady (handshake de prontidao do viewer)", () => {
    expect(isRemoteSessionControlType("webrtcReady")).toBe(true);
    const env = buildViewerRemoteControlEnvelope("webrtcReady", "sess-1", 3);
    const raw = encodeRemoteControlEnvelope(env);
    const decoded = decodeRemoteControlEnvelope(new TextDecoder().decode(raw));
    expect(decoded?.type).toBe("webrtcReady");
    expect(decoded?.from).toBe("viewer");
  });

  it("decodifica o transport_info TIPADO publicado pelo agent", () => {
    const decoded = decodeRemoteControlEnvelope({
      v: 1,
      type: "transport_info",
      sessionId: "sess-1",
      from: "agent",
      payload: { transport: { state: "webrtc", active: "webrtc" } },
    });
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe("transport_info");
    const transport = decoded?.payload?.transport as Record<string, unknown>;
    expect(transport.state).toBe("webrtc");
  });

  it("faz a ponte do transport_info LEGADO ({action}) de agentes ja implantados", () => {
    // Sem esta ponte o frame era REJEITADO (o decoder exige o campo "type") e o
    // selo ficava preso no default ("NATS") mesmo com o peer connection
    // conectado e os data channels abertos.
    const decoded = decodeRemoteControlEnvelope({
      action: "transport_info",
      sessionId: "sess-1",
      transport: { state: "webrtc", active: "webrtc", hasStun: true },
    });
    expect(decoded).not.toBeNull();
    expect(decoded?.type).toBe("transport_info");
    expect(decoded?.from).toBe("agent");
    const transport = decoded?.payload?.transport as Record<string, unknown>;
    expect(transport.state).toBe("webrtc");
  });

  it("ignora transport_info legado sem bloco transport valido", () => {
    expect(
      decodeRemoteControlEnvelope({ action: "transport_info", sessionId: "s" }),
    ).toBeNull();
    expect(
      decodeRemoteControlEnvelope({
        action: "transport_info",
        sessionId: "s",
        transport: [1, 2],
      }),
    ).toBeNull();
  });
});
