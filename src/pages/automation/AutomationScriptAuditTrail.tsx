import { useAutomationScriptAudit } from "@/hooks/useAutomation";
import { AutomationAuditList } from "./AutomationAuditList";

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
    <AutomationAuditList
      entries={auditQuery.data}
      isLoading={auditQuery.isLoading}
      isError={auditQuery.isError}
      onRetry={() => void auditQuery.refetch()}
      errorMessage="Não foi possível carregar a trilha de auditoria deste script."
    />
  );
}
