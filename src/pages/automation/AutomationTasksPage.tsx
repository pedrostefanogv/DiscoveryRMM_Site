import { useEffect, useMemo, useState } from "react";
import { useInRouterContext, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ContextMenu,
  type ContextMenuItem,
  DataTable,
  type Column,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  Select,
} from "@/components/ui";
import { useAuthorization } from "@/auth/authorization";
import { AutomationSubnav } from "./AutomationSubnav";
import { AutomationAuditList } from "./AutomationAuditList";
import { AutomationTaskDetailModal } from "./AutomationTaskDetailModal";
import { TaskFormModal } from "./components/TaskFormModal";
import {
  AppApprovalScopeType,
  AutomationNotificationMode,
  automationApi,
  type AutomationTaskDetail,
  type AutomationTaskSummary,
} from "@/api";
import {
  actionDisplayLabel,
  buildCorrelationId,
  normalizeActionType,
  normalizeScopeType,
  notificationModeFromTask,
  scopeLabel,
  toastTimingLabel,
} from "./automationTasksUtils";
import {
  TASK_ACTION_FILTERS,
  TASK_STATUS_FILTERS,
  TASK_TRIGGER_FILTERS,
  buildTaskScopeFilter,
  statusFilterToIsActive,
  toggleFilterValue,
  type TaskStatusFilterValue,
} from "./automationTaskFilters";
import {
  useAutomationKnownTags,
  useAutomationTask,
  useAutomationTaskAudit,
  useAutomationTasks,
  useDeleteAutomationTask,
  useRestoreAutomationTask,
  useUpdateAutomationTask,
} from "@/hooks/useAutomation";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useAgentsBySite } from "@/hooks/useAgents";
import { formatDateTime } from "@/utils/format";

/** Texto usado para ordenar a coluna Notificação (igual ao badge renderizado). */
function notificationSortLabel(item: AutomationTaskSummary): string {
  const mode = notificationModeFromTask(item.notificationMode, item.requiresApproval);
  if (mode === AutomationNotificationMode.Prompt) return "Prompt nativo";
  if (mode === AutomationNotificationMode.Toast) return "Toast (agent)";
  if (mode === AutomationNotificationMode.NativeToast) return "Toast nativo";
  return "Silenciosa";
}

/** Grupo de chips de seleção múltipla usado nos filtros rápidos. */
function FilterChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? "border-primary/60 bg-primary/20 text-primary-100"
                  : "border-border bg-surface-light text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
              onClick={() => onToggle(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function scopeDisplayName(
  item: Pick<
    AutomationTaskSummary,
    "scopeType" | "scopeId" | "scopeName" | "clientName" | "siteName" | "agentName"
  >,
): string {
  const scope = normalizeScopeType(item.scopeType);
  if (scope === AppApprovalScopeType.Global) return "Global";
  return item.scopeName || item.clientName || item.siteName || item.agentName || item.scopeId || "-";
}

export default function AutomationTasksPage() {
  const inRouter = useInRouterContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    canCreateAutomation,
    canEditAutomation,
    canDeleteAutomation,
    canExecuteAutomation,
  } = useAuthorization();

  const initialStatusParam = searchParams.get("status");
  const initialStatus: TaskStatusFilterValue =
    initialStatusParam === "active" || initialStatusParam === "inactive" ? initialStatusParam : "";
  const initialScopeParam = searchParams.get("scopeType") ?? "";

  const [listMode, setListMode] = useState<"default" | "all" | "deleted">("default");
  const [searchFilter, setSearchFilter] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(Boolean(initialScopeParam));
  const [scopeTypeFilter, setScopeTypeFilter] = useState(initialScopeParam);
  const [filterClientId, setFilterClientId] = useState("");
  const [filterSiteId, setFilterSiteId] = useState("");
  const [filterAgentId, setFilterAgentId] = useState("");
  const [filterActionTypes, setFilterActionTypes] = useState<string[]>([]);
  const [filterTriggers, setFilterTriggers] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<TaskStatusFilterValue>(initialStatus);
  const [filterLabels, setFilterLabels] = useState<string[]>([]);
  const [filterLabelSearch, setFilterLabelSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationTaskSummary | null>(null);
  const [editingId, setEditingId] = useState("");
  const [duplicateSource, setDuplicateSource] = useState<
    AutomationTaskSummary | AutomationTaskDetail | null
  >(null);

  const [auditTaskId, setAuditTaskId] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [deleteTask, setDeleteTask] = useState<AutomationTaskSummary | null>(null);
  const [restoreTask, setRestoreTask] = useState<AutomationTaskSummary | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: AutomationTaskSummary;
  } | null>(null);

  useEffect(() => {
    if (searchParams.get("new") === "1" && canCreateAutomation) {
      setEditing(null);
      setEditingId("");
      setDuplicateSource(null);
      setFormOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, canCreateAutomation, setSearchParams]);

  const cursor = pageCursors[page - 1];

  const scopeFilter = buildTaskScopeFilter(
    scopeTypeFilter,
    filterClientId,
    filterSiteId,
    filterAgentId,
  );

  const list = useAutomationTasks({
    search: searchFilter.trim() || undefined,
    clientId: scopeFilter.clientId,
    siteId: scopeFilter.siteId,
    agentId: scopeFilter.agentId,
    actionTypes: filterActionTypes.length ? filterActionTypes : undefined,
    triggers: filterTriggers.length ? filterTriggers : undefined,
    isActive: statusFilterToIsActive(filterStatus),
    labels: filterLabels.length ? filterLabels : undefined,
    scopeType: scopeFilter.scopeType,
    scopeId: scopeFilter.scopeId,
    activeOnly: false,
    deletedOnly: listMode === "deleted" ? true : undefined,
    includeDeleted: listMode === "all" ? true : undefined,
    cursor,
    limit,
  });

  const knownTags = useAutomationKnownTags();
  const availableKnownFilterLabels = useMemo(
    () =>
      (knownTags.data ?? []).filter((tag) =>
        filterLabelSearch.trim()
          ? tag.toLowerCase().includes(filterLabelSearch.trim().toLowerCase())
          : true,
      ),
    [knownTags.data, filterLabelSearch],
  );
  const clients = useClients();
  const advancedSites = useSites(filterClientId);
  const advancedAgents = useAgentsBySite(filterSiteId);
  const updateMutation = useUpdateAutomationTask();
  const deleteMutation = useDeleteAutomationTask();
  const restoreMutation = useRestoreAutomationTask();
  const auditQuery = useAutomationTaskAudit(auditTaskId ?? "", 50, !!auditTaskId);
  const detailTask = useAutomationTask(detailTaskId ?? "");

  const canPrev = page > 1 && !list.isFetching;
  const canNext = Boolean(list.data?.hasMore && list.data?.nextCursor) && !list.isFetching;

  const goToNextPage = () => {
    if (!list.data?.nextCursor) return;
    setPageCursors((prev) => {
      const next = [...prev];
      next[page] = list.data!.nextCursor!;
      return next;
    });
    setPage((p) => p + 1);
  };

  const goToPrevPage = () => {
    setPage((p) => Math.max(1, p - 1));
  };

  const resetPagination = () => {
    setPage(1);
    setPageCursors([undefined]);
  };

  const clearFilters = () => {
    setListMode("default");
    setLimit(20);
    setSearchFilter("");
    setScopeTypeFilter("");
    setFilterClientId("");
    setFilterSiteId("");
    setFilterAgentId("");
    setFilterActionTypes([]);
    setFilterTriggers([]);
    setFilterStatus("");
    setFilterLabels([]);
    setFilterLabelSearch("");
    resetPagination();
  };

  const hasActiveFilters = Boolean(
    listMode !== "default" ||
      limit !== 20 ||
      searchFilter.trim() ||
      scopeTypeFilter ||
      filterClientId ||
      filterSiteId ||
      filterAgentId ||
      filterActionTypes.length ||
      filterTriggers.length ||
      filterStatus ||
      filterLabels.length,
  );

  const advancedFilterCount = [
    listMode !== "default",
    Boolean(scopeTypeFilter),
    limit !== 20,
    Boolean(filterClientId),
    Boolean(filterSiteId),
    Boolean(filterAgentId),
    filterLabels.length > 0,
  ].filter(Boolean).length;

  const closeDeleteModal = () => {
    if (deleteMutation.isPending) return;
    setDeleteTask(null);
  };

  const closeRestoreModal = () => {
    if (restoreMutation.isPending) return;
    setRestoreTask(null);
  };

  const handleConfirmDelete = () => {
    if (!deleteTask) return;

    deleteMutation.mutate(
      {
        id: deleteTask.id,
        reason: "confirmed-via-modal",
        correlationId: buildCorrelationId("task-delete"),
      },
      {
        onSuccess: () => {
          toast.success("Tarefa excluída");
          closeDeleteModal();
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Falha ao excluir tarefa";
          toast.error(message);
        },
      },
    );
  };

  const handleConfirmRestore = () => {
    if (!restoreTask) return;

    restoreMutation.mutate(
      {
        id: restoreTask.id,
        reason: "confirmed-via-modal",
        correlationId: buildCorrelationId("task-restore"),
      },
      {
        onSuccess: () => {
          toast.success("Tarefa reativada");
          closeRestoreModal();
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Falha ao reativar tarefa";
          toast.error(message);
        },
      },
    );
  };

  const isTaskDeleted = (task: AutomationTaskSummary | null | undefined) => {
    if (!task) return false;
    if (task.isDeleted === true) return true;
    return Boolean(task.deletedAt);
  };

  const addFilterLabel = (rawTag: string) => {
    const tag = rawTag.trim();
    if (!tag) return;
    setFilterLabels((prev) => {
      if (prev.some((item) => item.toLowerCase() === tag.toLowerCase())) {
        return prev;
      }
      return [...prev, tag];
    });
  };

  const removeFilterLabel = (tag: string) => {
    setFilterLabels((prev) => prev.filter((item) => item.toLowerCase() !== tag.toLowerCase()));
  };

  const openNewModal = () => {
    setEditing(null);
    setEditingId("");
    setDuplicateSource(null);
    setFormOpen(true);
  };

  const openEditFor = (item: AutomationTaskSummary) => {
    setDuplicateSource(null);
    setEditing(item);
    setEditingId(item.id);
    setFormOpen(true);
  };

  const openDuplicateFor = async (item: AutomationTaskSummary) => {
    let source: AutomationTaskSummary | AutomationTaskDetail = item;
    try {
      source = await automationApi.getTask(item.id);
    } catch {
      // Fallback para o resumo se o GET detalhado falhar.
    }
    setEditing(null);
    setEditingId("");
    setDuplicateSource(source);
    setFormOpen(true);
  };

  const toggleActiveQuick = async (item: AutomationTaskSummary) => {
    const nextActive = !item.isActive;
    try {
      const detail = await automationApi.getTask(item.id);
      updateMutation.mutate(
        {
          id: item.id,
          data: {
            name: detail.name,
            description: detail.description ?? "",
            actionType: normalizeActionType(detail.actionType),
            installationType: detail.installationType as never,
            packageId: detail.packageId,
            scriptId: detail.scriptId,
            commandPayload: detail.commandPayload,
            scopeType: normalizeScopeType(detail.scopeType),
            scopeId: detail.scopeId,
            includeTags: detail.includeTags,
            excludeTags: detail.excludeTags,
            triggerImmediate: detail.triggerImmediate,
            triggerRecurring: detail.triggerRecurring,
            triggerOnUserLogin: detail.triggerOnUserLogin,
            triggerOnAgentCheckIn: detail.triggerOnAgentCheckIn,
            scheduleCron: detail.scheduleCron,
            requiresApproval: detail.requiresApproval,
            isActive: nextActive,
          },
          correlationId: buildCorrelationId("task-toggle"),
        },
        {
          onSuccess: () => {
            toast.success(nextActive ? "Tarefa ativada" : "Tarefa desativada");
          },
          onError: (error) => {
            const message =
              error instanceof Error ? error.message : "Falha ao alterar status da tarefa";
            toast.error(message);
          },
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao carregar tarefa para alterar status";
      toast.error(message);
    }
  };

  const buildRowContextMenuItems = (item: AutomationTaskSummary): ContextMenuItem[] => {
    const deleted = isTaskDeleted(item);
    const items: ContextMenuItem[] = [
      {
        key: "details",
        label: "Ver detalhes",
        icon: <Icon name="visibility" className="h-4 w-4" />,
        onClick: () => setDetailTaskId(item.id),
      },
    ];
    if (inRouter && canExecuteAutomation && !deleted && item.isActive) {
      items.push({
        key: "run",
        label: "Executar agora",
        icon: <Icon name="play_arrow" className="h-4 w-4" />,
        onClick: () => navigate(`/automation/operations?taskId=${item.id}`),
      });
    }
    if (canEditAutomation) {
      items.push({
        key: "edit",
        label: "Editar",
        icon: <Icon name="edit" className="h-4 w-4" />,
        disabled: deleted,
        onClick: () => openEditFor(item),
      });
      if (!deleted) {
        items.push({
          key: "toggle-active",
          label: item.isActive ? "Desativar" : "Ativar",
          icon: <Icon name={item.isActive ? "close" : "play_circle"} className="h-4 w-4" />,
          onClick: () => void toggleActiveQuick(item),
        });
      }
    }
    if (canCreateAutomation && !deleted) {
      items.push({
        key: "duplicate",
        label: "Duplicar",
        icon: <Icon name="content_copy" className="h-4 w-4" />,
        onClick: () => void openDuplicateFor(item),
      });
    }
    items.push({
      key: "audit",
      label: "Auditoria",
      icon: <Icon name="article" className="h-4 w-4" />,
      onClick: () => setAuditTaskId(item.id),
    });
    if (deleted && canEditAutomation) {
      items.push({
        key: "restore",
        label: "Reativar",
        icon: <Icon name="restart_alt" className="h-4 w-4" />,
        onClick: () => setRestoreTask(item),
      });
    } else if (!deleted && canDeleteAutomation) {
      items.push({
        key: "delete",
        label: "Excluir",
        icon: <Icon name="delete" className="h-4 w-4" />,
        danger: true,
        separatorBefore: true,
        onClick: () => setDeleteTask(item),
      });
    }
    return items;
  };

  const columns = useMemo<Column<AutomationTaskSummary>[]>(
    () => [
      {
        key: "name",
        header: "Nome",
        sortValue: (item) => item.name,
        render: (item) => (
          <div>
            <p className="font-medium text-foreground">{item.name}</p>
            <p className="text-xs text-muted">
              {item.description || "Sem descrição"}
              {item.key ? (
                <span className="ml-1.5 font-mono text-[11px] opacity-75">· {item.key}</span>
              ) : null}
            </p>
          </div>
        ),
      },
      {
        key: "action",
        header: "Ação",
        sortValue: (item) => actionDisplayLabel(item.actionType),
        render: (item) => <Badge color="primary">{actionDisplayLabel(item.actionType)}</Badge>,
      },
      {
        key: "executionOrder",
        header: "Ordem",
        sortValue: (item) => item.executionOrder,
        render: (item) => <Badge color="slate">{item.executionOrder}</Badge>,
      },
      {
        key: "scope",
        header: "Escopo",
        sortValue: (item) => `${scopeLabel(item.scopeType)} ${scopeDisplayName(item)}`,
        render: (item) => (
          <div>
            <p className="text-sm text-foreground">{scopeLabel(item.scopeType)}</p>
            <p className="text-xs text-muted" title={item.scopeId || undefined}>
              {scopeDisplayName(item)}
            </p>
          </div>
        ),
      },
      {
        key: "notify",
        header: "Notificação",
        sortValue: (item) => notificationSortLabel(item),
        render: (item) => {
          const mode = notificationModeFromTask(item.notificationMode, item.requiresApproval);
          if (mode === AutomationNotificationMode.Prompt) {
            return (
              <div className="space-y-0.5">
                <Badge color="warning">Prompt nativo</Badge>
                <p className="text-xs text-muted">
                  {item.allowDefer === false ? "sem adiar" : "pode adiar"} ·{" "}
                  {item.promptTimeoutSeconds ?? 60}s
                </p>
              </div>
            );
          }
          if (mode === AutomationNotificationMode.Toast) {
            return (
              <div className="space-y-0.5">
                <Badge color="accent">Toast (agent)</Badge>
                <p className="text-xs text-muted">{toastTimingLabel(item.toastTiming)}</p>
              </div>
            );
          }
          if (mode === AutomationNotificationMode.NativeToast) {
            return (
              <div className="space-y-0.5">
                <Badge color="accent">Toast nativo</Badge>
                <p className="text-xs text-muted">{toastTimingLabel(item.toastTiming)}</p>
              </div>
            );
          }
          return <Badge color="slate">Silenciosa</Badge>;
        },
      },
      {
        key: "status",
        header: "Status",
        sortValue: (item) => (isTaskDeleted(item) ? 2 : item.isActive ? 0 : 1),
        render: (item) => {
          const deleted = isTaskDeleted(item);
          return (
            <Badge color={deleted ? "danger" : item.isActive ? "success" : "slate"}>
              {deleted ? "Excluída" : item.isActive ? "Ativa" : "Inativa"}
            </Badge>
          );
        },
      },
      {
        key: "updated",
        header: "Atualizado",
        sortValue: (item) => Date.parse(item.lastUpdatedAt) || 0,
        render: (item) => formatDateTime(item.lastUpdatedAt),
      },
      {
        key: "menu",
        header: "",
        width: "48px",
        render: (item) => (
          <div className="flex justify-end">
            <button
              type="button"
              aria-label={`Mais ações para ${item.name}`}
              title="Mais ações"
              className="rounded-lg p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenu({ x: rect.right, y: rect.bottom, item });
              }}
            >
              <Icon name="more_vert" className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    [],
  );

  const filterClientOptions = [
    { value: "", label: "Selecione" },
    ...(Array.isArray(clients.data) ? clients.data : []).map((item) => ({
      value: item.id,
      label: item.name,
    })),
  ];

  const filterSiteOptions = [
    { value: "", label: "Selecione" },
    ...(Array.isArray(advancedSites.data) ? advancedSites.data : []).map((item) => ({
      value: item.id,
      label: item.name,
    })),
  ];

  const filterAgentOptions = [
    { value: "", label: "Selecione" },
    ...(Array.isArray(advancedAgents.data) ? advancedAgents.data : []).map((item) => ({
      value: item.id,
      label: item.displayName ?? item.hostname,
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Tarefas de Automação" description="Regras operacionais por escopo." />
        {canCreateAutomation && (
          <Button onClick={openNewModal}>
            <Icon name="add" className="h-4 w-4" /> Nova tarefa
          </Button>
        )}
      </div>

      <AutomationSubnav />

      <Card>
        <CardHeader title="Filtros" subtitle="Busca por texto, status e filtros avançados" />
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-end">
          <Input
            label="Busca"
            value={searchFilter}
            placeholder="Nome, descrição, packageId ou comando"
            onChange={(e) => {
              setSearchFilter(e.target.value);
              resetPagination();
            }}
          />
          <Select
            label="Status"
            options={[...TASK_STATUS_FILTERS]}
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value as TaskStatusFilterValue);
              resetPagination();
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-expanded={showAdvancedFilters}
            aria-controls="automation-advanced-filters"
            onClick={() => setShowAdvancedFilters((prev) => !prev)}
          >
            {showAdvancedFilters
              ? "Ocultar filtros avançados"
              : advancedFilterCount > 0
                ? `Filtros avançados (${advancedFilterCount})`
                : "Filtros avançados"}
          </Button>
        </div>

        <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface-light p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Filtros por tipo de ação e trigger são aplicados no servidor (valem para todas as páginas).
            </p>
            {hasActiveFilters && (
              <Button type="button" size="sm" variant="secondary" onClick={clearFilters}>
                Limpar filtros
              </Button>
            )}
          </div>
          <FilterChipGroup
            label="Tipo de ação"
            options={TASK_ACTION_FILTERS}
            selected={filterActionTypes}
            onToggle={(value) => {
              setFilterActionTypes((prev) => toggleFilterValue(prev, value));
              resetPagination();
            }}
          />
          <FilterChipGroup
            label="Trigger"
            options={TASK_TRIGGER_FILTERS}
            selected={filterTriggers}
            onToggle={(value) => {
              setFilterTriggers((prev) => toggleFilterValue(prev, value));
              resetPagination();
            }}
          />
        </div>

        {showAdvancedFilters && (
          <div
            id="automation-advanced-filters"
            className="mt-4 space-y-3 rounded-xl border border-border bg-surface-light p-4"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Select
                label="Visão"
                options={[
                  { value: "default", label: "Padrão (sem excluídas)" },
                  { value: "all", label: "Todas (inclui excluídas)" },
                  { value: "deleted", label: "Somente excluídas" },
                ]}
                value={listMode}
                onChange={(e) => {
                  setListMode(e.target.value as "default" | "all" | "deleted");
                  resetPagination();
                }}
              />
              <Select
                label="Escopo"
                options={[
                  { value: "", label: "Todos" },
                  { value: String(AppApprovalScopeType.Global), label: "Global" },
                  { value: String(AppApprovalScopeType.Client), label: "Client" },
                  { value: String(AppApprovalScopeType.Site), label: "Site" },
                  { value: String(AppApprovalScopeType.Agent), label: "Agent" },
                ]}
                value={scopeTypeFilter}
                onChange={(e) => {
                  setScopeTypeFilter(e.target.value);
                  resetPagination();
                }}
              />
              <Select
                label="Itens por página"
                options={[
                  { value: "20", label: "20" },
                  { value: "50", label: "50" },
                  { value: "100", label: "100" },
                ]}
                value={String(limit)}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  resetPagination();
                }}
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Select
                label="Cliente"
                options={filterClientOptions}
                value={filterClientId}
                onChange={(e) => {
                  setFilterClientId(e.target.value);
                  setFilterSiteId("");
                  setFilterAgentId("");
                  resetPagination();
                }}
              />
              <Select
                label="Site"
                options={filterSiteOptions}
                value={filterSiteId}
                disabled={!filterClientId}
                onChange={(e) => {
                  setFilterSiteId(e.target.value);
                  setFilterAgentId("");
                  resetPagination();
                }}
              />
              <Select
                label="Agent"
                options={filterAgentOptions}
                value={filterAgentId}
                disabled={!filterSiteId}
                onChange={(e) => {
                  setFilterAgentId(e.target.value);
                  resetPagination();
                }}
              />
            </div>

            <p className="mt-2 text-xs text-muted">
              {scopeTypeFilter === String(AppApprovalScopeType.Global)
                ? "Escopo global: as tarefas globais aparecem sem cliente/site/agente."
                : scopeTypeFilter
                  ? "O id do escopo é o do nível correspondente selecionado acima."
                  : "Sem tipo de escopo, a lista mostra as tarefas que se aplicam ao cliente/site/agente selecionado (qualquer nível)."}
            </p>

            <div className="space-y-2 rounded-lg border border-border bg-black/10 p-3">
              <Input
                label="Labels"
                value={filterLabelSearch}
                placeholder="Pesquisar labels"
                onChange={(e) => setFilterLabelSearch(e.target.value)}
              />

              {!!filterLabels.length && (
                <div className="flex flex-wrap gap-2">
                  {filterLabels.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="rounded-full border border-primary/40 bg-primary/20 px-2.5 py-1 text-xs text-primary-100"
                      onClick={() => {
                        removeFilterLabel(tag);
                        resetPagination();
                      }}
                    >
                      {tag} ×
                    </button>
                  ))}
                </div>
              )}

              <div className="max-h-36 space-y-1 overflow-y-auto">
                {knownTags.isLoading && <p className="text-xs text-muted">Carregando labels...</p>}
                {!knownTags.isLoading && availableKnownFilterLabels.length === 0 && (
                  <p className="text-xs text-muted">Nenhuma label encontrada.</p>
                )}
                {!knownTags.isLoading &&
                  availableKnownFilterLabels.map((tag) => {
                    const selected = filterLabels.some(
                      (item) => item.toLowerCase() === tag.toLowerCase(),
                    );
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`w-full rounded-md border px-2 py-1 text-left text-xs transition-colors ${
                          selected
                            ? "border-primary/40 bg-primary/20 text-primary-100"
                            : "border-border bg-surface-light text-muted-foreground hover:bg-surface-hover"
                        }`}
                        onClick={() => {
                          if (selected) {
                            removeFilterLabel(tag);
                          } else {
                            addFilterLabel(tag);
                          }
                          resetPagination();
                        }}
                      >
                        {selected ? "[x] " : "[ ] "}
                        {tag}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Tarefas"
          subtitle={`${list.data?.items?.length ?? 0}${list.data?.hasMore ? "+" : ""} itens retornados`}
        />
        {list.isLoading && <Loading message="Carregando tarefas..." />}
        {list.isError && <ErrorDisplay onRetry={() => list.refetch()} />}
        {!list.isLoading && !list.isError && (
          <>
            <DataTable
              columns={columns}
              data={list.data?.items ?? []}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => setDetailTaskId(item.id)}
              showPagination={false}
              defaultSort={{ key: "executionOrder", direction: "asc" }}
              onRowContextMenu={(event, item) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY, item });
              }}
            />
            <Pagination
              className="mt-4"
              page={page}
              totalPages={1}
              onPageChange={() => {}}
              cursor={{
                hasPrev: canPrev,
                hasNext: canNext,
                onPrev: goToPrevPage,
                onNext: goToNextPage,
                loading: list.isFetching,
              }}
            />
          </>
        )}
      </Card>

      {contextMenu && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          items={buildRowContextMenuItems(contextMenu.item)}
          onClose={() => setContextMenu(null)}
        />
      )}

      <TaskFormModal
        open={formOpen}
        editing={editing}
        editingId={editingId}
        duplicateSource={duplicateSource}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setEditingId("");
          setDuplicateSource(null);
        }}
        onTransitionToEdit={(saved) => {
          setEditing(saved);
          setEditingId(saved.id);
          setDuplicateSource(null);
        }}
      />

      <AutomationTaskDetailModal
        taskId={detailTaskId}
        task={detailTask.data}
        isLoading={detailTask.isLoading}
        isError={detailTask.isError}
        onRetry={() => void detailTask.refetch()}
        onClose={() => setDetailTaskId(null)}
        onEdit={(d) => {
          const item = list.data?.items.find((i) => i.id === d.id);
          openEditFor(item ?? d);
        }}
        onRestore={(item) => setRestoreTask(item)}
        canEdit={canEditAutomation}
        canExecute={canExecuteAutomation}
        scopeDisplayName={scopeDisplayName}
        isTaskDeleted={isTaskDeleted}
      />

      <Modal
        open={!!auditTaskId}
        onClose={() => setAuditTaskId(null)}
        title="Auditoria da tarefa"
        maxWidth="max-w-3xl"
      >
        <p className="mb-3 text-xs text-muted">
          Cada evento mostra o tipo de mudança, quem alterou e os snapshots antes/depois.
        </p>
        <AutomationAuditList
          entries={auditQuery.data}
          isLoading={auditQuery.isLoading}
          isError={auditQuery.isError}
          onRetry={() => void auditQuery.refetch()}
          errorMessage="Não foi possível carregar a trilha de auditoria desta tarefa."
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTask)}
        title="Excluir tarefa"
        message={
          deleteTask
            ? `Excluir a tarefa "${deleteTask.name}"? Ela poderá ser reativada depois na visão de excluídas.`
            : ""
        }
        confirmLabel="Excluir tarefa"
        tone="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onClose={closeDeleteModal}
      />

      <ConfirmDialog
        open={Boolean(restoreTask)}
        title="Reativar tarefa"
        message={
          restoreTask
            ? `Reativar a tarefa "${restoreTask.name}"? Ela voltará a ser aplicada ao escopo configurado.`
            : ""
        }
        confirmLabel="Reativar tarefa"
        tone="primary"
        isLoading={restoreMutation.isPending}
        onConfirm={handleConfirmRestore}
        onClose={closeRestoreModal}
      />
    </div>
  );
}
