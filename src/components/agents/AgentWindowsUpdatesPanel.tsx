import { useEffect, useMemo, useState } from "react";

import toast from "react-hot-toast";
import { Icon, Badge, Button, ConfirmDialog, DataTable, ErrorDisplay, Input, Loading, Modal, Pagination, Select, type Column } from "@/components/ui";
import { useAuthorization } from "@/auth/authorization";
import { usePatchesRealtime } from "@/hooks/usePatchesRealtime";
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
import {
  deriveScanHealth,
  deriveUpdateActivity,
  describePendingEmpty,
  describeProbe,
  formatElapsed,
  parseTimestamp,
  type ScanHealth,
} from "./agentWindowsUpdatesPanel.utils";

/** Quanto tempo o painel acompanha o agente em cadência rápida após pedir uma varredura. */
const SCAN_FOLLOW_UP_MS = 3 * 60 * 1000;

const HEALTH_TONE_CLASSES: Record<ScanHealth["tone"], string> = {
  ok: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
};

const PROBE_TONE_CLASSES: Record<ScanHealth["tone"], string> = {
  ok: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

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
  /** Momento em que a última varredura foi solicitada por este painel. */
  const [scanRequestedAt, setScanRequestedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  /**
   * Polling acelerado (15s): enquanto a varredura pedida por este painel não
   * chegou ou enquanto a máquina está com reinício pendente.
   */
  const [fastPolling, setFastPolling] = useState(false);

  const snapshot = useAgentWindowsUpdateSnapshot(agentId, { fastPolling });
  const data = snapshot.data;

  const effectiveStatus = statusFilter || (view === "pending" ? "pending" : "installed");
  const pageQuery = useAgentWindowsUpdates(agentId, {
    page,
    pageSize,
    search: searchApplied,
    status: effectiveStatus,
    severity: severity || undefined,
    order: "desc",
  });
  const scan = useScanAgentWindowsUpdates();
  const approve = useSetAgentWindowsUpdateApproval();
  const install = useInstallAgentWindowsUpdate();
  const installApproved = useInstallApprovedWindowsUpdates();
  const bulk = useBulkAgentWindowsUpdates();
  const applyOsPolicy = useApplyPatchOsPolicy();
  const rollbackOsPolicy = useRollbackPatchOsPolicy();
  const [confirmOsPolicy, setConfirmOsPolicy] = useState<"apply" | "rollback" | null>(null);
  const { hasAnyPermission } = useAuthorization();
  const canApprove = hasAnyPermission(["Patches.Edit", "patches.*", "admin.*"]);
  const canExecute = hasAnyPermission(["Patches.Execute", "patches.*", "admin.*"]);
  usePatchesRealtime();

  const items = pageQuery.data?.items ?? [];
  const totalCount = pageQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const pendingApprovedKeys = useMemo(
    () =>
      items
        .filter((update) => update.isPending &&
          (update.approvalState === "Approved" || update.approvalState === "AutoApproved"))
        .map((update) => update.updateKey),
    [items],
  );

  // ── Estado da varredura / atividade ────────────────────────────────────
  const health = useMemo(() => deriveScanHealth(data, nowMs), [data, nowMs]);
  const lastCollectedMs = parseTimestamp(data?.lastCollectedAt);
  const scanRequestedAtMs = scanRequestedAt;
  /** Snapshot posterior ao pedido de varredura: a resposta daquele clique chegou. */
  const scanAnswered =
    scanRequestedAtMs !== null &&
    (lastCollectedMs !== null && lastCollectedMs >= scanRequestedAtMs);

  /**
   * Aguardando a varredura pedida por este painel responder. Depois de
   * SCAN_FOLLOW_UP_MS sem resposta (agente offline/política), desistimos para
   * o painel voltar à cadência normal e continuar utilizável.
   */
  const scanGaveUp =
    scanRequestedAtMs !== null && scanRequestedAtMs !== undefined && nowMs - scanRequestedAtMs > SCAN_FOLLOW_UP_MS;
  const followUpActive = scanRequestedAtMs !== null && !scanAnswered && !scanGaveUp;

  /**
   * Liga/desliga o polling acelerado (15s) do snapshot: enquanto a varredura
   * pedida não chega e enquanto há reinício pendente. Depois do pedido, o
   * painel confere o snapshot a cada 15s até ver a resposta do agente.
   */
  const shouldFastPoll = followUpActive || data?.pendingReboot === true;
  useEffect(() => {
    setFastPolling(shouldFastPoll);
  }, [shouldFastPoll]);

  // Relógio curto para atualizar o "há N", expirar o follow-up e reavaliar o
  // banner de varredura desatualizada sem precisar de refresh da página.
  useEffect(() => {
    if (!fastPolling && scanRequestedAtMs === null) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [fastPolling, scanRequestedAtMs]);

  const activity = useMemo(() => deriveUpdateActivity(data), [data]);
  const probeFlags = useMemo(() => describeProbe(data), [data]);
  const scanning = scan.isPending || followUpActive;
  const scanButtonLabel = scanning
    ? "Verificando..."
    : health.alert
      ? "Verificar atualizações agora"
      : "Verificar atualizações";
  /** Aviso quando o pedido de varredura não retornou dentro do tempo esperado. */
  const followUpTimedOut =
    scanGaveUp && !health.neverScanned && !scanAnswered && scanRequestedAtMs !== null;

  const emptyMessage = useMemo(
    () =>
      describePendingEmpty(data, health, {
        skippedCount: data?.skippedCount,
        skippedReasons: data?.skippedReasons,
      }),
    [data, health],
  );

  const handleScan = async (source: "toolbar" | "banner" = "toolbar") => {
    try {
      setScanRequestedAt(Date.now());
      setNowMs(Date.now());
      await scan.mutateAsync({
        agentId,
        reason: source === "banner" ? "aba Atualizações (varredura desatualizada)" : "aba Atualizações (manual)",
      });
      toast.success(
        "Varredura solicitada ao agente. A atualização dos dados pode levar alguns segundos.",
      );
    } catch (error) {
      setScanRequestedAt(null);
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
            <Button size="sm" variant="secondary" onClick={() => openApproval(update, "approve")} title="Aprovar" disabled={!canApprove}>
              <Icon name="verified_user" className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openApproval(update, "deny")} title="Recusar" disabled={!canApprove}>
              <Icon name="gpp_bad" className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" onClick={() => openInstall(update, false)} disabled={install.isPending || !canExecute}>
              Instalar
            </Button>
            {update.approvalState === "Denied" && (
              <Button size="sm" variant="danger" onClick={() => openInstall(update, true)} disabled={install.isPending || !canExecute}>
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
      {snapshot.isError && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          Não foi possível ler o snapshot do Windows Update deste agente.
          <Button size="sm" variant="secondary" className="ml-2" onClick={() => void snapshot.refetch()}>
            Tentar de novo
          </Button>
        </div>
      )}

      {/* Alerta de varredura desatualizada / falha / nunca coletada. */}
      {health.alert && (
        <div
          role="alert"
          className={`flex flex-wrap items-start gap-2 rounded-xl border p-3 text-sm ${HEALTH_TONE_CLASSES[health.tone]}`}
        >
          {health.tone === "danger" ? (
            <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Icon name="schedule" className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{health.title}</p>
            <p className="text-xs opacity-90">{health.reason}</p>
            {data?.scanStatus && !health.neverScanned && (
              <p className="mt-1 text-[11px] opacity-75">
                status: {data.scanStatus}
                {data.scanDurationMs != null ? ` · ${(data.scanDurationMs / 1000).toFixed(1)}s` : ""}
                {data.scanErrorCode ? ` · código: ${data.scanErrorCode}` : ""}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleScan("banner")}
            disabled={scanning || !canExecute}
          >
            <Icon name="refresh" className="h-3.5 w-3.5" />
            {scanning ? "Verificando..." : "Verificar atualizações"}
          </Button>
        </div>
      )}

      {data?.pendingReboot && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Reinício pendente</p>
            <p className="text-xs">
              {(data.pendingRebootReasons ?? []).map(rebootReasonLabel).join(", ") || "motivo não informado"}
            </p>
            <p className="text-[11px] opacity-80">
              A busca do Windows Update pode deixar de listar a atualização como pendente até o reinício
              ser feito. Veja também a aba "Instaladas".
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
          {activity.key !== "idle" && (
            <span title={activity.detail} aria-label={activity.label}>
              <Badge color={activity.tone}>
                {activity.key === "downloading" ? (
                  <Icon name="progress_activity" className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Icon name="download" className="mr-1 h-3 w-3" />
                )}
                {activity.label}
              </Badge>
            </span>
          )}
          <Button variant="secondary" onClick={() => void handleScan("toolbar")} disabled={scanning || !canExecute}>
            <Icon name="refresh" className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
            {scanButtonLabel}
          </Button>
          <Button onClick={() => setConfirmInstallApproved(true)} disabled={installApproved.isPending || !canExecute}>
            <Icon name="download" className="h-4 w-4" />
            Instalar aprovadas
          </Button>
          <Button variant="secondary" onClick={() => setConfirmOsPolicy("apply")} disabled={applyOsPolicy.isPending || !canExecute}>
            Aplicar no SO
          </Button>
          <Button variant="ghost" onClick={() => setConfirmOsPolicy("rollback")} disabled={rollbackOsPolicy.isPending || !canExecute}>
            Reverter SO
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-xs text-muted">
        <p>
          <span className="font-medium text-foreground">Última varredura {formatElapsed(health.ageMs)}</span>
          {" · "}
          {formatPatchDate(data?.lastCollectedAt)}
          {data?.scanDurationMs != null ? ` · durou ${(data.scanDurationMs / 1000).toFixed(1)}s` : ""}
          {" · status: "}
          <span className={health.failed ? "text-danger" : health.stale ? "text-warning" : "text-success"}>
            {data?.scanStatus ?? "unknown"}
          </span>
          {data?.skippedCount ? ` · ${data.skippedCount} resultado(s) ignorado(s)` : ""}
          {followUpActive ? " · aguardando resposta da varredura solicitada" : ""}
        </p>
        {data?.scanError && (
          <p className="text-danger">Falha da última varredura: {data.scanError}</p>
        )}
        {followUpTimedOut && (
          <p className="text-warning">
            A varredura solicitada há {formatElapsed(nowMs - (scanRequestedAtMs ?? nowMs))} ainda não retornou.
            O agente pode estar offline ou sem permissão; o inventário exibido continua sendo o anterior.
          </p>
        )}
        {data?.probe && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 text-muted">
              <Icon name="info" className="h-3 w-3" />
              Sonda do agente:
            </span>
            {probeFlags.length === 0 && <span>sem dados</span>}
            {probeFlags.map((flag) => (
              <span key={flag.label} className={PROBE_TONE_CLASSES[flag.tone]}>
                {flag.label}: <span className="font-medium">{flag.value}</span>
              </span>
            ))}
          </p>
        )}
        {data?.probe?.lastInstallSuccessAt && (
          <p>Última instalação bem-sucedida no WU: {formatPatchDate(data.probe.lastInstallSuccessAt)}</p>
        )}
      </div>

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
          <Button variant="secondary" onClick={() => void handleApproveAllVisible()} disabled={bulk.isPending || !canApprove}>
            Aprovar visíveis
          </Button>
        )}
      </div>

      {/* Estado vazio explicativo: a busca WUA padrão só lista o que ainda
          falta baixar/instalar — vazio não significa "máquina em dia". */}
      {items.length === 0 && view === "pending" ? (
        <div
          className={
            emptyMessage.suspicious
              ? "rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm"
              : "rounded-xl border border-border bg-surface-light p-3 text-sm"
          }
        >
          <p className="font-medium text-foreground">{emptyMessage.title}</p>
          <p className="mt-1 text-xs text-muted">{emptyMessage.description}</p>
          {emptyMessage.suspicious && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleScan("banner")}
                disabled={scanning || !canExecute}
              >
                <Icon name="refresh" className="h-3.5 w-3.5" />
                {scanning ? "Verificando..." : "Verificar atualizações"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setView("installed"); setStatusFilter(""); setPage(1); }}
              >
                Ver instaladas ({data?.installedCount ?? 0})
              </Button>
            </div>
          )}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-light p-3 text-sm">
          <p className="font-medium text-foreground">
            {view === "pending"
              ? "Nenhuma atualização pendente"
              : "Nenhuma atualização instalada reportada"}
          </p>
          {view === "installed" && (
            <p className="mt-1 text-xs text-muted">
              O agente reporta as atualizações instaladas pela busca de KBs (Win32_QuickFixEngineering) e
              pela busca do Windows Update. Se a lista estiver vazia após uma varredura bem-sucedida, o
              agente pode estar sem permissão de leitura no WMI.
            </p>
          )}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={items}
          keyExtractor={(update) => update.id}
          showPagination={false}
          emptyMessage={view === "pending" ? emptyMessage.title : "Nenhuma atualização instalada reportada"}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={totalCount}
        pageSize={pageSize}
      />

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
