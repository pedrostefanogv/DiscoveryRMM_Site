import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  type Column,
  ErrorDisplay,
  Input,
  Loading,
  Modal,
  Select,
  TextArea,
} from "@/components/ui";
import {
  AppApprovalScopeType,
  AppInstallationType,
  AutomationTaskActionType,
  type AutomationTaskSummary,
  type CreateAutomationTaskRequest,
  type UpdateAutomationTaskRequest,
} from "@/api";
import {
  useAutomationKnownTags,
  useAutomationScripts,
  useAutomationTask,
  useAutomationTaskAudit,
  useAutomationTasks,
  useCreateAutomationTask,
  useDeleteAutomationTask,
  useUpdateAutomationTask,
} from "@/hooks/useAutomation";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useAgentsBySite } from "@/hooks/useAgents";
import { useAppStoreCatalog } from "@/hooks/useAppStore";
import { Search, LayoutGrid, List } from "lucide-react";

function buildCorrelationId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim()) return <>{text}</>;
  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function actionLabel(value: unknown): string {
  if (value === AutomationTaskActionType.InstallPackage || value === "InstallPackage") return "InstallPackage";
  if (value === AutomationTaskActionType.UpdatePackage || value === "UpdatePackage") return "UpdatePackage";
  if (value === AutomationTaskActionType.RunScript || value === "RunScript") return "RunScript";
  if (value === AutomationTaskActionType.CustomCommand || value === "CustomCommand") return "CustomCommand";
  if (value === AutomationTaskActionType.RemovePackage || value === "RemovePackage") return "RemovePackage";
  if (value === AutomationTaskActionType.UpdateOrInstallPackage || value === "UpdateOrInstallPackage") return "UpdateOrInstallPackage";
  return String(value ?? "-");
}

function scopeLabel(value: unknown): string {
  if (value === AppApprovalScopeType.Global || value === "Global") return "Global";
  if (value === AppApprovalScopeType.Client || value === "Client") return "Client";
  if (value === AppApprovalScopeType.Site || value === "Site") return "Site";
  if (value === AppApprovalScopeType.Agent || value === "Agent") return "Agent";
  return String(value ?? "-");
}

type TaskFormState = {
  name: string;
  description: string;
  actionType: string;
  installationType: string;
  packageId: string;
  scriptId: string;
  commandPayload: string;
  scopeType: string;
  scopeId: string;
  includeTags: string[];
  triggerImmediate: boolean;
  triggerRecurring: boolean;
  triggerOnUserLogin: boolean;
  triggerOnAgentCheckIn: boolean;
  scheduleCron: string;
  requiresApproval: boolean;
  isActive: boolean;
};

const defaultForm: TaskFormState = {
  name: "",
  description: "",
  actionType: String(AutomationTaskActionType.RunScript),
  installationType: String(AppInstallationType.Winget),
  packageId: "",
  scriptId: "",
  commandPayload: "",
  scopeType: String(AppApprovalScopeType.Global),
  scopeId: "",
  includeTags: [],
  triggerImmediate: true,
  triggerRecurring: false,
  triggerOnUserLogin: false,
  triggerOnAgentCheckIn: false,
  scheduleCron: "",
  requiresApproval: false,
  isActive: true,
};

export default function AutomationTasksPage() {
  const [activeOnly, setActiveOnly] = useState(true);
  const [scopeTypeFilter, setScopeTypeFilter] = useState("");
  const [scopeIdFilter, setScopeIdFilter] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationTaskSummary | null>(null);
  const [editingId, setEditingId] = useState("");
  const [auditTaskId, setAuditTaskId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskFormState>(defaultForm);
  const [scopeClientId, setScopeClientId] = useState("");
  const [scopeSiteId, setScopeSiteId] = useState("");
  const [scopeAgentId, setScopeAgentId] = useState("");
  const [packageSearch, setPackageSearch] = useState("");
  const [packageSearchDebounced, setPackageSearchDebounced] = useState("");
  const [packagePickerOpen, setPackagePickerOpen] = useState(false);
  const [packagePickerView, setPackagePickerView] = useState<"list" | "card">("list");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setPackageSearchDebounced(packageSearch), 400);
    return () => clearTimeout(timer);
  }, [packageSearch]);

  const list = useAutomationTasks({
    scopeType: scopeTypeFilter ? (Number(scopeTypeFilter) as AppApprovalScopeType) : undefined,
    scopeId: scopeIdFilter || undefined,
    activeOnly,
    limit,
    offset,
  });

  const scripts = useAutomationScripts({ activeOnly: true, limit: 200, offset: 0 });
  const knownTags = useAutomationKnownTags();
  const clients = useClients();
  const sites = useSites(scopeClientId);
  const agents = useAgentsBySite(scopeSiteId);
  const isPackageAction =
    Number(form.actionType) === AutomationTaskActionType.InstallPackage ||
    Number(form.actionType) === AutomationTaskActionType.UpdatePackage ||
    Number(form.actionType) === AutomationTaskActionType.RemovePackage ||
    Number(form.actionType) === AutomationTaskActionType.UpdateOrInstallPackage;
  const packageCatalog = useAppStoreCatalog({
    installationType: Number(form.installationType) as AppInstallationType,
    search: isPackageAction ? packageSearchDebounced : undefined,
    limit: 50,
  });
  const createMutation = useCreateAutomationTask();
  const updateMutation = useUpdateAutomationTask();
  const deleteMutation = useDeleteAutomationTask();
  const auditQuery = useAutomationTaskAudit(auditTaskId ?? "", 50, !!auditTaskId);
  const taskDetail = useAutomationTask(editingId);

  useEffect(() => {
    if (!editingId || !taskDetail.data) return;
    const detail = taskDetail.data;
    const scopeTypeString = String(detail.scopeType);
    setForm({
      name: detail.name,
      description: detail.description || "",
      actionType: String(detail.actionType),
      installationType: detail.installationType !== null ? String(detail.installationType) : String(AppInstallationType.Winget),
      packageId: detail.packageId || "",
      scriptId: detail.scriptId || "",
      commandPayload: detail.commandPayload || "",
      scopeType: scopeTypeString,
      scopeId: detail.scopeId || "",
      includeTags: detail.includeTags ?? [],
      triggerImmediate: detail.triggerImmediate,
      triggerRecurring: detail.triggerRecurring,
      triggerOnUserLogin: detail.triggerOnUserLogin,
      triggerOnAgentCheckIn: detail.triggerOnAgentCheckIn,
      scheduleCron: detail.scheduleCron || "",
      requiresApproval: detail.requiresApproval,
      isActive: detail.isActive,
    });

    if (detail.scopeType === AppApprovalScopeType.Client || detail.scopeType === "Client") {
      setScopeClientId(detail.scopeId || "");
      setScopeSiteId("");
      setScopeAgentId("");
    } else if (detail.scopeType === AppApprovalScopeType.Site || detail.scopeType === "Site") {
      setScopeSiteId(detail.scopeId || "");
      setScopeAgentId("");
    } else if (detail.scopeType === AppApprovalScopeType.Agent || detail.scopeType === "Agent") {
      setScopeAgentId(detail.scopeId || "");
    } else {
      setScopeClientId("");
      setScopeSiteId("");
      setScopeAgentId("");
    }
  }, [editingId, taskDetail.data]);

  useEffect(() => {
    const currentScopeType = Number(form.scopeType);
    if (currentScopeType === AppApprovalScopeType.Client) {
      if (scopeClientId) {
        setForm((prev) => ({ ...prev, scopeId: scopeClientId }));
      }
      return;
    }
    if (currentScopeType === AppApprovalScopeType.Site) {
      if (scopeSiteId) {
        setForm((prev) => ({ ...prev, scopeId: scopeSiteId }));
      }
      return;
    }
    if (currentScopeType === AppApprovalScopeType.Agent) {
      if (scopeAgentId) {
        setForm((prev) => ({ ...prev, scopeId: scopeAgentId }));
      }
      return;
    }
    if (currentScopeType === AppApprovalScopeType.Global) {
      setForm((prev) => ({ ...prev, scopeId: "" }));
    }
  }, [form.scopeType, scopeAgentId, scopeClientId, scopeSiteId]);

  const total = list.data?.total ?? 0;
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const columns = useMemo<Column<AutomationTaskSummary>[]>(
    () => [
      {
        key: "name",
        header: "Nome",
        render: (item) => (
          <div>
            <p className="font-medium text-white">{item.name}</p>
            <p className="text-xs text-slate-500">{item.description || "Sem descricao"}</p>
          </div>
        ),
      },
      {
        key: "action",
        header: "Acao",
        render: (item) => <Badge color="primary">{actionLabel(item.actionType)}</Badge>,
      },
      {
        key: "scope",
        header: "Escopo",
        render: (item) => (
          <div>
            <p className="text-sm text-slate-200">{scopeLabel(item.scopeType)}</p>
            <p className="text-xs text-slate-500 font-mono">{item.scopeId || "-"}</p>
          </div>
        ),
      },
      {
        key: "approval",
        header: "Aprovacao",
        render: (item) => (
          <Badge color={item.requiresApproval ? "warning" : "slate"}>
            {item.requiresApproval ? "Requer" : "Nao"}
          </Badge>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (item) => (
          <Badge color={item.isActive ? "success" : "slate"}>
            {item.isActive ? "Ativa" : "Inativa"}
          </Badge>
        ),
      },
      {
        key: "updated",
        header: "Atualizado",
        render: (item) => new Date(item.lastUpdatedAt).toLocaleString("pt-BR"),
      },
      {
        key: "actions",
        header: "Acoes",
        render: (item) => (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(item);
                setEditingId(item.id);
                setForm((f) => ({
                  ...f,
                  name: item.name,
                  description: item.description || "",
                  actionType: String(item.actionType),
                  scopeType: String(item.scopeType),
                  scopeId: item.scopeId || "",
                  requiresApproval: item.requiresApproval,
                  isActive: item.isActive,
                }));
                setFormOpen(true);
              }}
            >
              Editar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAuditTaskId(item.id)}>
              Auditoria
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (!window.confirm(`Excluir a tarefa ${item.name}?`)) return;
                deleteMutation.mutate(
                  {
                    id: item.id,
                    correlationId: buildCorrelationId("task-delete"),
                  },
                  {
                    onSuccess: () => toast.success("Tarefa excluida"),
                    onError: () => toast.error("Falha ao excluir tarefa"),
                  },
                );
              }}
            >
              Excluir
            </Button>
          </div>
        ),
      },
    ],
    [deleteMutation],
  );

  const scriptOptions = [
    { value: "", label: "Selecione" },
    ...(scripts.data?.items ?? []).map((item) => ({ value: item.id, label: item.name })),
  ];

  const scopeClientOptions = [
    { value: "", label: "Selecione" },
    ...(clients.data ?? []).map((item) => ({ value: item.id, label: item.name })),
  ];

  const scopeSiteOptions = [
    { value: "", label: "Selecione" },
    ...(sites.data ?? []).map((item) => ({ value: item.id, label: item.name })),
  ];

  const scopeAgentOptions = [
    { value: "", label: "Selecione" },
    ...(agents.data ?? []).map((item) => ({
      value: item.id,
      label: item.displayName ?? item.hostname,
    })),
  ];

  const packageOptions = [
    { value: "", label: "Selecione" },
    ...((packageCatalog.data?.items ?? []).map((pkg) => ({
      value: pkg.packageId,
      label: `${pkg.packageId}${pkg.name ? ` - ${pkg.name}` : ""}`,
    }))),
  ];

  const selectedPackageLabel =
    packageOptions.find((item) => item.value === form.packageId)?.label ||
    form.packageId ||
    "";

  const addIncludeTag = (rawTag: string) => {
    const nextTag = rawTag.trim();
    if (!nextTag) return;
    setForm((prev) => {
      if (prev.includeTags.some((item) => item.toLowerCase() === nextTag.toLowerCase())) {
        return prev;
      }
      return { ...prev, includeTags: [...prev.includeTags, nextTag] };
    });
  };

  const removeIncludeTag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      includeTags: prev.includeTags.filter((item) => item !== tag),
    }));
  };

  const handleSubmit = () => {
    const name = form.name.trim();
    if (!name) return toast.error("Nome obrigatorio");
    if (name.length > 200) return toast.error("Nome deve ter no maximo 200 caracteres");

    const triggerCount = [
      form.triggerImmediate,
      form.triggerRecurring,
      form.triggerOnUserLogin,
      form.triggerOnAgentCheckIn,
    ].filter(Boolean).length;

    if (!triggerCount) return toast.error("Ative pelo menos um trigger");

    const actionType = Number(form.actionType) as AutomationTaskActionType;
    const scopeType = Number(form.scopeType) as AppApprovalScopeType;

    if (form.triggerRecurring && !form.scheduleCron.trim()) {
      return toast.error("ScheduleCron obrigatorio quando trigger recorrente esta ativo");
    }

    if (scopeType !== AppApprovalScopeType.Global && !form.scopeId.trim()) {
      return toast.error("ScopeId obrigatorio para escopos nao globais");
    }

    if (
      (actionType === AutomationTaskActionType.InstallPackage ||
        actionType === AutomationTaskActionType.UpdatePackage ||
        actionType === AutomationTaskActionType.RemovePackage ||
        actionType === AutomationTaskActionType.UpdateOrInstallPackage) &&
      !form.packageId.trim()
    ) {
      return toast.error("PackageId obrigatorio para esta ação");
    }

    if (actionType === AutomationTaskActionType.RunScript && !form.scriptId) {
      return toast.error("ScriptId obrigatorio para RunScript");
    }

    if (actionType === AutomationTaskActionType.CustomCommand && !form.commandPayload.trim()) {
      return toast.error("CommandPayload obrigatorio para CustomCommand");
    }

    const payload: CreateAutomationTaskRequest = {
      name,
      description: form.description.trim() || null,
      actionType,
      installationType:
        actionType === AutomationTaskActionType.InstallPackage ||
        actionType === AutomationTaskActionType.UpdatePackage ||
        actionType === AutomationTaskActionType.RemovePackage ||
        actionType === AutomationTaskActionType.UpdateOrInstallPackage
          ? (Number(form.installationType) as AppInstallationType)
          : null,
      packageId:
        actionType === AutomationTaskActionType.InstallPackage ||
        actionType === AutomationTaskActionType.UpdatePackage ||
        actionType === AutomationTaskActionType.RemovePackage ||
        actionType === AutomationTaskActionType.UpdateOrInstallPackage
          ? form.packageId.trim()
          : null,
      scriptId: actionType === AutomationTaskActionType.RunScript ? form.scriptId : null,
      commandPayload:
        actionType === AutomationTaskActionType.CustomCommand
          ? form.commandPayload.trim()
          : null,
      scopeType,
      scopeId: scopeType === AppApprovalScopeType.Global ? null : form.scopeId.trim(),
      includeTags: form.includeTags,
      excludeTags: [],
      triggerImmediate: form.triggerImmediate,
      triggerRecurring: form.triggerRecurring,
      triggerOnUserLogin: form.triggerOnUserLogin,
      triggerOnAgentCheckIn: form.triggerOnAgentCheckIn,
      scheduleCron: form.triggerRecurring ? form.scheduleCron.trim() : null,
      requiresApproval: form.requiresApproval,
      isActive: form.isActive,
    };

    if (editing) {
      const updatePayload: UpdateAutomationTaskRequest = payload;
      updateMutation.mutate(
        {
          id: editing.id,
          data: updatePayload,
          correlationId: buildCorrelationId("task-update"),
        },
        {
          onSuccess: () => {
            toast.success("Tarefa atualizada");
            setFormOpen(false);
            setEditing(null);
            setEditingId("");
            setScopeClientId("");
            setScopeSiteId("");
            setScopeAgentId("");
            setPackageSearch("");
            setTagSearch("");
            setForm(defaultForm);
          },
          onError: () => toast.error("Falha ao atualizar tarefa"),
        },
      );
      return;
    }

    createMutation.mutate(
      {
        data: payload,
        correlationId: buildCorrelationId("task-create"),
      },
      {
        onSuccess: () => {
          toast.success("Tarefa criada");
          setFormOpen(false);
          setEditingId("");
          setScopeClientId("");
          setScopeSiteId("");
          setScopeAgentId("");
          setPackageSearch("");
          setTagSearch("");
          setForm(defaultForm);
        },
        onError: () => toast.error("Falha ao criar tarefa"),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Tarefas de Automacao</h1>
          <p className="text-sm text-slate-400">Regras operacionais por escopo.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setEditingId("");
            setScopeClientId("");
            setScopeSiteId("");
            setScopeAgentId("");
            setPackageSearch("");
            setTagSearch("");
            setForm(defaultForm);
            setFormOpen(true);
          }}
        >
          Nova tarefa
        </Button>
      </div>

      <Card>
        <CardHeader title="Filtros" subtitle="Escopo, status e paginacao" />
        <div className="grid gap-3 md:grid-cols-4">
          <Select
            label="ScopeType"
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
              setOffset(0);
            }}
          />
          <Input
            label="ScopeId"
            value={scopeIdFilter}
            onChange={(e) => {
              setScopeIdFilter(e.target.value);
              setOffset(0);
            }}
          />
          <Select
            label="Ativos"
            options={[
              { value: "true", label: "Somente ativos" },
              { value: "false", label: "Todos" },
            ]}
            value={String(activeOnly)}
            onChange={(e) => {
              setActiveOnly(e.target.value === "true");
              setOffset(0);
            }}
          />
          <Select
            label="Limite"
            options={[
              { value: "20", label: "20" },
              { value: "50", label: "50" },
              { value: "100", label: "100" },
            ]}
            value={String(limit)}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setOffset(0);
            }}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Tarefas"
          subtitle={`${list.data?.count ?? 0} itens retornados de ${total} total`}
        />
        {list.isLoading && <Loading message="Carregando tarefas..." />}
        {list.isError && <ErrorDisplay onRetry={() => list.refetch()} />}
        {!list.isLoading && !list.isError && (
          <>
            <DataTable
              columns={columns}
              data={list.data?.items ?? []}
              keyExtractor={(item) => item.id}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={!canPrev} onClick={() => setOffset((x) => Math.max(0, x - limit))}>
                Anterior
              </Button>
              <Button size="sm" variant="secondary" disabled={!canNext} onClick={() => setOffset((x) => x + limit)}>
                Proxima
              </Button>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setEditingId("");
        }}
        title={editing ? "Editar tarefa" : "Nova tarefa"}
        maxWidth="max-w-5xl"
      >
        {editing && taskDetail.isLoading && (
          <div className="mb-3">
            <Loading message="Carregando detalhes da tarefa..." />
          </div>
        )}
        {editing && taskDetail.isError && (
          <div className="mb-3">
            <ErrorDisplay onRetry={() => taskDetail.refetch()} />
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Nome"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            label="Descricao"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
          <Select
            label="ActionType"
            options={[
              { value: String(AutomationTaskActionType.InstallPackage), label: "Instalar pacote" },
              { value: String(AutomationTaskActionType.UpdatePackage), label: "Atualizar pacote" },
              { value: String(AutomationTaskActionType.RemovePackage), label: "Remover pacote" },
              { value: String(AutomationTaskActionType.UpdateOrInstallPackage), label: "Atualizar/Instalar pacote" },
              { value: String(AutomationTaskActionType.RunScript), label: "Executar script" },
              { value: String(AutomationTaskActionType.CustomCommand), label: "Comando personalizado" },
            ]}
            value={form.actionType}
            onChange={(e) => setForm((p) => ({ ...p, actionType: e.target.value }))}
          />
          <Select
            label="ScopeType"
            options={[
              { value: String(AppApprovalScopeType.Global), label: "Global" },
              { value: String(AppApprovalScopeType.Client), label: "Client" },
              { value: String(AppApprovalScopeType.Site), label: "Site" },
              { value: String(AppApprovalScopeType.Agent), label: "Agent" },
            ]}
            value={form.scopeType}
            onChange={(e) => {
              const nextScopeType = e.target.value;
              setForm((p) => ({ ...p, scopeType: nextScopeType }));
              if (Number(nextScopeType) === AppApprovalScopeType.Global) {
                setScopeClientId("");
                setScopeSiteId("");
                setScopeAgentId("");
              }
            }}
          />
          {Number(form.scopeType) === AppApprovalScopeType.Client && (
            <Select
              label="Cliente alvo"
              options={scopeClientOptions}
              value={scopeClientId}
              onChange={(e) => {
                setScopeClientId(e.target.value);
                setScopeSiteId("");
                setScopeAgentId("");
              }}
            />
          )}
          {Number(form.scopeType) === AppApprovalScopeType.Site && (
            <>
              <Select
                label="Cliente alvo"
                options={scopeClientOptions}
                value={scopeClientId}
                onChange={(e) => {
                  setScopeClientId(e.target.value);
                  setScopeSiteId("");
                  setScopeAgentId("");
                }}
              />
              <Select
                label="Site alvo"
                options={scopeSiteOptions}
                value={scopeSiteId}
                disabled={!scopeClientId}
                onChange={(e) => {
                  setScopeSiteId(e.target.value);
                  setScopeAgentId("");
                }}
              />
            </>
          )}
          {Number(form.scopeType) === AppApprovalScopeType.Agent && (
            <>
              <Select
                label="Cliente alvo"
                options={scopeClientOptions}
                value={scopeClientId}
                onChange={(e) => {
                  setScopeClientId(e.target.value);
                  setScopeSiteId("");
                  setScopeAgentId("");
                }}
              />
              <Select
                label="Site alvo"
                options={scopeSiteOptions}
                value={scopeSiteId}
                disabled={!scopeClientId}
                onChange={(e) => {
                  setScopeSiteId(e.target.value);
                  setScopeAgentId("");
                }}
              />
              <Select
                label="Agent alvo"
                options={scopeAgentOptions}
                value={scopeAgentId}
                disabled={!scopeSiteId}
                onChange={(e) => setScopeAgentId(e.target.value)}
              />
            </>
          )}
          {Number(form.scopeType) !== AppApprovalScopeType.Global && (
            <Input
              label="ScopeId (manual)"
              value={form.scopeId}
              onChange={(e) => setForm((p) => ({ ...p, scopeId: e.target.value }))}
            />
          )}

          {(Number(form.actionType) === AutomationTaskActionType.InstallPackage ||
            Number(form.actionType) === AutomationTaskActionType.UpdatePackage ||
            Number(form.actionType) === AutomationTaskActionType.RemovePackage ||
            Number(form.actionType) === AutomationTaskActionType.UpdateOrInstallPackage) && (
            <>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-300">PackageId</label>
                <div className="flex gap-2">
                  <Input
                    value={selectedPackageLabel}
                    readOnly
                    placeholder="Nenhum pacote selecionado"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setPackagePickerOpen(true)}
                    aria-label="Pesquisar pacote"
                    title="Pesquisar pacote"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Input
                label="PackageId (manual)"
                value={form.packageId}
                onChange={(e) => setForm((p) => ({ ...p, packageId: e.target.value }))}
                hint="Use busca/catálogo quando possível; este campo aceita entrada manual."
              />
            </>
          )}

          {Number(form.actionType) === AutomationTaskActionType.RunScript && (
            <Select
              label="ScriptId"
              options={scriptOptions}
              value={form.scriptId}
              onChange={(e) => setForm((p) => ({ ...p, scriptId: e.target.value }))}
            />
          )}
        </div>

        {Number(form.actionType) === AutomationTaskActionType.CustomCommand && (
          <div className="mt-3">
            <TextArea
              label="CommandPayload"
              className="min-h-28 font-mono"
              value={form.commandPayload}
              onChange={(e) => setForm((p) => ({ ...p, commandPayload: e.target.value }))}
            />
          </div>
        )}

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <p className="text-sm font-medium text-slate-300">Tags (IncludeTags)</p>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Selecionar tags</label>
              <div className="flex gap-2">
                <Input
                  value={form.includeTags.join(", ")}
                  readOnly
                  placeholder="Nenhuma tag selecionada"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setTagPickerOpen(true)}
                  aria-label="Pesquisar tags"
                  title="Pesquisar tags"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {!!form.includeTags.length && (
              <div className="flex flex-wrap gap-2 rounded-lg border border-white/10 bg-slate-900/40 p-2">
                {form.includeTags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                    {tag}
                    <button
                      type="button"
                      className="text-slate-400 hover:text-white"
                      onClick={() => removeIncludeTag(tag)}
                      aria-label={`Remover tag ${tag}`}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <Input
            label="ScheduleCron"
            value={form.scheduleCron}
            onChange={(e) => setForm((p) => ({ ...p, scheduleCron: e.target.value }))}
            disabled={!form.triggerRecurring}
          />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Select
            label="TriggerImmediate"
            options={[{ value: "true", label: "Sim" }, { value: "false", label: "Nao" }]}
            value={String(form.triggerImmediate)}
            onChange={(e) => setForm((p) => ({ ...p, triggerImmediate: e.target.value === "true" }))}
          />
          <Select
            label="TriggerRecurring"
            options={[{ value: "true", label: "Sim" }, { value: "false", label: "Nao" }]}
            value={String(form.triggerRecurring)}
            onChange={(e) => setForm((p) => ({ ...p, triggerRecurring: e.target.value === "true" }))}
          />
          <Select
            label="TriggerOnUserLogin"
            options={[{ value: "true", label: "Sim" }, { value: "false", label: "Nao" }]}
            value={String(form.triggerOnUserLogin)}
            onChange={(e) => setForm((p) => ({ ...p, triggerOnUserLogin: e.target.value === "true" }))}
          />
          <Select
            label="TriggerOnAgentCheckIn"
            options={[{ value: "true", label: "Sim" }, { value: "false", label: "Nao" }]}
            value={String(form.triggerOnAgentCheckIn)}
            onChange={(e) => setForm((p) => ({ ...p, triggerOnAgentCheckIn: e.target.value === "true" }))}
          />
          <Select
            label="RequiresApproval"
            options={[{ value: "true", label: "Sim" }, { value: "false", label: "Nao" }]}
            value={String(form.requiresApproval)}
            onChange={(e) => setForm((p) => ({ ...p, requiresApproval: e.target.value === "true" }))}
          />
          <Select
            label="Status"
            options={[{ value: "true", label: "Ativa" }, { value: "false", label: "Inativa" }]}
            value={String(form.isActive)}
            onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.value === "true" }))}
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setFormOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={createMutation.isPending || updateMutation.isPending}>
            {editing ? "Salvar" : "Criar"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={packagePickerOpen}
        onClose={() => setPackagePickerOpen(false)}
        title="Selecionar pacote"
        maxWidth="max-w-4xl"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-0">
              <Select
                label="InstallationType"
                options={[
                  { value: String(AppInstallationType.Winget), label: "Winget" },
                  { value: String(AppInstallationType.Chocolatey), label: "Chocolatey" },
                  { value: String(AppInstallationType.Custom), label: "Custom" },
                ]}
                value={form.installationType}
                onChange={(e) => {
                  setForm((p) => ({ ...p, installationType: e.target.value, packageId: "" }));
                  setPackageSearch("");
                }}
              />
            </div>
            <div className="flex-[2] min-w-0">
              <Input
                label="Pesquisar"
                placeholder="Digite nome ou package id"
                value={packageSearch}
                onChange={(e) => setPackageSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1 pb-0.5">
              <button
                type="button"
                onClick={() => setPackagePickerView("list")}
                className={`rounded p-1.5 transition-colors ${
                  packagePickerView === "list"
                    ? "bg-primary-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
                title="Visualização em lista"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPackagePickerView("card")}
                className={`rounded p-1.5 transition-colors ${
                  packagePickerView === "card"
                    ? "bg-primary-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
                title="Visualização em cards"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>

          {packageCatalog.isLoading && <Loading message="Carregando catálogo..." />}
          {packageCatalog.isError && <ErrorDisplay onRetry={() => packageCatalog.refetch()} />}

          {!packageCatalog.isLoading && !packageCatalog.isError && (
            <div className="max-h-[55vh] overflow-y-auto">
              {packagePickerView === "list" ? (
                <div className="space-y-1.5">
                  {(packageCatalog.data?.items ?? []).map((pkg) => (
                    <div
                      key={pkg.packageId}
                      className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 transition-colors cursor-pointer"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, packageId: pkg.packageId }));
                        setPackagePickerOpen(false);
                      }}
                    >
                      <div className="shrink-0">
                        {pkg.icon ? (
                          <img src={pkg.icon} alt="" className="h-8 w-8 rounded object-contain bg-white/5" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                            {(pkg.name || pkg.packageId).charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white font-medium truncate">
                          <HighlightText text={pkg.name || pkg.packageId} highlight={packageSearchDebounced} />
                        </p>
                        <p className="font-mono text-xs text-slate-400 truncate">
                          <HighlightText text={pkg.packageId} highlight={packageSearchDebounced} />
                        </p>
                      </div>
                      <p className="text-xs text-slate-500 shrink-0 max-w-[120px] truncate">
                        {pkg.publisher || ""}
                      </p>
                      <Button type="button" size="sm" onClick={(e) => { e.stopPropagation(); setForm((prev) => ({ ...prev, packageId: pkg.packageId })); setPackagePickerOpen(false); }}>
                        Selecionar
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(packageCatalog.data?.items ?? []).map((pkg) => (
                    <div
                      key={pkg.packageId}
                      className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3 hover:bg-white/10 transition-colors cursor-pointer"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, packageId: pkg.packageId }));
                        setPackagePickerOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {pkg.icon ? (
                          <img src={pkg.icon} alt="" className="h-9 w-9 rounded object-contain bg-white/5 shrink-0" />
                        ) : (
                          <div className="h-9 w-9 rounded bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 shrink-0">
                            {(pkg.name || pkg.packageId).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <p className="text-sm text-white font-medium leading-tight line-clamp-2">
                          <HighlightText text={pkg.name || pkg.packageId} highlight={packageSearchDebounced} />
                        </p>
                      </div>
                      <p className="font-mono text-xs text-slate-400 truncate">
                        <HighlightText text={pkg.packageId} highlight={packageSearchDebounced} />
                      </p>
                      {pkg.publisher && (
                        <p className="text-xs text-slate-500 truncate">{pkg.publisher}</p>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        className="mt-auto w-full"
                        onClick={(e) => { e.stopPropagation(); setForm((prev) => ({ ...prev, packageId: pkg.packageId })); setPackagePickerOpen(false); }}
                      >
                        Selecionar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {!packageCatalog.data?.items?.length && (
                <p className="text-sm text-slate-400 py-4 text-center">Nenhum pacote encontrado.</p>
              )}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={tagPickerOpen}
        onClose={() => setTagPickerOpen(false)}
        title="Selecionar tags"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-3">
          <Input
            label="Pesquisar tag"
            placeholder="Digite para filtrar tags"
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
          />

          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {knownTags.isLoading && <Loading message="Carregando tags..." />}
            {knownTags.isError && <ErrorDisplay onRetry={() => knownTags.refetch()} />}

            {!knownTags.isLoading && !knownTags.isError &&
              (knownTags.data ?? [])
                .filter((tag) =>
                  !tagSearch.trim()
                    ? true
                    : tag.toLowerCase().includes(tagSearch.trim().toLowerCase()),
                )
                .map((tag) => {
                  const selected = form.includeTags.some(
                    (item) => item.toLowerCase() === tag.toLowerCase(),
                  );

                  return (
                    <div
                      key={tag}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
                    >
                      <p className="text-sm text-slate-200">{tag}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant={selected ? "secondary" : "primary"}
                        onClick={() => {
                          if (selected) {
                            const existing = form.includeTags.find(
                              (item) => item.toLowerCase() === tag.toLowerCase(),
                            );
                            if (existing) removeIncludeTag(existing);
                            return;
                          }
                          addIncludeTag(tag);
                        }}
                      >
                        {selected ? "Remover" : "Selecionar"}
                      </Button>
                    </div>
                  );
                })}

            {!knownTags.isLoading && !knownTags.isError &&
              (knownTags.data ?? []).filter((tag) =>
                !tagSearch.trim()
                  ? true
                  : tag.toLowerCase().includes(tagSearch.trim().toLowerCase()),
              ).length === 0 && (
                <p className="text-sm text-slate-400">Nenhuma tag encontrada.</p>
              )}
          </div>

        </div>
      </Modal>

      <Modal
        open={!!auditTaskId}
        onClose={() => setAuditTaskId(null)}
        title="Auditoria da tarefa"
        maxWidth="max-w-3xl"
      >
        {auditQuery.isLoading && <Loading message="Carregando auditoria..." />}
        {auditQuery.isError && <ErrorDisplay onRetry={() => auditQuery.refetch()} />}
        {!auditQuery.isLoading && !auditQuery.isError && (
          <div className="space-y-3">
            {(auditQuery.data ?? []).map((entry) => (
              <div key={entry.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge color="accent">{String(entry.changeType)}</Badge>
                  <p className="text-xs text-slate-500">{new Date(entry.changedAt).toLocaleString("pt-BR")}</p>
                </div>
                <p className="text-sm text-slate-300">Motivo: {entry.reason || "-"}</p>
                <p className="text-xs text-slate-500">Correlation: {entry.correlationId || "-"}</p>
              </div>
            ))}
            {!auditQuery.data?.length && (
              <p className="text-sm text-slate-400">Nenhum evento de auditoria encontrado.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
