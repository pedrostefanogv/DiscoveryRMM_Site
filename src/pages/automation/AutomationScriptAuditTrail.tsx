import { formatDateTime } from '@/utils/format';
import { Badge, ErrorDisplay, Loading } from "@/components/ui";
import { useAutomationScriptAudit } from "@/hooks/useAutomation";
import { prettyJson, scriptChangeTypeLabel } from "./automationScriptUtils";

interface AutomationScriptAuditTrailProps {
  scriptId: string;
  limit?: number;
}

/**
 * Trilha de auditoria de um script (eventos Criado/Atualizado/Consumido...).
 *
 * Extraída da listagem para ser reaproveitada tanto no modal de auditoria
 * quanto na página de detalhes do script.
 */
export function AutomationScriptAuditTrail({ scriptId, limit = 50 }: AutomationScriptAuditTrailProps) {
  const auditQuery = useAutomationScriptAudit(scriptId, limit, !!scriptId);

  if (!scriptId) {
    return <p className="text-sm text-muted">Selecione um script para ver a auditoria.</p>;
  }

  return (
    <div className="space-y-3">
      {auditQuery.isLoading && <Loading message="Carregando auditoria..." />}
      {auditQuery.isError && (
        <ErrorDisplay
          message="Não foi possível carregar a trilha de auditoria deste script."
          onRetry={() => auditQuery.refetch()}
        />
      )}
      {!auditQuery.isLoading && !auditQuery.isError && (
        <>
          {(auditQuery.data ?? []).map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border bg-surface-light p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge color="accent">{scriptChangeTypeLabel(entry.changeType)}</Badge>
                <p className="text-xs text-muted">
                  {formatDateTime(entry.changedAt)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">Motivo: {entry.reason || "-"}</p>
              <p className="text-sm text-muted-foreground">Alterado por: {entry.changedBy || "-"}</p>
              <p className="text-xs text-muted">
                IP: {entry.ipAddress || "-"} · Correlation: {entry.correlationId || "-"}
              </p>
              {(entry.oldValueJson || entry.newValueJson) && (
                <details className="mt-2 rounded border border-border bg-background/40 p-2">
                  <summary className="cursor-pointer text-xs text-muted">
                    Snapshots (antes/depois)
                  </summary>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <pre className="max-h-56 overflow-auto rounded border border-border bg-surface/60 p-2 text-xs text-foreground">
                      {prettyJson(entry.oldValueJson) || "null"}
                    </pre>
                    <pre className="max-h-56 overflow-auto rounded border border-border bg-surface/60 p-2 text-xs text-foreground">
                      {prettyJson(entry.newValueJson) || "null"}
                    </pre>
                  </div>
                </details>
              )}
            </div>
          ))}
          {!auditQuery.data?.length && (
            <p className="text-sm text-muted">Nenhum evento de auditoria encontrado.</p>
          )}
        </>
      )}
    </div>
  );
}
