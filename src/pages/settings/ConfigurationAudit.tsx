import { useMemo, useState } from "react";
import type { ConfigurationAuditEntry } from "@/api";
import { Badge, Card, CardHeader, ErrorDisplay, Input, Loading, Select } from "@/components/ui";
import {
  useConfigurationAuditByUser,
  useConfigurationAuditReport,
  useEntityConfigurationAudit,
  useFieldConfigurationAudit,
  useRecentConfigurationAudit,
} from "@/hooks/useConfigurationApi";
import type { ConfigurationEntityType } from "@/services/configurationApi";

const PAGE_SIZE = 20;

export default function ConfigurationAudit() {
  const [days, setDays] = useState("30");
  const [limit, setLimit] = useState("200");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [entityType, setEntityType] = useState<"" | ConfigurationEntityType>("");
  const [entityId, setEntityId] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [username, setUsername] = useState("");
  const [page, setPage] = useState(1);

  const recentQuery = useRecentConfigurationAudit(Number(days) || 30, Number(limit) || 200);
  const byEntityQuery = useEntityConfigurationAudit(entityType || "Server", entityId, Number(limit) || 200);
  const byFieldQuery = useFieldConfigurationAudit(
    entityType || "Server",
    entityId,
    fieldName,
  );
  const byUserQuery = useConfigurationAuditByUser(username, Number(limit) || 200);
  const reportQuery = useConfigurationAuditReport(startDate, endDate);

  const activeQuery = useMemo(() => {
    if (startDate && endDate) {
      return reportQuery;
    }

    if (entityType && entityId && fieldName) {
      return byFieldQuery;
    }

    if (entityType && entityId) {
      return byEntityQuery;
    }

    if (username) {
      return byUserQuery;
    }

    return recentQuery;
  }, [
    byEntityQuery,
    byFieldQuery,
    byUserQuery,
    endDate,
    entityId,
    entityType,
    fieldName,
    recentQuery,
    reportQuery,
    startDate,
    username,
  ]);

  const sortedEntries = useMemo(
    () =>
      [...(activeQuery.data ?? [])].sort(
        (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
      ),
    [activeQuery.data],
  );

  const pageCount = Math.max(1, Math.ceil(sortedEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = sortedEntries.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Auditoria de Configurações</h1>
        <p className="text-sm text-slate-400">
          Consulte alterações por período, entidade, propriedade e usuário.
        </p>
      </div>

      <Card>
        <CardHeader title="Filtros" subtitle="Campos opcionais, combináveis" />
        <div className="grid gap-4 lg:grid-cols-4">
          <Input
            label="Dias"
            type="number"
            value={days}
            onChange={(event) => {
              setDays(event.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Limite"
            type="number"
            value={limit}
            onChange={(event) => {
              setLimit(event.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Data inicio"
            type="date"
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Data fim"
            type="date"
            value={endDate}
            onChange={(event) => {
              setEndDate(event.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Entidade"
            value={entityType}
            onChange={(event) => {
              setEntityType(event.target.value as "" | ConfigurationEntityType);
              setPage(1);
            }}
            options={[
              { value: "", label: "Todas" },
              { value: "Server", label: "Server" },
              { value: "Client", label: "Client" },
              { value: "Site", label: "Site" },
            ]}
          />
          <Input
            label="Entity ID"
            value={entityId}
            onChange={(event) => {
              setEntityId(event.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Campo"
            value={fieldName}
            onChange={(event) => {
              setFieldName(event.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Usuário"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Eventos"
          subtitle={`${sortedEntries.length} registros | página ${currentPage} de ${pageCount}`}
        />

        {activeQuery.isLoading && <Loading message="Carregando auditoria..." />}
        {activeQuery.isError && <ErrorDisplay onRetry={() => activeQuery.refetch()} />}

        {!activeQuery.isLoading && !activeQuery.isError && (
          <>
            <div className="space-y-3">
              {pageItems.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}

              {pageItems.length === 0 && (
                <p className="text-sm text-slate-400">Nenhum evento encontrado.</p>
              )}
            </div>

            {pageCount > 1 && (
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 disabled:opacity-40"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 disabled:opacity-40"
                  onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                  disabled={currentPage === pageCount}
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function AuditRow({ entry }: { entry: ConfigurationAuditEntry }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge color="accent">{entry.entityType}</Badge>
          <Badge color="slate">{entry.entityId}</Badge>
          <Badge color="primary">{entry.fieldName}</Badge>
        </div>
        <p className="text-xs text-slate-400">{new Date(entry.changedAt).toLocaleString()}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <AuditValue title="Valor antigo" value={entry.oldValue} />
        <AuditValue title="Valor novo" value={entry.newValue} />
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Alterado por: {entry.changedBy ?? "desconhecido"} | versão: {entry.entityVersion}
      </p>
    </div>
  );
}

function AuditValue({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-xs text-slate-400">{title}</p>
      <pre className="min-h-16 rounded border border-white/10 bg-slate-950/40 p-2 text-xs text-slate-200 whitespace-pre-wrap">
        {formatAuditValue(value)}
      </pre>
    </div>
  );
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[valor nao serializavel]";
  }
}
