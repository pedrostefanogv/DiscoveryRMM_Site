import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUN_CLOUDFLARE,
  DEFAULT_STUN_GOOGLE,
  EMPTY_POLICY,
  decideSaveAction,
  isPolicyDirty,
  isValidKind,
  isValidStunUrl,
  isValidTurnUrl,
  parsePolicy,
  serializePolicy,
  validatePolicy,
  type RemoteAccessWebRtcPolicy,
} from "./remoteAccessWebRtcPolicy";

/** Política válida e ligada, usada como base nos testes de mutação. */
function enabledPolicy(): RemoteAccessWebRtcPolicy {
  return {
    ...EMPTY_POLICY,
    enabled: true,
    kinds: ["screen", "rdp"],
    ice: { ...EMPTY_POLICY.ice },
  };
}

describe("parsePolicy", () => {
  it("cai em política desligada para JSON vazio, null ou inválido", () => {
    for (const input of [null, undefined, "", "   ", "{}", "{corrompido", "[1,2]", '"texto"']) {
      const policy = parsePolicy(input as string | null);
      expect(policy.enabled, `entrada: ${String(input)}`).toBe(false);
    }
  });

  it("preserva os defaults de STUN públicos quando o campo está ausente", () => {
    const policy = parsePolicy('{"enabled":true}');
    expect(policy.ice.stunUrls).toContain(DEFAULT_STUN_GOOGLE);
    expect(policy.ice.stunUrls).toContain(DEFAULT_STUN_CLOUDFLARE);
  });

  it("respeita lista de STUN esvaziada de propósito", () => {
    // Distinção importante: ausente = default; presente e vazio = LAN sem STUN.
    const policy = parsePolicy('{"enabled":true,"ice":{"stunUrls":[]}}');
    expect(policy.ice.stunUrls).toEqual([]);
  });

  it("descarta kinds desconhecidos (incluindo terminal)", () => {
    const policy = parsePolicy('{"enabled":true,"kinds":["screen","terminal","banana"]}');
    expect(policy.kinds).toEqual(["screen"]);
  });

  it("nunca liga H.264, mesmo com JSON adulterado", () => {
    const policy = parsePolicy('{"enabled":true,"h264Enabled":true}');
    expect(policy.h264Enabled).toBe(false);
  });

  it("faz fallbackToNats default true", () => {
    expect(parsePolicy('{"enabled":true}').fallbackToNats).toBe(true);
    expect(parsePolicy('{"enabled":true,"fallbackToNats":false}').fallbackToNats).toBe(false);
  });

  it("aplica os timeouts afinados para suporte remoto por padrão", () => {
    const policy = parsePolicy("{}");
    expect(policy.ice.disconnectedTimeoutSeconds).toBe(5);
    expect(policy.ice.failedTimeoutSeconds).toBe(15);
    expect(policy.ice.keepAliveIntervalSeconds).toBe(2);
  });

  it("traz timeouts fora de faixa de volta ao default", () => {
    const policy = parsePolicy('{"enabled":true,"ice":{"failedTimeoutSeconds":9999}}');
    expect(policy.ice.failedTimeoutSeconds).toBe(15);
  });

  it("ignora URLs de STUN/TURN com esquema errado", () => {
    const policy = parsePolicy(
      '{"enabled":true,"ice":{"stunUrls":["turn:x.net:3478"],"turnUrls":["stun:y.net:3478"]}}',
    );
    expect(policy.ice.stunUrls).toEqual([]);
    expect(policy.ice.turnUrls).toEqual([]);
  });
});

describe("serializePolicy", () => {
  it("faz round-trip preservando a política", () => {
    const original: RemoteAccessWebRtcPolicy = {
      ...enabledPolicy(),
      ice: {
        ...EMPTY_POLICY.ice,
        turnUrls: ["turn:turn.exemplo.com:3478"],
        turnUsername: "usuario",
        turnCredential: "segredo",
        relayOnly: true,
      },
    };

    const restored = parsePolicy(serializePolicy(original));

    expect(restored.enabled).toBe(true);
    expect(restored.kinds).toEqual(["screen", "rdp"]);
    expect(restored.ice.turnUrls).toEqual(["turn:turn.exemplo.com:3478"]);
    expect(restored.ice.turnUsername).toBe("usuario");
    expect(restored.ice.turnCredential).toBe("segredo");
    expect(restored.ice.relayOnly).toBe(true);
  });

  it("omite credenciais TURN quando não há TURN configurado", () => {
    const policy: RemoteAccessWebRtcPolicy = {
      ...enabledPolicy(),
      ice: { ...EMPTY_POLICY.ice, turnUsername: "orfao", turnCredential: "orfao" },
    };

    const parsed = JSON.parse(serializePolicy(policy));
    expect(parsed.ice.turnUsername).toBeUndefined();
    expect(parsed.ice.turnCredential).toBeUndefined();
  });

  it("grava fallbackToNats apenas quando false", () => {
    expect(JSON.parse(serializePolicy(enabledPolicy())).fallbackToNats).toBeUndefined();
    const off = { ...enabledPolicy(), fallbackToNats: false };
    expect(JSON.parse(serializePolicy(off)).fallbackToNats).toBe(false);
  });

  it("não grava h264Enabled (decisão travada)", () => {
    const parsed = JSON.parse(serializePolicy(enabledPolicy()));
    expect(parsed.h264Enabled).toBeUndefined();
  });

  it("sempre grava stunUrls e turnUrls, mesmo vazios", () => {
    const policy: RemoteAccessWebRtcPolicy = {
      ...enabledPolicy(),
      ice: { ...EMPTY_POLICY.ice, stunUrls: [], turnUrls: [] },
    };
    const parsed = JSON.parse(serializePolicy(policy));
    expect(parsed.ice.stunUrls).toEqual([]);
    expect(parsed.ice.turnUrls).toEqual([]);
  });
});

describe("validatePolicy", () => {
  it("aceita a política default", () => {
    expect(validatePolicy(EMPTY_POLICY)).toEqual([]);
  });

  it("recusa STUN sem esquema stun:", () => {
    const policy: RemoteAccessWebRtcPolicy = {
      ...EMPTY_POLICY,
      ice: { ...EMPTY_POLICY.ice, stunUrls: ["stun.l.google.com:19302"] },
    };
    const issues = validatePolicy(policy);
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("stunUrls");
  });

  it("recusa TURN sem esquema turn:/turns:", () => {
    const policy: RemoteAccessWebRtcPolicy = {
      ...EMPTY_POLICY,
      ice: { ...EMPTY_POLICY.ice, turnUrls: ["turn.exemplo.com:3478"] },
    };
    const issues = validatePolicy(policy);
    expect(issues.some((i) => i.field === "turnUrls")).toBe(true);
  });

  it("recusa relayOnly sem TURN — a armadilha que produz sessão que nunca conecta", () => {
    const policy: RemoteAccessWebRtcPolicy = {
      ...EMPTY_POLICY,
      ice: { ...EMPTY_POLICY.ice, relayOnly: true, turnUrls: [] },
    };
    const issues = validatePolicy(policy);
    expect(issues.some((i) => i.field === "relayOnly")).toBe(true);
  });

  it("aceita relayOnly COM TURN", () => {
    const policy: RemoteAccessWebRtcPolicy = {
      ...EMPTY_POLICY,
      ice: { ...EMPTY_POLICY.ice, relayOnly: true, turnUrls: ["turn:t.exemplo.com:3478"] },
    };
    expect(validatePolicy(policy)).toEqual([]);
  });

  it("recusa WebRTC ligado sem nenhum kind selecionado", () => {
    const policy = { ...enabledPolicy(), kinds: [] };
    const issues = validatePolicy(policy);
    expect(issues.some((i) => i.field === "kinds")).toBe(true);
  });

  it("não exige kind quando o WebRTC está desligado", () => {
    const policy = { ...EMPTY_POLICY, kinds: [] };
    expect(validatePolicy(policy)).toEqual([]);
  });

  it("recusa timeouts fora da faixa 1-120", () => {
    const policy: RemoteAccessWebRtcPolicy = {
      ...EMPTY_POLICY,
      ice: { ...EMPTY_POLICY.ice, failedTimeoutSeconds: 0 },
    };
    const issues = validatePolicy(policy);
    expect(issues.some((i) => i.field === "failedTimeoutSeconds")).toBe(true);
  });

  it("recusa TTL de credencial TURN fora da faixa", () => {
    const policy: RemoteAccessWebRtcPolicy = {
      ...EMPTY_POLICY,
      ice: { ...EMPTY_POLICY.ice, turnCredentialTtlMinutes: 5000 },
    };
    const issues = validatePolicy(policy);
    expect(issues.some((i) => i.field === "turnCredentialTtlMinutes")).toBe(true);
  });
});

describe("isPolicyDirty", () => {
  it("não considera sujo quando nada mudou", () => {
    const json = serializePolicy(enabledPolicy());
    expect(isPolicyDirty(parsePolicy(json), json)).toBe(false);
  });

  it("detecta mudança em campo avançado (timeout)", () => {
    // A armadilha: mexer SÓ num timeout com "herdar" marcado precisa contar como
    // edição, senão é descartado em silêncio.
    const json = serializePolicy(enabledPolicy());
    const edited = enabledPolicy();
    edited.ice.failedTimeoutSeconds = 30;
    expect(isPolicyDirty(edited, json)).toBe(true);
  });

  it("detecta ligar/desligar", () => {
    const json = serializePolicy(EMPTY_POLICY);
    expect(isPolicyDirty(enabledPolicy(), json)).toBe(true);
  });
});

describe("decideSaveAction", () => {
  it("pula quando herda e nada mudou", () => {
    expect(decideSaveAction({ ownsPolicy: false, hasOwnPolicy: false, isPolicyDirty: false }))
      .toBe("skip");
  });

  it("grava quando o operador assume a política", () => {
    expect(decideSaveAction({ ownsPolicy: true, hasOwnPolicy: false, isPolicyDirty: false }))
      .toBe("persist");
  });

  it("grava quando houve edição mesmo com herdar marcado", () => {
    expect(decideSaveAction({ ownsPolicy: false, hasOwnPolicy: false, isPolicyDirty: true }))
      .toBe("persist");
  });

  it("limpa (volta a herdar) quando o escopo tinha política e o operador desmarcou", () => {
    expect(decideSaveAction({ ownsPolicy: false, hasOwnPolicy: true, isPolicyDirty: false }))
      .toBe("clear");
  });
});

describe("validações de URL e kind", () => {
  it("reconhece STUN válido", () => {
    expect(isValidStunUrl("stun:stun.l.google.com:19302")).toBe(true);
    expect(isValidStunUrl("STUN:host:3478")).toBe(true);
    expect(isValidStunUrl("stun:")).toBe(false);
    expect(isValidStunUrl("turn:host:3478")).toBe(false);
  });

  it("reconhece TURN válido em turn: e turns:", () => {
    expect(isValidTurnUrl("turn:host:3478")).toBe(true);
    expect(isValidTurnUrl("turns:host:5349")).toBe(true);
    expect(isValidTurnUrl("turn:")).toBe(false);
    expect(isValidTurnUrl("stun:host:3478")).toBe(false);
  });

  it("aceita apenas os kinds suportados (terminal fora)", () => {
    expect(isValidKind("screen")).toBe(true);
    expect(isValidKind("rdp")).toBe(true);
    expect(isValidKind("files")).toBe(true);
    // Proxy entra: mesmo SessionTunnel do RDP no agente.
    expect(isValidKind("proxy")).toBe(true);
    // Excluídos, com motivo medido.
    expect(isValidKind("terminal")).toBe(false);
    expect(isValidKind("processes")).toBe(false);
    expect(isValidKind("registry")).toBe(false);
  });

  it("lê turnCredentialConfigured do GET e o omite na serialização", () => {
    const parsed = parsePolicy(
      JSON.stringify({
        enabled: true,
        ice: {
          turnUrls: ["turn:t.exemplo.com:3478"],
          turnUsername: "u",
          turnCredential: "",
          turnCredentialConfigured: true,
        },
      }),
    );

    expect(parsed.ice.turnCredentialConfigured).toBe(true);
    const serialized = JSON.parse(serializePolicy(parsed)) as { ice: Record<string, unknown> };
    expect("turnCredentialConfigured" in serialized.ice).toBe(false);
  });
});
