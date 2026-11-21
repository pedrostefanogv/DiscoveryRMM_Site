import { describe, expect, it } from "vitest";
import {
  TRANSPORT_STATE_FALLBACK,
  TRANSPORT_STATE_NATS,
  TRANSPORT_STATE_WEBRTC,
  describeTransport,
  parseTransportControlFrame,
  parseTransportEvent,
  resolveWebRtcKinds,
} from "./transportIndicator";

describe("describeTransport", () => {
  it("assume NATS quando não há informação", () => {
    for (const input of [null, undefined]) {
      const p = describeTransport(input);
      expect(p.label).toBe("NATS");
      expect(p.tone).toBe("slate");
    }
  });

  it("reconhece WebRTC como sucesso", () => {
    const p = describeTransport({ state: TRANSPORT_STATE_WEBRTC, hasStun: true, hasTurn: true });
    expect(p.label).toBe("WebRTC");
    expect(p.tone).toBe("success");
  });

  it("marca o fallback como ATENÇÃO, não como sucesso nem erro", () => {
    // O ponto do indicador: a sessão funciona, mas não pelo caminho configurado.
    const p = describeTransport({
      state: TRANSPORT_STATE_FALLBACK,
      reason: "ICE falhou: timeout",
    });
    expect(p.tone).toBe("warning");
    expect(p.label).toContain("fallback");
    expect(p.title).toContain("ICE falhou: timeout");
    expect(p.title).toContain("continua funcionando");
  });

  it("mostra NATS com o motivo quando o WebRTC foi recusado", () => {
    const p = describeTransport({ state: TRANSPORT_STATE_NATS, reason: "relayOnly sem servidor TURN" });
    expect(p.label).toBe("NATS");
    expect(p.title).toContain("relayOnly sem servidor TURN");
  });

  it("trata estado desconhecido como NATS", () => {
    // Na dúvida, exibir o transporte básico — nunca prometer P2P que pode não
    // ser verdade.
    const p = describeTransport({ state: "quantico" });
    expect(p.label).toBe("NATS");
    expect(p.tone).toBe("slate");
  });

  it("explica a configuração ICE no tooltip", () => {
    expect(describeTransport({ state: TRANSPORT_STATE_WEBRTC, relayOnly: true }).title)
      .toContain("relayOnly");
    expect(describeTransport({ state: TRANSPORT_STATE_WEBRTC, hasTurn: true }).title)
      .toContain("TURN");
    expect(describeTransport({ state: TRANSPORT_STATE_WEBRTC, hasStun: true }).title)
      .toContain("STUN");
    expect(describeTransport({ state: TRANSPORT_STATE_WEBRTC }).title)
      .toContain("LAN");
  });
});

describe("parseTransportControlFrame", () => {
  it("extrai o bloco de um frame válido", () => {
    const info = parseTransportControlFrame({
      action: "transport_info",
      sessionId: "abc",
      transport: { state: "webrtc", active: "webrtc", hasStun: true, hasTurn: false, relayOnly: false },
    });

    expect(info).not.toBeNull();
    expect(info!.state).toBe("webrtc");
    expect(info!.hasStun).toBe(true);
    expect(info!.hasTurn).toBe(false);
  });

  it("ignora frames que não são do transporte", () => {
    // Um frame irrelevante (ping, keyframe) não pode virar um selo incorreto.
    for (const raw of [
      null,
      undefined,
      "texto",
      {},
      { action: "pong" },
      { action: "transport_info" },
      { action: "transport_info", transport: null },
      { action: "transport_info", transport: "webrtc" },
      { action: "transport_info", transport: {} },
      { action: "transport_info", transport: { state: "" } },
    ]) {
      expect(parseTransportControlFrame(raw as unknown), JSON.stringify(raw)).toBeNull();
    }
  });

  it("normaliza campos ausentes para undefined/false", () => {
    const info = parseTransportControlFrame({
      action: "transport_info",
      transport: { state: "nats" },
    });

    expect(info!.reason).toBeUndefined();
    expect(info!.hasStun).toBe(false);
    expect(info!.hasTurn).toBe(false);
    expect(info!.relayOnly).toBe(false);
  });
});

describe("parseTransportEvent", () => {
  it("extrai o bloco do evento started", () => {
    const info = parseTransportEvent({
      state: "webrtc-fallback",
      requested: "webrtc",
      active: "nats",
      reason: "sem TURN",
    });

    expect(info!.state).toBe("webrtc-fallback");
    expect(info!.requested).toBe("webrtc");
    expect(info!.active).toBe("nats");
    expect(info!.reason).toBe("sem TURN");
  });

  it("ignora dados sem forma de transporte", () => {
    for (const raw of [null, undefined, "texto", [], {}, { state: "" }, { state: 123 }]) {
      expect(parseTransportEvent(raw as unknown), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe("resolveWebRtcKinds", () => {
  const policy = (kinds: string[], enabled = true) =>
    JSON.stringify({ enabled, kinds });

  it("devolve os kinds quando blob E kill switch estão ligados", () => {
    const kinds = resolveWebRtcKinds({
      remoteAccessWebRtcEnabled: true,
      remoteAccessWebRtcPolicyJson: policy(["screen", "rdp"]),
    });

    expect(kinds).toEqual(["screen", "rdp"]);
  });

  it("devolve vazio quando o kill switch está desligado", () => {
    // O kill switch tem precedência sobre o blob: é o que permite desligar num
    // site sem apagar a configuração de STUN/TURN.
    const kinds = resolveWebRtcKinds({
      remoteAccessWebRtcEnabled: false,
      remoteAccessWebRtcPolicyJson: policy(["screen"]),
    });

    expect(kinds).toEqual([]);
  });

  it("devolve vazio quando o kill switch está ausente", () => {
    expect(resolveWebRtcKinds({ remoteAccessWebRtcPolicyJson: policy(["screen"]) })).toEqual([]);
  });

  it("devolve vazio quando o blob está desligado", () => {
    const kinds = resolveWebRtcKinds({
      remoteAccessWebRtcEnabled: true,
      remoteAccessWebRtcPolicyJson: policy(["screen"], false),
    });

    expect(kinds).toEqual([]);
  });

  it("é fail-closed para JSON corrompido ou forma inesperada", () => {
    const cases: unknown[] = [
      null,
      undefined,
      "texto",
      [],
      {},
      { remoteAccessWebRtcEnabled: true },
      { remoteAccessWebRtcEnabled: true, remoteAccessWebRtcPolicyJson: "{corrompido" },
      { remoteAccessWebRtcEnabled: true, remoteAccessWebRtcPolicyJson: "[1,2]" },
      { remoteAccessWebRtcEnabled: true, remoteAccessWebRtcPolicyJson: '"texto"' },
      { remoteAccessWebRtcEnabled: true, remoteAccessWebRtcPolicyJson: "{}" },
      { remoteAccessWebRtcEnabled: "true", remoteAccessWebRtcPolicyJson: policy(["screen"]) },
    ];

    for (const input of cases) {
      expect(resolveWebRtcKinds(input), JSON.stringify(input)).toEqual([]);
    }
  });

  it("descarta kinds não suportados (terminal fora)", () => {
    const kinds = resolveWebRtcKinds({
      remoteAccessWebRtcEnabled: true,
      remoteAccessWebRtcPolicyJson: policy(["screen", "terminal", "processes", "banana"]),
    });

    expect(kinds).toEqual(["screen"]);
  });

  it("aceita all, que cobre a sessão composta de tela", () => {
    const kinds = resolveWebRtcKinds({
      remoteAccessWebRtcEnabled: true,
      remoteAccessWebRtcPolicyJson: policy(["all", "rdp", "files"]),
    });

    expect(kinds).toEqual(["all", "rdp", "files"]);
  });

  it("aceita proxy, que usa o mesmo túnel TCP do RDP", () => {
    // Proxy compartilha o SessionTunnel do RDP no agente; excluí-lo seria
    // incoerente — e é onde o P2P mais ajuda (destino em outra rede).
    const kinds = resolveWebRtcKinds({
      remoteAccessWebRtcEnabled: true,
      remoteAccessWebRtcPolicyJson: policy(["proxy", "rdp"]),
    });

    expect(kinds).toEqual(["proxy", "rdp"]);
  });

  it("descarta registry, cujo gargalo é o tamanho da página", () => {
    // A resposta do registry já é paginada em 500 itens porque estouraria o
    // limite do NATS: trocar o transporte não resolveria o gargalo real.
    const kinds = resolveWebRtcKinds({
      remoteAccessWebRtcEnabled: true,
      remoteAccessWebRtcPolicyJson: policy(["screen", "registry"]),
    });

    expect(kinds).toEqual(["screen"]);
  });

  it("devolve vazio quando kinds não é array", () => {
    const kinds = resolveWebRtcKinds({
      remoteAccessWebRtcEnabled: true,
      remoteAccessWebRtcPolicyJson: JSON.stringify({ enabled: true, kinds: "screen" }),
    });

    expect(kinds).toEqual([]);
  });
});
