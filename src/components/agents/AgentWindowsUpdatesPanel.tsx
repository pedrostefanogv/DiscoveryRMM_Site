import { useMemo, useState } from "react";
import { Download, RefreshCw, ShieldCheck, ShieldX, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button, ConfirmDialog, DataTable, ErrorDisplay, Input, Loading, Modal, Select, type Column } from "@/components/ui";
import {
  useAgentWindowsUpdateSnapshot,
  useAgentWindowsUpdates,
  useBulkAgentWindowsUpdates,
  useInstallAgentWindowsUpdate,
  useInstallApprovedWindowsUpdates,
  useScanAgentWindowsUpdates,
  useSetAgentWindowsUpdateApproval,
  useApplyPatchOsPolicy,
  useRollbackPatchOsPolicy,
} from "@/hooks/useAgentWindowsUpdates";
import type { AgentWindowsUpdate, PatchApprovalScopeType } from "@/api/types";
import {
  approvalColor,
  approvalLabel,
  formatBytes,
  formatKbList,
  formatPatchDate,
  PATCH_SEVERITY_OPTIONS,
  PATCH_STATUS_OPTIONS,
  rebootReasonLabel,
  severityColor,
  statusColor,
  statusLabel,
} from "@/pages/patches/patchesUtils";

type UpdateView = "pending" | "installed";

interface ApprovalModalState {
  update: AgentWindowsUpdate;
  action: "approve" | "deny";
}

interface InstallModalState {
  update: AgentWindowsUpdate;
  force: boolean;
}

export function AgentWindowsUpdatesPanel({ agentId }: { agentId: string }) {
  const [view, setView] = useState<UpdateView>("pending");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [severity, setSeverity] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [approvalModal, setApprovalModal] = useState<ApprovalModalState | null>(null);
  const [approvalScope, setApprovalScope] = useState<PatchApprovalScopeType>("Agent");
  const [approvalReason, setApprovalReason] = useState("");
  const [installModal, setInstallModal] = useState<InstallModalState | null>(null);
  const [installReason, setInstallReason] = useState("");
  const [installPostAction, setInstallPostAction] = useState<"none" | "restart" | "shutdown">("none");
  const [confirmInstallApproved, setConfirmInstallApproved] = useState(false);

  const effectiveStatus = statusFilter || (view === "pending" ? "pending" : "installed");
  const pageQuery = useAgentWindowsUpdates(agentId, {
    page,
    pageSize,
    search: searchApplied,
    status: effectiveStatus,
    severity: severity || undefined,
    order: "desc",
  });
  const snapshot = useAgentWindowsUpdateSnapshot(agentId);
  const scan = useScanAgentWindowsUpdates();
  const approve = useSetAgentWindowsUpdateApproval();
  const install = useInstallAgentWindowsUpdate();
  const installApproved = useInstallApprovedWindowsUpdates();
  const bulk = useBulkAgentWindowsUpdates();
  const applyOsPolicy = useApplyPatchOsPolicy();
  const rollbackOsPolicy = useRollbackPatchOsPolicy();
  const [confirmOsPolicy, setConfirmOsPolicy] = useState<"apply" | "rollback" | null>(null);

  const items = pageQuery.data?.items ?? [];
  const totalCount = pageQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const data = snapshot.data;

  const pendingApprovedKeys = useMemo(
    () =>
      items
        .filter((update) => update.isPending &&
          (update.approvalState === "Approved" || update.approvalState === "AutoApproved"))
        .map((update) => update.updateKey),
    [items],
  );

  const handleScan = async () => {
    try {
      await scan.mutateAsync(agentId);
      toast.success("Varredura de atualizações solicitada ao agente.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao solicitar varredura.");
    }
  };

  const openApproval = (update: AgentWindowsUpdate, action: "approve" | "deny") => {
    setApprovalModal({ update, action });
    setApprovalScope("Agent");
    setApprovalReason("");
  };

  const submitApproval = async () => {
    if (!approvalModal) return;
    try {
      await approve.mutateAsync({
        agentId,
        updateKey: approvalModal.update.updateKey,
        action: approvalModal.action,
        scope: approvalScope,
        reason: approvalReason.trim() || undefined,
      });
      toast.success(approvalModal.action === "approve" ? "Atualização aprovada." : "Atualização recusada.");
      setApprovalModal(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar aprovação.");
    }
  };

  const openInstall = (update: AgentWindowsUpdate, force: boolean) => {
    setInstallModal({ update, force });
    setInstallReason("");
    setInstallPostAction("none");
  };

  const submitInstall = async () => {
    if (!installModal) return;
    try {
      await install.mutateAsync({
        agentId,
        updateKey: installModal.update.updateKey,
        force: installModal.force,
        postAction: installPostAction,
        reason: installReason.trim() || undefined,
      });
      toast.success("Instalação enviada ao agente.");
      setInstallModal(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao instalar atualização.";
      if (message.toLowerCase().includes("recusada")) {
        toast.error("Atualização recusada: confirme o override (forçar) para instalar.");
      } else {
        toast.error(message);
      }
    }
  };

  const handleInstallApproved = async () => {
    try {
      const result = await installApproved.mutateAsync({ agentId, postAction: "none" });
      toast.success(result.message);
      setConfirmInstallApproved(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao instalar aprovadas.");
    }
  };

  const handleApproveAllVisible = async () => {
    if (items.length === 0) return;
    try {
      const result = await bulk.mutateAsync({
        agentId,
        action: "approve",
        updateKeys: items.filter((update) => update.isPending).map((update) => update.updateKey),
        scope: "Agent",
        reason: "aprovação em lote na aba do agente",
      });
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na aprovação em lote.");
    }
  };

  const columns: Column<AgentWindowsUpdate>[] = [
    {
      key: "update",
      header: "Atualização",
      render: (update) => (
        <div>
          <p className="font-medium text-foreground">{update.title}</p>
          <p className="text-xs text-muted">
            {formatKbList(update.kbIds)} · {update.classification ?? "Sem classificação"} · {formatBytes(update.maxDownloadSize)}
          </p>
        </div>
      ),
    },
    {
      key: "severity",
      header: "Severidade",
      render: (update) => <Badge color={severityColor(update.severity)}>{update.severity ?? "—"}</Badge>,
    },
    {
      key: "approval",
      header: "Aprovação",
      render: (update) => <Badge color={approvalColor(update.approvalState)}>{approvalLabel(update.approvalState)}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (update) => (
        <div>
          <Badge color={statusColor(update.status)}>{statusLabel(update.status)}</Badge>
          {update.requiresReboot && <span className="ml-1 text-xs text-warning">reinício</span>}
          {update.installError && <p className="mt-1 text-xs text-danger">{update.installError}</p>}
        </div>
      ),
    },
    {
      key: "dates",
      header: "Publicada / Reportada",
      render: (update) => (
        <div className="text-xs text-muted">
          <p>{formatPatchDate(update.publishedAt)}</p>
          <p>{formatPatchDate(update.reportedAt)}</p>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (update) => {
        if (update.isInstalled) return null;
        return (
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => openApproval(update, "approve")} title="Aprovar">
              <ShieldCheck className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openApproval(update, "deny")} title="Recusar">
              <ShieldX className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" onClick={() => openInstall(update, false)} disabled={install.isPending}>
              Instalar
            </Button>
            {update.approvalState === "Denied" && (
              <Button size="sm" variant="danger" onClick={() => openInstall(update, true)} disabled={install.isPending}>
                Forçar
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  if (pageQuery.isLoading && !pageQuery.data) return <Loading />;
  if (pageQuery.isError) return <ErrorDisplay onRetry={() => pageQuery.refetch()} />;

  return (
    <div className="space-y-4">
      {data?.pendingReboot && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Reinício pendente</p>
            <p className="text-xs">
              {(data.pendingRebootReasons ?? []).map(rebootReasonLabel).join(", ") || "motivo não informado"}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border p-1">
          <Button size="sm" variant={view === "pending" ? "primary" : "ghost"} onClick={() => { setView("pending"); setStatusFilter(""); setPage(1); }}>
            Pendentes ({data?.pendingCount ?? 0})
          </Button>
          <Button size="sm" variant={view === "installed" ? "primary" : "ghost"} onClick={() => { setView("installed"); setStatusFilter(""); setPage(1); }}>
            Instaladas ({data?.installedCount ?? 0})
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void handleScan()} disabled={scan.isPending}>
            <RefreshCw className="h-4 w-4" />
            {scan.isPending ? "Verificando..." : "Verificar atualizações"}
          </Button>
          <Button onClick={() => setConfirmInstallApproved(true)} disabled={installApproved.isPending}>
            <Download className="h-4 w-4" />
            Instalar aprovadas
          </Button>
          <Button variant="secondary" onClick={() => setConfirmOsPolicy("apply")} disabled={applyOsPolicy.isPending}>
            Aplicar no SO
          </Button>
          <Button variant="ghost" onClick={() => setConfirmOsPolicy("rollback")} disabled={rollbackOsPolicy.isPending}>
            Reverter SO
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted">
        Última varredura: {formatPatchDate(data?.lastCollectedAt)} · status: {data?.scanStatus ?? "—"}
        {data?.scanError ? " (" + data.scanError + ")" : ""}
        {data?.pendingReboot ? " · reinício pendente" : ""}
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="Buscar"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setSearchApplied(searchInput.trim());
              setPage(1);
            }
          }}
          placeholder="KB, título ou classificação"
        />
        <Select label="Severidade" fullWidth={false} value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }} options={PATCH_SEVERITY_OPTIONS} />
        <Select label="Status" fullWidth={false} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} options={PATCH_STATUS_OPTIONS} />
        <Button variant="secondary" onClick={() => { setSearchApplied(searchInput.trim()); setPage(1); }}>Filtrar</Button>
        {view === "pending" && items.length > 0 && (
          <Button variant="secondary" onClick={() => void handleApproveAllVisible()} disabled={bulk.isPending}>
            Aprovar visíveis
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={items}
        keyExtractor={(update) => update.id}
        showPagination={false}
        emptyMessage={view === "pending" ? "Nenhuma atualização pendente" : "Nenhuma atualização instalada reportada"}
      />

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Página {page} de {totalPages} · {totalCount} registro(s)</span>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || pageQuery.isFetching}>
            Anterior
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || pageQuery.isFetching}>
            Próxima
          </Button>
        </div>
      </div>

      <Modal open={approvalModal !== null} onClose={() => setApprovalModal(null)} title={approvalModal?.action === "deny" ? "Recusar atualização" : "Aprovar atualização"}>
        <div className="space-y-3">
          <p className="text-sm text-muted">{approvalModal?.update.title}</p>
          <Select
            label="Aplicar a"
            value={approvalScope}
            onChange={(event) => setApprovalScope(event.target.value as PatchApprovalScopeType)}
            options={[
              { value: "Agent", label: "Somente este agente" },
              { value: "Site", label: "Todo o site" },
              { value: "Client", label: "Todo o cliente" },
              { value: "Global", label: "Global" },
            ]}
          />
          <Input label="Motivo" value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} placeholder="Registrado na auditoria" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setApprovalModal(null)}>Cancelar</Button>
            <Button onClick={() => void submitApproval()} disabled={approve.isPending}>Confirmar</Button>
          </div>
        </div>
      </Modal>

      <Modal open={installModal !== null} onClose={() => setInstallModal(null)} title={installModal?.force ? "Forçar instalação" : "Instalar atualização"}>
        <div className="space-y-3">
          <p className="text-sm text-muted">{installModal?.update.title}</p>
          {installModal?.force && (
            <p className="rounded-lg border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
              A atualização está recusada. Forçar ignora a aprovação e fica registrado na auditoria.
            </p>
          )}
          <Input label="Motivo (auditoria)" value={installReason} onChange={(event) => setInstallReason(event.target.value)} />
          <Select
            label="Depois de instalar"
            value={installPostAction}
            onChange={(event) => setInstallPostAction(event.target.value as "none" | "restart" | "shutdown")}
            options={[
              { value: "none", label: "Nada (somente instalar)" },
              { value: "restart", label: "Reiniciar" },
              { value: "shutdown", label: "Desligar" },
            ]}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInstallModal(null)}>Cancelar</Button>
            <Button onClick={() => void submitInstall()} disabled={install.isPending}>Confirmar</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOsPolicy === "apply"}
        title="Aplicar enforcement no Windows Update"
        message="Oculta os KBs recusados e aplica a política de WU (notificar/deferir). Só funciona se a política do escopo estiver em OsEnforced; é best-effort e pode ser revertido. O backup é gravado quando o agente responder."
        confirmLabel="Aplicar"
        tone="primary"
        onConfirm={() => {
          setConfirmOsPolicy(null);
          applyOsPolicy.mutate(
            { agentId, hideDenied: true },
            {
              onSuccess: (result) => toast.success(result.message),
              onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao aplicar enforcement."),
            },
          );
        }}
        onClose={() => setConfirmOsPolicy(null)}
      />

      <ConfirmDialog
        open={confirmOsPolicy === "rollback"}
        title="Reverter enforcement no Windows Update"
        message="Restaura a política anterior e reexibe os KBs ocultos, usando o backup gravado no resultado do agente. Se o backup ainda não chegou, o servidor recusa com uma mensagem."
        confirmLabel="Reverter"
        tone="primary"
        onConfirm={() => {
          setConfirmOsPolicy(null);
          rollbackOsPolicy.mutate(agentId, {
            onSuccess: (result) => toast.success(result.message),
            onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao reverter enforcement."),
          });
        }}
        onClose={() => setConfirmOsPolicy(null)}
      />

      <ConfirmDialog
        open={confirmInstallApproved}
        title="Instalar atualizações aprovadas"
        message={
          pendingApprovedKeys.length > 0
            ? `Serão instaladas as atualizações aprovadas. Nenhum reinício é feito automaticamente.`
            : "Somente atualizações aprovadas serão instaladas; se não houver nenhuma, nada será enviado ao agente."
        }
        confirmLabel="Instalar"
        onConfirm={() => void handleInstallApproved()}
        onClose={() => setConfirmInstallApproved(false)}
      />
    </div>
  );
}
