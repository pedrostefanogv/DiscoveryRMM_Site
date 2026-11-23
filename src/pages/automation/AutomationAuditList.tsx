import toast from "react-hot-toast";
import { Badge, ErrorDisplay, Icon, Loading } from "@/components/ui";
import { formatDateTime } from "@/utils/format";
import { prettyJson, scriptChangeTypeLabel } from "./automationScriptUtils";

export interface AutomationAuditEntry {
  id: string;
  changeType: unknown;
  reason: string | null;
  oldValueJson: string | null;
  newValueJson: string | null;
  changedBy: string | null;
  ipAddress: string | null;
  correlationId: string | null;
  changedAt: string;
}

interface AutomationAuditListProps {
  entries: AutomationAuditEntry[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  entityBadge?: string;
  emptyMessage?: string;
  errorMessage?: string;
}

export function AutomationAuditList({
  entries,
  isLoading,
  isError,
  onRetry,
  entityBadge,
  emptyMessage = "Nenhum evento de auditoria encontrado.",
  errorMessage = "Não foi possível carregar a trilha de auditoria.",
}: AutomationAuditListProps) {
  const copyCorrelation = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Correlation ID copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  if (isLoading) {
    return <Loading message="Carregando auditoria..." />;
  }

  if (isError) {
    return <ErrorDisplay message={errorMessage} onRetry={onRetry} />;
  }

  if (!entries?.length) {
    return <p className="text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-border bg-surface-light p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="accent">{scriptChangeTypeLabel(entry.changeType)}</Badge>
              {entityBadge && <Badge color="slate">{entityBadge}</Badge>}
            </div>
            <p className="text-xs text-muted">{formatDateTime(entry.changedAt)}</p>
          </div>
          <p className="text-sm text-muted-foreground">Motivo: {entry.reason || "-"}</p>
          <p className="text-sm text-muted-foreground">Alterado por: {entry.changedBy || "-"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>IP: {entry.ipAddress || "-"}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              Correlation: <span className="font-mono">{entry.correlationId || "-"}</span>
              {entry.correlationId && (
                <button
                  type="button"
                  onClick={() => void copyCorrelation(entry.correlationId!)}
                  className="rounded p-0.5 text-muted transition-colors hover:text-foreground"
                  aria-label="Copiar correlation id"
                  title="Copiar correlation id"
                >
                  <Icon name="content_copy" className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          </div>
          {(entry.oldValueJson || entry.newValueJson) && (
            <details className="mt-2 rounded border border-border bg-background/40 p-2">
              <summary className="cursor-pointer text-xs text-muted">
                Snapshots (antes / depois)
              </summary>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-medium text-muted">Antes</p>
                  <pre className="max-h-56 overflow-auto rounded border border-border bg-surface/60 p-2 text-xs text-foreground">
                    {prettyJson(entry.oldValueJson) || "null"}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-medium text-muted">Depois</p>
                  <pre className="max-h-56 overflow-auto rounded border border-border bg-surface/60 p-2 text-xs text-foreground">
                    {prettyJson(entry.newValueJson) || "null"}
                  </pre>
                </div>
              </div>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
