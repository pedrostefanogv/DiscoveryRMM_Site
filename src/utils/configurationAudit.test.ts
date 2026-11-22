import { describe, expect, it } from "vitest";
import type { ConfigurationAuditEntry } from "@/api";
import {
  buildAuditCsv,
  clampAuditNumber,
  entityLabel,
  filterAuditEntries,
  formatAuditValue,
  isValidUuid,
  normalizeDateRangeForReport,
  shortEntityId,
} from "./configurationAudit";

function entry(overrides: Partial<ConfigurationAuditEntry>): ConfigurationAuditEntry {
  return {
    id: "audit-1",
    entityType: "Server",
    entityId: "12345678-1234-1234-1234-123456789012",
    fieldName: "discoveryEnabled",
    oldValue: false,
    newValue: true,
    changedBy: "tester",
    changedAt: "2026-01-01T00:00:00Z",
    entityVersion: 3,
    ...overrides,
  } as unknown as ConfigurationAuditEntry;
}

describe("helpers de auditoria de configuração", () => {
  it("traduz o tipo de entidade e mantém desconhecidos", () => {
    expect(entityLabel("Server")).toBe("Servidor");
    expect(entityLabel("Client")).toBe("Cliente");
    expect(entityLabel("Site")).toBe("Site");
    expect(entityLabel("Outro")).toBe("Outro");
  });

  it("trunca o UUID para exibição", () => {
    expect(shortEntityId("12345678-1234-1234-1234-123456789012")).toBe("12345678…");
    expect(shortEntityId("curto")).toBe("curto");
    expect(shortEntityId("")).toBe("");
  });

  it("monta o CSV com cabeçalho, rótulo amigável e escape", () => {
    const csv = buildAuditCsv([
      entry({ oldValue: 'a,"b"', newValue: "linha1\nlinha2" }),
    ]);

    expect(csv.startsWith("changedAt,entityType,entityId,fieldName,oldValue,newValue,changedBy,entityVersion")).toBe(true);
    expect(csv).toContain("Servidor");
    expect(csv).toContain('"a,""b"""');
    expect(csv).toContain('"linha1\nlinha2"');
  });

  it("valida UUIDs corretamente", () => {
    expect(isValidUuid("12345678-1234-1234-1234-123456789012")).toBe(true);
    expect(isValidUuid("  12345678-1234-1234-1234-123456789012  ")).toBe(true);
    expect(isValidUuid("12345678")).toBe(false);
    expect(isValidUuid("")).toBe(false);
  });

  it("limita números de dias e limite com fallback seguro", () => {
    expect(clampAuditNumber("", 30, 1, 365)).toBe(30);
    expect(clampAuditNumber("abc", 30, 1, 365)).toBe(30);
    expect(clampAuditNumber("0", 30, 1, 365)).toBe(1);
    expect(clampAuditNumber("999", 30, 1, 365)).toBe(365);
    expect(clampAuditNumber("15", 30, 1, 365)).toBe(15);
  });

  it("normaliza intervalo de datas para cobrir o dia final inteiro e rejeita intervalo invertido", () => {
    expect(normalizeDateRangeForReport("2026-01-01", "2026-01-10")).toEqual({
      startIso: "2026-01-01T00:00:00",
      endIso: "2026-01-10T23:59:59.999",
    });
    expect(normalizeDateRangeForReport("2026-01-10", "2026-01-01")).toBeNull();
    expect(normalizeDateRangeForReport("2026-01-01", "")).toBeNull();
  });

  it("formata valores nulos, strings vazias e JSON serializado", () => {
    expect(formatAuditValue(null)).toEqual({
      text: "— (vazio)",
      isEmpty: true,
      isJson: false,
    });
    expect(formatAuditValue("")).toEqual({
      text: '"" (string vazia)',
      isEmpty: true,
      isJson: false,
    });
    expect(formatAuditValue('{"enabled":true,"limit":10}')).toEqual({
      text: '{\n  "enabled": true,\n  "limit": 10\n}',
      isEmpty: false,
      isJson: true,
    });
    expect(formatAuditValue("texto simples")).toEqual({
      text: "texto simples",
      isEmpty: false,
      isJson: false,
    });
  });

  it("filtra entradas combinando entidade, campo, usuário, data e busca rápida", () => {
    const entries = [
      entry({
        id: "1",
        entityType: "Server",
        fieldName: "discoveryEnabled",
        changedBy: "admin",
        changedAt: "2026-01-05T12:00:00Z",
        reason: "ajuste inicial",
      }),
      entry({
        id: "2",
        entityType: "Client",
        entityId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        fieldName: "retentionDays",
        changedBy: "pedro",
        changedAt: "2026-01-08T15:00:00Z",
        reason: "política de backup",
      }),
    ];
    const names = new Map([
      ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "Cliente: ACME"],
    ]);

    expect(
      filterAuditEntries(
        entries,
        {
          entityType: "Client",
          entityId: "",
          fieldName: "",
          username: "",
          startDate: "",
          endDate: "",
          search: "",
        },
        names,
      ).map((e) => e.id),
    ).toEqual(["2"]);

    expect(
      filterAuditEntries(
        entries,
        {
          entityType: "",
          entityId: "",
          fieldName: "",
          username: "",
          startDate: "",
          endDate: "",
          search: "ACME",
        },
        names,
      ).map((e) => e.id),
    ).toEqual(["2"]);

    expect(
      filterAuditEntries(
        entries,
        {
          entityType: "",
          entityId: "",
          fieldName: "",
          username: "",
          startDate: "2026-01-06",
          endDate: "2026-01-10",
          search: "",
        },
        names,
      ).map((e) => e.id),
    ).toEqual(["2"]);
  });
});
