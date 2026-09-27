import { describe, expect, it } from "vitest";
import type { ConfigurationAuditEntry } from "@/api";
import { buildAuditCsv, entityLabel, shortEntityId } from "./configurationAudit";

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
});
