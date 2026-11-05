import { describe, expect, it } from "vitest";
import { ReportDatasetType } from "./types";
import { getDefaultPreviewFields, getDatasetsMissingPreviewFields } from "./reports";

/** Nome do enum -> numero do dataset no backend. */
function numericEnumValues(): Array<[string, number]> {
  return Object.entries(ReportDatasetType)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    // O enum TS e numerico reverso: entradas "0": "SoftwareInventory" etc.
    .filter(([name]) => Number.isNaN(Number(name)));
}

describe("paridade de datasets (ReportDatasetType <-> reports.ts)", () => {
  it("o enum tem 30 datasets", () => {
    expect(numericEnumValues()).toHaveLength(30);
  });

  it("TODO ReportDatasetType tem campos de preview mapeados", () => {
    // Este e o teste que falha quando um dataset novo entra no enum e
    // ninguem mapeia os campos: sem isso o wizard abre o dataset com a
    // tabela de campos vazia e o usuario nao consegue montar o relatorio.
    const missing = getDatasetsMissingPreviewFields();
    expect(missing).toEqual([]);
  });

  it("os 7 datasets antes omitidos estao mapeados", () => {
    // Regressao: estes eram exatamente os que faltavam em DEFAULT_PREVIEW_FIELDS
    // e nos mapas DEFAULT_COLUMNS do wizard.
    const previouslyMissing = [
      ReportDatasetType.TicketAnswers,
      ReportDatasetType.WindowsUpdates,
      ReportDatasetType.PatchCompliance,
      ReportDatasetType.PatchApprovals,
      ReportDatasetType.PatchApprovalAudit,
      ReportDatasetType.Agents,
      ReportDatasetType.AgentSensors,
    ];

    for (const datasetType of previouslyMissing) {
      expect(
        getDefaultPreviewFields(datasetType),
        `dataset ${datasetType} sem campos de preview`,
      ).not.toHaveLength(0);
    }
  });

  it("agentSensors (29) expoe os campos reais do catalogo", () => {
    const fields = getDefaultPreviewFields(ReportDatasetType.AgentSensors);
    // Estes nomes vem de ReportDatasetCatalogProvider (dataset 29). Inventar
    // um campo aqui faria o backend devolver vazio no preview.
    expect(fields).toContain("sensorName");
    expect(fields).toContain("severity");
    expect(fields).toContain("lastRunAt");
  });

  it("nao ha campo desconhecido nos datasets de patches/agentes", () => {
    // Campos reais do catalogo do backend, por dataset.
    const catalogFields: Record<number, string[]> = {
      23: ["ticketId", "ticketTitle", "questionLabel", "valueText", "createdAt"],
      24: [
        "agentHostname", "kbIds", "title", "classification", "severity",
        "approvalState", "status", "requiresReboot", "reportedAt",
      ],
      25: [
        "agentHostname", "clientName", "siteName", "osName", "pendingCount",
        "criticalCount", "deniedCount", "approvedCount", "installedCount",
        "pendingReboot", "scanStatus", "lastScanAt",
      ],
      26: ["scopeType", "updateKey", "kbId", "action", "reason", "updatedBy", "updatedAt"],
      27: [
        "changedAt", "changeType", "scopeType", "updateKey", "oldAction",
        "newAction", "reason", "changedBy", "ipAddress",
      ],
      28: [
        "hostname", "clientName", "siteName", "status", "osName", "osVersion",
        "agentVersion", "loggedUser", "lastSeenAt", "pendingReboot",
      ],
      29: [
        "agentHostname", "sensorName", "sensorType", "target", "status",
        "severity", "primaryValue", "unit", "message", "consecutiveFailures",
        "lastRunAt",
      ],
    };

    for (const [datasetType, known] of Object.entries(catalogFields)) {
      const fields = getDefaultPreviewFields(Number(datasetType) as ReportDatasetType) ?? [];
      for (const field of fields) {
        expect(known, `dataset ${datasetType}: campo '${field}' nao existe no catalogo`).toContain(field);
      }
    }
  });
});
