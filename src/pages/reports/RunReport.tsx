import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Play, Download, Clock, CheckCircle, XCircle } from "lucide-react";
import {
  useReportTemplate,
  useRunReport,
  useReportExecution,
} from "@/hooks";
import { Button, Card, Loading, Badge } from "@/components/ui";
import {
  ReportFormat,
  ReportExecutionStatus,
  type RunReportRequest,
} from "@/api/types";
import { getReportDownloadUrl } from "@/api/reports";
import toast from "react-hot-toast";

const FORMAT_LABELS: Record<ReportFormat, string> = {
  [ReportFormat.Xlsx]: "Excel (.xlsx)",
  [ReportFormat.Csv]: "CSV (.csv)",
  [ReportFormat.Pdf]: "PDF (.pdf)",
};

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

export default function RunReport() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const templateId = searchParams.get("templateId") || "";
  const clientId = searchParams.get("clientId") || "";

  const [format, setFormat] = useState<ReportFormat | null>(null);
  const [filters, setFilters] = useState("");
  const [executionId, setExecutionId] = useState<string | null>(null);

  const template = useReportTemplate(templateId, clientId);
  const runMutation = useRunReport();
  const execution = useReportExecution(
    executionId || "",
    clientId,
  );

  const handleRun = (runAsync: boolean) => {
    const request: RunReportRequest = {
      templateId,
      clientId,
      format: format || null,
      filtersJson: filters.trim() || null,
      createdBy: "user@example.com", // TODO: Get from auth context
      runAsync,
    };

    runMutation.mutate(request, {
      onSuccess: (response) => {
        setExecutionId(response.executionId);
        if (!runAsync && response.downloadPath) {
          toast.success("Relatório gerado com sucesso!");
        } else {
          toast.success("Relatório em processamento...");
        }
      },
      onError: () => {
        toast.error("Erro ao executar relatório");
      },
    });
  };

  if (template.isLoading) return <Loading />;
  if (!template.data) {
    return (
      <div className="space-y-6">
        <Card>
          <p className="text-center text-slate-400">Template não encontrado</p>
        </Card>
      </div>
    );
  }

  const selectedFormat = format ?? template.data.defaultFormat;
  const isProcessing =
    execution.data?.status === ReportExecutionStatus.Pending ||
    execution.data?.status === ReportExecutionStatus.Processing;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Executar Relatório</h1>
          <p className="text-sm text-slate-400">{template.data.name}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-white">
            Configurações
          </h2>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Formato de Saída
              </label>
              <select
                value={selectedFormat}
                onChange={(e) => setFormat(Number(e.target.value) as ReportFormat)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-primary focus:ring-1 focus:ring-primary"
                aria-label="Formato de saída do relatório"
              >
                <option value={ReportFormat.Xlsx}>
                  {FORMAT_LABELS[ReportFormat.Xlsx]}
                </option>
                <option value={ReportFormat.Csv}>
                  {FORMAT_LABELS[ReportFormat.Csv]}
                </option>
                <option value={ReportFormat.Pdf}>
                  {FORMAT_LABELS[ReportFormat.Pdf]}
                </option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Filtros (JSON)
              </label>
              <textarea
                value={filters}
                onChange={(e) => setFilters(e.target.value)}
                placeholder='{"from": "2026-01-01", "to": "2026-03-07"}'
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                rows={6}
              />
              <p className="mt-1 text-xs text-slate-500">
                Opcional. Sobrescreve os filtros padrão do template.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => handleRun(false)}
                disabled={runMutation.isPending || isProcessing}
                className="flex-1"
              >
                <Play className="h-4 w-4" />
                {runMutation.isPending ? "Executando..." : "Executar Agora"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleRun(true)}
                disabled={runMutation.isPending || isProcessing}
                className="flex-1"
              >
                <Clock className="h-4 w-4" />
                Executar em Background
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-white">Status</h2>
          {!executionId ? (
            <p className="text-center text-slate-400">
              Nenhuma execução iniciada
            </p>
          ) : execution.isLoading ? (
            <Loading />
          ) : execution.data ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Status:</span>
                <Badge color={STATUS_CONFIG[execution.data.status].color}>
                  {STATUS_CONFIG[execution.data.status].label}
                </Badge>
              </div>

              {execution.data.rowCount !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Linhas:</span>
                  <span className="text-white">
                    {execution.data.rowCount.toLocaleString()}
                  </span>
                </div>
              )}

              {execution.data.resultSizeBytes !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Tamanho:</span>
                  <span className="text-white">
                    {(execution.data.resultSizeBytes / 1024 / 1024).toFixed(2)}{" "}
                    MB
                  </span>
                </div>
              )}

              {execution.data.errorMessage && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <p className="text-sm text-red-400">
                    {execution.data.errorMessage}
                  </p>
                </div>
              )}

              {execution.data.status === ReportExecutionStatus.Completed && (
                <Button
                  className="w-full"
                  onClick={() => {
                    const url = getReportDownloadUrl(executionId, clientId);
                    window.open(url, "_blank");
                  }}
                >
                  <Download className="h-4 w-4" />
                  Baixar Relatório
                </Button>
              )}
            </div>
          ) : null}
        </Card>
      </div>

      {template.data.description && (
        <Card>
          <h3 className="mb-2 text-sm font-medium text-slate-300">Descrição</h3>
          <p className="text-sm text-slate-400">{template.data.description}</p>
        </Card>
      )}
    </div>
  );
}
