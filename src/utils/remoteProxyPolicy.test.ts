import { describe, expect, it } from "vitest";
import {
  EMPTY_POLICY,
  PROXY_MODE_ALLOWLIST,
  PROXY_MODE_OPEN,
  formatPorts,
  isValidCidrOrIp,
  isValidIPv4,
  isValidPort,
  parsePolicy,
  parsePorts,
  serializePolicy,
  validatePolicy,
  type RemoteProxyPolicy,
} from "./remoteProxyPolicy";

function policy(overrides: Partial<RemoteProxyPolicy> = {}): RemoteProxyPolicy {
  return { ...EMPTY_POLICY, entries: [], ...overrides };
}

describe("validação de CIDR/IP", () => {
  it("aceita IPv4 válido", () => {
    expect(isValidIPv4("192.168.10.250")).toBe(true);
    expect(isValidIPv4("10.0.0.5")).toBe(true);
    expect(isValidIPv4("0.0.0.0")).toBe(true);
    expect(isValidIPv4("255.255.255.255")).toBe(true);
  });

  it("rejeita IPv4 inválido", () => {
    expect(isValidIPv4("256.1.1.1")).toBe(false);
    expect(isValidIPv4("192.168.10")).toBe(false);
    expect(isValidIPv4("192.168.10.1.1")).toBe(false);
    expect(isValidIPv4("abc")).toBe(false);
    // Notação ambígua: o backend (netip) recusaria.
    expect(isValidIPv4("010.0.0.1")).toBe(false);
  });

  it("aceita CIDR IPv4 e IP avulso", () => {
    expect(isValidCidrOrIp("192.168.10.0/24")).toBe(true);
    expect(isValidCidrOrIp("10.0.0.0/8")).toBe(true);
    expect(isValidCidrOrIp("10.0.0.5")).toBe(true);
    expect(isValidCidrOrIp(" 192.168.10.250 ")).toBe(true);
  });

  it("rejeita CIDR com bits fora da faixa", () => {
    expect(isValidCidrOrIp("192.168.10.0/33")).toBe(false);
    expect(isValidCidrOrIp("192.168.10.0/-1")).toBe(false);
    expect(isValidCidrOrIp("192.168.10.0/abc")).toBe(false);
  });

  it("aceita IPv6 de forma permissiva", () => {
    expect(isValidCidrOrIp("::1")).toBe(true);
    expect(isValidCidrOrIp("fd00::/8")).toBe(true);
    expect(isValidCidrOrIp("fd00::/129")).toBe(false);
  });

  it("rejeita entrada vazia", () => {
    expect(isValidCidrOrIp("")).toBe(false);
    expect(isValidCidrOrIp("   ")).toBe(false);
  });
});

describe("portas", () => {
  it("valida faixa 1-65535", () => {
    expect(isValidPort(1)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(65536)).toBe(false);
    expect(isValidPort(1.5)).toBe(false);
  });

  it("interpreta lista separada por vírgula/espaço e reporta inválidas", () => {
    const { ports, invalid } = parsePorts("22, 80 443");
    expect(ports).toEqual([22, 80, 443]);
    expect(invalid).toEqual([]);
  });

  it("deduplica e ordena", () => {
    const { ports } = parsePorts("443,22,443,80");
    expect(ports).toEqual([22, 80, 443]);
  });

  it("separa tokens inválidos em vez de descartá-los em silêncio", () => {
    const { ports, invalid } = parsePorts("22, 99999, abc");
    expect(ports).toEqual([22]);
    expect(invalid).toEqual(["99999", "abc"]);
  });

  it("formata para o input", () => {
    expect(formatPorts([22, 80])).toBe("22, 80");
    expect(formatPorts([])).toBe("");
    expect(formatPorts(null)).toBe("");
  });
});

describe("parsePolicy — fail-closed", () => {
  it("JSON vazio ou {} vira allowlist vazia", () => {
    for (const raw of ["", "   ", "{}", null, undefined]) {
      const parsed = parsePolicy(raw as string);
      expect(parsed.mode).toBe(PROXY_MODE_ALLOWLIST);
      expect(parsed.entries).toEqual([]);
    }
  });

  it("JSON corrompido NUNCA vira modo open", () => {
    // Este é o ponto crítico: se um JSON corrompido abrisse a tela em "liberado
    // geral", um salvar subsequente consolidaria a liberação.
    for (const raw of ["{invalid", "[1,2,3]", '"texto"', "null", "42"]) {
      const parsed = parsePolicy(raw);
      expect(parsed.mode).toBe(PROXY_MODE_ALLOWLIST);
      expect(parsed.entries).toEqual([]);
    }
  });

  it("modo desconhecido cai em allowlist", () => {
    expect(parsePolicy('{"mode":"qualquer"}').mode).toBe(PROXY_MODE_ALLOWLIST);
  });

  it("lê modo open explicitamente", () => {
    expect(parsePolicy('{"mode":"open"}').mode).toBe(PROXY_MODE_OPEN);
    expect(parsePolicy('{"mode":"OPEN"}').mode).toBe(PROXY_MODE_OPEN);
  });

  it("descarta entradas sem cidr e portas inválidas", () => {
    const parsed = parsePolicy(
      JSON.stringify({
        mode: "allowlist",
        entries: [
          { cidr: "192.168.10.0/24", ports: [8006, 99999] },
          { cidr: "", ports: [22] },
          { ports: [80] },
        ],
      }),
    );
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].cidr).toBe("192.168.10.0/24");
    expect(parsed.entries[0].ports).toEqual([8006]);
  });

  it("lê allowLoopback e maxResponseBytes", () => {
    const parsed = parsePolicy(
      '{"mode":"allowlist","allowLoopback":true,"maxResponseBytes":2048}',
    );
    expect(parsed.allowLoopback).toBe(true);
    expect(parsed.maxResponseBytes).toBe(2048);
  });
});

describe("serializePolicy", () => {
  it("omite campos vazios", () => {
    const json = serializePolicy(policy());
    expect(JSON.parse(json)).toEqual({ mode: PROXY_MODE_ALLOWLIST });
  });

  it("faz round-trip preservando entradas e portas", () => {
    // Portas já normalizadas (ordenadas): o parse ordena e deduplica, então
    // comparar com uma lista fora de ordem testaria a normalização, não o
    // round-trip.
    const original = policy({
      entries: [
        { cidr: "192.168.10.0/24", ports: [22, 8006], note: "Proxmox matriz" },
      ],
      allowLoopback: true,
      allowedPorts: [443],
      maxResponseBytes: 4096,
    });

    const restored = parsePolicy(serializePolicy(original));
    expect(restored.mode).toBe(original.mode);
    expect(restored.entries).toEqual(original.entries);
    expect(restored.allowLoopback).toBe(true);
    expect(restored.allowedPorts).toEqual([443]);
    expect(restored.maxResponseBytes).toBe(4096);
  });

  it("normaliza modo desconhecido para allowlist ao serializar", () => {
    const json = serializePolicy(policy({ mode: "banana" }));
    expect(JSON.parse(json).mode).toBe(PROXY_MODE_ALLOWLIST);
  });
});

describe("validatePolicy", () => {
  it("aprova política vazia (bloqueio total é válido)", () => {
    expect(validatePolicy(policy())).toEqual([]);
  });

  it("aprova o caso real do Proxmox", () => {
    const issues = validatePolicy(
      policy({ entries: [{ cidr: "192.168.10.0/24", ports: [8006], note: "Proxmox" }] }),
    );
    expect(issues).toEqual([]);
  });

  it("aponta CIDR inválido com o índice da entrada", () => {
    const issues = validatePolicy(
      policy({
        entries: [
          { cidr: "192.168.10.0/24", ports: [] },
          { cidr: "nao-e-ip", ports: [] },
        ],
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].entryIndex).toBe(1);
    expect(issues[0].message).toContain("nao-e-ip");
  });

  it("aponta entrada sem cidr", () => {
    const issues = validatePolicy(policy({ entries: [{ cidr: "  ", ports: [] }] }));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("Informe um IP ou CIDR");
  });

  it("devolve TODOS os problemas de uma vez", () => {
    const issues = validatePolicy(
      policy({
        entries: [
          { cidr: "invalido", ports: [] },
          { cidr: "10.0.0.1", ports: [99999] },
        ],
      }),
    );
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });
});
