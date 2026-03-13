import { api } from "./client";
import type {
  ReportTemplate,
  ReportExecution,
  ReportTemplateHistory,
  CreateReportTemplateRequest,
  UpdateReportTemplateRequest,
  RunReportRequest,
  RunReportResponse,
  ReportDatasetType,
  ReportDatasetTypeValue,
  DatasetCatalogItem,
  LayoutSchemaResponse,
  PreviewReportRequest,
  PreviewReportResponse,
  PreviewMode,
  ReportAutocompleteResponse,
} from "./types";
import { API_BASE_URL, ApiError } from "./client";

// ── Dataset Catalog ─────────────────────────────────────

export async function getDatasetCatalog(): Promise<DatasetCatalogItem[]> {
  return api.get<DatasetCatalogItem[]>("/api/reports/datasets");
}

export async function getReportLayoutSchema(): Promise<LayoutSchemaResponse> {
  return api.get<LayoutSchemaResponse>("/api/reports/layout-schema");
}

export async function getReportAutocomplete(params: {
  term: string;
  datasetType: ReportDatasetTypeValue;
  alias?: string;
}): Promise<ReportAutocompleteResponse> {
  return api.get<ReportAutocompleteResponse>(
    "/api/reports/autocomplete",
    params,
  );
}

// ── Templates ───────────────────────────────────────────

export async function createReportTemplate(
  request: CreateReportTemplateRequest,
): Promise<ReportTemplate> {
  return api.post<ReportTemplate>("/api/reports/templates", request);
}

export async function getReportTemplates(params?: {
  datasetType?: ReportDatasetTypeValue;
  isActive?: boolean;
}): Promise<ReportTemplate[]> {
  return api.get<ReportTemplate[]>("/api/reports/templates", params ?? {});
}

export async function getReportTemplateById(
  id: string,
  clientId?: string,
): Promise<ReportTemplate> {
  return api.get<ReportTemplate>(`/api/reports/templates/${id}`, {
    clientId,
  });
}

export async function updateReportTemplate(
  id: string,
  request: UpdateReportTemplateRequest,
): Promise<ReportTemplate> {
  return api.put<ReportTemplate>(`/api/reports/templates/${id}`, request);
}

export async function deleteReportTemplate(id: string): Promise<void> {
  return api.del<void>(`/api/reports/templates/${id}`);
}

export async function getReportTemplateHistory(
  id: string,
  limit?: number,
): Promise<ReportTemplateHistory[]> {
  return api.get<ReportTemplateHistory[]>(
    `/api/reports/templates/${id}/history`,
    { limit },
  );
}

// ── Executions ──────────────────────────────────────────

export async function runReport(
  request: RunReportRequest,
): Promise<RunReportResponse> {
  return api.post<RunReportResponse>("/api/reports/run", request);
}

export async function getReportExecution(
  id: string,
  clientId?: string,
): Promise<ReportExecution> {
  return api.get<ReportExecution>(`/api/reports/executions/${id}`, {
    clientId,
  });
}

export async function getReportExecutions(params?: {
  clientId?: string;
  limit?: number;
}): Promise<ReportExecution[]> {
  return api.get<ReportExecution[]>("/api/reports/executions", params ?? {});
}

export async function previewReport(
  request: PreviewReportRequest,
): Promise<PreviewReportResponse> {
  const url = `${API_BASE_URL}/api/reports/preview`;
  const previewMode: PreviewMode = request.previewMode ?? "document";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
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

export function getReportDownloadUrl(id: string, clientId?: string): string {
  // Use relative URLs to properly leverage browser's cookie/session handling
  // The VITE_API_URL is only for server-to-server API calls, not for browser navigation
  if (clientId) {
    const params = new URLSearchParams({ clientId });
    return `/api/reports/executions/${id}/download?${params}`;
  }
  return `/api/reports/executions/${id}/download`;
}

// ── Download Helper ─────────────────────────────────────

/**
 * Downloads a report file using direct redirect for better browser handling
 */
export async function downloadReportFile(
  executionId: string,
  _fileName?: string,
  clientId?: string,
): Promise<void> {
  const downloadUrl = getReportDownloadUrl(executionId, clientId);

  try {
    // Use direct window.location for file download to leverage browser's native download handling
    // This avoids CORS issues and properly maintains authentication cookies
    window.location.href = downloadUrl;
  } catch (error) {
    console.error("Failed to initiate report download:", error);
    throw new Error(
      `Failed to download report: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// ── Preview (fallback local) ───────────────────────────

export async function previewReportData(
  datasetType: ReportDatasetType,
  _filters?: string,
  limit: number = 10,
): Promise<any[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(generateMockPreviewData(datasetType, limit));
    }, 300);
  });
}

function generateMockPreviewData(
  datasetType: ReportDatasetType,
  limit: number,
): any[] {
  const data: any[] = [];

  for (let i = 0; i < limit; i++) {
    switch (datasetType) {
      case 0:
        data.push({
          softwareName: `Software ${i + 1}`,
          publisher: `Publisher ${i + 1}`,
          version: `${i + 1}.0.0`,
          installedAt: new Date().toISOString(),
          agentId: `agent-${i + 1}`,
        });
        break;
      case 1:
        data.push({
          level: ["Info", "Warning", "Error"][i % 3],
          message: `Log message ${i + 1}`,
          source: "Agent",
          timestamp: new Date().toISOString(),
        });
        break;
      case 2:
        data.push({
          fieldName: `field${i + 1}`,
          changedBy: `user${i + 1}@example.com`,
          changedAt: new Date().toISOString(),
          reason: `Change reason ${i + 1}`,
        });
        break;
      case 3:
        data.push({
          priority: ["Low", "Medium", "High", "Critical"][i % 4],
          createdAt: new Date().toISOString(),
          status: ["Open", "In Progress", "Closed"][i % 3],
        });
        break;
      case 4:
        data.push({
          osName: `Windows ${10 + (i % 2)}`,
          processor: `Intel Core i${5 + (i % 4)}`,
          totalMemoryBytes: (8 + i * 4) * 1024 * 1024 * 1024,
          collectedAt: new Date().toISOString(),
        });
        break;
      case 5:
        data.push({
          label: ["Windows", "Linux", "Database", "Critical"][i % 4],
          sourceType: i % 2 === 0 ? "Automatic" : "Manual",
          agentHostname: `agent-${i + 1}`,
          ruleId: `rule-${(i % 3) + 1}`,
          updatedAt: new Date().toISOString(),
        });
        break;
      case 6:
        data.push({
          title: `Artigo ${i + 1}`,
          category: ["Rede", "Segurança", "Aplicações"][i % 3],
          author: `Autor ${i + 1}`,
          isPublished: i % 2 === 0,
          updatedAt: new Date().toISOString(),
        });
        break;
    }
  }

  return data;
}
