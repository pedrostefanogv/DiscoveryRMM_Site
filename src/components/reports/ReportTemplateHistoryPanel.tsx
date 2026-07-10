import { History } from "lucide-react";
import { Card, Badge, Loading } from "@/components/ui";
import { useReportTemplateHistory } from "@/hooks";
import { ReportFormat, ReportDatasetType, type ReportDatasetTypeValue, type ReportFormatValue } from "@/api/types";

const EVENT_LABELS = {
  Created: "Criado",
  Updated: "Atualizado",
  Deleted: "Excluído",
} as const;

const EVENT_COLORS = {
  Created: "success" as const,
  Updated: "primary" as const,
  Deleted: "danger" as const,
};

const FORMAT_LABELS: Record<ReportFormat, string> = {
  [ReportFormat.Xlsx]: "Excel",
  [ReportFormat.Csv]: "CSV",
  [ReportFormat.Pdf]: "PDF",
  [ReportFormat.Markdown]: "Markdown",
};

const DATASET_LABELS: Record<ReportDatasetType, string> = {
  [ReportDatasetType.SoftwareInventory]: "Inventário de Software",
  [ReportDatasetType.Logs]: "Logs",
  [ReportDatasetType.ConfigurationAudit]: "Auditoria de Configuração",
  [ReportDatasetType.Tickets]: "Tickets",
  [ReportDatasetType.AgentHardware]: "Hardware de Agentes",
  [ReportDatasetType.AgentInventoryComposite]: "Inventário Composto",
  [ReportDatasetType.AgentLabels]: "Labels de Agentes",
  [ReportDatasetType.AutomaticLabelRules]: "Regras de Labels",
  [ReportDatasetType.AutomationExecutions]: "Execuções de Automação",
  [ReportDatasetType.KnowledgeBase]: "Base de Conhecimento",
};

function getDatasetLabel(datasetType: ReportDatasetTypeValue): string {
  if (typeof datasetType === "string") {
    const normalized = datasetType.trim();
    const lower = normalized.toLowerCase();
    const stringLabels: Record<string, string> = {
      softwareinventory: "Inventário de Software",
      "software-inventory": "Inventário de Software",
      logs: "Logs",
      configurationaudit: "Auditoria de Configuração",
      "configuration-audit": "Auditoria de Configuração",
      tickets: "Tickets",
      agenthardware: "Hardware de Agentes",
      "agent-hardware": "Hardware de Agentes",
      agentlabels: "Labels de Agentes",
      "agent-labels": "Labels de Agentes",
      knowledgebase: "Base de Conhecimento",
      "knowledge-base": "Base de Conhecimento",
    };
    return stringLabels[lower] ?? normalized;
  }

  return DATASET_LABELS[datasetType] ?? String(datasetType);
}

function getFormatLabel(format: ReportFormatValue): string {
  if (typeof format === "string") {
    const lower = format.toLowerCase();
    if (lower === "pdf") return "PDF";
    if (lower === "csv") return "CSV";
    if (lower === "xlsx") return "Excel";
    return format;
  }

  return FORMAT_LABELS[format] ?? String(format);
}

interface ReportTemplateHistoryPanelProps {
  templateId: string;
  limit?: number;
}

export function ReportTemplateHistoryPanel({ templateId, limit = 50 }: ReportTemplateHistoryPanelProps) {
  const { data: history, isLoading } = useReportTemplateHistory(templateId, limit);

  if (isLoading) {
    return (
      <Card>
        <Loading />
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Histórico de Versões
          </h3>
        </div>
        {history && (
          <span className="text-xs text-muted">
            {history.length} {history.length === 1 ? "versão" : "versões"}
          </span>
        )}
      </div>

      <div className="max-h-96 space-y-3 overflow-auto pr-1">
        {!history || history.length === 0 ? (
          <p className="text-sm text-muted">Sem histórico disponível.</p>
        ) : (
          history.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-border bg-surface-light p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge color={EVENT_COLORS[entry.eventType]}>
                      {EVENT_LABELS[entry.eventType]}
                    </Badge>
                    <span className="text-xs text-muted">
                      v{entry.version}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    {entry.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>
                      {getDatasetLabel(entry.datasetType)}
                    </span>
                    <span>•</span>
                    <span>
                      {getFormatLabel(entry.defaultFormat)}
                    </span>
                    <span>•</span>
                    <span className={entry.isActive ? "text-green-400" : "text-red-400"}>
                      {entry.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted">
                {new Date(entry.createdAt).toLocaleString("pt-BR")}
                {entry.createdBy && ` por ${entry.createdBy}`}
              </p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
