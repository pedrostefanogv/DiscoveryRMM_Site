import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Download,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useReportExecutions, useReportDownload, useReportTemplates } from "@/hooks";
import { Button, Card, DataTable, Badge, Loading } from "@/components/ui";
import type { ReportExecution } from "@/api/types";
import type { Column } from "@/components/ui";
import { ReportExecutionStatus, ReportFormat } from "@/api/types";

const STATUS_CONFIG = {
  [ReportExecutionStatus.Pending]: {
    label: "Pendente",
    color: "slate" as const,
    icon: Clock,
  },
  [ReportExecutionStatus.Running]: {
    label: "Processando",
    color: "primary" as const,
    icon: Clock,
  },
  [ReportExecutionStatus.Completed]: {
    label: "Concluído",
    color: "success" as const,
    icon: CheckCircle,
  },
  [ReportExecutionStatus.Failed]: {
    label: "Falhou",
    color: "danger" as const,
    icon: XCircle,
  },
};

const FORMAT_LABELS: Record<ReportFormat, string> = {
  [ReportFormat.Xlsx]: "Excel",
  [ReportFormat.Csv]: "CSV",
  [ReportFormat.Pdf]: "PDF",
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
  if (normalized === "pdf") return ReportFormat.Pdf;
  return undefined;
}

export default function ReportExecutionList() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") || undefined;
  const [limit, setLimit] = useState(50);

  const executions = useReportExecutions({ 
    clientId, 
    limit 
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
    if (!dateStr) return "—";
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
      return "—";
    }
  };

  const formatBytes = (bytes: number | null | undefined) => {
    if (!bytes) return "—";
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
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-white text-sm">
                {templateName ?? "Template sem nome"}
              </p>
              <p className="text-xs text-slate-500 font-mono">
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
        <div className="space-y-1 text-xs text-slate-300">
          <p>
            <span className="text-slate-500">Criado:</span> {formatDate(e.createdAt)}
          </p>
          <p>
            <span className="text-slate-500">Finalizado:</span> {formatDate(e.finishedAt)}
          </p>
          <p>
            <span className="text-slate-500">Duração:</span>{" "}
            {e.executionTimeMs ? `${(e.executionTimeMs / 1000).toFixed(1)}s` : "—"}
          </p>
          <p className="truncate max-w-48">
            <span className="text-slate-500">Por:</span> {e.createdBy || "—"}
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
        const Icon = config.icon;
        return (
          <Badge color={config.color}>
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        );
      },
    },
    {
      key: "rowCount",
      header: "Linhas",
      render: (e) => (
        <span className="text-slate-300">
          {e.rowCount ? e.rowCount.toLocaleString() : "—"}
        </span>
      ),
    },
    {
      key: "size",
      header: "Tamanho",
      render: (e) => (
        <span className="text-slate-300">
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
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                )}
                {progress.status === "completed" && (
                  <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                )}
                {progress.status === "error" && (
                  <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                )}

                {progress.status === "running" && (
                  <span className="text-slate-300">{progressValue}%</span>
                )}
                {progress.status === "running" && (
                  <span className="truncate text-slate-400">{progress.message}</span>
                )}
                {progress.status === "completed" && (
                  <span className="text-green-400">Download concluído</span>
                )}
              </div>

              {progress.status === "error" && (
                <div className="flex items-center gap-1 text-xs text-red-400">
                  {progress.errorMessage || "Erro no download"}
                </div>
              )}
            </div>
          );
        }

        return normalizedStatus === ReportExecutionStatus.Completed ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              downloadReport(e.id, { clientId });
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
        ) : null;
      },
    },
  ];

  if (executions.isLoading) return <Loading />;

  if (executions.isError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">
            Histórico de Execuções
          </h1>
        </div>
        <Card>
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
            <p className="text-sm text-red-400">
              Erro ao carregar execuções de relatórios. Por favor, selecione um cliente ou tente novamente.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (!executions.data || executions.data.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">
            Histórico de Execuções
          </h1>
        </div>
        <Card>
          <p className="text-center text-slate-400">
            Nenhuma execução de relatório encontrada.{!clientId && " Selecione um cliente para ver o histórico."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Histórico de Execuções
          </h1>
          <p className="text-sm text-slate-400">
            {executions.data?.length ?? 0} execuções recentes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            aria-label="Limite de itens por página"
          >
            <option value={25}>25 itens</option>
            <option value={50}>50 itens</option>
            <option value={100}>100 itens</option>
          </select>
        </div>
      </div>

      <Card padding={false}>
        <DataTable
          columns={columns}
          data={executions.data ?? []}
          keyExtractor={(e) => e.id}
        />
      </Card>
    </div>
  );
}
