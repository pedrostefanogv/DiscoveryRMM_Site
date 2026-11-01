import { describe, it, expect } from "vitest";
import {
  DAY_LABELS,
  DEFAULT_TIME_ZONE,
  describeMaintenanceWindow,
  formatUtcOffset,
  isValidTimeZone,
  listTimeZoneOptions,
  localTimeToUtc,
  parseMaintenanceWindow,
  serializeMaintenanceWindow,
  timeZoneOffsetMinutes,
  type MaintenanceWindowConfig,
} from "./maintenancePolicy";

// Data de referência fixa (10/06/2026, 12:00 UTC): sem horário de verão no
// Brasil e com EDT (-4) nos EUA — deixa os testes determinísticos.
const REF = new Date("2026-06-10T12:00:00Z");

const FALLBACK_JANELA: MaintenanceWindowConfig = {
  enabled: false,
  daysOfWeek: [],
  startTime: "02:00",
  timeZone: DEFAULT_TIME_ZONE,
  startUtc: "02:00",
  durationMinutes: 60,
  rebootGraceSeconds: 60,
};

describe("parseMaintenanceWindow", () => {
  it.each([null, undefined, "", "{}"])("retorna fallback para %j", (json) => {
    expect(parseMaintenanceWindow(json as string | null | undefined, REF)).toEqual(FALLBACK_JANELA);
  });

  it("faz parse de um JSON completo com timeZone nova", () => {
    const json = JSON.stringify({
      enabled: true,
      daysOfWeek: [2, 4, 6],
      startTime: "23:00",
      timeZone: "America/Sao_Paulo",
      startUtc: "02:00",
      durationMinutes: 90,
      rebootGraceSeconds: 120,
    });
    expect(parseMaintenanceWindow(json, REF)).toEqual({
      enabled: true,
      daysOfWeek: [2, 4, 6],
      startTime: "23:00",
      timeZone: "America/Sao_Paulo",
      startUtc: "02:00",
      durationMinutes: 90,
      rebootGraceSeconds: 120,
    });
  });

  it("lê JSON legado (só startUtc) como UTC, sem mudar o instante", () => {
    const cfg = parseMaintenanceWindow(JSON.stringify({ enabled: true, startUtc: "03:30" }), REF);
    expect(cfg.timeZone).toBe("UTC");
    expect(cfg.startTime).toBe("03:30");
    expect(cfg.startUtc).toBe("03:30");
  });

  it("startTime tem precedência sobre startUtc no JSON novo", () => {
    const cfg = parseMaintenanceWindow(
      JSON.stringify({ enabled: true, startTime: "22:15", timeZone: "America/Sao_Paulo", startUtc: "01:00" }),
      REF,
    );
    expect(cfg.startTime).toBe("22:15");
    // Espelho recalculado a partir de startTime+timeZone (01:15 UTC com UTC-3).
    expect(cfg.startUtc).toBe("01:15");
  });

  it("timeZone inválida cai em UTC (legado)", () => {
    const cfg = parseMaintenanceWindow(
      JSON.stringify({ enabled: true, startTime: "23:00", timeZone: "Marte/Olympus" }),
      REF,
    );
    expect(cfg.timeZone).toBe("UTC");
    expect(cfg.startTime).toBe("23:00");
    expect(cfg.startUtc).toBe("23:00");
  });

  it("preenche campos ausentes com defaults em JSON parcial", () => {
    expect(parseMaintenanceWindow(JSON.stringify({ enabled: true }), REF)).toEqual({
      ...FALLBACK_JANELA,
      enabled: true,
    });
  });

  it("filtra dias fora de 1..7 e não-inteiros", () => {
    expect(
      parseMaintenanceWindow(JSON.stringify({ daysOfWeek: [0, 8, 2.5, 3, "4", null] }), REF).daysOfWeek,
    ).toEqual([3]);
  });

  it("startUtc em formato inválido cai no default 02:00", () => {
    expect(parseMaintenanceWindow(JSON.stringify({ startUtc: "9:5" }), REF).startUtc).toBe("02:00");
    expect(parseMaintenanceWindow(JSON.stringify({ startUtc: 42 }), REF).startUtc).toBe("02:00");
  });

  it("durationMinutes <= 0 ou não numérico cai em 60", () => {
    expect(parseMaintenanceWindow(JSON.stringify({ durationMinutes: 0 }), REF).durationMinutes).toBe(60);
    expect(parseMaintenanceWindow(JSON.stringify({ durationMinutes: -5 }), REF).durationMinutes).toBe(60);
    expect(parseMaintenanceWindow(JSON.stringify({ durationMinutes: "x" }), REF).durationMinutes).toBe(60);
  });

  it("preserva rebootGraceSeconds = 0 (reboot imediato)", () => {
    expect(parseMaintenanceWindow(JSON.stringify({ rebootGraceSeconds: 0 }), REF).rebootGraceSeconds).toBe(0);
  });

  it("retorna fallback para JSON inválido", () => {
    expect(parseMaintenanceWindow("{oops", REF)).toEqual(FALLBACK_JANELA);
  });
});

describe("serializeMaintenanceWindow", () => {
  it("grava startTime, timeZone e o espelho startUtc em UTC", () => {
    const cfg: MaintenanceWindowConfig = {
      enabled: true,
      daysOfWeek: [1, 3],
      startTime: "23:00",
      timeZone: "America/Sao_Paulo",
      startUtc: "02:00",
      durationMinutes: 45,
      rebootGraceSeconds: 30,
    };
    expect(JSON.parse(serializeMaintenanceWindow(cfg, REF))).toEqual({
      enabled: true,
      daysOfWeek: [1, 3],
      startTime: "23:00",
      timeZone: "America/Sao_Paulo",
      startUtc: "02:00",
      durationMinutes: 45,
      rebootGraceSeconds: 30,
    });
  });

  it("normaliza timeZone inválida para UTC", () => {
    const cfg: MaintenanceWindowConfig = { ...FALLBACK_JANELA, timeZone: "Marte/Olympus", startTime: "05:00" };
    const parsed = JSON.parse(serializeMaintenanceWindow(cfg, REF)) as MaintenanceWindowConfig;
    expect(parsed.timeZone).toBe("UTC");
    expect(parsed.startUtc).toBe("05:00");
  });

  it("roundtrip parse(serialize(cfg)) === cfg", () => {
    const cfg: MaintenanceWindowConfig = {
      enabled: true,
      daysOfWeek: [7, 2, 5],
      startTime: "01:15",
      timeZone: "America/Sao_Paulo",
      startUtc: "04:15",
      durationMinutes: 30,
      rebootGraceSeconds: 0,
    };
    expect(parseMaintenanceWindow(serializeMaintenanceWindow(cfg, REF), REF)).toEqual(cfg);
  });
});

describe("conversão de fuso", () => {
  it("valida IDs IANA", () => {
    expect(isValidTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("")).toBe(true);
    expect(isValidTimeZone("Marte/Olympus")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });

  it("formata o offset", () => {
    expect(formatUtcOffset(-180)).toBe("UTC-03:00");
    expect(formatUtcOffset(330)).toBe("UTC+05:30");
    expect(formatUtcOffset(0)).toBe("UTC+00:00");
  });

  it("calcula offset com horário de verão", () => {
    expect(timeZoneOffsetMinutes("America/Sao_Paulo", REF)).toBe(-180);
    // 10/06/2026 nos EUA = EDT (UTC-4).
    expect(timeZoneOffsetMinutes("America/New_York", REF)).toBe(-240);
  });

  it("converte hora local para UTC (Brasília, UTC-3)", () => {
    expect(localTimeToUtc("23:00", "America/Sao_Paulo", REF)).toBe("02:00");
    expect(localTimeToUtc("02:00", "UTC", REF)).toBe("02:00");
  });

  it("converte hora local para UTC respeitando DST (Nova York em junho)", () => {
    expect(localTimeToUtc("21:00", "America/New_York", REF)).toBe("01:00");
  });

  it("fallback quando o horário é inválido", () => {
    expect(localTimeToUtc("25:99", "UTC", REF)).toBe("02:00");
  });

  it("lista de fusos começa em UTC e tem rótulo com offset", () => {
    const options = listTimeZoneOptions(REF);
    expect(options[0]?.value).toBe("UTC");
    expect(options[0]?.label).toContain("UTC");
    const saoPaulo = options.find((option) => option.value === "America/Sao_Paulo");
    expect(saoPaulo?.label).toContain("UTC-03:00");
    expect(new Set(options.map((option) => option.value)).size).toBe(options.length);
  });
});

describe("describeMaintenanceWindow", () => {
  it("janela desligada", () => {
    expect(describeMaintenanceWindow(FALLBACK_JANELA, REF)).toContain("Desligada");
  });

  it("janela ativa em UTC mostra o horário UTC", () => {
    const text = describeMaintenanceWindow({ ...FALLBACK_JANELA, enabled: true }, REF);
    expect(text).toContain("todos os dias");
    expect(text).toContain("02:00 UTC");
    expect(text).toContain("60 min");
    expect(text).toContain("aviso de reboot 60s");
  });

  it("janela com fuso mostra hora local, offset e o espelho UTC", () => {
    const text = describeMaintenanceWindow(
      {
        enabled: true,
        daysOfWeek: [3, 1, 7],
        startTime: "23:00",
        timeZone: "America/Sao_Paulo",
        startUtc: "02:00",
        durationMinutes: 120,
        rebootGraceSeconds: 15,
      },
      REF,
    );
    expect(text).toBe(
      `Ativa — ${DAY_LABELS[1]}, ${DAY_LABELS[3]}, ${DAY_LABELS[7]}, 23:00 America/Sao Paulo (UTC-03:00) = 02:00 UTC, 120 min, aviso de reboot 15s`,
    );
  });
});
