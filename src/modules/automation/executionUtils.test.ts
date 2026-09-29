import { describe, expect, it } from "vitest";
import {
  AutomationExecutionSourceType,
  AutomationExecutionStatus,
  type AutomationExecutionReport,
} from "@/api/types";
import {
  ackLatencyMs,
  buildExecutionsCsv,
  canRetryExecution,
  executionDurationMs,
  executionSourceLabel,
  executionStatusMeta,
  executionTargetName,
  filterExecutions,
  formatDuration,
  isExecutionPending,
  normalizeExecutionStatus,
  summarizeExecutions,
} from "./executionUtils";

function makeReport(
  overrides: Partial<AutomationExecutionReport> = {},
): AutomationExecutionReport {
  return {
    id: "exec-1",
    commandId: "cmd-1",
    agentId: "agent-1",
    taskId: null,
    scriptId: null,
    sourceType: AutomationExecutionSourceType.RunNow,
    status: AutomationExecutionStatus.Completed,
    correlationId: "corr-1",
    createdAt: "2024-01-01T10:00:00.000Z",
    acknowledgedAt: null,
    resultReceivedAt: null,
    exitCode: 0,
    errorMessage: null,
    requestMetadataJson: null,
    ackMetadataJson: null,
    resultMetadataJson: null,
    taskName: null,
    scriptName: null,
    ...overrides,
  };
}

describe("normalizeExecutionStatus", () => {
  it("aceita o enum numérico e o nome vindo da API", () => {
    expect(normalizeExecutionStatus(0)).toBe(AutomationExecutionStatus.Dispatched);
    expect(normalizeExecutionStatus(3)).toBe(AutomationExecutionStatus.Failed);
    expect(normalizeExecutionStatus("Dispatched")).toBe(
      AutomationExecutionStatus.Dispatched,
    );
    expect(normalizeExecutionStatus("ACKNOWLEDGED")).toBe(
      AutomationExecutionStatus.Acknowledged,
    );
    expect(normalizeExecutionStatus("2")).toBe(AutomationExecutionStatus.Completed);
  });

  it("reconhece o status Cancelada (cancelamento pelo operador)", () => {
    expect(normalizeExecutionStatus(4)).toBe(AutomationExecutionStatus.Cancelled);
    expect(normalizeExecutionStatus("Cancelled")).toBe(AutomationExecutionStatus.Cancelled);
    expect(executionStatusMeta("Cancelled")).toEqual({
      label: "Cancelada",
      color: "slate",
      pending: false,
    });
    expect(isExecutionPending("Cancelled")).toBe(false);
  });

  it("devolve null para valores desconhecidos", () => {
    expect(normalizeExecutionStatus("Running")).toBeNull();
    expect(normalizeExecutionStatus(9)).toBeNull();
    expect(normalizeExecutionStatus(undefined)).toBeNull();
  });
});

describe("isExecutionPending", () => {
  // Regressão: o hook comparava status === 0/1 contra strings da API e o
  // auto-refresh nunca ligava.
  it("reconhece pendentes tanto em string quanto em número", () => {
    expect(isExecutionPending("Dispatched")).toBe(true);
    expect(isExecutionPending("Acknowledged")).toBe(true);
    expect(isExecutionPending(1)).toBe(true);
    expect(isExecutionPending("Completed")).toBe(false);
    expect(isExecutionPending(3)).toBe(false);
  });
});

describe("executionStatusMeta", () => {
  it("mapeia rótulo, cor e flag de pendência", () => {
    expect(executionStatusMeta("Failed")).toEqual({
      label: "Failed",
      color: "danger",
      pending: false,
    });
    expect(executionStatusMeta(0)).toEqual({
      label: "Dispatched",
      color: "slate",
      pending: true,
    });
  });
});

describe("executionSourceLabel", () => {
  it("traduz enum numérico e nome", () => {
    expect(executionSourceLabel(0)).toBe("RunNow");
    expect(executionSourceLabel("SoftwareUninstall")).toBe("SoftwareUninstall");
    expect(executionSourceLabel(2)).toBe("ForceSync");
  });
});

describe("executionTargetName", () => {
  it("prioriza a tarefa e cai no id quando não há nome", () => {
    expect(
      executionTargetName(makeReport({ taskId: "t1", taskName: "Instalar Chrome" })),
    ).toEqual({ kind: "task", name: "Instalar Chrome", id: "t1" });

    expect(executionTargetName(makeReport({ scriptId: "s1" }))).toEqual({
      kind: "script",
      name: null,
      id: "s1",
    });

    expect(executionTargetName(makeReport())).toEqual({
      kind: "none",
      name: null,
      id: null,
    });
  });
});

describe("executionDurationMs / ackLatencyMs", () => {
  it("mede o total entre criação e resultado", () => {
    const report = makeReport({
      createdAt: "2024-01-01T10:00:00.000Z",
      acknowledgedAt: "2024-01-01T10:00:05.000Z",
      resultReceivedAt: "2024-01-01T10:00:30.000Z",
    });

    expect(executionDurationMs(report)).toBe(30_000);
    expect(ackLatencyMs(report)).toBe(5_000);
  });

  it("usa o relógio informado para execuções em andamento", () => {
    const report = makeReport({
      status: AutomationExecutionStatus.Acknowledged,
      createdAt: "2024-01-01T10:00:00.000Z",
      acknowledgedAt: "2024-01-01T10:00:05.000Z",
      resultReceivedAt: null,
    });

    const now = Date.parse("2024-01-01T10:00:20.000Z");
    expect(executionDurationMs(report, now)).toBe(20_000);
  });

  it("ignora timestamps inválidos", () => {
    const report = makeReport({ createdAt: "not-a-date" });
    expect(executionDurationMs(report)).toBeNull();
    expect(ackLatencyMs(report)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formata ms, segundos, minutos e horas", () => {
    expect(formatDuration(500)).toBe("500 ms");
    expect(formatDuration(1500)).toBe("1,5 s");
    expect(formatDuration(65_000)).toBe("1 min 5 s");
    expect(formatDuration(3_600_000)).toBe("1 h");
    expect(formatDuration(null)).toBe("-");
  });
});

describe("summarizeExecutions", () => {
  it("conta por status, pendentes e taxa de sucesso", () => {
    const summary = summarizeExecutions([
      makeReport({ id: "1", status: AutomationExecutionStatus.Completed }),
      makeReport({ id: "2", status: "Failed" }),
      makeReport({ id: "3", status: "Dispatched" }),
      makeReport({ id: "4", status: 1 }),
    ]);

    expect(summary).toMatchObject({
      total: 4,
      completed: 1,
      failed: 1,
      dispatched: 1,
      acknowledged: 1,
      pending: 2,
    });
    expect(summary.successRate).toBe(0.5);
  });

  it("conta canceladas sem inflar a taxa de sucesso", () => {
    const summary = summarizeExecutions([
      makeReport({ id: "1", status: AutomationExecutionStatus.Completed }),
      makeReport({ id: "2", status: "Cancelled" }),
    ]);

    expect(summary.cancelled).toBe(1);
    expect(summary.pending).toBe(0);
    expect(summary.successRate).toBe(1);
  });

  it("taxa de sucesso é 0 quando nada finalizou", () => {
    expect(summarizeExecutions([makeReport({ status: "Dispatched" })]).successRate).toBe(0);
  });
});

describe("filterExecutions", () => {
  const reports = [
    makeReport({
      id: "1",
      taskId: "t1",
      taskName: "Instalar Chrome",
      status: AutomationExecutionStatus.Completed,
    }),
    makeReport({
      id: "2",
      scriptId: "s1",
      scriptName: "Limpar Temp",
      status: "Failed",
      errorMessage: "exit 1",
    }),
    makeReport({ id: "3", status: "Dispatched" }),
  ];

  it("busca por nome, erro e correlation", () => {
    expect(filterExecutions(reports, { search: "chrome" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterExecutions(reports, { search: "exit 1" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterExecutions(reports, { search: "corr-1" })).toHaveLength(3);
  });

  it("filtra falhas e pendentes", () => {
    expect(filterExecutions(reports, { onlyFailures: true }).map((r) => r.id)).toEqual(["2"]);
    expect(filterExecutions(reports, { onlyPending: true }).map((r) => r.id)).toEqual(["3"]);
  });

  it("sem filtro devolve cópia da lista", () => {
    const out = filterExecutions(reports, {});
    expect(out).toHaveLength(3);
    expect(out).not.toBe(reports);
  });
});

describe("buildExecutionsCsv", () => {
  it("usa ';' como separador e escapa campos com separador/quebra de linha", () => {
    const csv = buildExecutionsCsv([
      makeReport({
        taskId: "t1",
        taskName: "Instalar; Chrome",
        errorMessage: 'falhou "feio"\nlinha 2',
        status: "Failed",
      }),
    ]);

    const [header, row] = csv.split("\r\n");
    expect(header.split(";")).toContain("duracaoMs");
    expect(row).toContain('"Instalar; Chrome"');
    expect(row).toContain('"falhou ""feio""');
  });

  it("neutraliza fórmulas (CSV injection)", () => {
    const csv = buildExecutionsCsv([
      makeReport({
        taskName: "=HYPERLINK(\"http://malicioso\")",
        errorMessage: "+SUM(A1:A9)",
        correlationId: "@cmd",
      }),
    ]);

    const row = csv.split("\r\n")[1];
    expect(row).toContain("'=HYPERLINK");
    expect(row).toContain("'+SUM");
    expect(row).toContain("'@cmd");
    // O exit code numérico não ganha apóstrofo (segue numérico no Excel).
    expect(row).toContain(";0;");
  });
});

describe("canRetryExecution", () => {
  it("só permite reenvio quando há tarefa ou script", () => {
    expect(canRetryExecution(makeReport({ taskId: "t1" }))).toBe(true);
    expect(canRetryExecution(makeReport({ scriptId: "s1" }))).toBe(true);
    expect(canRetryExecution(makeReport())).toBe(false);
  });
});
