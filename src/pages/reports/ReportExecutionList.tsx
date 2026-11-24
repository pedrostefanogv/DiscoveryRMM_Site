import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useReportExecutions, useReportDownload, useReportTemplates } from "@/hooks";
import {
  Icon,
  Button,
  Card,
  DataTable,
  Badge,
  Loading,
  PageHeader,
} from "@/components/ui";
import type { ReportExecution } from "@/api/types";
import type { Column } from "@/components/ui";
import { ReportExecutionStatus, ReportFormat } from "@/api/types";

const STATUS_CONFIG = {
  [ReportExecutionStatus.Pending]: {
    label: "Pendente",
    color: "slate" as const,
    icon: "schedule",
  },
  [ReportExecutionStatus.Running]: {
    label: "Processando",
    color: "primary" as const,
    icon: "schedule",
  },
  [ReportExecutionStatus.Completed]: {
    label: "Concluído",
    color: "success" as const,
    icon: "check_circle",
  },
  [ReportExecutionStatus.Failed]: {
    label: "Falhou",
    color: "danger" as const,
    icon: "cancel",
  },
} as const;

const FORMAT_LABELS: Record<ReportFormat, string> = {
  [ReportFormat.Xlsx]: "Excel",
  [ReportFormat.Csv]: "CSV",
  [ReportFormat.Markdown]: "Markdown",
};

function normalizeExecutionStatus(
  status: ReportExecution["status"] | string | number,
): ReportExecutionStatus | undefined {
  if (typeof status === "number") {
    return STATUS_CONFIG[status as ReportExecutionStatus]
      ? (status as ReportExecutionStatus)
      : undefined;
  }

  const normalized = String(status).toLowerCase();
  if (normalized === "pending") return ReportExecutionStatus.Pending;
  if (normalized === "running" || normalized === "processing") {
    return ReportExecutionStatus.Running;
  }
  if (normalized === "completed") return ReportExecutionStatus.Completed;
  if (normalized === "failed") return ReportExecutionStatus.Failed;
  return undefined;
}

function normalizeReportFormat(
  format: ReportExecution["format"] | string | number,
): ReportFormat | undefined {
  if (typeof format === "number") {
    return FORMAT_LABELS[format as ReportFormat]
      ? (format as ReportFormat)
      : undefined;
  }

  const normalized = String(format).toLowerCase();
  if (normalized === "xlsx" || normalized === "excel") return ReportFormat.Xlsx;
  if (normalized === "csv") return ReportFormat.Csv;
  if (normalized === "markdown" || normalized === "md") return ReportFormat.Markdown;
  return undefined;
}

export default function ReportExecutionList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") || undefined;
  const [limit, setLimit] = useState(50);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");

  const executions = useReportExecutions({
    clientId,
    limit,
  });
  const templates = useReportTemplates();

  const { downloadReport, getProgress } = useReportDownload();

  const templateNameById = useMemo(() => {
    const map = new Map<string, string>();
    (templates.data ?? []).forEach((template) => {
      map.set(template.id, template.name);
    });
    return map;
  }, [templates.data]);

  const shortId = (id: string) => `${id.slice(0, 8)}...`;

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "\u2014";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "\u2014";
    }
  };

  const formatBytes = (bytes: number | null | undefined) => {
    if (bytes == null) return "\u2014";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  const columns: Column<ReportExecution>[] = [
    {
      key: "templateId",
      header: "Template",
      render: (e) => {
        const templateName = templateNameById.get(e.templateId);
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
              <Icon name="description" className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground text-sm">
                {templateName ?? "Template sem nome"}
              </p>
              <p className="text-xs text-muted font-mono">
                {shortId(e.templateId)}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      key: "executionDetails",
      header: "Execução",
      render: (e) => (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            <span className="text-muted">Criado:</span> {formatDate(e.createdAt)}
          </p>
          <p>
            <span className="text-muted">Finalizado:</span> {formatDate(e.finishedAt)}
          </p>
          <p>
            <span className="text-muted">Duração:</span>{" "}
            {e.executionTimeMs != null ? `${(e.executionTimeMs / 1000).toFixed(1)}s` : "\u2014"}
          </p>
          <p className="truncate max-w-48">
            <span className="text-muted">Por:</span> {e.createdBy || "\u2014"}
          </p>
        </div>
      ),
    },
    {
      key: "format",
      header: "Formato",
      render: (e) => {
        const normalizedFormat = normalizeReportFormat(
          e.format as ReportExecution["format"] | string | number,
        );
        return (
          <Badge color="slate">
            {normalizedFormat !== undefined
              ? FORMAT_LABELS[normalizedFormat]
              : "Desconhecido"}
          </Badge>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (e) => {
        const normalizedStatus = normalizeExecutionStatus(
          e.status as ReportExecution["status"] | string | number,
        );
        const config =
          normalizedStatus !== undefined ? STATUS_CONFIG[normalizedStatus] : undefined;
        if (!config) {
          return <Badge color="slate">Desconhecido</Badge>;
        }
        return (
          <div className="space-y-1">
            <Badge color={config.color}>
              <Icon name={config.icon} className="h-3 w-3" />
              {config.label}
            </Badge>
            {normalizedStatus === ReportExecutionStatus.Failed && e.errorMessage && (
              <p className="max-w-xs truncate text-xs text-danger" title={e.errorMessage}>
                {e.errorMessage}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: "rowCount",
      header: "Linhas",
      render: (e) => (
        <span className="text-muted-foreground">
          {e.rowCount != null ? e.rowCount.toLocaleString() : "\u2014"}
        </span>
      ),
    },
    {
      key: "size",
      header: "Tamanho",
      sortValue: (e) => e.resultSizeBytes ?? 0,
      render: (e) => (
        <span className="text-muted-foreground">
          {formatBytes(e.resultSizeBytes)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (e) => {
        const normalizedStatus = normalizeExecutionStatus(
          e.status as ReportExecution["status"] | string | number,
        );
        const progress = getProgress(e.id);

        if (progress) {
          const progressValue = Math.max(0, Math.min(100, Math.round(progress.progress)));
          return (
            <div className="min-w-44 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                {progress.status === "running" && (
                  <Icon name="progress_activity" className="h-3.5 w-3.5 animate-spin text-primary" />
                )}
                {progress.status === "completed" && (
                  <Icon name="check_circle" className="h-3.5 w-3.5 text-success" />
                )}
                {progress.status === "error" && (
                  <Icon name="error" className="h-3.5 w-3.5 text-danger" />
                )}

                {progress.status === "running" && (
                  <span className="text-muted-foreground">{progressValue}%</span>
                )}
                {progress.status === "running" && (
                  <span className="truncate text-muted">{progress.message}</span>
                )}
                {progress.status === "completed" && (
                  <span className="text-success">Download concluído</span>
                )}
              </div>

              {progress.status === "error" && (
                <div className="flex items-center gap-1 text-xs text-danger">
                  {progress.errorMessage || "Erro no download"}
                </div>
              )}
            </div>
          );
        }

        if (normalizedStatus === ReportExecutionStatus.Failed) {
          return (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Tentar novamente"
              title="Abrir template para tentar novamente"
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/reports/run?templateId=${e.templateId}${e.clientId ? `&clientId=${e.clientId}` : ""}`);
              }}
            >
              <Icon name="refresh" className="h-4 w-4" aria-hidden="true" />
            </Button>
          );
        }

        return normalizedStatus === ReportExecutionStatus.Completed ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Baixar relatório"
            title="Baixar relatório"
            onClick={(event) => {
              event.stopPropagation();
              downloadReport(e.id, { clientId });
            }}
          >
            <Icon name="download" className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null;
      },
    },
  ];

  const filteredExecutions = useMemo(() => {
    return (executions.data ?? []).filter((e) => {
      if (templateFilter !== "all" && e.templateId !== templateFilter) return false;
      if (statusFilter !== "all") {
        const s = normalizeExecutionStatus(e.status as ReportExecution["status"] | string | number);
        if (String(s) !== statusFilter) return false;
      }
      return true;
    });
  }, [executions.data, statusFilter, templateFilter]);

  if (executions.isLoading) return <Loading />;

  if (executions.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Histórico de Execuções" />
        <Card>
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
            <p className="text-sm text-danger">
              Erro ao carregar execuções de relatórios. Tente novamente.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (!executions.data || executions.data.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Histórico de Execuções">
          <Button variant="secondary" size="sm" onClick={() => executions.refetch()}>
            <Icon name="refresh" className="h-4 w-4" />
            Atualizar
          </Button>
        </PageHeader>
        <Card>
          <p className="text-center text-muted">
            Nenhuma execução de relatório encontrada.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histórico de Execuções"
        description={`${filteredExecutions.length} de ${executions.data.length} execuções recentes`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground"
            aria-label="Filtrar por status"
          >
            <option value="all">Todos os status</option>
            <option value={String(ReportExecutionStatus.Pending)}>Pendente</option>
            <option value={String(ReportExecutionStatus.Running)}>Processando</option>
            <option value={String(ReportExecutionStatus.Completed)}>Concluído</option>
            <option value={String(ReportExecutionStatus.Failed)}>Falhou</option>
          </select>
          <select
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground max-w-52"
            aria-label="Filtrar por template"
          >
            <option value="all">Todos os templates</option>
            {(templates.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground"
            aria-label="Limite de itens por página"
          >
            <option value={25}>25 itens</option>
            <option value={50}>50 itens</option>
            <option value={100}>100 itens</option>
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => executions.refetch()}
            disabled={executions.isFetching}
          >
            <Icon name="refresh" className={`h-4 w-4 ${executions.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </PageHeader>

      <Card padding={false}>
        <DataTable
          columns={columns}
          data={filteredExecutions}
          keyExtractor={(e) => e.id}
          pageSize={limit}
        />
      </Card>
    </div>
  );
}
