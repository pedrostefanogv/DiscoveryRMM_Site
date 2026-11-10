import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Icon, Badge, Button, Card, CardHeader, DataTable, ErrorDisplay, Input, Loading, PageHeader, Pagination, Select, type Column } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useCursorPagination } from "@/hooks/useCursorPagination";
import { usePatchPending, useScanPatchScope } from "@/hooks/usePatches";
import { useApproveAgentPendingWindowsUpdates, useInstallApprovedWindowsUpdates, useScanAgentWindowsUpdates } from "@/hooks/useAgentWindowsUpdates";
import { useNowTick } from "@/hooks/useNowTick";
import { useAuthorization } from "@/auth/authorization";
import { isAgentOnlineNow } from "@/utils/agentStatus";
import type { PatchPendingAgent, PatchScope } from "@/api/types";
import { formatPatchDate, PATCH_SCOPE_OPTIONS } from "./patchesUtils";

/**
 * Indicador de agente online da lista de pendências.
 *
 * Duas fontes, combinadas pela MESMA regra da lista de agentes (AgentListView):
 * - `lastSeenAt` é o FRESCOR do sinal: dentro da janela
 *   VITE_AGENT_OFFLINE_FALLBACK_MS (90s por padrão) o agente conta como online,
 *   mesmo que o status persistido ainda diga "Offline".
 * - `status` é o status PERSISTIDO pelo servidor (Online/Offline), atualizado nas
 *   transições de heartbeat. Ele só é consultado quando não há lastSeenAt válido
 *   (payload antigo do backend, sem o campo).
 *
 * O `now` vem de fora (useNowTick no componente) para que a decisão seja
 * determinística em teste e se atualize sozinha na tela a cada tick.
 */
export function isPendingAgentOnline(agent: PatchPendingAgent, now: number): boolean {
  return isAgentOnlineNow(
    {
      status: (agent.status ?? undefined) as "Online" | "Offline" | undefined,
      lastSeenAt: agent.lastSeenAt,
    },
    now,
  );
}

export default function PatchesPending() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<PatchScope>("global");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [scanningAgentId, setScanningAgentId] = useState<string | null>(null);
  const pag = useCursorPagination({ initialLimit: 25 });
  // Tick de 5s: mantém o indicador Online/Offline coerente com o frescor de
  // lastSeenAt sem depender de um novo fetch da lista.
  const now = useNowTick();

  const clients = useClients();
  const sites = useSites(selectedClientId || undefined);
  const list = usePatchPending({
    scope,
    clientId: selectedClientId || undefined,
    siteId: selectedSiteId || undefined,
    cursor: pag.cursor,
    limit: pag.limit,
    search: searchApplied,
  });
  const scan = useScanPatchScope();
  const installApproved = useInstallApprovedWindowsUpdates();
  const approvePending = useApproveAgentPendingWindowsUpdates();
  const scanAgent = useScanAgentWindowsUpdates();
  const { hasAnyPermission } = useAuthorization();
  const canExecute = hasAnyPermission(["Patches.Execute", "patches.*", "admin.*"]);
  const canApprove = hasAnyPermission(["Patches.Edit", "patches.*", "admin.*"]);

  const clientOptions = useMemo(
    () => [{ value: "", label: "Selecione um cliente..." }, ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name }))],
    [clients.data],
  );
  const siteOptions = useMemo(
    () => [{ value: "", label: "Selecione um site..." }, ...(sites.data ?? []).map((site) => ({ value: site.id, label: site.name }))],
    [sites.data],
  );

  const scopeId = scope === "client" ? selectedClientId : scope === "site" ? selectedSiteId : undefined;
  const canQuery = scope === "global" || Boolean(scopeId);

  const handleScan = async () => {
    try {
      const result = await scan.mutateAsync({ scope, scopeId: scopeId ?? null });
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao solicitar varredura.");
    }
  };

  const handleApprovePending = async (agent: PatchPendingAgent) => {
    try {
      const result = await approvePending.mutateAsync({
        agentId: agent.agentId,
        action: "Approve",
        scope: "Agent",
        reason: "aprovação em lote na página de pendências",
      });
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao aprovar pendências.");
    }
  };

  const handleInstallApproved = async (agent: PatchPendingAgent) => {
    try {
      const result = await installApproved.mutateAsync({ agentId: agent.agentId, postAction: "none" });
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao instalar atualizações aprovadas.");
    }
  };

  const handleScanAgent = async (agent: PatchPendingAgent) => {
    setScanningAgentId(agent.agentId);
    try {
      const result = await scanAgent.mutateAsync({
        agentId: agent.agentId,
        reason: "varredura individual na página de pendências",
      });
      toast.success(result.message);
      // O hook já invalida as queries de patches; refetch garante o status visível nesta lista.
      await list.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao solicitar varredura do agente.");
    } finally {
      setScanningAgentId(null);
    }
  };

  const columns: Column<PatchPendingAgent>[] = [
    {
      key: "agent",
      header: "Agente",
      render: (agent) => (
        <div>
          <p className="font-medium text-foreground">{agent.agentDisplayName ?? agent.hostname}</p>
          <p className="text-xs text-muted">{agent.clientName} · {agent.siteName}</p>
        </div>
      ),
    },
    { key: "pending", header: "Pendentes", className: "text-right tabular-nums", sortValue: (agent) => agent.pendingCount, render: (agent) => agent.pendingCount },
    { key: "critical", header: "Críticas", className: "text-right tabular-nums", sortValue: (agent) => agent.criticalCount, render: (agent) => (
      <Badge color={agent.criticalCount > 0 ? "danger" : "slate"}>{agent.criticalCount}</Badge>
    ) },
    { key: "denied", header: "Recusadas", className: "text-right tabular-nums", render: (agent) => agent.deniedCount },
    { key: "reboot", header: "Reinício", render: (agent) => (
      agent.pendingReboot ? <Badge color="warning"><Icon name="restart_alt" className="mr-1 h-3 w-3" />Pendente</Badge> : <span className="text-xs text-muted">—</span>
    ) },
    { key: "scan", header: "Último scan", render: (agent) => (
      <div>
        <p className="text-sm">{formatPatchDate(agent.lastScanAt)}</p>
        {agent.scanStatus && agent.scanStatus !== "ok" && (
          <p className="text-xs text-danger">scan: {agent.scanStatus}</p>
        )}
      </div>
    ) },
    {
      // Indicador de agente online. Fica imediatamente antes das ações para não
      // empurrar as colunas numéricas, que continuam alinhadas à direita.
      key: "status",
      header: "Status",
      render: (agent) => {
        const online = isPendingAgentOnline(agent, now);
        // Offline com lastSeenAt conhecido: o title mostra quando o agente foi
        // visto pela última vez (o Badge em si não aceita title).
        const vistoPorUltimo =
          !online && agent.lastSeenAt
            ? `Visto por último em ${formatPatchDate(agent.lastSeenAt)}`
            : undefined;
        return (
          <span className="inline-flex" title={vistoPorUltimo}>
            <Badge color={online ? "success" : "slate"}>
              <span className="flex items-center gap-1">
                <Icon name={online ? "wifi" : "wifi_off"} className="h-2.5 w-2.5" />
                {online ? "Online" : "Offline"}
              </span>
            </Badge>
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (agent) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/agents/${agent.agentId}?tab=atualizacoes`)}>
            Abrir
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleApprovePending(agent)}
            disabled={approvePending.isPending || !canApprove}
          >
            Aprovar pendentes
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleScanAgent(agent)}
            disabled={scanningAgentId !== null || !canExecute}
            title="Verificar atualizações somente neste agente"
          >
            <Icon name="refresh" className={`h-4 w-4${scanningAgentId === agent.agentId ? " animate-spin" : ""}`} />
            {scanningAgentId === agent.agentId ? "Verificando..." : "Verificar atualizações"}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleInstallApproved(agent)}
            disabled={installApproved.isPending || !canExecute}
          >
            Instalar aprovadas
          </Button>
        </div>
      ),
    },
  ];

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pendências de atualizações"
        description="Agentes com patches pendentes. Use a aba do agente para aprovar/recusar cada KB."
      >
        <Button variant="secondary" onClick={() => void list.refetch()} disabled={list.isFetching}>
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
            pag.reset();
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
              pag.reset();
            }}
            options={clientOptions}
          />
        )}
        {scope === "site" && (
          <Select
            label="Site"
            fullWidth={false}
            value={selectedSiteId}
            onChange={(event) => {
              setSelectedSiteId(event.target.value);
              pag.reset();
            }}
            options={siteOptions}
          />
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearchApplied(searchInput.trim());
            pag.reset();
          }}
        >
          <Input label="Buscar" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="hostname, cliente ou site" />
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>
        <Select
          label="Por página"
          fullWidth={false}
          value={String(pag.limit)}
          onChange={(event) => pag.setLimit(Number(event.target.value))}
          options={[10, 25, 50].map((value) => ({ value: String(value), label: String(value) }))}
        />
      </div>

      {!canQuery ? (
        <Card><CardHeader title="Selecione o escopo" subtitle="Escolha cliente ou site para listar as pendências." /></Card>
      ) : list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorDisplay onRetry={() => list.refetch()} />
      ) : (
        <Card padding={false}>
          <div className="p-4">
            <DataTable
              columns={columns}
              data={list.data?.items ?? []}
              keyExtractor={(agent) => agent.agentId}
              showPagination={false}
              emptyMessage="Nenhum agente com atualizações pendentes"
            />
          </div>
          <Pagination
            className="border-t border-border px-4 py-3"
            page={pag.page}
            totalPages={1}
            onPageChange={() => {}}
            itemLabel={`${list.data?.items.length ?? 0} agente(s)`}
            cursor={{
              hasPrev: pag.page > 1,
              hasNext: Boolean(list.data?.hasMore),
              onPrev: pag.goToPrev,
              onNext: () => pag.goToNext(list.data?.nextCursor),
              loading: list.isFetching,
            }}
          />
        </Card>
      )}
    </div>
  );
}
