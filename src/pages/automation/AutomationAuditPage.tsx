import { useMemo, useState } from "react";
import {
  Badge,
  Card,
  CardHeader,
  ErrorDisplay,
  Loading,
  Select,
} from "@/components/ui";
import {
  useAutomationScriptAudit,
  useAutomationScripts,
  useAutomationTaskAudit,
  useAutomationTasks,
} from "@/hooks/useAutomation";

type AuditEntity = "script" | "task";

export default function AutomationAuditPage() {
  const [entity, setEntity] = useState<AuditEntity>("script");
  const [entityId, setEntityId] = useState("");
  const [limit, setLimit] = useState(50);

  const scripts = useAutomationScripts({ activeOnly: false, limit: 200, offset: 0 });
  const tasks = useAutomationTasks({ activeOnly: false, limit: 200, offset: 0 });

  const scriptAudit = useAutomationScriptAudit(entityId, limit, entity === "script" && !!entityId);
  const taskAudit = useAutomationTaskAudit(entityId, limit, entity === "task" && !!entityId);

  const activeQuery = entity === "script" ? scriptAudit : taskAudit;

  const entityOptions = useMemo(
    () => [
      { value: "", label: "Selecione" },
      ...((entity === "script" ? scripts.data?.items : tasks.data?.items) ?? []).map((item) => ({
        value: item.id,
        label: item.name,
      })),
    ],
    [entity, scripts.data?.items, tasks.data?.items],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Auditoria de Automacao</h1>
        <p className="text-sm text-slate-400">
          Consulte a trilha funcional de scripts e tarefas com correlation id.
        </p>
      </div>

      <Card>
        <CardHeader title="Filtros" subtitle="Escolha entidade e limite de eventos" />
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            label="Entidade"
            value={entity}
            options={[
              { value: "script", label: "Script" },
              { value: "task", label: "Tarefa" },
            ]}
            onChange={(e) => {
              setEntity(e.target.value as AuditEntity);
              setEntityId("");
            }}
          />
          <Select
            label={entity === "script" ? "Script" : "Tarefa"}
            value={entityId}
            options={entityOptions}
            onChange={(e) => setEntityId(e.target.value)}
          />
          <Select
            label="Limite"
            value={String(limit)}
            options={[
              { value: "20", label: "20" },
              { value: "50", label: "50" },
              { value: "100", label: "100" },
            ]}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Eventos" subtitle={entityId ? "Auditoria retornada pela API" : "Selecione uma entidade para consultar"} />
        {!entityId && <p className="text-sm text-slate-400">Nenhuma entidade selecionada.</p>}
        {entityId && activeQuery.isLoading && <Loading message="Carregando auditoria..." />}
        {entityId && activeQuery.isError && <ErrorDisplay onRetry={() => activeQuery.refetch()} />}
        {entityId && !activeQuery.isLoading && !activeQuery.isError && (
          <div className="space-y-3">
            {(activeQuery.data ?? []).map((entry) => (
              <div key={entry.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <Badge color="accent">{String(entry.changeType)}</Badge>
                    <Badge color="slate">{entity === "script" ? "Script" : "Tarefa"}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{new Date(entry.changedAt).toLocaleString("pt-BR")}</p>
                </div>
                <p className="text-sm text-slate-300">Motivo: {entry.reason || "-"}</p>
                <p className="text-sm text-slate-300">Alterado por: {entry.changedBy || "-"}</p>
                <p className="text-xs text-slate-500">Correlation: {entry.correlationId || "-"}</p>
                <details className="mt-2 rounded border border-white/10 bg-slate-950/40 p-2">
                  <summary className="cursor-pointer text-xs text-slate-400">Snapshot técnico</summary>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <pre className="overflow-auto rounded border border-white/10 bg-slate-900/60 p-2 text-xs text-slate-200">
{entry.oldValueJson || "null"}
                    </pre>
                    <pre className="overflow-auto rounded border border-white/10 bg-slate-900/60 p-2 text-xs text-slate-200">
{entry.newValueJson || "null"}
                    </pre>
                  </div>
                </details>
              </div>
            ))}
            {!activeQuery.data?.length && (
              <p className="text-sm text-slate-400">Nenhum evento de auditoria encontrado.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
