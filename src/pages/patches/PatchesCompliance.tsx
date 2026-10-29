import { formatDateTime } from '@/utils/format';
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  ErrorDisplay,
  Loading,
  PageHeader,
  Select,
  StatCard,
  type Column,
} from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { usePatchCompliance } from "@/hooks/usePatchCompliance";
import type { PatchComplianceRowDto } from "@/api/patchCompliance";

/** Cor do badge de score: >=90 verde, >=70 amarelo, <70 vermelho. */
export function scoreBadgeColor(score: number): "success" | "warning" | "danger" {
  if (score >= 90) return "success";
  if (score >= 70) return "warning";
  return "danger";
}

const formatDate = (value?: string | null) => formatDateTime(value);

export default function PatchesCompliance() {
  const [selectedClientId, setSelectedClientId] = useState("");
  const clients = useClients();
  const compliance = usePatchCompliance({
    clientId: selectedClientId || undefined,
  });

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Todos os clientes..." },
      ...(clients.data ?? []).map((client) => ({
        value: client.id,
        label: client.name,
      })),
    ],
    [clients.data],
  );

  // Piores primeiro: ordenação por score ascendente.
  const rows = useMemo(
    () =>
      [...(compliance.data?.rows ?? [])].sort((a, b) => a.score - b.score),
    [compliance.data?.rows],
  );

  const totals = compliance.data?.totals;

  const columns: Column<PatchComplianceRowDto>[] = [
    { key: "clientName", header: "Cliente", render: (item) => item.clientName },
    {
      key: "siteName",
      header: "Site",
      render: (item) => item.siteName || "—",
    },
    {
      key: "agents",
      header: "Agentes",
      className: "text-right tabular-nums",
      render: (item) => item.agents,
    },
    {
      key: "compliant",
      header: "Em conformidade",
      className: "text-right tabular-nums",
      render: (item) => item.compliant,
    },
    {
      key: "score",
      header: "Score",
      render: (item) => (
        <Badge color={scoreBadgeColor(item.score)}>
          {(Math.round(item.score * 10) / 10).toFixed(1)}
        </Badge>
      ),
    },
    {
      key: "pendingPatches",
      header: "Pendentes",
      className: "text-right tabular-nums",
      render: (item) => item.pendingPatches,
    },
    {
      key: "failedPatches",
      header: "Falhas",
      className: "text-right tabular-nums",
      render: (item) => item.failedPatches,
    },
    {
      key: "lastScanUtc",
      header: "Última varredura",
      render: (item) => formatDate(item.lastScanUtc),
    },
  ];

  if (clients.isLoading) return <Loading />;
  if (clients.isError)
    return <ErrorDisplay onRetry={() => clients.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conformidade de patches"
        description="Score de conformidade por cliente/site com pendências e falhas de instalação."
      >
        <Link
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-light"
          to="/patches"
        >
          Ir para patches
        </Link>
        <Button
          variant="secondary"
          onClick={() => void compliance.refetch()}
          disabled={compliance.isFetching}
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
          onChange={(event) => setSelectedClientId(event.target.value)}
          options={clientOptions}
        />
      </div>

      {compliance.isLoading ? (
        <Loading />
      ) : compliance.isError ? (
        <ErrorDisplay onRetry={() => compliance.refetch()} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">Score global</span>
            <Badge color={scoreBadgeColor(totals?.score ?? 0)}>
              <Icon name="verified_user" className="mr-1 h-3.5 w-3.5" />
              {(Math.round((totals?.score ?? 0) * 10) / 10).toFixed(1)}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon="verified_user"
              label="Agentes"
              value={totals?.agents ?? 0}
              tone="primary"
            />
            <StatCard
              icon="check_circle"
              label="Em conformidade"
              value={totals?.compliant ?? 0}
              tone="success"
            />
            <StatCard
              icon="warning"
              label="Patches pendentes"
              value={totals?.pendingPatches ?? 0}
              tone="warning"
            />
            <StatCard
              icon="cancel"
              label="Falhas de instalação"
              value={totals?.failedPatches ?? 0}
              tone="warning"
            />
          </div>

          <Card>
            <CardHeader
              title="Por escopo"
              subtitle={
                "Gerado em " + formatDate(compliance.data?.generatedAtUtc) +
                " · ordenado do pior para o melhor score"
              }
            />
            <DataTable
              columns={columns}
              data={rows}
              keyExtractor={(item) =>
                (item.siteId ? item.clientId + "/" + item.siteId : item.clientId)
              }
              showPagination={false}
              emptyMessage="Nenhuma linha de conformidade"
            />
          </Card>
        </>
      )}
    </div>
  );
}
