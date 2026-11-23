import { useState } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { Badge, Button, ErrorDisplay, Icon, Loading, Modal } from "@/components/ui";
import {
  AutomationNotificationMode,
  type AutomationTaskDetail,
  type AutomationTaskSummary,
} from "@/api";
import { formatDateTime } from "@/utils/format";
import { useAutomationTaskExecutions, useAutomationTaskTargetPreview } from "@/hooks/useAutomation";
import { executionStatusMeta, executionSourceLabel } from "@/modules/automation/executionUtils";
import {
  actionLabel,
  notificationModeFromTask,
  notificationModeLabel,
  packageNoticeFrom,
  scopeLabel,
  toastTimingLabel,
} from "./automationTasksUtils";

interface AutomationTaskDetailModalProps {
  taskId: string | null;
  task: AutomationTaskDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onClose: () => void;
  onEdit: (task: AutomationTaskDetail) => void;
  onRestore: (task: AutomationTaskSummary) => void;
  canEdit: boolean;
  canExecute: boolean;
  scopeDisplayName: (item: Pick<AutomationTaskSummary, "scopeType" | "scopeId" | "scopeName" | "clientName" | "siteName" | "agentName">) => string;
  isTaskDeleted: (task: AutomationTaskSummary | null | undefined) => boolean;
}

type DetailTab = "summary" | "targets" | "executions";

export function AutomationTaskDetailModal({
  taskId,
  task,
  isLoading,
  isError,
  onRetry,
  onClose,
  onEdit,
  onRestore,
  canEdit,
  canExecute,
  scopeDisplayName,
  isTaskDeleted,
}: AutomationTaskDetailModalProps) {
  const inRouter = useInRouterContext();
  const [activeTab, setActiveTab] = useState<DetailTab>("summary");

  const targetsQuery = useAutomationTaskTargetPreview(
    taskId ?? "",
    Boolean(taskId) && activeTab === "targets",
  );
  const executionsQuery = useAutomationTaskExecutions(
    taskId ?? "",
    50,
    Boolean(taskId) && activeTab === "executions",
  );

  const handleClose = () => {
    setActiveTab("summary");
    onClose();
  };

  return (
    <Modal
      open={!!taskId}
      onClose={handleClose}
      title="Detalhes da tarefa"
      maxWidth="max-w-4xl"
    >
      {isLoading && <Loading message="Carregando detalhes..." />}
      {isError && <ErrorDisplay onRetry={onRetry} />}
      {task && !isLoading && (() => {
        const d = task;
        const detailIsDeleted = isTaskDeleted(d);
        const detailNotificationMode = notificationModeFromTask(d.notificationMode, d.requiresApproval);
        const detailPackageNotice = packageNoticeFrom(d);

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 space-y-1">
                <h3 className="text-lg font-semibold text-foreground">{d.name}</h3>
                {d.description && <p className="text-sm text-muted">{d.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Badge color={detailIsDeleted ? "danger" : d.isActive ? "success" : "slate"}>
                  {detailIsDeleted ? "Excluida" : d.isActive ? "Ativa" : "Inativa"}
                </Badge>
                <Badge
                  color={
                    detailNotificationMode === AutomationNotificationMode.Silent
                      ? "slate"
                      : detailNotificationMode === AutomationNotificationMode.Prompt
                        ? "warning"
                        : "accent"
                  }
                >
                  {notificationModeLabel(detailNotificationMode)}
                </Badge>
                {detailPackageNotice && <Badge color="warning">Fora da App Store</Badge>}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 border-b border-border pb-2" role="tablist">
              {(
                [
                  { id: "summary", label: "Resumo", icon: "info" },
                  { id: "targets", label: "Agentes Alvo (Prévia)", icon: "devices" },
                  { id: "executions", label: "Execuções Recentes", icon: "history" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? "bg-primary/20 text-primary-100 border border-primary/40"
                      : "text-muted hover:bg-surface-hover hover:text-foreground border border-transparent"
                  }`}
                >
                  <Icon name={tab.icon} className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "summary" && (
              <>
                {detailPackageNotice && (
                  <div
                    role="alert"
                    className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground"
                  >
                    <p className="font-medium">Pacote fora da App Store aprovada</p>
                    <p className="mt-1 text-muted">{detailPackageNotice}</p>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg bg-surface-light border border-border p-3">
                    <p className="text-xs text-muted mb-1">Ação</p>
                    <Badge color="primary">{actionLabel(d.actionType)}</Badge>
                    <p className="text-xs text-muted mt-1">Ordem de execução: {d.executionOrder}</p>
                    {d.installationType !== null && d.installationType !== undefined && (
                      <p className="text-xs text-muted mt-1">{d.installationType === 0 ? "Winget" : d.installationType === 1 ? "Chocolatey" : "Custom"}</p>
                    )}
                    {d.packageId && (
                      <p className="font-mono text-xs text-muted-foreground mt-1 truncate">{d.packageId}</p>
                    )}
                  </div>

                  <div className="rounded-lg bg-surface-light border border-border p-3">
                    <p className="text-xs text-muted mb-1">Escopo</p>
                    <p className="text-sm text-foreground">{scopeLabel(d.scopeType)}</p>
                    <p className="text-xs text-muted truncate" title={d.scopeId || undefined}>
                      {scopeDisplayName(d)}
                    </p>
                    {d.clientName && d.clientName !== scopeDisplayName(d) && (
                      <p className="text-xs text-muted truncate">Cliente: {d.clientName}</p>
                    )}
                    {d.siteName && d.siteName !== scopeDisplayName(d) && (
                      <p className="text-xs text-muted truncate">Site: {d.siteName}</p>
                    )}
                  </div>

                  <div className="rounded-lg bg-surface-light border border-border p-3">
                    <p className="text-xs text-muted mb-1">Triggers</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {d.triggerImmediate && <Badge color="accent">Imediato</Badge>}
                      {d.triggerRecurring && <Badge color="accent">Recorrente</Badge>}
                      {d.triggerOnUserLogin && <Badge color="accent">Login</Badge>}
                      {d.triggerOnAgentCheckIn && <Badge color="accent">Check-in</Badge>}
                    </div>
                    {d.scheduleCron && <p className="font-mono text-xs text-muted mt-1">{d.scheduleCron}</p>}
                  </div>

                  <div className="rounded-lg bg-surface-light border border-border p-3">
                    <p className="text-xs text-muted mb-1">Notificação ao usuário</p>
                    {detailNotificationMode === AutomationNotificationMode.Prompt ? (
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">Prompt nativo (Continuar/Adiar)</p>
                        <p className="text-xs text-muted">
                          {d.allowDefer === false ? "Não pode adiar" : "Pode adiar"} · ação padrão em{" "}
                          {d.promptTimeoutSeconds ?? 60}s
                        </p>
                        {!!(d.closeProcesses?.length) && (
                          <p className="text-xs text-muted truncate" title={(d.closeProcesses ?? []).join(", ")}>
                            Fecha: {(d.closeProcesses ?? []).join(", ")}
                          </p>
                        )}
                      </div>
                    ) : detailNotificationMode === AutomationNotificationMode.Toast ? (
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">Toast na interface do agent</p>
                        <p className="text-xs text-muted">
                          {toastTimingLabel(d.toastTiming)} · sem interação do usuário
                        </p>
                      </div>
                    ) : detailNotificationMode === AutomationNotificationMode.NativeToast ? (
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">Toast nativo do app</p>
                        <p className="text-xs text-muted">
                          {toastTimingLabel(d.toastTiming)} · notificação do Windows/Action Center
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">Execução silenciosa</p>
                    )}
                  </div>
                </div>

                {(d.includeTags?.length > 0 || d.excludeTags?.length > 0) && (
                  <div className="rounded-lg bg-surface-light border border-border p-3">
                    <p className="text-xs text-muted mb-2">Tags de filtragem</p>
                    {d.includeTags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        <span className="text-xs text-muted">Include:</span>
                        {d.includeTags.map((t) => <Badge key={t} color="success">{t}</Badge>)}
                      </div>
                    )}
                    {d.excludeTags?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs text-muted">Exclude:</span>
                        {d.excludeTags.map((t) => <Badge key={t} color="danger">{t}</Badge>)}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-xs text-muted">
                  <p>Criado: {formatDateTime(d.createdAt)}</p>
                  <p>Atualizado: {formatDateTime(d.updatedAt)}</p>
                </div>
              </>
            )}

            {activeTab === "targets" && (
              <div className="space-y-3">
                {targetsQuery.isLoading && <Loading message="Calculando agentes atingidos..." />}
                {targetsQuery.isError && <ErrorDisplay onRetry={() => void targetsQuery.refetch()} />}
                {targetsQuery.data && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-xs">
                      <span className="text-foreground font-medium">
                        {targetsQuery.data.total} agente(s) elegível(is) no escopo atual
                      </span>
                      <span className="text-muted">
                        Exibindo {targetsQuery.data.items.length} de {targetsQuery.data.total}
                      </span>
                    </div>
                    {targetsQuery.data.items.length === 0 ? (
                      <p className="text-sm text-muted">Nenhum agente corresponde ao escopo e às tags desta tarefa.</p>
                    ) : (
                      <div className="max-h-72 space-y-1.5 overflow-y-auto">
                        {targetsQuery.data.items.map((agent) => (
                          <div
                            key={agent.agentId}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">
                                {agent.displayName ?? agent.hostname}
                              </p>
                              <p className="font-mono text-muted truncate">{agent.hostname}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {agent.agentTags.map((tag) => (
                                <Badge key={tag} color="slate">{tag}</Badge>
                              ))}
                              {inRouter && (
                                <Link
                                  to={`/agents/${agent.agentId}`}
                                  className="text-primary hover:underline ml-1"
                                  onClick={handleClose}
                                >
                                  Abrir
                                </Link>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === "executions" && (
              <div className="space-y-3">
                {executionsQuery.isLoading && <Loading message="Carregando execuções da tarefa..." />}
                {executionsQuery.isError && <ErrorDisplay onRetry={() => void executionsQuery.refetch()} />}
                {executionsQuery.data && (
                  executionsQuery.data.length === 0 ? (
                    <p className="text-sm text-muted">Nenhuma execução registrada para esta tarefa.</p>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                      {executionsQuery.data.map((exec) => {
                        const meta = executionStatusMeta(exec.status);
                        return (
                          <div
                            key={exec.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-light px-3 py-2 text-xs"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge color={meta.color}>{meta.label}</Badge>
                                <Badge color="accent">{executionSourceLabel(exec.sourceType)}</Badge>
                                <span className="font-mono text-muted">Exit: {exec.exitCode ?? "-"}</span>
                              </div>
                              <p className="text-muted">
                                Agent: <span className="font-mono">{exec.agentId.slice(0, 8)}</span> · {formatDateTime(exec.createdAt)}
                              </p>
                              {exec.errorMessage && <p className="text-danger">{exec.errorMessage}</p>}
                              {exec.skipReason && (
                                <p className="text-warning">
                                  Ignorado: {exec.skipReason}{exec.decidedBy ? ` (${exec.decidedBy})` : ""}
                                </p>
                              )}
                            </div>
                            {inRouter && (
                              <Link
                                to={`/automation/operations?agentId=${exec.agentId}`}
                                className="text-primary hover:underline shrink-0"
                                onClick={handleClose}
                              >
                                Ver no agent
                              </Link>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {inRouter && canExecute && !detailIsDeleted && d.isActive && (
                <Link to={`/automation/operations?taskId=${d.id}`} onClick={handleClose}>
                  <Button type="button" variant="secondary">
                    <Icon name="play_arrow" className="h-4 w-4" /> Executar agora
                  </Button>
                </Link>
              )}
              {detailIsDeleted && canEdit && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    handleClose();
                    onRestore(d);
                  }}
                >
                  Reativar
                </Button>
              )}
              {canEdit && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={detailIsDeleted}
                  onClick={() => {
                    handleClose();
                    onEdit(d);
                  }}
                >
                  Editar
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={handleClose}>
                Fechar
              </Button>
            </div>
          </div>
        );
      })()}
    </Modal>
  );
}
