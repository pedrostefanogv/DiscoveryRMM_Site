import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorDisplay,
  Icon,
  Loading,
  PageHeader,
  Select,
  StatCard,
  type Column,
} from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useSensorsFleetSummary } from "@/hooks/useSensors";
import { formatDateTime } from "@/utils/format";
import type { SensorFleetAgent, SensorFleetByType, SensorSeverity } from "@/api";
import { sensorTypeLabel } from "@/components/agents/sensorUtils";

/** Cor/rótulo da PIOR severidade entre os sensores do agente. */
const WORST_SEVERITY_META: Record<
  SensorSeverity,
  { label: string; color: "danger" | "warning" | "slate" }
> = {
  Critical: { label: "Crítico", color: "danger" },
  Warning: { label: "Atenção", color: "warning" },
  Info: { label: "Informativo", color: "slate" },
};

/**
 * Página "Sensores" (frota): visão agregada do monitoramento por dispositivo.
 *
 * Consome GET /api/v1/sensors/summary (permissão Sensors.View) e resume a frota
 * em contadores, uma tabela por tipo e o top de agentes com mais sensores fora
 * do normal — cada agente leva ao detalhe já na aba "Sensores".
 *
 * Semântica dos contadores (contrato do backend): passing/warning/failing/
 * pending/unknown são por STATUS e somam "total"; "stale" é uma dimensão
 * SEPARADA (sensores sem dado recente) e não entra nessa soma.
 */
export default function SensorsFleetPage() {
  /**
   * Os filtros vivem na URL (`?clientId=...&siteId=...`): o link da frota
   * filtrada fica compartilhável e sobrevive ao F5 — antes o estado era só
   * local e um refresh perdia o recorte.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedClientId = searchParams.get("clientId") ?? "";
  const selectedSiteId = searchParams.get("siteId") ?? "";

  /** Grava os filtros na URL removendo chaves vazias (URL limpa = "todos"). */
  const applyFilters = useCallback(
    (nextClientId: string, nextSiteId: string) => {
      const next = new URLSearchParams(searchParams);
      if (nextClientId) next.set("clientId", nextClientId);
      else next.delete("clientId");
      if (nextSiteId) next.set("siteId", nextSiteId);
      else next.delete("siteId");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const clients = useClients();
  const sites = useSites(selectedClientId || undefined);
  const summary = useSensorsFleetSummary({
    clientId: selectedClientId || undefined,
    siteId: selectedSiteId || undefined,
  });

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Todos os clientes" },
      ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
    ],
    [clients.data],
  );
  const siteOptions = useMemo(
    () => [
      { value: "", label: "Todos os sites" },
      ...(sites.data ?? []).map((site) => ({ value: site.id, label: site.name })),
    ],
    [sites.data],
  );

  const counts = summary.data?.counts;
  const semColeta = (counts?.pending ?? 0) + (counts?.unknown ?? 0);
  const hasFilters = Boolean(selectedClientId || selectedSiteId);

  const byTypeColumns: Column<SensorFleetByType>[] = useMemo(
    () => [
      {
        key: "sensorType",
        header: "Tipo de sensor",
        render: (item) => (
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="sensors" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-foreground">{sensorTypeLabel(item.sensorType)}</span>
          </div>
        ),
      },
      {
        key: "total",
        header: "Total",
        className: "text-right tabular-nums",
        sortValue: (item) => item.total,
        render: (item) => item.total,
      },
      {
        key: "warning",
        header: "Atenção",
        className: "text-right tabular-nums",
        sortValue: (item) => item.warning,
        render: (item) => <span className={item.warning > 0 ? "text-warning" : "text-muted"}>{item.warning}</span>,
      },
      {
        key: "failing",
        header: "Crítico",
        className: "text-right tabular-nums",
        sortValue: (item) => item.failing,
        render: (item) => (
          <span className={item.failing > 0 ? "font-medium text-danger" : "text-muted"}>
            {item.failing}
          </span>
        ),
      },
    ],
    [],
  );

  const topColumns: Column<SensorFleetAgent>[] = useMemo(
    () => [
      {
        key: "agent",
        header: "Agente",
        render: (item) => (
          <Link
            to={`/agents/${item.agentId}?tab=sensores`}
            className="min-w-0 text-primary hover:underline"
            title={item.displayName ?? item.hostname}
          >
            <span className="block truncate font-medium">{item.displayName || item.hostname}</span>
            {item.displayName ? (
              <span className="block truncate text-xs text-muted">{item.hostname}</span>
            ) : null}
          </Link>
        ),
      },
      {
        key: "client",
        header: "Cliente / Site",
        render: (item) => (
          <div className="min-w-0">
            <p className="truncate text-foreground">{item.clientName ?? "—"}</p>
            {item.siteName ? <p className="truncate text-xs text-muted">{item.siteName}</p> : null}
          </div>
        ),
      },
      {
        key: "failing",
        header: "Crítico",
        className: "text-right tabular-nums",
        sortValue: (item) => item.failing,
        render: (item) => (
          <span className={item.failing > 0 ? "font-medium text-danger" : "text-muted"}>{item.failing}</span>
        ),
      },
      {
        key: "warning",
        header: "Atenção",
        className: "text-right tabular-nums",
        sortValue: (item) => item.warning,
        render: (item) => (
          <span className={item.warning > 0 ? "text-warning" : "text-muted"}>{item.warning}</span>
        ),
      },
      {
        key: "worstSeverity",
        header: "Pior severidade",
        className: "text-right",
        render: (item) => {
          if (!item.worstSeverity) return <span className="text-muted">—</span>;
          const meta = WORST_SEVERITY_META[item.worstSeverity];
          return <Badge color={meta.color}>{meta.label}</Badge>;
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sensores"
        description="Visão agregada do monitoramento por dispositivo: o que está OK, o que precisa de atenção e quais agentes concentram falhas."
      >
        <Button
          variant="secondary"
          onClick={() => void summary.refetch()}
          disabled={summary.isFetching}
        >
          <Icon name="refresh" className="h-4 w-4" />
          Atualizar
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Cliente"
          fullWidth={false}
          value={selectedClientId}
          onChange={(event) => {
            // Site pertence a um cliente: trocar o cliente invalida a seleção.
            applyFilters(event.target.value, "");
          }}
          options={clientOptions}
        />
        <Select
          label="Site"
          fullWidth={false}
          value={selectedSiteId}
          disabled={!selectedClientId}
          onChange={(event) => applyFilters(selectedClientId, event.target.value)}
          options={siteOptions}
        />
        {hasFilters ? (
          <Button
            variant="ghost"
            onClick={() => applyFilters("", "")}
          >
            <Icon name="refresh" className="h-4 w-4" />
            Limpar filtros
          </Button>
        ) : null}
      </div>

      {summary.isLoading ? (
        <Loading message="Carregando resumo dos sensores..." />
      ) : summary.isError ? (
        <ErrorDisplay onRetry={() => void summary.refetch()} />
      ) : (counts?.total ?? 0) === 0 ? (
        <EmptyState
          icon="sensors"
          title={hasFilters ? "Nenhum sensor neste filtro" : "Nenhum sensor monitorado"}
          description={hasFilters
            ? "Ajuste o cliente/site (ou limpe os filtros) para ver os sensores da frota."
            : "Configure sensores no detalhe de um agente — o conjunto recomendado (disco, CPU, memória e uptime) já cobre a saúde básica."
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon="sensors" label="Sensores" value={counts?.total ?? 0} tone="primary" />
            <StatCard icon="check_circle" label="OK" value={counts?.passing ?? 0} tone="success" />
            <StatCard icon="warning" label="Atenção" value={counts?.warning ?? 0} tone="warning" />
            <StatCard icon="error" label="Crítico" value={counts?.failing ?? 0} tone="warning" />
            <StatCard icon="schedule" label="Sem coleta" value={semColeta} tone="accent" />
            <StatCard icon="history" label="Sem dados recentes" value={counts?.stale ?? 0} tone="accent" />
            <StatCard
              icon="desktop_windows"
              label="Agentes com falha"
              value={counts?.agentsWithFailing ?? 0}
              tone="warning"
            />
            <StatCard
              icon="check_circle"
              label="Sensores OK"
              value={`${Math.round(((counts?.passing ?? 0) / Math.max(1, counts?.total ?? 1)) * 100)}%`}
              tone="success"
            />
          </div>

          <p className="flex items-center gap-2 text-xs text-muted">
            <Icon name="info" className="h-3.5 w-3.5" />
            Contadores por status somam o total; "Sem dados recentes" é uma dimensão à parte
            (sensor que existe mas não coleta há mais que o esperado).
            {summary.data?.generatedAt ? ` Gerado em ${formatDateTime(summary.data.generatedAt)}.` : ""}
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Sensores por tipo"
                subtitle="Onde estão as falhas: tipos com mais sensores em estado crítico primeiro."
              />
              <DataTable
                columns={byTypeColumns}
                data={summary.data?.byType ?? []}
                keyExtractor={(item) => item.sensorType}
                defaultSort={{ key: "failing", direction: "desc" }}
                showPagination={false}
                emptyMessage="Nenhum sensor no período"
              />
            </Card>

            <Card>
              <CardHeader
                title="Agentes com mais problemas"
                subtitle="Clique no agente para abrir a aba Sensores do detalhe."
              />
              {(summary.data?.top.length ?? 0) === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  Nenhum agente com sensores fora do normal. Frota saudável.
                </p>
              ) : (
                <DataTable
                  columns={topColumns}
                  data={summary.data?.top ?? []}
                  keyExtractor={(item) => item.agentId}
                  defaultSort={{ key: "failing", direction: "desc" }}
                  showPagination={false}
                  emptyMessage="Nenhum agente com sensores fora do normal"
                />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
