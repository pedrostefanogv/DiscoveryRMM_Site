import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Clock, CheckCircle, XCircle, FileText } from "lucide-react";
import { useReportExecutions } from "@/hooks";
import { Button, Card, DataTable, Badge, Loading } from "@/components/ui";
import type { ReportExecution } from "@/api/types";
import type { Column } from "@/components/ui";
import { ReportExecutionStatus, ReportFormat } from "@/api/types";
import { getReportDownloadUrl } from "@/api/reports";

const STATUS_CONFIG = {
  [ReportExecutionStatus.Pending]: {
    label: "Pendente",
    color: "slate" as const,
    icon: Clock,
  },
  [ReportExecutionStatus.Processing]: {
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

export default function ReportExecutionList() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") || "";
  const [limit, setLimit] = useState(50);

  const executions = useReportExecutions(clientId, limit);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return "—";
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  const columns: Column<ReportExecution>[] = [
    {
      key: "templateId",
      header: "Template",
      render: (e) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-white text-xs font-mono">
              {e.templateId.substring(0, 8)}...
            </p>
            <p className="text-xs text-slate-500">
              {formatDate(e.createdAt)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "format",
      header: "Formato",
      render: (e) => (
        <Badge color="slate">
          {FORMAT_LABELS[e.format]}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (e) => {
        const config = STATUS_CONFIG[e.status];
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
          {e.rowCount !== null ? e.rowCount.toLocaleString() : "—"}
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
      render: (e) =>
        e.status === ReportExecutionStatus.Completed ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              const url = getReportDownloadUrl(e.id, clientId);
              window.open(url, "_blank");
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
        ) : null,
    },
  ];

  if (executions.isLoading) return <Loading />;

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
