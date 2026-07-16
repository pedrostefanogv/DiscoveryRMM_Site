import { api } from "./client";
import { ReportDatasetType } from "./types";
import type {
  ReportTemplate,
  ReportExecution,
  ReportTemplateHistory,
  ReportLibraryTemplate,
  CreateReportTemplateRequest,
  UpdateReportTemplateRequest,
  RunReportRequest,
  RunReportResponse,
  ReportDatasetTypeValue,
  DatasetCatalogItem,
  LayoutSchemaResponse,
  PreviewReportRequest,
  PreviewReportResponse,
  PreviewMode,
  ReportAutocompleteResponse,
  JoinCompatibilityResponse,
} from "./types";
import { ApiError, apiFetchResponse, parseErrorMessage } from "./client";

const DEFAULT_PREVIEW_FIELDS: Partial<Record<ReportDatasetType, string[]>> = {
  [ReportDatasetType.SoftwareInventory]: [
    "softwareName",
    "publisher",
    "version",
    "installedAt",
    "agentId",
  ],
  [ReportDatasetType.Logs]: ["level", "message", "source", "timestamp"],
  [ReportDatasetType.ConfigurationAudit]: [
    "fieldName",
    "changedBy",
    "changedAt",
    "reason",
  ],
  [ReportDatasetType.Tickets]: ["priority", "createdAt", "status"],
  [ReportDatasetType.AgentHardware]: [
    "osName",
    "processor",
    "totalMemoryBytes",
    "collectedAt",
  ],
  [ReportDatasetType.AgentInventoryComposite]: [
    "agentHostname",
    "softwareName",
    "osName",
    "totalMemoryGB",
  ],
  [ReportDatasetType.AgentLabels]: [
    "labelName",
    "labelSource",
    "agentHostname",
    "labelAppliedAt",
  ],
  [ReportDatasetType.AutomaticLabelRules]: [
    "ruleName",
    "labelName",
    "matchCount",
    "affectedAgentHostnames",
  ],
  [ReportDatasetType.AutomationExecutions]: [
    "agentHostname",
    "status",
    "exitCode",
    "createdAt",
  ],
  [ReportDatasetType.KnowledgeBase]: [
    "title",
    "category",
    "author",
    "updatedAt",
  ],
};

function buildPreviewLayoutJson(fields: string[]) {
  return JSON.stringify({
    title: "Previa dos Dados",
    columns: fields.map((field) => ({
      field,
      header: field,
    })),
  });
}

function parsePreviewHtmlTable(
  html: string,
  limit: number,
): Record<string, string>[] {
  if (typeof DOMParser === "undefined") {
    return [];
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  const rows = Array.from(document.querySelectorAll("table tbody tr"));
  const headers = Array.from(document.querySelectorAll("table thead th")).map(
    (cell, index) => cell.textContent?.trim() || `column${index + 1}`,
  );

  return rows.slice(0, limit).map((row) => {
    const cells = Array.from(row.querySelectorAll("th, td"));
    const record: Record<string, string> = {};

    cells.forEach((cell, index) => {
      const key = headers[index] ?? `column${index + 1}`;
      record[key] = cell.textContent?.trim() ?? "";
    });

    return record;
  });
}

export async function getDatasetCatalog(): Promise<DatasetCatalogItem[]> {
  return api.get<DatasetCatalogItem[]>("/api/v1/reports/datasets");
}

export async function getReportLayoutSchema(): Promise<LayoutSchemaResponse> {
  return api.get<LayoutSchemaResponse>("/api/v1/reports/layout-schema");
}

export async function getJoinCompatibility(): Promise<JoinCompatibilityResponse> {
  return api.get<JoinCompatibilityResponse>(
    "/api/v1/reports/join-compatibility",
  );
}

export async function getReportAutocomplete(params: {
  term: string;
  datasetType: ReportDatasetTypeValue;
  alias?: string;
}): Promise<ReportAutocompleteResponse> {
  return api.get<ReportAutocompleteResponse>(
    "/api/v1/reports/autocomplete",
    params,
  );
}

export async function createReportTemplate(
  request: CreateReportTemplateRequest,
): Promise<ReportTemplate> {
  return api.post<ReportTemplate>("/api/v1/reports/templates", request);
}

export async function getReportTemplates(params?: {
  datasetType?: ReportDatasetTypeValue;
  isActive?: boolean;
}): Promise<ReportTemplate[]> {
  return api.get<ReportTemplate[]>("/api/v1/reports/templates", params ?? {});
}

export async function getReportTemplateById(
  id: string,
  clientId?: string,
): Promise<ReportTemplate> {
  return api.get<ReportTemplate>(`/api/v1/reports/templates/${id}`, {
    clientId,
  });
}

export async function updateReportTemplate(
  id: string,
  request: UpdateReportTemplateRequest,
): Promise<ReportTemplate> {
  return api.put<ReportTemplate>(`/api/v1/reports/templates/${id}`, request);
}

export async function deleteReportTemplate(id: string): Promise<void> {
  return api.del<void>(`/api/v1/reports/templates/${id}`);
}

export async function getReportTemplateHistory(
  id: string,
  limit?: number,
): Promise<ReportTemplateHistory[]> {
  return api.get<ReportTemplateHistory[]>(
    `/api/v1/reports/templates/${id}/history`,
    { limit },
  );
}

// â   Library Templates                  ”

export async function getLibraryTemplates(params?: {
  datasetType?: ReportDatasetTypeValue;
}): Promise<ReportLibraryTemplate[]> {
  return api.get<ReportLibraryTemplate[]>(
    "/api/v1/reports/templates/library",
    params ?? {},
  );
}

export async function installLibraryTemplate(
  id: string,
  createdBy?: string,
): Promise<ReportTemplate> {
  const params = new URLSearchParams();
  if (createdBy) params.set("createdBy", createdBy);
  const query = params.toString();
  const path = `/api/v1/reports/templates/library/${id}/install${query ? `?${query}` : ""}`;
  return api.post<ReportTemplate>(path);
}

// â   Executions  ”      ”

export async function runReport(
  request: RunReportRequest,
): Promise<RunReportResponse> {
  return api.post<RunReportResponse>("/api/v1/reports/run", request);
}

export async function getReportExecution(
  id: string,
  clientId?: string,
): Promise<ReportExecution> {
  return api.get<ReportExecution>(`/api/v1/reports/executions/${id}`, {
    clientId,
  });
}

export async function getReportExecutions(params?: {
  clientId?: string;
  limit?: number;
}): Promise<ReportExecution[]> {
  return api.get<ReportExecution[]>("/api/v1/reports/executions", params ?? {});
}

export async function previewReport(
  request: PreviewReportRequest,
): Promise<PreviewReportResponse> {
  const previewMode: PreviewMode = request.previewMode ?? "document";

  const res = await apiFetchResponse(`/api/v1/reports/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const message = await parseErrorMessage(res);
    throw new ApiError(res.status, message);
  }

  const rowCountHeader = res.headers.get("X-Report-RowCount");
  const rowCount = rowCountHeader ? Number(rowCountHeader) : undefined;
  const isPreviewHeader = res.headers.get("X-Report-Preview");

  const base: PreviewReportResponse = {
    mode: previewMode,
    contentType: res.headers.get("Content-Type") ?? "application/octet-stream",
    headers: {
      rowCount: Number.isFinite(rowCount) ? rowCount : undefined,
      title: res.headers.get("X-Report-Title") ?? undefined,
      format: res.headers.get("X-Report-Format") ?? undefined,
      isPreview: isPreviewHeader === "true",
      disposition: res.headers.get("Content-Disposition"),
    },
  };

  if (previewMode === "html") {
    return {
      ...base,
      html: await res.text(),
    };
  }

  return {
    ...base,
    blob: await res.blob(),
  };
}

function getReportDownloadPath(id: string, clientId?: string): string {
  const params = new URLSearchParams();
  if (clientId) {
    params.set("clientId", clientId);
  }

  const query = params.toString();
  return query
    ? `/api/v1/reports/executions/${id}/download?${query}`
    : `/api/v1/reports/executions/${id}/download`;
}

function parseContentDispositionFileName(
  contentDisposition: string | null,
  fallback: string,
) {
  if (!contentDisposition) return fallback;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() || fallback;
}

// â   Download Helper                    ”

/**
 * Downloads a report file using direct redirect for better browser handling
 */
export async function downloadReportFile(
  executionId: string,
  fileName?: string,
  clientId?: string,
): Promise<void> {
  const response = await apiFetchResponse(
    getReportDownloadPath(executionId, clientId),
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(response.status, message);
  }

  const blob = await response.blob();
  const downloadName = parseContentDispositionFileName(
    response.headers.get("Content-Disposition"),
    fileName ?? `report-${executionId}`,
  );

  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

// â   Preview (fallback local)          ”

export async function previewReportData(
  datasetType: ReportDatasetType,
  filters?: string,
  limit: number = 10,
  selectedFields?: string[],
): Promise<Record<string, string>[]> {
  const fields = (selectedFields ?? DEFAULT_PREVIEW_FIELDS[datasetType] ?? [])
    .map((field) => field.trim())
    .filter(Boolean);

  if (fields.length === 0) {
    throw new Error("Selecione ao menos um campo para visualizar a previa.");
  }

  const response = await previewReport({
    template: {
      name: "Previa temporaria",
      datasetType,
      defaultFormat: "pdf",
      layoutJson: buildPreviewLayoutJson(fields),
    },
    filtersJson: filters ?? null,
    previewMode: "html",
    responseDisposition: "inline",
    fileName: "preview-dados",
  });

  if (!response.html) {
    return [];
  }

  return parsePreviewHtmlTable(response.html, limit);
}
