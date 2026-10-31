import { useEffect, useMemo, useState } from "react";

import toast from "react-hot-toast";
import { Icon, Badge, Button, ConfirmDialog, ContextMenu, DataTable, ErrorDisplay, Input, Loading, Modal, Pagination, Select, Tooltip, type Column, type ContextMenuItem } from "@/components/ui";
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
  formatDownloadSizeLabel,
  formatKbList,
  formatPatchDate,
  PATCH_SEVERITY_OPTIONS,
  rebootReasonLabel,
  severityColor,
  statusColor,
  statusLabel,
} from "@/pages/patches/patchesUtils";
import {
  deriveScanHealth,
  deriveUpdateActivity,
  describeFilteredEmpty,
  describeScanTrigger,
  describePendingEmpty,
  describeProbe,
  describeSnapshotSummary,
  formatElapsed,
  formatScanDuration,
  formatSkippedReasons,
  hasActiveFilters,
  parseTimestamp,
  type ScanHealth,
} from "./agentWindowsUpdatesPanel.utils";

/** Quanto tempo o painel acompanha o agente em cadência rápida após pedir uma varredura. */
const SCAN_FOLLOW_UP_MS = 3 * 60 * 1000;
/** Debounce da busca: digitar já filtra, sem precisar do botão "Filtrar". */
const SEARCH_DEBOUNCE_MS = 400;

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

const HEALTH_DOT_CLASSES: Record<ScanHealth["tone"], string> = {
  ok: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

type UpdateView = "pending" | "installed";

/** Filtro de aprovação da aba de pendentes (vira `status` na API). */
type ApprovalFilter = "" | "approved" | "denied";

const SOURCE_FILTER_OPTIONS = [
  { value: "", label: "Todas as origens" },
  { value: "windows", label: "Só Windows Update" },
  { value: "third-party", label: "Só de terceiros" },
];

const APPROVAL_FILTER_OPTIONS = [
  { value: "", label: "Todas as aprovações" },
  { value: "approved", label: "Aprovadas" },
  { value: "denied", label: "Recusadas" },
];

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
  /** Filtro de origem: "windows" esconde apps de terceiros (já listados em Programas). */
  const [sourceFilter, setSourceFilter] = useState<"" | "windows" | "third-party">("");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("");
  const [approvalModal, setApprovalModal] = useState<ApprovalModalState | null>(null);
  const [approvalScope, setApprovalScope] = useState<PatchApprovalScopeType>("Agent");
  const [approvalReason, setApprovalReason] = useState("");
  const [installModal, setInstallModal] = useState<InstallModalState | null>(null);
  const [installReason, setInstallReason] = useState("");
  const [installPostAction, setInstallPostAction] = useState<"none" | "restart" | "shutdown">("none");
  const [confirmInstallApproved, setConfirmInstallApproved] = useState(false);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  /** Menu "⋯" da linha: aprovar/recusar/forçar/suporte sem poluir a tabela. */
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; update: AgentWindowsUpdate } | null>(null);
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

  /**
   * A aba manda no status base (pendentes/instaladas); o filtro de aprovação
   * só refina a aba de pendentes, para não existirem dois controles dizendo a
   * mesma coisa (antes havia um select "Status" duplicando as abas).
   */
  const effectiveStatus = view === "installed" ? "installed" : approvalFilter || "pending";
  const pageQuery = useAgentWindowsUpdates(agentId, {
    page,
    pageSize,
    search: searchApplied,
    status: effectiveStatus,
    severity: severity || undefined,
    source: sourceFilter || undefined,
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

  // Busca com debounce: o operador digita e a lista acompanha; "Filtrar"
  // continua existindo para quem prefere confirmar com Enter/botão.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === searchApplied) return;
    const id = window.setTimeout(() => {
      setSearchApplied(trimmed);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchInput, searchApplied]);

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

  const summary = useMemo(() => describeSnapshotSummary(data), [data]);
  const filters = { search: searchApplied, severity, status: approvalFilter, source: sourceFilter };
  const filtersActive = hasActiveFilters(filters);
  const filteredEmpty = useMemo(() => describeFilteredEmpty(filters), [searchApplied, severity, approvalFilter, sourceFilter]);

  const emptyMessage = useMemo(
    () =>
      describePendingEmpty(data, health, {
        skippedCount: data?.skippedCount,
        skippedReasons: data?.skippedReasons,
      }),
    [data, health],
  );

  const clearFilters = () => {
    setSearchInput("");
    setSearchApplied("");
    setSeverity("");
    setSourceFilter("");
    setApprovalFilter("");
    setPage(1);
  };

  const selectView = (next: UpdateView) => {
    setView(next);
    setApprovalFilter("");
    setPage(1);
  };

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

  /** Itens do menu "⋯" da linha — ações secundárias fora da tabela. */
  const rowMenuItems = useMemo<ContextMenuItem[]>(() => {
    const update = rowMenu?.update;
    if (!update) return [];
    const items: ContextMenuItem[] = [
      {
        key: "approve",
        label: "Aprovar…",
        icon: <Icon name="verified_user" className="h-4 w-4" />,
        disabled: !canApprove,
        onClick: () => openApproval(update, "approve"),
      },
      {
        key: "deny",
        label: "Recusar…",
        icon: <Icon name="gpp_bad" className="h-4 w-4" />,
        disabled: !canApprove,
        danger: true,
        onClick: () => openApproval(update, "deny"),
      },
    ];
    if (update.approvalState === "Denied") {
      items.push({
        key: "force",
        label: "Forçar instalação…",
        icon: <Icon name="warning" className="h-4 w-4" />,
        danger: true,
        separatorBefore: true,
        disabled: !canExecute,
        hint: "Ignora a recusa e fica na auditoria",
        onClick: () => openInstall(update, true),
      });
    }
    if (update.supportUrl) {
      items.push({
        key: "support",
        label: "Abrir página de suporte",
        icon: <Icon name="open_in_new" className="h-4 w-4" />,
        separatorBefore: true,
        onClick: () => window.open(update.supportUrl ?? "", "_blank", "noopener,noreferrer"),
      });
    }
    return items;
  }, [rowMenu, canApprove, canExecute]);

  const columns: Column<AgentWindowsUpdate>[] = [
    {
      key: "update",
      header: "Atualização",
      sortable: true,
      width: "38%",
      render: (update) => {
        const sizeLabel = formatDownloadSizeLabel(update.minDownloadSize, update.maxDownloadSize);
        return (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground" title={update.title}>{update.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
            <span className="font-mono text-[11px] text-foreground/80">{formatKbList(update.kbIds)}</span>
            <span aria-hidden>·</span>
            <span>{update.classification ?? "Sem classificação"}</span>
            {sizeLabel ? (
              <>
                <span aria-hidden>·</span>
                {/* O WUA reporta a soma de TODO o pacote empacotado (UUP): em
                    updates Insider isso inclui todas as edições/idiomas e passa
                    de 90 GB, enquanto o download real é ~9 GB. Acima do limiar
                    plausível o número é omitido; com min>0 exibimos "a partir
                    de X" (formatDownloadSizeLabel). */}
                <span title="Estimativa de download reportada pelo Windows Update Agent (o download real pode variar)">
                  {sizeLabel}
                </span>
              </>
            ) : null}
            {update.isMandatory ? <Badge color="warning">obrigatória</Badge> : null}
            {update.isDownloaded && update.isPending ? <Badge color="primary">baixada</Badge> : null}
          </p>
        </div>
        );
      },
    },
    {
      key: "severity",
      header: "Severidade",
      width: "11%",
      sortable: true,
      render: (update) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge color={severityColor(update.severity)}>{update.severity ?? "—"}</Badge>
          {update.severitySource === "derived" ? (
            <span
              className="text-[10px] uppercase tracking-wide opacity-70"
              title="Severidade inferida pelo agente (a Microsoft não publicou MSRC para este update); nunca acima de Important."
            >
              derivada
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "approval",
      header: "Aprovação",
      width: "14%",
      render: (update) => (
        <Badge color={approvalColor(update.approvalState)}>{approvalLabel(update.approvalState)}</Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "14%",
      render: (update) => (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <Badge color={statusColor(update.status)}>{statusLabel(update.status)}</Badge>
            {update.requiresReboot && (
              <Badge color="warning" className="gap-1">
                <Icon name="restart_alt" className="h-3 w-3" />
                reinício
              </Badge>
            )}
          </div>
          {update.installError && (
            <p className="text-xs text-danger" title={update.installError}>{update.installError}</p>
          )}
          {(update.attemptCount ?? 0) > 0 && update.status === "Failed" ? (
            <p className="text-[11px] text-muted-foreground">
              {update.attemptCount} tentativa(s)
              {update.failureClass ? " · " + update.failureClass : ""}
              {update.nextAttemptAt
                ? " · próxima " + formatPatchDate(update.nextAttemptAt)
                : " · sem retry automático"}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "dates",
      // Na aba de instaladas a data que importa é a da instalação.
      header: view === "installed" ? "Instalada em" : "Publicada",
      width: "12%",
      render: (update) => (
        <Tooltip content={
          <span>
            Publicada em {formatPatchDate(update.publishedAt)}
            {update.installedAt ? ` · instalada em ${formatPatchDate(update.installedAt)}` : ""}
            {` · reportada em ${formatPatchDate(update.reportedAt)}`}
            {update.source ? ` · origem ${update.source}` : ""}
          </span>
        }>
          <span className="cursor-help text-xs text-muted underline decoration-dotted decoration-border underline-offset-2">
            {formatPatchDate(view === "installed" ? update.installedAt ?? update.publishedAt : update.publishedAt)}
          </span>
        </Tooltip>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "11%",
      className: "text-right",
      render: (update) => {
        if (update.isInstalled) return null;
        const busy = install.isPending || approve.isPending;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              onClick={() => openInstall(update, false)}
              disabled={busy || !canExecute}
              aria-label={`Instalar ${update.title}`}
            >
              Instalar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="px-2"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setRowMenu({ x: rect.right - 220, y: rect.bottom + 4, update });
              }}
              aria-haspopup="menu"
              aria-label={`Mais ações para ${update.title}`}
              title="Mais ações"
            >
              <Icon name="more_vert" className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  if (pageQuery.isLoading && !pageQuery.data) return <Loading />;
  if (pageQuery.isError) return <ErrorDisplay onRetry={() => pageQuery.refetch()} />;

  const scanStatusRaw = data?.scanStatus ?? "unknown";
  const probeDetailsHidden = probeFlags.length === 0 && !data?.probe && data?.wuaAvailable == null;

  return (
    <div className="space-y-4">
      {/* Cabeçalho: identidade da aba + ações primárias (as ações de política do
          SO saem da linha principal — são raras e não devem competir com
          "Verificar" e "Instalar"). */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground sm:text-xl">
            <Icon name="arrow_circle_up" className="h-5 w-5 text-primary" />
            Atualizações do Windows
          </h3>
          <p className="text-sm text-muted">{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {activity.key !== "idle" && (
            <span title={activity.detail} aria-label={activity.label}>
              <Badge color={activity.tone}>
                {activity.key === "downloading" ? (
                  <Icon name="progress_activity" className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Icon name="download" className="mr-1 h-3 w-3" />
                )}
                <span>{activity.label}</span>
                {/* A porcentagem vem da sonda (probe.downloadPercent) desde a
                    correção do agente. Só aparece no estado de DOWNLOAD: no badge
                    de "Reinício pendente" o percentual é do download anterior e
                    seria lido como progresso do reboot. */}
                {activity.key === "downloading" &&
                  typeof data?.probe?.downloadPercent === "number" && (
                    <span className="ml-1 tabular-nums">{Math.round(data.probe.downloadPercent)}%</span>
                  )}
              </Badge>
            </span>
          )}
          <Button variant="secondary" onClick={() => void handleScan("toolbar")} disabled={scanning || !canExecute}>
            <Icon name="refresh" className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
            {scanButtonLabel}
          </Button>
          <Button
            onClick={() => setConfirmInstallApproved(true)}
            disabled={installApproved.isPending || !canExecute || data?.approvedCount === 0}
            title={
              data?.approvedCount === 0
                ? "Nenhuma atualização aprovada aguardando instalação"
                : "Instalar todas as atualizações aprovadas deste agente"
            }
          >
            <Icon name="download" className="h-4 w-4" />
            Instalar aprovadas
            {typeof data?.approvedCount === "number" && data.approvedCount > 0 ? (
              <span className="rounded-full bg-black/15 px-1.5 text-xs tabular-nums">{data.approvedCount}</span>
            ) : null}
          </Button>
          <Button variant="ghost" onClick={() => setPolicyModalOpen(true)} title="Aplicar ou reverter a política do Windows Update no sistema operacional">
            <Icon name="shield" className="h-4 w-4" />
            Política do SO
          </Button>
        </div>
      </div>

      {/* Faixa de saúde da varredura: um único lugar para "quando", "quão bom"
          e "o que a sonda viu" — o diagnóstico detalhado fica recolhido. */}
      <section
        aria-label="Saúde da varredura do Windows Update"
        className="rounded-xl border border-border bg-surface-light/50 px-3 py-2.5"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT_CLASSES[health.tone]}`} aria-hidden />
            <span className="font-medium text-foreground">Última varredura {formatElapsed(health.ageMs)}</span>
          </span>
          <span className="text-muted" aria-hidden>·</span>
          <span className="text-muted">{formatPatchDate(data?.lastCollectedAt)}</span>
          <span className="text-muted" aria-hidden>·</span>
          <span className="text-muted">durou {formatScanDuration(data?.scanDurationMs)}</span>
          <span className="text-muted" aria-hidden>·</span>
          <span className={health.failed ? "text-danger" : health.stale ? "text-warning" : "text-success"}>
            status: {scanStatusRaw}
          </span>
          {data?.skippedCount ? (
            <>
              <span className="text-muted" aria-hidden>·</span>
              <span className="text-muted">{data.skippedCount} resultado(s) ignorado(s)</span>
            </>
          ) : null}
          {followUpActive ? (
            <>
              <span className="text-muted" aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 text-primary" aria-live="polite">
                <Icon name="progress_activity" className="h-3 w-3 animate-spin" />
                aguardando resposta da varredura solicitada
              </span>
            </>
          ) : null}
        </div>

        {data?.scanError && (
          <p className="mt-1.5 text-xs text-danger">Falha da última varredura: {data.scanError}</p>
        )}
        {followUpTimedOut && (
          <p className="mt-1.5 text-xs text-warning">
            A varredura solicitada há {formatElapsed(nowMs - (scanRequestedAtMs ?? nowMs))} ainda não retornou.
            O agente pode estar offline ou sem permissão; o inventário exibido continua sendo o anterior.
          </p>
        )}

        {!probeDetailsHidden && (
          <details className="group mt-2 border-t border-border/60 pt-2 text-xs text-muted">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
              <Icon name="expand_more" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              Diagnóstico da sonda
              {describeScanTrigger(data?.scanTrigger, data?.scanSource) ? (
                <span className="font-normal">· {describeScanTrigger(data?.scanTrigger, data?.scanSource)}</span>
              ) : null}
              {data?.probe?.lastInstallSuccessAt ? (
                <span className="font-normal">· última instalação OK em {formatPatchDate(data.probe.lastInstallSuccessAt)}</span>
              ) : null}
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-4">
              {probeFlags.length === 0 && <span>sem dados da sonda</span>}
              {probeFlags.map((flag) => (
                <span key={flag.label} className={PROBE_TONE_CLASSES[flag.tone]}>
                  {flag.label}: <span className="font-medium">{flag.value}</span>
                </span>
              ))}
              {data?.skippedCount ? (
                <span className="text-muted">
                  Resultados ignorados: <span className="font-medium text-foreground">{data.skippedCount}</span>
                  {formatSkippedReasons(data.skippedReasons) ? ` (${formatSkippedReasons(data.skippedReasons)})` : ""}
                </span>
              ) : null}
            </div>
          </details>
        )}
      </section>

      {snapshot.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <Icon name="warning" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Não foi possível ler o snapshot do Windows Update deste agente.</span>
          <Button size="sm" variant="secondary" onClick={() => void snapshot.refetch()}>
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
                {data.scanDurationMs != null ? ` · ${formatScanDuration(data.scanDurationMs)}` : ""}
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
          <Icon name="restart_alt" className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">Reinício pendente</p>
            <p className="text-xs">
              {(data.pendingRebootReasons ?? []).map(rebootReasonLabel).join(", ") || "motivo não informado"}
            </p>
            <p className="text-[11px] opacity-80">
              A busca do Windows Update pode deixar de listar a atualização como pendente até o reinício
              ser feito. Veja também a aba "Instaladas".
            </p>
            {data.rebootAction && data.rebootAction !== "None" ? (
              <p className="text-[11px] font-medium">
                Política de reinício: {data.rebootActionReason ?? "notificar operador"}
                {" — o reinício é sempre ação manual do operador."}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Abas + filtros numa única barra: aba à esquerda, refinamentos à direita. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Lista de atualizações"
            className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-light/60 p-1"
          >
            <Button
              size="sm"
              role="tab"
              aria-selected={view === "pending"}
              variant={view === "pending" ? "primary" : "ghost"}
              onClick={() => selectView("pending")}
            >
              Pendentes ({data?.pendingCount ?? 0})
            </Button>
            <Button
              size="sm"
              role="tab"
              aria-selected={view === "installed"}
              variant={view === "installed" ? "primary" : "ghost"}
              onClick={() => selectView("installed")}
            >
              Instaladas ({data?.installedCount ?? 0})
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>
              {totalCount === 0
                ? "Nenhum resultado"
                : `${totalCount} atualizaç${totalCount === 1 ? "ão" : "ões"} · página ${page} de ${totalPages}`}
            </span>
            {filtersActive && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <Icon name="close" className="h-3.5 w-3.5" />
                Limpar filtros
              </Button>
            )}
            {view === "pending" && items.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleApproveAllVisible()}
                disabled={bulk.isPending || !canApprove}
                title="Aprovar todas as atualizações pendentes listadas nesta página"
              >
                <Icon name="verified_user" className="h-3.5 w-3.5" />
                Aprovar visíveis
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-light/40 p-2.5">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
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
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(""); setSearchApplied(""); setPage(1); }}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select
            label="Severidade"
            fullWidth={false}
            value={severity}
            onChange={(event) => { setSeverity(event.target.value); setPage(1); }}
            options={PATCH_SEVERITY_OPTIONS}
          />
          <Select
            label="Origem"
            fullWidth={false}
            value={sourceFilter}
            onChange={(event) => { setSourceFilter(event.target.value as "" | "windows" | "third-party"); setPage(1); }}
            options={SOURCE_FILTER_OPTIONS}
          />
          {view === "pending" && (
            <Select
              label="Aprovação"
              fullWidth={false}
              value={approvalFilter}
              onChange={(event) => { setApprovalFilter(event.target.value as ApprovalFilter); setPage(1); }}
              options={APPROVAL_FILTER_OPTIONS}
            />
          )}
          {/* Dica discreta: fecha a barra e explica que a busca é incremental. */}
          <p className="ml-auto hidden self-center text-xs text-muted lg:block">
            A busca filtra enquanto você digita · os filtros valem só para a aba aberta
          </p>
        </div>
      </div>

      {/* Estado vazio: curto na frente, explicação longa recolhida (antes o
          texto inteiro ficava aberto e repetia a mesma ideia três vezes). */}
      {items.length === 0 ? (
        filtersActive ? (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface-light/60 p-4 text-sm">
            <p className="font-medium text-foreground">{filteredEmpty.title}</p>
            <p className="text-xs text-muted">{filteredEmpty.description}</p>
            <Button size="sm" variant="secondary" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>
        ) : view === "pending" ? (
          <div
            className={
              emptyMessage.suspicious
                ? "rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
                : "rounded-xl border border-border bg-surface-light/60 p-4 text-sm"
            }
          >
            <div className="flex items-start gap-2">
              <Icon
                name={emptyMessage.suspicious ? "warning" : "verified"}
                className={`mt-0.5 h-4 w-4 shrink-0 ${emptyMessage.suspicious ? "text-warning" : "text-success"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{emptyMessage.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {emptyMessage.suspicious
                    ? "Vazio aqui não significa máquina em dia: veja a explicação abaixo antes de concluir."
                    : "Nada a fazer nesta máquina pela busca padrão do Windows Update."}
                </p>
                <details className="group mt-2 text-xs text-muted">
                  <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
                    <Icon name="expand_more" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    Por que esta lista pode aparecer vazia?
                  </summary>
                  <p className="mt-1.5 pl-4">{emptyMessage.description}</p>
                </details>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 pl-6">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleScan("banner")}
                disabled={scanning || !canExecute}
              >
                <Icon name="refresh" className="h-3.5 w-3.5" />
                {scanning ? "Verificando..." : "Verificar atualizações"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => selectView("installed")}>
                Ver instaladas ({data?.installedCount ?? 0})
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface-light/60 p-4 text-sm">
            <p className="font-medium text-foreground">Nenhuma atualização instalada reportada</p>
            <details className="group mt-2 text-xs text-muted">
              <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-muted-foreground hover:text-foreground">
                <Icon name="expand_more" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                O que alimenta esta lista?
              </summary>
              <p className="mt-1.5 pl-4">
                O agente reporta as atualizações instaladas pela busca de KBs (Win32_QuickFixEngineering) e
                pela busca do Windows Update. Se a lista estiver vazia após uma varredura bem-sucedida, o
                agente pode estar sem permissão de leitura no WMI.
              </p>
            </details>
          </div>
        )
      ) : (
        <DataTable
          columns={columns}
          data={items}
          keyExtractor={(update) => update.id}
          showPagination={false}
          fixedLayout
          flush
          defaultSort={{ key: "severity", direction: "desc" }}
          emptyMessage={view === "pending" ? emptyMessage.title : "Nenhuma atualização instalada reportada"}
        />
      )}

      {totalCount > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={totalCount}
          pageSize={pageSize}
        />
      )}

      <Modal open={policyModalOpen} onClose={() => setPolicyModalOpen(false)} title="Política do Windows Update no SO">
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Ações raras e reversíveis que escrevem política no Windows do agente (não no servidor). Ficam
            fora da barra principal para não competir com “Verificar” e “Instalar”.
          </p>
          <div className="rounded-xl border border-border bg-surface-light/60 p-3">
            <p className="text-sm font-medium text-foreground">Aplicar enforcement</p>
            <p className="mt-1 text-xs text-muted">
              Oculta os KBs recusados e aplica a política de WU (notificar/deferir). Só funciona se a política
              do escopo estiver em OsEnforced; o backup é gravado quando o agente responder.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              disabled={applyOsPolicy.isPending || !canExecute}
              onClick={() => { setPolicyModalOpen(false); setConfirmOsPolicy("apply"); }}
            >
              <Icon name="shield" className="h-3.5 w-3.5" />
              Aplicar no SO
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-surface-light/60 p-3">
            <p className="text-sm font-medium text-foreground">Reverter enforcement</p>
            <p className="mt-1 text-xs text-muted">
              Restaura a política anterior e reexibe os KBs ocultos, usando o backup gravado no resultado do
              agente. Se o backup ainda não chegou, o servidor recusa com uma mensagem.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              disabled={rollbackOsPolicy.isPending || !canExecute}
              onClick={() => { setPolicyModalOpen(false); setConfirmOsPolicy("rollback"); }}
            >
              <Icon name="undo" className="h-3.5 w-3.5" />
              Reverter SO
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setPolicyModalOpen(false)}>Fechar</Button>
          </div>
        </div>
      </Modal>

      {rowMenu && (
        <ContextMenu
          position={{ x: rowMenu.x, y: rowMenu.y }}
          items={rowMenuItems}
          onClose={() => setRowMenu(null)}
        />
      )}

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
