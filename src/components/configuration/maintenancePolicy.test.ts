import { describe, it, expect } from "vitest";
import {
  DAY_LABELS,
  describeMaintenanceWindow,
  describeMcpToolPolicy,
  parseMaintenanceWindow,
  parseMcpToolPolicy,
  serializeMaintenanceWindow,
  serializeMcpToolPolicy,
  type MaintenanceWindowConfig,
  type McpToolPolicyConfig,
} from "./maintenancePolicy";

const FALLBACK_JANELA: MaintenanceWindowConfig = {
  enabled: false,
  daysOfWeek: [],
  startUtc: "02:00",
  durationMinutes: 60,
  rebootGraceSeconds: 60,
};

describe("parseMaintenanceWindow", () => {
  it.each([null, undefined, "", "{}"])("retorna fallback para %j", (json) => {
    expect(parseMaintenanceWindow(json as string | null | undefined)).toEqual(FALLBACK_JANELA);
  });

  it("faz parse de um JSON completo", () => {
    const cfg: MaintenanceWindowConfig = {
      enabled: true,
      daysOfWeek: [2, 4, 6],
      startUtc: "03:30",
      durationMinutes: 90,
      rebootGraceSeconds: 120,
    };
    expect(parseMaintenanceWindow(JSON.stringify(cfg))).toEqual(cfg);
  });

  it("preenche campos ausentes com defaults em JSON parcial", () => {
    expect(parseMaintenanceWindow(JSON.stringify({ enabled: true }))).toEqual({
      ...FALLBACK_JANELA,
      enabled: true,
    });
  });

  it("filtra dias fora de 1..7 e não-inteiros", () => {
    expect(
      parseMaintenanceWindow(JSON.stringify({ daysOfWeek: [0, 8, 2.5, 3, "4", null] })).daysOfWeek,
    ).toEqual([3]);
  });

  it("startUtc em formato inválido cai no default 02:00", () => {
    expect(parseMaintenanceWindow(JSON.stringify({ startUtc: "9:5" })).startUtc).toBe("02:00");
    expect(parseMaintenanceWindow(JSON.stringify({ startUtc: 42 })).startUtc).toBe("02:00");
  });

  it("durationMinutes <= 0 ou não numérico cai em 60", () => {
    expect(parseMaintenanceWindow(JSON.stringify({ durationMinutes: 0 })).durationMinutes).toBe(60);
    expect(parseMaintenanceWindow(JSON.stringify({ durationMinutes: -5 })).durationMinutes).toBe(60);
    expect(parseMaintenanceWindow(JSON.stringify({ durationMinutes: "x" })).durationMinutes).toBe(60);
  });

  it("preserva rebootGraceSeconds = 0 (reboot imediato)", () => {
    expect(parseMaintenanceWindow(JSON.stringify({ rebootGraceSeconds: 0 })).rebootGraceSeconds).toBe(0);
  });

  it("retorna fallback para JSON inválido", () => {
    expect(parseMaintenanceWindow("{oops")).toEqual(FALLBACK_JANELA);
  });
});

describe("serializeMaintenanceWindow", () => {
  it("gera JSON com os campos exatos", () => {
    expect(
      JSON.parse(
        serializeMaintenanceWindow({
          enabled: true,
          daysOfWeek: [1, 3],
          startUtc: "04:00",
          durationMinutes: 45,
          rebootGraceSeconds: 30,
        }),
      ),
    ).toEqual({
      enabled: true,
      daysOfWeek: [1, 3],
      startUtc: "04:00",
      durationMinutes: 45,
      rebootGraceSeconds: 30,
    });
  });

  it("roundtrip parse(serialize(cfg)) === cfg", () => {
    const cfg: MaintenanceWindowConfig = {
      enabled: true,
      daysOfWeek: [7, 2, 5],
      startUtc: "01:15",
      durationMinutes: 30,
      rebootGraceSeconds: 0,
    };
    expect(parseMaintenanceWindow(serializeMaintenanceWindow(cfg))).toEqual(cfg);
  });
});

describe("parseMcpToolPolicy", () => {
  it.each([null, undefined, "", "{}"])("retorna fallback { mode: all, allow: [] } para %j", (json) => {
    expect(parseMcpToolPolicy(json as string | null | undefined)).toEqual({ mode: "all", allow: [] });
  });

  it("faz parse de allowlist", () => {
    expect(
      parseMcpToolPolicy(JSON.stringify({ mode: "allowlist", allow: ["fs.read", "fs.write"] })),
    ).toEqual({ mode: "allowlist", allow: ["fs.read", "fs.write"] });
  });

  it("mode desconhecido vira all", () => {
    expect(parseMcpToolPolicy(JSON.stringify({ mode: "deny", allow: [] }))).toEqual({ mode: "all", allow: [] });
  });

  it("filtra itens não-string e vazios/apenas espaços do allow", () => {
    expect(
      parseMcpToolPolicy(JSON.stringify({ mode: "allowlist", allow: ["a", "", "   ", 42, null, "b"] })).allow,
    ).toEqual(["a", "b"]);
  });

  it("retorna fallback para JSON inválido", () => {
    expect(parseMcpToolPolicy("{oops")).toEqual({ mode: "all", allow: [] });
  });
});

describe("serializeMcpToolPolicy", () => {
  it("gera JSON no formato { mode, allow }", () => {
    expect(serializeMcpToolPolicy({ mode: "allowlist", allow: ["fs.read"] })).toBe(
      JSON.stringify({ mode: "allowlist", allow: ["fs.read"] }),
    );
  });

  it("roundtrip parse(serialize(cfg)) === cfg", () => {
    const cfg: McpToolPolicyConfig = { mode: "allowlist", allow: ["fs.read", "proc.list"] };
    expect(parseMcpToolPolicy(serializeMcpToolPolicy(cfg))).toEqual(cfg);
  });
});

describe("describeMaintenanceWindow", () => {
  it("janela desligada", () => {
    expect(describeMaintenanceWindow(FALLBACK_JANELA)).toContain("Desligada");
  });

  it("janela ativa sem dias menciona todos os dias", () => {
    const text = describeMaintenanceWindow({ ...FALLBACK_JANELA, enabled: true });
    expect(text).toContain("todos os dias");
    expect(text).toContain("02:00 UTC");
    expect(text).toContain("60 min");
    expect(text).toContain("aviso de reboot 60s");
  });

  it("janela ativa com dias mostra rótulos ordenados e detalhes", () => {
    const text = describeMaintenanceWindow({
      enabled: true,
      daysOfWeek: [3, 1, 7],
      startUtc: "05:00",
      durationMinutes: 120,
      rebootGraceSeconds: 15,
    });
    expect(text).toBe(`Ativa — ${DAY_LABELS[1]}, ${DAY_LABELS[3]}, ${DAY_LABELS[7]}, 05:00 UTC, 120 min, aviso de reboot 15s`);
    expect(text).toContain("05:00 UTC");
    expect(text).toContain("120 min");
    expect(text).toContain("15s");
  });
});

describe("describeMcpToolPolicy", () => {
  it("mode all", () => {
    expect(describeMcpToolPolicy({ mode: "all", allow: [] })).toBe("Todas as tools (mode all)");
  });

  it("allowlist vazia menciona bloqueio total", () => {
    expect(describeMcpToolPolicy({ mode: "allowlist", allow: [] })).toContain("bloqueia todas as tools");
  });

  it("allowlist com N tools mostra contagem e nomes", () => {
    const text = describeMcpToolPolicy({ mode: "allowlist", allow: ["fs.read", "proc.list"] });
    expect(text).toContain("2");
    expect(text).toContain("fs.read");
    expect(text).toContain("proc.list");
  });
});
