import { useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  ErrorDisplay,
  Loading,
  Select,
  type Column,
} from "@/components/ui";
import { ApiError, type MeshCentralNodeLinksBackfillItem, type MeshCentralNodeLinksBackfillReport } from "@/api";
import { useAuthorization } from "@/auth/authorization";
import {
  useClients,
  useRunMeshCentralNodeLinksBackfill,
  useRunMeshCentralNodeLinksBackfillDryRun,
  useSites,
} from "@/hooks";

function statusBadgeColor(status: string): "slate" | "warning" | "success" | "danger" | "accent" {
  const normalized = status.toLowerCase();
  if (normalized === "verified") return "success";
  if (normalized === "linked") return "accent";
  if (normalized === "suggested") return "warning";
  if (normalized === "ambiguous") return "danger";
  if (normalized === "error") return "danger";
  return "slate";
}

function toText(value: unknown, fallback = "N/A") {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return fallback;
}

export default function MeshNodeLinksBackfillPage() {
  const { hasAnyPermission } = useAuthorization();
  const canRun = hasAnyPermission([
    "Agents.Edit",
    "agents.*",
    "identity.*",
    "admin.*",
  ]);

  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [report, setReport] = useState<MeshCentralNodeLinksBackfillReport | null>(null);

  const clientsQuery = useClients();
  const sitesQuery = useSites(clientId, false);

  const dryRunMutation = useRunMeshCentralNodeLinksBackfillDryRun();
  const applyMutation = useRunMeshCentralNodeLinksBackfill();

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Todos os clientes" },
      ...((clientsQuery.data ?? []).map((client) => ({
        value: client.id,
        label: client.name,
      })) ?? []),
    ],
    [clientsQuery.data],
  );

  const siteOptions = useMemo(
    () => [
      {
        value: "",
        label: clientId ? "Todos os sites" : "Selecione um cliente primeiro",
      },
      ...((sitesQuery.data ?? []).map((site) => ({
        value: site.id,
        label: site.name,
      })) ?? []),
    ],
    [clientId, sitesQuery.data],
  );

  const columns = useMemo<Column<MeshCentralNodeLinksBackfillItem>[]>(
    () => [
      {
        key: "hostname",
        header: "Agent",
        render: (item) => (
          <div>
            <p className="font-medium text-foreground">{item.displayName ?? item.hostname}</p>
            <p className="text-xs text-muted">{item.hostname}</p>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (item) => (
          <Badge color={statusBadgeColor(item.status)}>
            {item.status}
          </Badge>
        ),
      },
      {
        key: "currentNodeId",
        header: "Node atual",
        render: (item) => (
          <span className="font-mono text-xs text-muted-foreground">{toText(item.currentNodeId, "Sem vínculo")}</span>
        ),
      },
      {
        key: "suggestedNodeId",
        header: "Node sugerido",
        render: (item) => (
          <span className="font-mono text-xs text-muted-foreground">{toText(item.suggestedNodeId, "Sem sugestão")}</span>
        ),
      },
      {
        key: "candidateNodeIds",
        header: "Candidates",
        render: (item) => {
          const candidates = item.candidateNodeIds ?? [];
          if (candidates.length === 0) {
            return <span className="text-xs text-muted">Nenhum</span>;
          }
          return (
            <div className="space-y-1">
              {candidates.slice(0, 2).map((candidate) => (
                <p key={candidate} className="font-mono text-xs text-muted-foreground">{candidate}</p>
              ))}
              {candidates.length > 2 && (
                <p className="text-xs text-muted">+{candidates.length - 2} adicionais</p>
              )}
            </div>
          );
        },
      },
      {
        key: "error",
        header: "Erro",
        render: (item) => (
          <span className="text-xs text-danger">{toText(item.error, "-")}</span>
        ),
      },
    ],
    [],
  );

  const isPending = dryRunMutation.isPending || applyMutation.isPending;

  const runBackfill = async (applyChanges: boolean) => {
    if (!canRun) {
      toast.error("Sem permissão para reconciliar node links de agents.");
      return;
    }

    if (applyChanges) {
      const confirmed = window.confirm(
        "Aplicar backfill atualiza meshcentral_node_id dos agents. Deseja continuar?",
      );
      if (!confirmed) return;
    }

    try {
      const nextReport = applyChanges
        ? await applyMutation.mutateAsync({
            applyChanges: true,
            clientId: clientId || null,
            siteId: siteId || null,
          })
        : await dryRunMutation.mutateAsync({
            clientId: clientId || null,
            siteId: siteId || null,
          });
      setReport(nextReport);
      toast.success(applyChanges ? "Backfill aplicado com sucesso." : "Dry-run concluído.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast.error("Sem permissão no escopo para executar node-links backfill.");
        return;
      }
      if (error instanceof ApiError && error.status === 503) {
        toast.error("Falha operacional/configuração do MeshCentral.");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Falha ao executar node-links backfill.");
    }
  };

  if (!canRun) {
    return <ErrorDisplay message="Sem permissão para operar backfill de node links." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Node Links Backfill</h1>
        <p className="text-sm text-muted">
          Reconcilia o vínculo meshcentral_node_id de agents existentes. Trate status ambiguous como ação manual.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Escopo"
          subtitle="Filtre por cliente/site e execute dry-run antes de aplicar."
          action={<Link2 className="h-4 w-4 text-muted" />}
        />

        <div className="grid gap-3 px-5 pb-4 md:grid-cols-2">
          <Select
            label="Cliente"
            options={clientOptions}
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setSiteId("");
            }}
          />
          <Select
            label="Site"
            options={siteOptions}
            value={siteId}
            disabled={!clientId || sitesQuery.isLoading}
            onChange={(event) => setSiteId(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-3 px-5 pb-5">
          <Button
            onClick={() => {
              void runBackfill(false);
            }}
            loading={dryRunMutation.isPending}
            disabled={isPending}
          >
            Executar dry-run
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              void runBackfill(true);
            }}
            loading={applyMutation.isPending}
            disabled={isPending}
          >
            Aplicar backfill
          </Button>
        </div>
      </Card>

      {(clientsQuery.isLoading || sitesQuery.isLoading) && <Loading message="Carregando escopo..." />}

      {report && (
        <Card>
          <CardHeader
            title="Resultado"
            subtitle={report.applyChanges ? "Modo apply" : "Modo dry-run"}
          />
          <div className="space-y-4 px-5 pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="accent">Total: {report.totalAgents}</Badge>
              <Badge color="success">Verified: {report.verifiedAgents}</Badge>
              <Badge color="accent">Updated: {report.updatedAgents}</Badge>
              <Badge color={report.ambiguousAgents > 0 ? "danger" : "slate"}>
                Ambiguous: {report.ambiguousAgents}
              </Badge>
              <Badge color={report.missingAgents > 0 ? "warning" : "slate"}>
                Missing: {report.missingAgents}
              </Badge>
            </div>

            {report.items.some((item) => item.status.toLowerCase() === "ambiguous") && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Encontrado status ambiguous: revisão manual do operador é necessária antes de aplicar em produção.
              </div>
            )}

            <DataTable
              columns={columns}
              data={report.items}
              keyExtractor={(item) => item.agentId}
              emptyMessage="Nenhum agent retornado para o escopo selecionado."
            />
          </div>
        </Card>
      )}
    </div>
  );
}
