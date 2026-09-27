import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { ConfigurationAuditEntry } from "@/api";
import { Badge, Button, Card, CardHeader, ErrorDisplay, Input, Loading, Select } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useAllSites } from "@/hooks/useSites";
import {
  useConfigurationAuditByUser,
  useConfigurationAuditReport,
  useEntityConfigurationAudit,
  useFieldConfigurationAudit,
  useRecentConfigurationAudit,
} from "../../hooks/useConfigurationApi";
import type { ConfigurationEntityType } from "@/services/configurationApi";
import { buildAuditCsv, entityLabel, shortEntityId } from "@/utils/configurationAudit";

const PAGE_SIZE = 20;

function exportCsv(entries: ConfigurationAuditEntry[]) {
  const blob = new Blob([buildAuditCsv(entries)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `auditoria-config-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

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

  const clientsQuery = useClients();
  const sitesQuery = useAllSites(false);

  const entityNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const client of clientsQuery.data ?? []) {
      map.set(client.id, `Cliente: ${client.name}`);
    }
    for (const site of sitesQuery.data ?? []) {
      map.set(site.id, `Site: ${site.name}`);
    }
    return map;
  }, [clientsQuery.data, sitesQuery.data]);

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
        <h1 className="text-2xl font-bold text-foreground">Auditoria de Configurações</h1>
        <p className="text-sm text-muted">
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
            label="Data início"
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
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => exportCsv(sortedEntries)}
              disabled={sortedEntries.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </Button>
          }
        />

        {activeQuery.isLoading && <Loading message="Carregando auditoria..." />}
        {activeQuery.isError && <ErrorDisplay onRetry={() => activeQuery.refetch()} />}

        {!activeQuery.isLoading && !activeQuery.isError && (
          <>
            <div className="space-y-3">
              {pageItems.map((entry) => (
                <AuditRow
                  key={entry.id}
                  entry={entry}
                  entityName={entityNameById.get(entry.entityId)}
                />
              ))}

              {pageItems.length === 0 && (
                <p className="text-sm text-muted">Nenhum evento encontrado.</p>
              )}
            </div>

            {pageCount > 1 && (
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground disabled:opacity-40"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground disabled:opacity-40"
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

function AuditRow({
  entry,
  entityName,
}: {
  entry: ConfigurationAuditEntry;
  entityName?: string;
}) {
  // UUID truncado por padrão; o valor completo fica no tooltip e no CSV exportado.
  const shortId = shortEntityId(entry.entityId);

  return (
    <div className="rounded-lg border border-border bg-surface-light p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="accent">{entityLabel(entry.entityType)}</Badge>
          <Badge color="primary">{entry.fieldName}</Badge>
          <span
            className="inline-flex max-w-full items-center rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-xs text-foreground"
            title={entityName ? undefined : entry.entityId}
          >
            <span className="truncate">{entityName ?? shortId}</span>
          </span>
          <span className="font-mono text-[11px] text-muted" title={entry.entityId}>
            {shortId}
          </span>
        </div>
        <p className="text-xs text-muted">{new Date(entry.changedAt).toLocaleString()}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <AuditValue title="Valor antigo" value={entry.oldValue} />
        <AuditValue title="Valor novo" value={entry.newValue} />
      </div>

      <p className="mt-2 text-xs text-muted">
        Alterado por: {entry.changedBy ?? "desconhecido"} | versão: {entry.entityVersion}
      </p>
    </div>
  );
}

function AuditValue({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{title}</p>
      <pre className="min-h-16 rounded border border-border bg-background/40 p-2 text-xs text-foreground whitespace-pre-wrap">
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
    return "[valor não serializável]";
  }
}
