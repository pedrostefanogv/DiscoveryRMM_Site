import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Eye, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button, Card, CardHeader, DataTable, ErrorDisplay, Input, Loading, Modal, PageHeader, Select, type Column } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useCursorPagination } from "@/hooks/useCursorPagination";
import { usePatchInventory, usePatchInventoryAgents, useScanPatchScope } from "@/hooks/usePatches";
import { useSetAgentWindowsUpdateApproval } from "@/hooks/useAgentWindowsUpdates";
import type { PatchInventoryAgent, PatchInventoryGroup, PatchScope } from "@/api/types";
import {
  approvalColor,
  approvalLabel,
  formatKbList,
  formatPatchDate,
  PATCH_SCOPE_OPTIONS,
  PATCH_SEVERITY_OPTIONS,
  PATCH_STATUS_OPTIONS,
  severityColor,
  statusColor,
  statusLabel,
} from "./patchesUtils";

export default function PatchesInventory() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<PatchScope>("global");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const pag = useCursorPagination({ initialLimit: 25 });

  const [selectedGroup, setSelectedGroup] = useState<PatchInventoryGroup | null>(null);
  const agentsPag = useCursorPagination({ initialLimit: 50 });

  const clients = useClients();
  const sites = useSites(selectedClientId || undefined);
  const list = usePatchInventory({
    scope,
    clientId: selectedClientId || undefined,
    siteId: selectedSiteId || undefined,
    cursor: pag.cursor,
    limit: pag.limit,
    search: searchApplied,
    severity: severity || undefined,
    status: status || undefined,
    order,
  });
  const agents = usePatchInventoryAgents({
    groupKey: selectedGroup?.groupKey ?? "",
    scope,
    clientId: selectedClientId || undefined,
    siteId: selectedSiteId || undefined,
    cursor: agentsPag.cursor,
    limit: agentsPag.limit,
  });
  const scan = useScanPatchScope();
  const setApproval = useSetAgentWindowsUpdateApproval();

  const handleApproval = async (
    agent: PatchInventoryAgent,
    action: "approve" | "deny",
  ) => {
    try {
      await setApproval.mutateAsync({
        agentId: agent.agentId,
        updateKey: agent.updateKey,
        action,
        scope: "Agent",
        reason: action === "deny" ? "recusada no inventário de atualizações" : "aprovada no inventário de atualizações",
      });
      toast.success(action === "deny" ? "Atualização recusada." : "Atualização aprovada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar aprovação.");
    }
  };

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

  const columns: Column<PatchInventoryGroup>[] = [
    {
      key: "update",
      header: "Atualização",
      render: (item) => (
        <div>
          <p className="font-medium text-foreground">{item.title}</p>
          <p className="text-xs text-muted">{formatKbList(item.kbIds)} · {item.classification ?? "Sem classificação"}</p>
        </div>
      ),
    },
    {
      key: "severity",
      header: "Severidade",
      render: (item) => (
        <Badge color={severityColor(item.severity)}>{item.severity ?? "—"}</Badge>
      ),
    },
    { key: "pending", header: "Pendentes", className: "text-right tabular-nums", render: (item) => item.pendingAgents },
    { key: "installed", header: "Instaladas", className: "text-right tabular-nums", render: (item) => item.installedAgents },
    { key: "denied", header: "Recusadas", className: "text-right tabular-nums", render: (item) => item.deniedAgents },
    { key: "last", header: "Última coleta", render: (item) => formatPatchDate(item.lastSeenAt) },
    {
      key: "details",
      header: "",
      className: "text-right",
      render: (item) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedGroup(item);
            agentsPag.reset();
          }}
        >
          <Eye className="h-4 w-4" />
          Agentes
        </Button>
      ),
    },
  ];

  const agentColumns: Column<PatchInventoryAgent>[] = [
    {
      key: "agent",
      header: "Agente",
      render: (agent) => (
        <button
          type="button"
          className="text-left text-primary hover:underline"
          onClick={() => navigate(`/agents/${agent.agentId}?tab=atualizacoes`)}
        >
          <span className="block font-medium">{agent.agentDisplayName ?? agent.hostname}</span>
          <span className="block text-xs text-muted">{agent.clientName} · {agent.siteName}</span>
        </button>
      ),
    },
    { key: "status", header: "Status", render: (agent) => <Badge color={statusColor(agent.status)}>{statusLabel(agent.status)}</Badge> },
    { key: "approval", header: "Aprovação", render: (agent) => <Badge color={approvalColor(agent.approvalState)}>{approvalLabel(agent.approvalState)}</Badge> },
    { key: "severity", header: "Severidade", render: (agent) => <Badge color={severityColor(agent.severity)}>{agent.severity ?? "—"}</Badge> },
    { key: "reported", header: "Reportada", render: (agent) => formatPatchDate(agent.reportedAt) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (agent) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              void handleApproval(agent, "approve");
            }}
            disabled={setApproval.isPending}
            title="Aprovar para este agente"
          >
            Aprovar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              void handleApproval(agent, "deny");
            }}
            disabled={setApproval.isPending}
            title="Recusar para este agente"
          >
            Recusar
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
        title="Inventário de atualizações"
        description="Visão por atualização (KB) com contagem de agentes pendentes/instalados e drill-down."
      >
        <Button variant="secondary" onClick={() => void list.refetch()} disabled={list.isFetching}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
        <Button onClick={() => void handleScan()} disabled={!canQuery || scan.isPending}>
          <Download className="h-4 w-4" />
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
        <Select label="Severidade" fullWidth={false} value={severity} onChange={(event) => { setSeverity(event.target.value); pag.reset(); }} options={PATCH_SEVERITY_OPTIONS} />
        <Select label="Status" fullWidth={false} value={status} onChange={(event) => { setStatus(event.target.value); pag.reset(); }} options={PATCH_STATUS_OPTIONS} />
        <Select
          label="Ordem"
          fullWidth={false}
          value={order}
          onChange={(event) => {
            setOrder(event.target.value === "desc" ? "desc" : "asc");
            pag.reset();
          }}
          options={[{ value: "asc", label: "A–Z" }, { value: "desc", label: "Z–A" }]}
        />
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearchApplied(searchInput.trim());
            pag.reset();
          }}
        >
          <Input label="Buscar" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="KB, título ou classificação" />
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>
      </div>

      {!canQuery ? (
        <Card><CardHeader title="Selecione o escopo" subtitle="Escolha cliente ou site para carregar o inventário." /></Card>
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
              keyExtractor={(item) => item.groupKey}
              showPagination={false}
              emptyMessage="Nenhuma atualização inventariada"
            />
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted">Página {pag.page} · {list.data?.items.length ?? 0} atualização(ões)</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={pag.goToPrev} disabled={pag.page <= 1 || list.isFetching}>Anterior</Button>
              <Button size="sm" variant="secondary" onClick={() => pag.goToNext(list.data?.nextCursor)} disabled={!list.data?.hasMore || list.isFetching}>Próxima</Button>
            </div>
          </div>
        </Card>
      )}

      <Modal
        open={selectedGroup !== null}
        onClose={() => setSelectedGroup(null)}
        title={selectedGroup ? `Agentes — ${selectedGroup.title}` : "Agentes"}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {formatKbList(selectedGroup?.kbIds)} · {selectedGroup?.classification ?? "Sem classificação"} · {selectedGroup?.pendingAgents ?? 0} pendente(s)
          </p>
          {agents.isLoading ? (
            <Loading />
          ) : agents.isError ? (
            <ErrorDisplay onRetry={() => agents.refetch()} />
          ) : (
            <>
              <DataTable
                columns={agentColumns}
                data={agents.data?.items ?? []}
                keyExtractor={(agent) => agent.agentId}
                showPagination={false}
                emptyMessage="Nenhum agente neste escopo possui esta atualização"
              />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Página {agentsPag.page}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={agentsPag.goToPrev} disabled={agentsPag.page <= 1}>Anterior</Button>
                  <Button size="sm" variant="secondary" onClick={() => agentsPag.goToNext(agents.data?.nextCursor)} disabled={!agents.data?.hasMore}>Próxima</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
