import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Icon, Button, Card, CardHeader, DataTable, ErrorDisplay, Loading, PageHeader, Select, StatCard, Badge, type Column } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { usePatchOverview, useScanPatchScope } from "@/hooks/usePatches";
import { usePatchesRealtime } from "@/hooks/usePatchesRealtime";
import type { PatchScope, PatchSeverityCount } from "@/api/types";
import { formatPatchDate, PATCH_SCOPE_OPTIONS } from "./patchesUtils";

export default function PatchesOverview() {
  const [scope, setScope] = useState<PatchScope>("global");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");

  const clients = useClients();
  const sites = useSites(selectedClientId || undefined);
  const overview = usePatchOverview(scope, selectedClientId || undefined, selectedSiteId || undefined);
  const scan = useScanPatchScope();
  usePatchesRealtime();

  const snapshot = overview.data?.snapshot;
  const scopeId = scope === "client" ? selectedClientId : scope === "site" ? selectedSiteId : undefined;
  const canQuery = scope === "global" || Boolean(scopeId);

  const clientOptions = useMemo(
    () => [{ value: "", label: "Selecione um cliente..." }, ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name }))],
    [clients.data],
  );
  const siteOptions = useMemo(
    () => [{ value: "", label: "Selecione um site..." }, ...(sites.data ?? []).map((site) => ({ value: site.id, label: site.name }))],
    [sites.data],
  );

  const severityColumns: Column<PatchSeverityCount>[] = [
    { key: "label", header: "Severidade", render: (item) => item.label || "Não informada" },
    { key: "count", header: "Pendentes", className: "text-right tabular-nums", render: (item) => item.count },
  ];
  const classificationColumns: Column<PatchSeverityCount>[] = [
    { key: "label", header: "Classificação", render: (item) => item.label || "Não informada" },
    { key: "count", header: "Pendentes", className: "text-right tabular-nums", render: (item) => item.count },
  ];

  const handleScan = async () => {
    try {
      const result = await scan.mutateAsync({ scope, scopeId: scopeId ?? null });
      toast.success(result.message || "Varredura enviada aos agentes do escopo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao solicitar varredura.");
    }
  };

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atualizações do Windows"
        description="Inventário de patches, aprovações e conformidade da frota (WUA)."
      >
        <Button variant="secondary" onClick={() => void overview.refetch()} disabled={overview.isFetching}>
          <Icon name="refresh" className="h-4 w-4" />
          Atualizar
        </Button>
        <Button onClick={() => void handleScan()} disabled={!canQuery || scan.isPending}>
          <Icon name="download" className="h-4 w-4" />
          {scan.isPending ? "Solicitando..." : "Verificar atualizações"}
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Escopo"
          fullWidth={false}
          value={scope}
          onChange={(event) => {
            setScope(event.target.value as PatchScope);
            setSelectedSiteId("");
          }}
          options={PATCH_SCOPE_OPTIONS}
        />
        {scope !== "global" && (
          <Select
            label="Cliente"
            fullWidth={false}
            value={selectedClientId}
            onChange={(event) => {
              setSelectedClientId(event.target.value);
              setSelectedSiteId("");
            }}
            options={clientOptions}
          />
        )}
        {scope === "site" && (
          <Select
            label="Site"
            fullWidth={false}
            value={selectedSiteId}
            onChange={(event) => setSelectedSiteId(event.target.value)}
            options={siteOptions}
          />
        )}
      </div>

      {!canQuery ? (
        <Card>
          <CardHeader title="Selecione o escopo" subtitle="Escolha um cliente ou site para carregar a visão de patches." />
        </Card>
      ) : overview.isLoading ? (
        <Loading />
      ) : overview.isError ? (
        <ErrorDisplay onRetry={() => overview.refetch()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <StatCard icon="check_circle" label="Conformidade" value={(snapshot?.compliancePercent ?? 0).toFixed(1) + "%"} tone="success" />
            <StatCard icon="gpp_maybe" label="Pendentes" value={snapshot?.totalPending ?? 0} tone="primary" />
            <StatCard icon="warning" label="Críticas" value={snapshot?.criticalPending ?? 0} tone="warning" />
            <StatCard icon="block" label="Recusadas" value={snapshot?.deniedPending ?? 0} tone="warning" />
            <StatCard icon="schedule" label="Reinício pendente" value={snapshot?.rebootPendingAgents ?? 0} tone="warning" />
            <StatCard icon="monitoring" label="Agentes reportando" value={(snapshot?.agentsReporting ?? 0) + "/" + (snapshot?.agentsTotal ?? 0)} tone="accent" />
          </div>

          <Card>
            <CardHeader
              title="Resumo"
              subtitle={
                "Última varredura: " + formatPatchDate(snapshot?.lastScanAt) +
                " · " + (snapshot?.agentsWithPending ?? 0) + " agente(s) com pendências · " +
                (snapshot?.failedInstallations24h ?? 0) + " falha(s) em 24h"
              }
            />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-light" to="/patches/inventory">Inventário por atualização</Link>
              <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-light" to="/patches/pending">Pendências por agente</Link>
              <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-light" to="/patches/approvals">Aprovações</Link>
              <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-light" to="/patches/policy">Política</Link>
              <Badge color={(snapshot?.agentsWithPending ?? 0) > 0 ? "warning" : "success"}>
                {(snapshot?.agentsWithPending ?? 0) > 0 ? "Atenção necessária" : "Frota em conformidade"}
              </Badge>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Pendências por severidade" />
              <DataTable columns={severityColumns} data={overview.data?.bySeverity ?? []} keyExtractor={(item) => item.label} showPagination={false} emptyMessage="Nenhuma pendência" />
            </Card>
            <Card>
              <CardHeader title="Pendências por classificação" />
              <DataTable columns={classificationColumns} data={overview.data?.byClassification ?? []} keyExtractor={(item) => item.label} showPagination={false} emptyMessage="Nenhuma pendência" />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
