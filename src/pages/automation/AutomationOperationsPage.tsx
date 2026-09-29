import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Activity,
  Ban,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Layers,
  RefreshCw,
  RotateCcw,
  ServerCog,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  type Column,
  ErrorDisplay,
  Input,
  Loading,
  Select,
  StatCard,
} from "@/components/ui";
import {
  ApiError,
  AutomationExecutionSourceType,
  AutomationExecutionStatus,
  type AutomationExecutionReport,
  type AutomationScopeDispatchResult,
  type AutomationScopeTarget,
} from "@/api";
import { useAuthorization } from "@/auth/authorization";
import { useAgent, useAgentsByClient, useAgentsBySite } from "@/hooks/useAgents";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import {
  useAutomationScripts,
  useAutomationTasks,
  useAutomationExecutions,
  useCancelAutomationExecution,
  useForceAutomationSync,
  useForceAutomationSyncForScope,
  useRunAutomationScriptForScope,
  useRunAutomationScriptNow,
  useRunAutomationTaskForScope,
  useRunAutomationTaskNow,
} from "@/hooks/useAutomation";
import {
  ackLatencyMs,
  buildExecutionsCsv,
  canRetryExecution,
  executionDurationMs,
  executionSourceLabel,
  executionStatusMeta,
  executionTargetName,
  filterExecutions,
  isExecutionPending,
  formatDuration,
  summarizeExecutions,
} from "@/modules/automation/executionUtils";
import { buildCorrelationId, wingetDecisionFromMetadata } from "./automationTasksUtils";

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: String(AutomationExecutionStatus.Dispatched), label: "Dispatched" },
  { value: String(AutomationExecutionStatus.Acknowledged), label: "Acknowledged" },
  { value: String(AutomationExecutionStatus.Completed), label: "Completed" },
  { value: String(AutomationExecutionStatus.Failed), label: "Failed" },
  { value: String(AutomationExecutionStatus.Cancelled), label: "Cancelada" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "Todas as origens" },
  { value: String(AutomationExecutionSourceType.RunNow), label: "RunNow" },
  { value: String(AutomationExecutionSourceType.Scheduled), label: "Scheduled" },
  { value: String(AutomationExecutionSourceType.ForceSync), label: "ForceSync" },
  { value: String(AutomationExecutionSourceType.AgentManual), label: "AgentManual" },
  { value: String(AutomationExecutionSourceType.SoftwareUpdate), label: "SoftwareUpdate" },
  { value: String(AutomationExecutionSourceType.SoftwareUninstall), label: "SoftwareUninstall" },
];

const LIMIT_OPTIONS = [
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "200", label: "200" },
];

const BOOL_OPTIONS = [
  { value: "true", label: "Sim" },
  { value: "false", label: "Não" },
];

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : "-";
}

function downloadCsv(filename: string, csv: string) {
  // BOM para o Excel pt-BR abrir os acentos corretamente.
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Permissões equivalentes ao RequirePermission(Automation, Execute) do backend. */
const AUTOMATION_EXECUTE_PERMISSIONS = [
  "Automation.Execute",
  "automation.execute",
  "Automation.Edit",
  "automation.*",
  "admin.*",
];

export default function AutomationOperationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlAgentId = searchParams.get("agentId") ?? "";
  const { hasAnyPermission } = useAuthorization();
  const canExecute = hasAnyPermission(AUTOMATION_EXECUTE_PERMISSIONS);

  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [agentId, setAgentId] = useState(urlAgentId);

  const [taskId, setTaskId] = useState("");
  const [scriptId, setScriptId] = useState("");
  // Default histórico do agent: policies + inventory.
  const [syncPolicies, setSyncPolicies] = useState(true);
  const [syncInventory, setSyncInventory] = useState(true);
  const [syncSoftware, setSyncSoftware] = useState(false);
  const [syncAppStore, setSyncAppStore] = useState(false);

  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [retryTarget, setRetryTarget] = useState<AutomationExecutionReport | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AutomationExecutionReport | null>(null);

  // Escopo da operação: agente único (padrão), site inteiro ou cliente inteiro.
  const [scopeMode, setScopeMode] = useState<"agent" | "site" | "client">("agent");
  const [pendingBulk, setPendingBulk] = useState<
    { kind: "task" | "script" | "force-sync"; label: string } | null
  >(null);
  const [bulkResult, setBulkResult] = useState<AutomationScopeDispatchResult | null>(null);

  // Deep link (?agentId=...) → reflete a URL no estado (voltar/avançar do browser).
  useEffect(() => {
    setAgentId(urlAgentId);
  }, [urlAgentId]);

  // Trocar de escopo/alvo invalida o resultado exibido: manter o painel do lote
  // anterior ao lado de um novo contexto confunde.
  useEffect(() => {
    setBulkResult(null);
  }, [scopeMode, clientId, siteId]);

  /**
   * O link vindo do detalhe do agente traz só o agentId. Sem client/site o
   * usuário não conseguiria confirmar o alvo: buscamos o agente para preencher
   * o contexto (antes o select ficava travado no id "solto").
   */
  const needsAgentResolution = !!agentId && !clientId && !siteId;
  const agentDetail = useAgent(needsAgentResolution ? agentId : undefined);
  useEffect(() => {
    const agent = agentDetail.data;
    if (!agent) return;
    setClientId(agent.clientId ?? "");
    setSiteId(agent.siteId);
  }, [agentDetail.data]);

  const selectAgent = useCallback(
    (id: string) => {
      setAgentId(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("agentId", id);
          else next.delete("agentId");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clients = useClients();
  const sites = useSites(clientId);
  const agents = useAgentsBySite(siteId);
  const tasks = useAutomationTasks({ activeOnly: true, limit: 200 });
  const scripts = useAutomationScripts({ activeOnly: true, limit: 200 });

  const [targetKind, targetId] = targetFilter.split(":");

  const executions = useAutomationExecutions(
    agentId,
    {
      limit,
      status: statusFilter || undefined,
      sourceType: sourceFilter || undefined,
      taskId: targetKind === "task" ? targetId : undefined,
      scriptId: targetKind === "script" ? targetId : undefined,
    },
    !!agentId,
  );

  const cancelExecution = useCancelAutomationExecution();
  const runTaskNow = useRunAutomationTaskNow();
  const runScriptNow = useRunAutomationScriptNow();
  const forceSync = useForceAutomationSync();

  // ── Operações em massa (cliente/site inteiro) ──────────────────────────
  const clientAgents = useAgentsByClient(scopeMode === "client" ? clientId : "");
  const runTaskForScope = useRunAutomationTaskForScope();
  const runScriptForScope = useRunAutomationScriptForScope();
  const forceSyncForScope = useForceAutomationSyncForScope();

  const bulkScope: AutomationScopeTarget | null = useMemo(() => {
    if (!clientId) return null;
    if (scopeMode === "site") return siteId ? { clientId, siteId } : null;
    if (scopeMode === "client") return { clientId };
    return null;
  }, [clientId, scopeMode, siteId]);

  /** Agentes do escopo selecionado (a lista já vem filtrada pelo backend). */
  const scopeAgents = useMemo(
    () => (scopeMode === "client" ? (clientAgents.data ?? []) : (agents.data ?? [])),
    [scopeMode, clientAgents.data, agents.data],
  );
  const scopeOnline = scopeAgents.filter((agent) => agent.isOnline).length;
  const scopeOffline = scopeAgents.length - scopeOnline;
  const bulkPending =
    runTaskForScope.isPending || runScriptForScope.isPending || forceSyncForScope.isPending;

  const clientOptions = [
    { value: "", label: "Selecione" },
    ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
  ];
  const siteOptions = [
    { value: "", label: clientId ? "Selecione" : "Escolha um cliente primeiro" },
    ...(sites.data ?? []).map((site) => ({ value: site.id, label: site.name })),
  ];
  const agentOptions = [
    { value: "", label: siteId ? "Selecione" : "Escolha um site" },
    ...(agents.data ?? []).map((agent) => ({
      value: agent.id,
      label: `${agent.displayName ?? agent.hostname} (${agent.hostname})`,
    })),
  ];
  const taskOptions = [
    { value: "", label: "Selecione" },
    ...(tasks.data?.items ?? []).map((task) => ({ value: task.id, label: task.name })),
  ];
  const scriptOptions = [
    { value: "", label: "Selecione" },
    ...(scripts.data?.items ?? []).map((script) => ({ value: script.id, label: script.name })),
  ];
  const targetOptions = useMemo(
    () => [
      { value: "", label: "Todos os alvos" },
      ...(tasks.data?.items ?? []).map((task) => ({
        value: `task:${task.id}`,
        label: `Tarefa · ${task.name}`,
      })),
      ...(scripts.data?.items ?? []).map((script) => ({
        value: `script:${script.id}`,
        label: `Script · ${script.name}`,
      })),
    ],
    [tasks.data, scripts.data],
  );

  const reports = executions.data ?? [];
  const summary = useMemo(() => summarizeExecutions(reports), [reports]);
  const visibleReports = useMemo(
    () => filterExecutions(reports, { search, onlyFailures, onlyPending }),
    [reports, search, onlyFailures, onlyPending],
  );

  const currentAgent =
    (agents.data ?? []).find((agent) => agent.id === agentId) ?? agentDetail.data ?? null;

  // Agente offline não impede mais a operação: o comando é persistido e a
  // reentrega o envia quando ele reconectar.
  const canRunInScope =
    scopeMode === "agent" ? true : Boolean(bulkScope) && scopeAgents.length > 0;

  const bulkActionTitle = !canExecute
    ? "Sem permissão para executar automações"
    : scopeMode === "agent"
      ? undefined
      : !bulkScope
        ? "Selecione o escopo (cliente/site)"
        : undefined;

  // Com a confirmação aberta ou um lote em voo, os botões de escopo ficam
  // bloqueados — evita disparar dois lotes por duplo clique.
  const bulkBusy = bulkPending || pendingBulk !== null;

  const clearQuickFilters = () => {
    setOnlyFailures(false);
    setOnlyPending(false);
  };

  // Os atalhos limpam o filtro de status do servidor: combinar "status=Acknowledged"
  // com "somente falhas" devolvia uma lista vazia sem explicação.
  const handleToggleFailures = () => {
    setOnlyPending(false);
    setStatusFilter("");
    setOnlyFailures((prev) => !prev);
  };

  const handleTogglePending = () => {
    setOnlyFailures(false);
    setStatusFilter("");
    setOnlyPending((prev) => !prev);
  };

  const handleRunTask = () => {
    if (!agentId) return toast.error("Selecione um agent");
    if (!taskId) return toast.error("Selecione uma tarefa");

    runTaskNow.mutate(
      { agentId, taskId, correlationId: buildCorrelationId("task-run-now") },
      {
        onSuccess: () => {
          clearQuickFilters();
          toast.success("Tarefa disparada com sucesso");
        },
        onError: (error) => toast.error(errorMessage(error, "Falha ao disparar tarefa")),
      },
    );
  };

  const handleRunScript = () => {
    if (!agentId) return toast.error("Selecione um agent");
    if (!scriptId) return toast.error("Selecione um script");

    runScriptNow.mutate(
      { agentId, scriptId, correlationId: buildCorrelationId("script-run-now") },
      {
        onSuccess: () => {
          clearQuickFilters();
          toast.success("Script disparado com sucesso");
        },
        onError: (error) => toast.error(errorMessage(error, "Falha ao disparar script")),
      },
    );
  };

  const handleForceSync = () => {
    if (!agentId) return toast.error("Selecione um agent");
    if (!syncPolicies && !syncInventory && !syncSoftware && !syncAppStore) {
      return toast.error("Selecione ao menos uma opção para sincronizar");
    }

    forceSync.mutate(
      {
        agentId,
        // As flags agora chegam ao agent: antes eram descartadas pelo backend.
        request: {
          policies: syncPolicies,
          inventory: syncInventory,
          software: syncSoftware,
          appStore: syncAppStore,
        },
        correlationId: buildCorrelationId("force-sync"),
      },
      {
        onSuccess: () => {
          clearQuickFilters();
          toast.success("Force sync enviado");
        },
        onError: (error) => toast.error(errorMessage(error, "Falha ao enviar force sync")),
      },
    );
  };

  const handleRetry = () => {
    const target = retryTarget;
    if (!target) return;
    if (!agentId) {
      setRetryTarget(null);
      return toast.error("Selecione um agent");
    }
    if (currentAgent && !currentAgent.isOnline) {
      toast(
        "Agent offline: o comando fica na fila e é entregue quando ele reconectar",
      );
    }

    const onSuccess = () => {
      clearQuickFilters();
      toast.success("Operação reenviada");
      setRetryTarget(null);
    };
    const onError = (error: unknown) => {
      toast.error(errorMessage(error, "Falha ao reenviar operação"));
      setRetryTarget(null);
    };

    if (target.taskId) {
      runTaskNow.mutate(
        { agentId, taskId: target.taskId, correlationId: buildCorrelationId("task-rerun") },
        { onSuccess, onError },
      );
      return;
    }

    if (target.scriptId) {
      runScriptNow.mutate(
        { agentId, scriptId: target.scriptId, correlationId: buildCorrelationId("script-rerun") },
        { onSuccess, onError },
      );
      return;
    }

    setRetryTarget(null);
    toast.error("Execução sem tarefa/script — não é possível reenviar");
  };

  const handleConfirmCancel = () => {
    const target = cancelTarget;
    if (!target) return;
    if (!agentId) {
      setCancelTarget(null);
      return toast.error("Selecione um agent");
    }

    cancelExecution.mutate(
      { agentId, executionId: target.id, correlationId: buildCorrelationId("execution-cancel") },
      {
        onSuccess: () => {
          setCancelTarget(null);
          toast.success("Execução cancelada");
        },
        onError: (error) => {
          setCancelTarget(null);
          toast.error(errorMessage(error, "Falha ao cancelar execução"));
        },
      },
    );
  };

  /** Abre a confirmação; o disparo em si acontece em handleConfirmBulk. */
  const requestBulk = (kind: "task" | "script" | "force-sync", label: string) => {
    if (!canExecute) return toast.error("Sem permissão para executar automações");
    if (!bulkScope) {
      return toast.error(
        scopeMode === "site" ? "Selecione cliente e site" : "Selecione um cliente",
      );
    }
    if (scopeAgents.length === 0) return toast.error("Nenhum agente no escopo selecionado");

    if (kind === "task" && !taskId) return toast.error("Selecione uma tarefa");
    if (kind === "script" && !scriptId) return toast.error("Selecione um script");
    if (
      kind === "force-sync" &&
      !syncPolicies &&
      !syncInventory &&
      !syncSoftware &&
      !syncAppStore
    ) {
      return toast.error("Selecione ao menos uma opção para sincronizar");
    }

    setPendingBulk({ kind, label });
  };

  const handleConfirmBulk = () => {
    if (!pendingBulk || !bulkScope) return;

    const onSuccess = (result: AutomationScopeDispatchResult) => {
      setBulkResult(result);
      setPendingBulk(null);
      clearQuickFilters();

      const ignored = result.skippedOffline + result.skippedMaintenance;
      if (result.dispatched === 0) {
        toast.error("Nenhum agente recebeu o comando (todos offline ou em manutenção)");
      } else if (ignored > 0 || result.failed > 0) {
        toast.success(
          `${result.dispatched} de ${result.totalAgents} agentes receberam o comando`,
        );
      } else {
        toast.success(`Comando enviado para ${result.dispatched} agente(s)`);
      }
    };

    const onError = (error: unknown) => {
      toast.error(errorMessage(error, "Falha ao executar operação em massa"));
      setPendingBulk(null);
    };

    if (pendingBulk.kind === "task") {
      runTaskForScope.mutate(
        { scope: bulkScope, taskId, correlationId: buildCorrelationId("bulk-task") },
        { onSuccess, onError },
      );
      return;
    }

    if (pendingBulk.kind === "script") {
      runScriptForScope.mutate(
        { scope: bulkScope, scriptId, correlationId: buildCorrelationId("bulk-script") },
        { onSuccess, onError },
      );
      return;
    }

    forceSyncForScope.mutate(
      {
        scope: bulkScope,
        request: {
          policies: syncPolicies,
          inventory: syncInventory,
          software: syncSoftware,
          appStore: syncAppStore,
        },
        correlationId: buildCorrelationId("bulk-force-sync"),
      },
      { onSuccess, onError },
    );
  };

  const handleCopyCorrelation = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Correlation copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }, []);

  const handleExportCsv = () => {
    if (visibleReports.length === 0) return toast.error("Nada para exportar");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadCsv(`operacoes-${shortId(agentId)}-${stamp}.csv`, buildExecutionsCsv(visibleReports));
    toast.success(`${visibleReports.length} execução(ões) exportada(s)`);
  };

  const columns = useMemo<Column<AutomationExecutionReport>[]>(
    () => [
      {
        key: "status",
        header: "Status",
        sortable: true,
        render: (item) => {
          const meta = executionStatusMeta(item.status);
          return (
            <div className="space-y-1">
              <Badge color={meta.color}>{meta.label}</Badge>
              {meta.pending && <p className="text-xs text-muted">aguardando agent…</p>}
            </div>
          );
        },
      },
      {
        key: "sourceType",
        header: "Origem",
        sortable: true,
        render: (item) => <Badge color="accent">{executionSourceLabel(item.sourceType)}</Badge>,
      },
      {
        key: "target",
        header: "Alvo",
        render: (item) => {
          const target = executionTargetName(item);
          if (target.kind === "none") {
            return <span className="text-xs text-muted">Sincronização técnica</span>;
          }
          return (
            <div className="min-w-0 text-xs">
              <p className="truncate font-medium text-foreground" title={target.name ?? target.id ?? ""}>
                {target.name ?? `(${target.kind} sem nome)`}
              </p>
              <p className="font-mono text-muted" title={target.id ?? ""}>
                {target.kind}: {shortId(target.id)}
              </p>
            </div>
          );
        },
      },
      {
        key: "duration",
        header: "Duração",
        sortable: true,
        sortKey: "createdAt",
        render: (item) => {
          const ack = ackLatencyMs(item);
          return (
            <div className="text-xs">
              <p className="font-medium text-foreground">{formatDuration(executionDurationMs(item))}</p>
              <p className="text-muted">Ack: {formatDuration(ack)}</p>
            </div>
          );
        },
      },
      {
        key: "timestamps",
        header: "Eventos",
        render: (item) => (
          <div className="text-xs text-muted">
            <p>Criado: {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
            <p>Ack: {item.acknowledgedAt ? new Date(item.acknowledgedAt).toLocaleString("pt-BR") : "-"}</p>
            <p>Resultado: {item.resultReceivedAt ? new Date(item.resultReceivedAt).toLocaleString("pt-BR") : "-"}</p>
          </div>
        ),
      },
      {
        key: "result",
        header: "Resultado",
        render: (item) => {
          const decision = wingetDecisionFromMetadata(item.resultMetadataJson);
          return (
            <div className="text-xs">
              <p className="text-foreground">ExitCode: {item.exitCode ?? "-"}</p>
              <p className="text-muted [overflow-wrap:anywhere]">{item.errorMessage || "Sem erro"}</p>
              {decision?.skip && (
                <p className="text-warning" title={decision.reason ?? undefined}>
                  Sem instalação: {decision.reason ?? "pacote já em estado final"}
                  {decision.decidedBy ? ` (${decision.decidedBy})` : ""}
                </p>
              )}
            </div>
          );
        },
      },
      {
        key: "correlation",
        header: "Correlation",
        render: (item) =>
          item.correlationId ? (
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs" title={item.correlationId}>
                {item.correlationId.length > 22
                  ? `${item.correlationId.slice(0, 22)}…`
                  : item.correlationId}
              </span>
              <button
                type="button"
                onClick={() => void handleCopyCorrelation(item.correlationId!)}
                className="rounded p-0.5 text-muted transition-colors hover:text-foreground"
                aria-label="Copiar correlation id"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-xs text-muted">-</span>
          ),
      },
      {
        key: "actions",
        header: "Ações",
        render: (item) =>
          // Execução em voo: cancelar (o comando vira terminal e sai da
          // reentrega). Finalizada: reenviar.
          isExecutionPending(item.status) ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setCancelTarget(item)}
              disabled={!canExecute}
              title={
                canExecute
                  ? "Cancelar esta execução pendente"
                  : "Sem permissão para executar automações"
              }
            >
              <Ban className="h-3.5 w-3.5" />
              Cancelar
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              {canRetryExecution(item) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRetryTarget(item)}
                  disabled={!canExecute}
                  title={
                    canExecute
                      ? "Reenviar esta operação para o agent"
                      : "Sem permissão para executar automações"
                  }
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reenviar
                </Button>
              ) : (
                <span className="text-xs text-muted">-</span>
              )}
            </div>
          ),
      },
    ],
    [canExecute, handleCopyCorrelation],
  );

  const retryLabel = retryTarget ? executionTargetName(retryTarget) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Operações de Automação</h1>
          <p className="text-sm text-muted">
            Execute tarefas/scripts por agent e acompanhe o histórico.
          </p>
        </div>
        {agentId && (
          <Link
            to={`/agents/${agentId}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-hover"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir detalhe do agent
          </Link>
        )}
      </div>

      <Card>
        <CardHeader
          title="Contexto da operação"
          subtitle="Escolha o escopo: um agente, o site inteiro ou o cliente inteiro"
        />

        <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Escopo da operação">
          <span className="text-sm font-medium text-muted-foreground">Escopo:</span>
          <Button
            variant={scopeMode === "agent" ? "primary" : "secondary"}
            size="sm"
            aria-pressed={scopeMode === "agent"}
            onClick={() => setScopeMode("agent")}
          >
            <ServerCog className="h-3.5 w-3.5" />
            Agente único
          </Button>
          <Button
            variant={scopeMode === "site" ? "primary" : "secondary"}
            size="sm"
            aria-pressed={scopeMode === "site"}
            onClick={() => setScopeMode("site")}
          >
            <Layers className="h-3.5 w-3.5" />
            Site inteiro
          </Button>
          <Button
            variant={scopeMode === "client" ? "primary" : "secondary"}
            size="sm"
            aria-pressed={scopeMode === "client"}
            onClick={() => setScopeMode("client")}
          >
            <Building2 className="h-3.5 w-3.5" />
            Cliente inteiro
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Select
            label="Cliente"
            options={clientOptions}
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setSiteId("");
              selectAgent("");
            }}
          />
          <Select
            label="Site"
            options={siteOptions}
            value={siteId}
            disabled={!clientId}
            onChange={(e) => {
              setSiteId(e.target.value);
              selectAgent("");
            }}
          />
          {scopeMode === "agent" ? (
            <Select
              label="Agent"
              options={agentOptions}
              value={agentId}
              disabled={!siteId}
              onChange={(e) => selectAgent(e.target.value)}
            />
          ) : (
            <div className="rounded-xl border border-border bg-surface-light px-3 py-2">
              <p className="text-sm font-medium text-muted-foreground">Alcance</p>
              <p className="text-sm text-foreground">
                {scopeMode === "site" ? "Site inteiro" : "Cliente inteiro"}
              </p>
              <p className="text-xs text-muted">
                {scopeAgents.length} agente(s) · {scopeOnline} online · {scopeOffline} offline
              </p>
            </div>
          )}
        </div>

        {agentId && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-light px-3 py-2 text-sm">
            {currentAgent ? (
              <>
                {currentAgent.isOnline ? (
                  <Wifi className="h-4 w-4 text-success" />
                ) : (
                  <WifiOff className="h-4 w-4 text-muted" />
                )}
                <span className="font-medium text-foreground">
                  {currentAgent.displayName ?? currentAgent.hostname}
                </span>
                <span className="text-muted">{currentAgent.hostname}</span>
                <Badge color={currentAgent.isOnline ? "success" : "slate"}>
                  {currentAgent.isOnline ? "Online" : "Offline"}
                </Badge>
              </>
            ) : (
              <>
                <ServerCog className="h-4 w-4 text-muted" />
                <span className="text-muted">
                  {needsAgentResolution && agentDetail.isLoading
                    ? "Resolvendo agente do link…"
                    : "Agente não encontrado na listagem atual."}
                </span>
              </>
            )}
            <span className="font-mono text-xs text-muted">{agentId}</span>
            {currentAgent && !currentAgent.isOnline && (
              <span className="w-full text-xs text-warning">
                Agent offline: o comando fica na fila e é entregue quando ele reconectar
                (a reentrega roda em segundo plano).
              </span>
            )}
          </div>
        )}

        {scopeMode !== "agent" && (
          <div className="mt-3 rounded-xl border border-border bg-surface-light px-3 py-2 text-xs">
            {!bulkScope && (
              <p className="text-warning">
                {scopeMode === "site"
                  ? "Selecione um cliente e um site para operar o site inteiro."
                  : "Selecione um cliente para operar o cliente inteiro."}
              </p>
            )}
            {bulkScope && (
              <p className="text-muted">
                A operação atinge <strong className="text-foreground">{scopeOnline}</strong>{" "}
                agente(s) online agora
                {scopeOffline > 0 && (
                  <>
                    {" "}e deixa <strong className="text-foreground">{scopeOffline}</strong> na fila
                    para quando reconectarem
                  </>
                )}
                .
              </p>
            )}
          </div>
        )}
        {!canExecute && (
          <p className="mt-2 text-xs text-warning">
            Sua conta não tem permissão de execução de automações — os disparos ficam
            desabilitados.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Run Task Now" subtitle="Disparo imediato de tarefa" />
          <div className="space-y-3">
            <Select label="Tarefa" options={taskOptions} value={taskId} onChange={(e) => setTaskId(e.target.value)} />
            <Button
              className="w-full"
              onClick={() => (scopeMode === "agent" ? handleRunTask() : requestBulk("task", "tarefa"))}
              loading={
                scopeMode === "agent"
                  ? runTaskNow.isPending
                  : runTaskForScope.isPending && pendingBulk?.kind === "task"
              }
              disabled={!canExecute || !canRunInScope || (scopeMode !== "agent" && bulkBusy)}
              title={bulkActionTitle}
            >
              {scopeMode === "agent"
                ? "Executar tarefa"
                : `Executar tarefa (${scopeOnline} online)`}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Run Script Now" subtitle="Disparo imediato de script" />
          <div className="space-y-3">
            <Select label="Script" options={scriptOptions} value={scriptId} onChange={(e) => setScriptId(e.target.value)} />
            <Button
              className="w-full"
              onClick={() => (scopeMode === "agent" ? handleRunScript() : requestBulk("script", "script"))}
              loading={
                scopeMode === "agent"
                  ? runScriptNow.isPending
                  : runScriptForScope.isPending && pendingBulk?.kind === "script"
              }
              disabled={!canExecute || !canRunInScope || (scopeMode !== "agent" && bulkBusy)}
              title={bulkActionTitle}
            >
              {scopeMode === "agent"
                ? "Executar script"
                : `Executar script (${scopeOnline} online)`}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Force Sync" subtitle="Sincronização técnica sob demanda" />
          <div className="space-y-3">
            <Select
              label="Policies"
              options={BOOL_OPTIONS}
              value={String(syncPolicies)}
              onChange={(e) => setSyncPolicies(e.target.value === "true")}
            />
            <Select
              label="Inventory"
              options={BOOL_OPTIONS}
              value={String(syncInventory)}
              onChange={(e) => setSyncInventory(e.target.value === "true")}
            />
            <Select
              label="Software"
              options={BOOL_OPTIONS}
              value={String(syncSoftware)}
              onChange={(e) => setSyncSoftware(e.target.value === "true")}
            />
            <Select
              label="AppStore"
              options={BOOL_OPTIONS}
              value={String(syncAppStore)}
              onChange={(e) => setSyncAppStore(e.target.value === "true")}
            />
            <Button
              className="w-full"
              onClick={() =>
                scopeMode === "agent" ? handleForceSync() : requestBulk("force-sync", "force sync")
              }
              loading={
                scopeMode === "agent"
                  ? forceSync.isPending
                  : forceSyncForScope.isPending && pendingBulk?.kind === "force-sync"
              }
              disabled={!canExecute || !canRunInScope || (scopeMode !== "agent" && bulkBusy)}
              title={bulkActionTitle}
            >
              {scopeMode === "agent"
                ? "Executar force sync"
                : `Force sync (${scopeOnline} online)`}
            </Button>
            <p className="text-xs text-muted">
              As opções são enviadas ao agent — desmarcar tudo não dispara nada.
            </p>
          </div>
        </Card>
      </div>

      {bulkResult && (
        <Card>
          <CardHeader
            title="Resultado do último lote"
            subtitle={`${bulkResult.scope === "site" ? "Site" : "Cliente"} ${shortId(bulkResult.scopeId)} · correlation ${bulkResult.correlationId}`}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={CheckCircle2} label="Enviados agora" value={bulkResult.dispatched} tone="success" />
            <StatCard icon={Clock} label="Na fila (offline)" value={bulkResult.queued} tone="accent" />
            <StatCard icon={XCircle} label="Falhas" value={bulkResult.failed} tone="warning" />
            <StatCard
              icon={WifiOff}
              label="Ignorados"
              value={bulkResult.skippedOffline + bulkResult.skippedMaintenance}
              tone="primary"
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            {bulkResult.totalAgents} agente(s) no escopo · {bulkResult.eligibleAgents} receberam o
            comando (agora ou na reconexão). Cada disparo gera uma execução no histórico do
            respectivo agente com a mesma correlation do lote.
            {bulkResult.skippedMaintenance > 0 && (
              <> {bulkResult.skippedMaintenance} em manutenção foram excluídos.</>
            )}
            {bulkResult.skippedOffline > 0 && (
              <> {bulkResult.skippedOffline} offline não receberam porque a reentrega está desativada.</>
            )}
          </p>
          {bulkResult.failed > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {bulkResult.items
                .filter((item) => item.status === "failed")
                .slice(0, 20)
                .map((item) => (
                  <li key={item.agentId} className="text-danger">
                    <span className="font-medium">{item.hostname}</span>: {item.error}
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-3 flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => setBulkResult(null)}>
              Fechar resultado
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Histórico de execuções"
          subtitle={
            agentId
              ? `${summary.total} execução(ões) · ${summary.pending} em andamento`
              : "Selecione um agent para consultar"
          }
        />

        {scopeMode !== "agent" && (
          <p className="mb-3 text-xs text-muted">
            O histórico é por agente: selecione “Agente único” e escolha a máquina para ver os
            resultados do lote.
          </p>
        )}

        {!agentId && <p className="text-sm text-muted">Nenhum agent selecionado.</p>}

        {agentId && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Activity}
                label={`Execuções (máx. ${limit})`}
                value={summary.total}
                tone="primary"
                active={!onlyFailures && !onlyPending}
                onClick={() => {
                  clearQuickFilters();
                  setStatusFilter("");
                }}
              />
              <StatCard
                icon={RefreshCw}
                label="Em andamento"
                value={summary.pending}
                tone="accent"
                active={onlyPending}
                onClick={handleTogglePending}
              />
              <StatCard
                icon={XCircle}
                label="Falhas"
                value={summary.failed}
                tone="warning"
                active={onlyFailures}
                onClick={handleToggleFailures}
              />
              <StatCard
                icon={CheckCircle2}
                label="Sucesso"
                value={
                  summary.completed + summary.failed === 0
                    ? "—"
                    : `${Math.round(summary.successRate * 100)}%`
                }
                tone="success"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              <Input
                label="Buscar"
                placeholder="Tarefa, script, correlation, erro…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select
                label="Status"
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              />
              <Select
                label="Origem"
                options={SOURCE_OPTIONS}
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              />
              <Select
                label="Alvo"
                options={targetOptions}
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value)}
              />
              <Select
                label="Limite"
                options={LIMIT_OPTIONS}
                value={String(limit)}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleToggleFailures} aria-pressed={onlyFailures}>
                  <XCircle className="h-3.5 w-3.5" />
                  Somente falhas
                </Button>
                <Button variant="secondary" size="sm" onClick={handleTogglePending} aria-pressed={onlyPending}>
                  <Clock className="h-3.5 w-3.5" />
                  Somente em andamento
                </Button>
                {summary.pending > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Atualizando a cada 3s
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => void executions.refetch()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Atualizar
                </Button>
                <Button variant="secondary" size="sm" onClick={handleExportCsv}>
                  <Download className="h-3.5 w-3.5" />
                  Exportar CSV
                </Button>
              </div>
            </div>

            {reports.length >= limit && (
              <p className="text-xs text-muted">
                Exibindo as {limit} execuções mais recentes — aumente o limite para ver
                o histórico anterior.
              </p>
            )}

            {executions.isLoading && <Loading message="Carregando execuções..." />}
            {executions.isError && <ErrorDisplay onRetry={() => void executions.refetch()} />}
            {!executions.isLoading && !executions.isError && (
              <DataTable
                columns={columns}
                data={visibleReports}
                keyExtractor={(item) => item.id}
                emptyMessage={
                  reports.length > 0
                    ? "Nenhuma execução corresponde aos filtros."
                    : "Nenhuma execução encontrada."
                }
              />
            )}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={retryTarget !== null}
        title="Reenviar operação"
        tone="primary"
        confirmLabel="Confirmar reenvio"
        message={
          retryLabel && retryLabel.kind !== "none" ? (
            <>
              Reenviar a {retryLabel.kind === "task" ? "tarefa" : "script"}{" "}
              <strong>{retryLabel.name ?? retryLabel.id}</strong> para o agent selecionado?
            </>
          ) : (
            "Reenviar esta operação para o agent selecionado?"
          )
        }
        isLoading={runTaskNow.isPending || runScriptNow.isPending}
        onConfirm={handleRetry}
        onClose={() => setRetryTarget(null)}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancelar execução"
        confirmLabel="Cancelar execução"
        message={
          <>
            Cancelar a execução{" "}
            <strong className="font-mono text-xs">{cancelTarget?.id.slice(0, 8)}</strong>?
            <br />
            <span className="text-muted">
              O comando não será mais entregue (sai da reentrega automática). Se o agent já
              começou a executar, a execução em si não é interrompida.
            </span>
          </>
        }
        isLoading={cancelExecution.isPending}
        onConfirm={handleConfirmCancel}
        onClose={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        open={pendingBulk !== null}
        title="Confirmar operação em massa"
        tone="primary"
        confirmLabel="Executar no escopo"
        message={
          pendingBulk ? (
            <>
              Executar <strong>{pendingBulk.label}</strong> em{" "}
              <strong>
                {scopeMode === "site"
                  ? siteOptions.find((option) => option.value === siteId)?.label ?? "site"
                  : clientOptions.find((option) => option.value === clientId)?.label ?? "cliente"}
              </strong>{" "}
              ({scopeMode === "site" ? "site inteiro" : "cliente inteiro"})?
              <br />
              <span className="text-muted">
                {scopeOnline} agente(s) online recebem agora
                {scopeOffline > 0
                  ? ` · ${scopeOffline} offline entram na fila e recebem quando reconectarem.`
                  : "."}
              </span>
            </>
          ) : null
        }
        isLoading={bulkPending}
        onConfirm={handleConfirmBulk}
        onClose={() => setPendingBulk(null)}
      />
    </div>
  );
}
