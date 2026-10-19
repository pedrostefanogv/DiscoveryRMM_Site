import { describe, expect, it } from "vitest";
import {
  deriveScanHealth,
  deriveUpdateActivity,
  describePendingEmpty,
  describeProbe,
  describeScanError,
  formatElapsed,
  isScanFailed,
  normalizeScanStatus,
  scanErrorCodeLabel,
  STALE_SCAN_THRESHOLD_MS,
  VERY_STALE_SCAN_THRESHOLD_MS,
} from "./agentWindowsUpdatesPanel.utils";
import type { AgentWindowsUpdateSnapshot } from "@/api/types";

const NOW = Date.parse("2026-10-19T18:00:00Z");
const isoAgo = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;

function snapshot(overrides: Partial<AgentWindowsUpdateSnapshot> = {}): AgentWindowsUpdateSnapshot {
  return {
    agentId: "a1",
    pendingCount: 0,
    installedCount: 4,
    deniedCount: 0,
    approvedCount: 0,
    scanStatus: "ok",
    scanError: null,
    scanDurationMs: 5745,
    lastCollectedAt: isoAgo(10 * 60 * 1000),
    pendingReboot: false,
    pendingRebootReasons: [],
    rebootCheckedAt: null,
    ...overrides,
  };
}

describe("deriveScanHealth — banner de varredura", () => {
  it("não alerta quando a varredura é recente e ok", () => {
    const health = deriveScanHealth(snapshot(), NOW);
    expect(health.alert).toBe(false);
    expect(health.stale).toBe(false);
    expect(health.failed).toBe(false);
    expect(health.tone).toBe("ok");
    expect(health.ageMs).toBe(10 * 60 * 1000);
  });

  it("alerta varredura desatualizada quando lastCollectedAt passa de 6h", () => {
    const health = deriveScanHealth(snapshot({ lastCollectedAt: isoAgo(7 * HOUR) }), NOW);
    expect(health.alert).toBe(true);
    expect(health.stale).toBe(true);
    expect(health.veryStale).toBe(false);
    expect(health.tone).toBe("warning");
    expect(health.title).toBe("Varredura desatualizada");
    expect(health.reason).toMatch(/6h/);
  });

  it("não alerta exatamente no limiar de 6h", () => {
    const health = deriveScanHealth(snapshot({ lastCollectedAt: isoAgo(STALE_SCAN_THRESHOLD_MS) }), NOW);
    expect(health.stale).toBe(false);
    expect(health.alert).toBe(false);
  });

  it("escala o tom quando passa de 12h", () => {
    const health = deriveScanHealth(snapshot({ lastCollectedAt: isoAgo(VERY_STALE_SCAN_THRESHOLD_MS + HOUR) }), NOW);
    expect(health.veryStale).toBe(true);
    expect(health.tone).toBe("danger");
    expect(health.reason).toMatch(/12h/);
  });

  it("trata scanStatus de erro com o motivo do scanError", () => {
    const health = deriveScanHealth(
      snapshot({ scanStatus: "error", scanError: "wuauserv Start=4" }),
      NOW,
    );
    expect(health.failed).toBe(true);
    expect(health.alert).toBe(true);
    expect(health.tone).toBe("danger");
    expect(health.title).toBe("A última varredura falhou");
    expect(health.reason).toContain("wuauserv Start=4");
  });

  it("prefere o rótulo do scanErrorCode e mantém o detalhe bruto", () => {
    const health = deriveScanHealth(
      snapshot({ scanStatus: "error", scanErrorCode: "service_disabled", scanError: "OpenServiceEx: 5" }),
      NOW,
    );
    expect(health.reason).toMatch(/wuauserv/);
    expect(health.reason).toContain("OpenServiceEx: 5");
  });

  it("aceita 'partial' como varredura bem-sucedida", () => {
    const health = deriveScanHealth(snapshot({ scanStatus: "partial" }), NOW);
    expect(health.failed).toBe(false);
    expect(health.alert).toBe(false);
  });

  it("alerta quando nunca houve varredura (snapshot ausente)", () => {
    const health = deriveScanHealth(undefined, NOW);
    expect(health.neverScanned).toBe(true);
    expect(health.alert).toBe(true);
    expect(health.title).toMatch(/Nenhuma varredura/);
  });

  it("alerta quando a API antiga devolve scanStatus=unknown sem snapshot coletado", () => {
    const health = deriveScanHealth(snapshot({ scanStatus: "unknown", lastCollectedAt: null }), NOW);
    expect(health.neverScanned).toBe(true);
    expect(health.alert).toBe(true);
  });

  it("ignora data inválida em lastCollectedAt", () => {
    const health = deriveScanHealth(snapshot({ lastCollectedAt: "nao-e-data" }), NOW);
    expect(health.neverScanned).toBe(true);
    expect(health.ageMs).toBeNull();
  });
});

describe("isScanFailed / normalizeScanStatus", () => {
  it("normaliza valores vazios e unknown", () => {
    expect(normalizeScanStatus(undefined)).toBe("ok");
    expect(normalizeScanStatus(" UNKNOWN ")).toBe("ok");
    expect(normalizeScanStatus("partial")).toBe("partial");
  });

  it("unknown com coleta válida não é falha", () => {
    expect(isScanFailed("unknown", isoAgo(HOUR))).toBe(false);
  });

  it("status desconhecido/erro é falha", () => {
    expect(isScanFailed("timeout", isoAgo(HOUR))).toBe(true);
    expect(isScanFailed("unsupported", isoAgo(HOUR))).toBe(true);
    expect(isScanFailed("ok", isoAgo(HOUR))).toBe(false);
  });
});

describe("describeScanError / scanErrorCodeLabel", () => {
  it("mapeia códigos conhecidos", () => {
    expect(describeScanError(null, "service_disabled")).toMatch(/wuauserv/);
    expect(scanErrorCodeLabel("wua_unavailable")).toMatch(/WUA/);
  });

  it("cai para o texto bruto quando o código é desconhecido", () => {
    expect(describeScanError("falha XYZ", "codigo_novo")).toBe("falha XYZ");
    expect(describeScanError(null, null)).toBeNull();
  });
});

describe("formatElapsed", () => {
  it("formata minutos, horas e dias", () => {
    expect(formatElapsed(20_000)).toBe("há instantes");
    expect(formatElapsed(3 * 60 * 1000)).toBe("há 3 min");
    expect(formatElapsed(2 * HOUR)).toBe("há 2 h");
    expect(formatElapsed(2 * HOUR + 15 * 60 * 1000)).toBe("há 2 h 15 min");
    expect(formatElapsed(26 * HOUR)).toBe("há 1 dia");
    expect(formatElapsed(50 * HOUR)).toBe("há 2 dias");
    expect(formatElapsed(null)).toBe("sem registro");
    expect(formatElapsed(-5)).toBe("sem registro");
  });
});

describe("deriveUpdateActivity — badge de atividade", () => {
  it("mostra download em andamento com percentual", () => {
    const activity = deriveUpdateActivity(snapshot({ probe: { downloadInProgress: true, downloadPercent: 42.4 } }));
    expect(activity.key).toBe("downloading");
    expect(activity.label).toBe("Download em andamento");
    expect(activity.detail).toContain("42%");
  });

  it("mostra reinício pendente com motivos traduzidos", () => {
    const activity = deriveUpdateActivity(
      snapshot({ pendingReboot: true, pendingRebootReasons: ["windows_update", "file_rename"] }),
    );
    expect(activity.key).toBe("reboot");
    expect(activity.detail).toContain("Windows Update");
    expect(activity.detail).toContain("Arquivos em uso");
  });

  it("fica ocioso quando não há nada acontecendo", () => {
    expect(deriveUpdateActivity(snapshot()).key).toBe("idle");
    expect(deriveUpdateActivity(undefined).key).toBe("idle");
  });

  it("prioriza download em andamento sobre reinício pendente", () => {
    const activity = deriveUpdateActivity(snapshot({ pendingReboot: true, probe: { downloadInProgress: true } }));
    expect(activity.key).toBe("downloading");
  });
});

describe("describePendingEmpty — estado vazio explicativo", () => {
  const healthOk = deriveScanHealth(snapshot(), NOW);

  it("explica a busca WUA mesmo quando a máquina parece em dia", () => {
    const message = describePendingEmpty(snapshot(), healthOk);
    expect(message.title).toBe("Nenhuma atualização PENDENTE detectada pela busca do Windows Update.");
    expect(message.description).toMatch(/IsInstalled=0/);
    expect(message.suspicious).toBe(false);
  });

  it("vira suspeito quando há reinício pendente", () => {
    const message = describePendingEmpty(
      snapshot({ pendingReboot: true, pendingRebootReasons: ["cbs"] }),
      healthOk,
    );
    expect(message.suspicious).toBe(true);
    expect(message.description).toMatch(/reinício pendente/i);
  });

  it("vira suspeito quando há download em andamento", () => {
    const message = describePendingEmpty(snapshot({ probe: { downloadInProgress: true } }), healthOk);
    expect(message.suspicious).toBe(true);
    expect(message.description).toMatch(/download em andamento/i);
  });

  it("vira suspeito quando a varredura falhou", () => {
    const failedHealth = deriveScanHealth(snapshot({ scanStatus: "error", scanError: "falhou" }), NOW);
    const message = describePendingEmpty(snapshot({ scanStatus: "error", scanError: "falhou" }), failedHealth);
    expect(message.suspicious).toBe(true);
    expect(message.description).toContain("falhou");
  });

  it("vira suspeito quando a varredura está desatualizada", () => {
    const stale = deriveScanHealth(snapshot({ lastCollectedAt: isoAgo(8 * HOUR) }), NOW);
    const message = describePendingEmpty(snapshot({ lastCollectedAt: isoAgo(8 * HOUR) }), stale);
    expect(message.suspicious).toBe(true);
  });

  it("reporta resultados ignorados pela varredura", () => {
    const message = describePendingEmpty(snapshot(), healthOk, {
      skippedCount: 3,
      skippedReasons: ["drivers"],
    });
    expect(message.description).toContain("3 resultado(s) foram ignorados");
    expect(message.description).toContain("drivers");
  });
});

describe("describeProbe — diagnóstico do agente", () => {
  it("não devolve nada sem sonda", () => {
    expect(describeProbe(snapshot())).toEqual([]);
    expect(describeProbe(undefined)).toEqual([]);
  });

  it("sinaliza serviço desabilitado em vermelho", () => {
    const flags = describeProbe(snapshot({ probe: { service: "disabled", serviceDisabled: true } }));
    expect(flags).toEqual([
      { label: "Serviço Windows Update", tone: "danger", value: "desabilitado" },
    ]);
  });

  it("sinaliza WSUS/política e o último resultado de instalação", () => {
    const flags = describeProbe(
      snapshot({
        wuaAvailable: true,
        probe: { service: "running", wsus: true, policyManaged: true, lastInstallResult: 0 },
      }),
    );
    expect(flags.map((flag) => flag.label)).toEqual([
      "WUA (COM)",
      "Serviço Windows Update",
      "WSUS",
      "Política de WU",
      "Último resultado de instalação",
    ]);
    expect(flags.find((flag) => flag.label === "Último resultado de instalação")?.tone).toBe("ok");
  });

  it("marca WUA indisponível como perigo", () => {
    const flags = describeProbe(snapshot({ wuaAvailable: false, probe: {} }));
    expect(flags[0]).toEqual({ label: "WUA (COM)", tone: "danger", value: "indisponível" });
  });
});
