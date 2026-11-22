import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ConfigurationAuditEntry } from "@/api";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  PageHeader,
  Pagination,
  Select,
  StatCard,
} from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useAllSites } from "@/hooks/useSites";
import {
  useConfigurationAuditByUser,
  useConfigurationAuditReport,
  useEntityConfigurationAudit,
  useFieldConfigurationAudit,
  useRecentConfigurationAudit,
} from "@/hooks/useConfigurationApi";
import type { ConfigurationEntityType } from "@/services/configurationApi";
import {
  buildAuditCsv,
  clampAuditNumber,
  entityLabel,
  filterAuditEntries,
  formatAuditValue,
  isValidUuid,
  normalizeDateRangeForReport,
  shortEntityId,
} from "@/utils/configurationAudit";

const PAGE_SIZE = 20;
const DEFAULT_DAYS = "30";
const DEFAULT_LIMIT = "200";
const PERIOD_PRESETS = ["7", "30", "90"] as const;

type QueryMode = "report" | "field" | "entity" | "user" | "recent";

function parseEntityTypeParam(
  raw: string | null,
): "" | ConfigurationEntityType {
  if (raw === "Server" || raw === "Client" || raw === "Site") {
    return raw;
  }
  return "";
}

function parsePageParam(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

function exportCsv(entries: ConfigurationAuditEntry[]) {
  const blob = new Blob(["\uFEFF", buildAuditCsv(entries)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `auditoria-config-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function useCopyFeedback() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const copy = (text: string) => {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopied(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 1500);
  };

  return { copied, copy };
}

function ClearFieldButton({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={label}
      className="absolute right-2.5 bottom-2 flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <Icon name="close" className="h-3.5 w-3.5" />
    </button>
  );
}

export default function ConfigurationAudit() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [days, setDays] = useState(
    () => searchParams.get("days") || DEFAULT_DAYS,
  );
  const [limit, setLimit] = useState(
    () => searchParams.get("limit") || DEFAULT_LIMIT,
  );
  const [startDate, setStartDate] = useState(
    () => searchParams.get("startDate") ?? "",
  );
  const [endDate, setEndDate] = useState(
    () => searchParams.get("endDate") ?? "",
  );
  const [entityType, setEntityType] = useState<"" | ConfigurationEntityType>(
    () => parseEntityTypeParam(searchParams.get("entityType")),
  );
  const [entityId, setEntityId] = useState(
    () => searchParams.get("entityId") ?? "",
  );
  const [fieldName, setFieldName] = useState(
    () => searchParams.get("fieldName") ?? "",
  );
  const [username, setUsername] = useState(
    () => searchParams.get("username") ?? "",
  );
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [page, setPage] = useState(() => parsePageParam(searchParams.get("page")));

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Auditoria de Configurações — Discovery RMM";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams();
        if (days && days !== DEFAULT_DAYS) next.set("days", days);
        if (limit && limit !== DEFAULT_LIMIT) next.set("limit", limit);
        if (startDate) next.set("startDate", startDate);
        if (endDate) next.set("endDate", endDate);
        if (entityType) next.set("entityType", entityType);
        if (entityId) next.set("entityId", entityId);
        if (fieldName) next.set("fieldName", fieldName);
        if (username) next.set("username", username);
        if (search) next.set("q", search);
        if (page > 1) next.set("page", String(page));
        return next.toString() === prev.toString() ? prev : next;
      },
      { replace: true },
    );
  }, [
    days,
    limit,
    startDate,
    endDate,
    entityType,
    entityId,
    fieldName,
    username,
    search,
    page,
    setSearchParams,
  ]);

  const deferredDays = useDeferredValue(days);
  const deferredLimit = useDeferredValue(limit);
  const deferredEntityId = useDeferredValue(entityId);
  const deferredFieldName = useDeferredValue(fieldName);
  const deferredUsername = useDeferredValue(username);
  const deferredSearch = useDeferredValue(search);

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

  const parsedDays = clampAuditNumber(deferredDays, 30, 1, 365);
  const parsedLimit = clampAuditNumber(deferredLimit, 200, 1, 1000);
  const reportRange = normalizeDateRangeForReport(startDate, endDate);
  const isDateRangeInvalid = Boolean(
    startDate && endDate && endDate < startDate,
  );

  const trimmedEntityId = deferredEntityId.trim();
  const trimmedFieldName = deferredFieldName.trim();
  const trimmedUsername = deferredUsername.trim();

  const queryMode: QueryMode = useMemo(() => {
    if (reportRange !== null) {
      return "report";
    }
    if (entityType && isValidUuid(trimmedEntityId) && trimmedFieldName) {
      return "field";
    }
    if (entityType && isValidUuid(trimmedEntityId)) {
      return "entity";
    }
    if (trimmedUsername) {
      return "user";
    }
    return "recent";
  }, [
    entityType,
    reportRange,
    trimmedEntityId,
    trimmedFieldName,
    trimmedUsername,
  ]);

  const recentQuery = useRecentConfigurationAudit(
    parsedDays,
    parsedLimit,
    queryMode === "recent",
  );
  const byEntityQuery = useEntityConfigurationAudit(
    entityType || "Server",
    trimmedEntityId,
    parsedLimit,
    queryMode === "entity",
  );
  const byFieldQuery = useFieldConfigurationAudit(
    entityType || "Server",
    trimmedEntityId,
    trimmedFieldName,
    queryMode === "field",
  );
  const byUserQuery = useConfigurationAuditByUser(
    trimmedUsername,
    parsedLimit,
    queryMode === "user",
  );
  const reportQuery = useConfigurationAuditReport(
    reportRange?.startIso ?? "",
    reportRange?.endIso ?? "",
    queryMode === "report",
  );

  const activeQuery = useMemo(() => {
    switch (queryMode) {
      case "report":
        return reportQuery;
      case "field":
        return byFieldQuery;
      case "entity":
        return byEntityQuery;
      case "user":
        return byUserQuery;
      default:
        return recentQuery;
    }
  }, [
    byEntityQuery,
    byFieldQuery,
    byUserQuery,
    queryMode,
    recentQuery,
    reportQuery,
  ]);

  const sortedEntries = useMemo(
    () =>
      [...(activeQuery.data ?? [])].sort(
        (a, b) =>
          new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
      ),
    [activeQuery.data],
  );

  const entriesWithoutEntityType = useMemo(
    () =>
      filterAuditEntries(
        sortedEntries,
        {
          entityType: "",
          entityId: deferredEntityId,
          fieldName: deferredFieldName,
          username: deferredUsername,
          startDate,
          endDate,
          search: deferredSearch,
        },
        entityNameById,
      ),
    [
      deferredEntityId,
      deferredFieldName,
      deferredSearch,
      deferredUsername,
      endDate,
      entityNameById,
      sortedEntries,
      startDate,
    ],
  );

  const kpiCounts = useMemo(() => {
    let server = 0;
    let client = 0;
    let site = 0;
    for (const entry of entriesWithoutEntityType) {
      if (entry.entityType === "Server") server += 1;
      else if (entry.entityType === "Client") client += 1;
      else if (entry.entityType === "Site") site += 1;
    }
    return {
      total: entriesWithoutEntityType.length,
      server,
      client,
      site,
    };
  }, [entriesWithoutEntityType]);

  const filteredEntries = useMemo(() => {
    if (!entityType) return entriesWithoutEntityType;
    return entriesWithoutEntityType.filter(
      (entry) => entry.entityType === entityType,
    );
  }, [entriesWithoutEntityType, entityType]);

  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredEntries.slice(pageStart, pageStart + PAGE_SIZE);

  const hasActiveFilters = Boolean(
    days !== DEFAULT_DAYS ||
      limit !== DEFAULT_LIMIT ||
      startDate ||
      endDate ||
      entityType ||
      entityId ||
      fieldName ||
      username ||
      search,
  );

  const clearAllFilters = () => {
    setDays(DEFAULT_DAYS);
    setLimit(DEFAULT_LIMIT);
    setStartDate("");
    setEndDate("");
    setEntityType("");
    setEntityId("");
    setFieldName("");
    setUsername("");
    setSearch("");
    setPage(1);
  };

  const handleEntityTypeChange = (nextType: "" | ConfigurationEntityType) => {
    setEntityType((prev) => {
      if (prev !== nextType && (prev === "Client" || prev === "Site" || nextType === "Client" || nextType === "Site")) {
        setEntityId("");
      }
      return nextType;
    });
    setPage(1);
  };

  const toggleEntityTypeKpi = (target: ConfigurationEntityType) => {
    handleEntityTypeChange(entityType === target ? "" : target);
  };

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Todos os clientes" },
      ...(clientsQuery.data ?? []).map((client) => ({
        value: client.id,
        label: client.name,
      })),
    ],
    [clientsQuery.data],
  );

  const siteOptions = useMemo(
    () => [
      { value: "", label: "Todos os sites" },
      ...(sitesQuery.data ?? []).map((site) => ({
        value: site.id,
        label: site.name,
      })),
    ],
    [sitesQuery.data],
  );

  const eventsSubtitle =
    filteredEntries.length !== sortedEntries.length
      ? `${filteredEntries.length} de ${sortedEntries.length} registros | página ${currentPage} de ${pageCount}`
      : `${filteredEntries.length} registros | página ${currentPage} de ${pageCount}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoria de Configurações"
        description="Consulte alterações por período, entidade, propriedade e usuário."
        breadcrumb={
          <Link
            to="/settings"
            className="transition-colors hover:text-foreground"
          >
            Configurações
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void activeQuery.refetch()}
            disabled={activeQuery.isFetching}
          >
            <Icon
              name="refresh"
              className={`h-4 w-4 ${activeQuery.isFetching ? "animate-spin" : ""}`}
            />
            Atualizar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => exportCsv(filteredEntries)}
            disabled={filteredEntries.length === 0}
          >
            <Icon name="download" className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="history"
          label="Total"
          value={kpiCounts.total}
          tone="primary"
          active={entityType === ""}
          onClick={() => handleEntityTypeChange("")}
        />
        <StatCard
          icon="dns"
          label="Servidor"
          value={kpiCounts.server}
          tone="accent"
          active={entityType === "Server"}
          onClick={() => toggleEntityTypeKpi("Server")}
        />
        <StatCard
          icon="storefront"
          label="Cliente"
          value={kpiCounts.client}
          tone="success"
          active={entityType === "Client"}
          onClick={() => toggleEntityTypeKpi("Client")}
        />
        <StatCard
          icon="location_on"
          label="Site"
          value={kpiCounts.site}
          tone="warning"
          active={entityType === "Site"}
          onClick={() => toggleEntityTypeKpi("Site")}
        />
      </div>

      <Card>
        <CardHeader
          title="Filtros"
          subtitle="Combine período, entidade, propriedade e busca rápida"
          action={
            hasActiveFilters ? (
              <Button size="sm" variant="ghost" onClick={clearAllFilters}>
                Limpar filtros
              </Button>
            ) : undefined
          }
        />

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Input
              label="Buscar"
              placeholder="Campo, entidade, usuário, motivo ou valor..."
              value={search}
              className="pr-8"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            {search && (
              <ClearFieldButton
                label="Limpar busca"
                onClear={() => {
                  setSearch("");
                  setPage(1);
                }}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted">Período rápido:</span>
            {PERIOD_PRESETS.map((preset) => {
              const isSelected = !startDate && !endDate && days === preset;
              return (
                <Button
                  key={preset}
                  size="sm"
                  variant={isSelected ? "primary" : "secondary"}
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setDays(preset);
                    setPage(1);
                  }}
                >
                  {preset}d
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Dias"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(event) => {
              setDays(event.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Limite"
            type="number"
            min={1}
            max={1000}
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
            onChange={(event) =>
              handleEntityTypeChange(
                event.target.value as "" | ConfigurationEntityType,
              )
            }
            options={[
              { value: "", label: "Todas" },
              { value: "Server", label: "Servidor" },
              { value: "Client", label: "Cliente" },
              { value: "Site", label: "Site" },
            ]}
          />

          {entityType === "Client" ? (
            <Select
              label="Cliente"
              value={entityId}
              onChange={(event) => {
                setEntityId(event.target.value);
                setPage(1);
              }}
              options={clientOptions}
            />
          ) : entityType === "Site" ? (
            <Select
              label="Site"
              value={entityId}
              onChange={(event) => {
                setEntityId(event.target.value);
                setPage(1);
              }}
              options={siteOptions}
            />
          ) : (
            <div className="relative">
              <Input
                label="ID da entidade"
                placeholder="UUID ou parte do ID"
                value={entityId}
                className="pr-8"
                onChange={(event) => {
                  setEntityId(event.target.value);
                  setPage(1);
                }}
              />
              {entityId && (
                <ClearFieldButton
                  label="Limpar ID da entidade"
                  onClear={() => {
                    setEntityId("");
                    setPage(1);
                  }}
                />
              )}
            </div>
          )}

          <div className="relative">
            <Input
              label="Campo"
              placeholder="Ex.: discoveryEnabled"
              value={fieldName}
              className="pr-8"
              onChange={(event) => {
                setFieldName(event.target.value);
                setPage(1);
              }}
            />
            {fieldName && (
              <ClearFieldButton
                label="Limpar campo"
                onClear={() => {
                  setFieldName("");
                  setPage(1);
                }}
              />
            )}
          </div>

          <div className="relative">
            <Input
              label="Usuário"
              placeholder="Nome do operador"
              value={username}
              className="pr-8"
              onChange={(event) => {
                setUsername(event.target.value);
                setPage(1);
              }}
            />
            {username && (
              <ClearFieldButton
                label="Limpar usuário"
                onClear={() => {
                  setUsername("");
                  setPage(1);
                }}
              />
            )}
          </div>
        </div>

        {isDateRangeInvalid && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning"
          >
            A data final não pode ser anterior à data inicial.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Eventos" subtitle={eventsSubtitle} />

        {activeQuery.isLoading && <Loading message="Carregando auditoria..." />}
        {activeQuery.isError && (
          <ErrorDisplay onRetry={() => void activeQuery.refetch()} />
        )}

        {!activeQuery.isLoading && !activeQuery.isError && (
          <>
            <div className="space-y-3">
              {pageItems.map((entry) => (
                <AuditRow
                  key={entry.id}
                  entry={entry}
                  entityName={entityNameById.get(entry.entityId)}
                  onFilterField={(field) => {
                    setFieldName(field);
                    setPage(1);
                  }}
                  onFilterUser={(user) => {
                    setUsername(user);
                    setPage(1);
                  }}
                />
              ))}

              {pageItems.length === 0 && (
                <EmptyState
                  icon="history"
                  title="Nenhum evento encontrado"
                  description={
                    hasActiveFilters
                      ? "Nenhuma alteração corresponde aos filtros aplicados."
                      : "Nenhuma alteração de configuração registrada neste período."
                  }
                  action={
                    hasActiveFilters
                      ? {
                          label: "Limpar filtros",
                          onClick: clearAllFilters,
                        }
                      : undefined
                  }
                />
              )}
            </div>

            {pageCount > 1 && (
              <Pagination
                className="mt-4"
                page={currentPage}
                totalPages={pageCount}
                onPageChange={setPage}
                totalItems={filteredEntries.length}
                pageSize={PAGE_SIZE}
              />
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
  onFilterField,
  onFilterUser,
}: {
  entry: ConfigurationAuditEntry;
  entityName?: string;
  onFilterField: (fieldName: string) => void;
  onFilterUser: (username: string) => void;
}) {
  // UUID truncado por padrão; o valor completo fica no tooltip e no CSV exportado.
  const shortId = shortEntityId(entry.entityId);
  const { copied: idCopied, copy: copyId } = useCopyFeedback();

  return (
    <div className="rounded-lg border border-border bg-surface-light p-3.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="accent">{entityLabel(entry.entityType)}</Badge>
          <button
            type="button"
            onClick={() => onFilterField(entry.fieldName)}
            title={`Filtrar pelo campo ${entry.fieldName}`}
            className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Badge color="primary">{entry.fieldName}</Badge>
          </button>
          <span
            className={`inline-flex max-w-full items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs ${
              entityName
                ? "bg-surface-hover text-foreground"
                : "font-mono text-muted"
            }`}
            title={entry.entityId}
          >
            <span className="truncate">{entityName ?? shortId}</span>
            <button
              type="button"
              onClick={() => copyId(entry.entityId)}
              aria-label="Copiar ID da entidade"
              title="Copiar ID completo"
              className="ml-0.5 inline-flex items-center text-muted transition-colors hover:text-foreground"
            >
              <Icon
                name={idCopied ? "check" : "content_copy"}
                className={`h-3 w-3 ${idCopied ? "text-success" : ""}`}
              />
            </button>
          </span>
        </div>
        <p className="text-xs text-muted tabular-nums">
          {new Date(entry.changedAt).toLocaleString("pt-BR")}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <AuditValue title="Valor antigo" value={entry.oldValue} variant="old" />
        <AuditValue title="Valor novo" value={entry.newValue} variant="new" />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          Alterado por:{" "}
          {entry.changedBy ? (
            <button
              type="button"
              onClick={() => onFilterUser(entry.changedBy ?? "")}
              title={`Filtrar por ${entry.changedBy}`}
              className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              {entry.changedBy}
            </button>
          ) : (
            "desconhecido"
          )}
        </span>
        <span>•</span>
        <span>versão: {entry.entityVersion}</span>
        {entry.ipAddress && (
          <>
            <span>•</span>
            <span className="font-mono">IP: {entry.ipAddress}</span>
          </>
        )}
        {entry.reason && (
          <>
            <span>•</span>
            <span>Motivo: {entry.reason}</span>
          </>
        )}
      </div>
    </div>
  );
}

function AuditValue({
  title,
  value,
  variant,
}: {
  title: string;
  value: unknown;
  variant: "old" | "new";
}) {
  const formatted = useMemo(() => formatAuditValue(value), [value]);
  const { copied, copy } = useCopyFeedback();

  const containerStyle =
    variant === "old"
      ? "border-danger/25 bg-danger/5"
      : "border-success/25 bg-success/5";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted">{title}</p>
        {!formatted.isEmpty && (
          <button
            type="button"
            onClick={() => copy(formatted.text)}
            aria-label={`Copiar ${title.toLowerCase()}`}
            title={`Copiar ${title.toLowerCase()}`}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Icon
              name={copied ? "check" : "content_copy"}
              className={`h-3 w-3 ${copied ? "text-success" : ""}`}
            />
            <span>{copied ? "Copiado" : "Copiar"}</span>
          </button>
        )}
      </div>
      <pre
        className={`max-h-60 min-h-14 overflow-auto rounded border p-2.5 text-xs whitespace-pre-wrap break-words ${containerStyle} ${
          formatted.isEmpty ? "italic text-muted" : "text-foreground"
        }`}
      >
        {formatted.text}
      </pre>
    </div>
  );
}
