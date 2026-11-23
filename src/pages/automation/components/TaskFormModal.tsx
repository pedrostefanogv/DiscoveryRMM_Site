import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Badge,
  Button,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  Modal,
  Select,
  TextArea,
} from "@/components/ui";
import {
  AppApprovalScopeType,
  AppInstallationType,
  AutomationNotificationMode,
  AutomationTaskActionType,
  AutomationToastTiming,
  type AutomationTaskDetail,
  type AutomationTaskSummary,
  type CreateAutomationTaskRequest,
  type UpdateAutomationTaskRequest,
} from "@/api";
import { CustomFieldsUsedByPanel } from "@/components/custom-fields/CustomFieldsUsedByPanel";
import {
  useAutomationKnownTags,
  useAutomationScripts,
  useAutomationTask,
  useCreateAutomationTask,
  useUpdateAutomationTask,
} from "@/hooks/useAutomation";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import { useAgentsBySite } from "@/hooks/useAgents";
import { useAgentCustomFieldMap } from "@/hooks/useCustomFields";
import { useAutoKey } from "@/hooks/useAutoKey";
import { fieldKeyError } from "@/utils/fieldKey";
import {
  actionDisplayLabel,
  buildCorrelationId,
  describeCron,
  installationTypeLabel,
  isToastNotificationMode,
  isValidCron,
  normalizeActionType,
  normalizeInstallationType,
  normalizeNotificationMode,
  normalizeScopeType,
  normalizeToastTiming,
  notificationModeFromTask,
  notificationModeLabel,
  packageNoticeFrom,
  scopeLabel,
} from "../automationTasksUtils";
import {
  DEFAULT_EXECUTION_ORDER_BY_ACTION,
  MAX_EXECUTION_ORDER,
  MIN_EXECUTION_ORDER,
  defaultExecutionOrderForAction,
  executionOrderError,
} from "../automationTaskExecutionOrder";
import { TaskCronAssistant } from "./TaskCronAssistant";
import { TaskPackagePickerModal } from "./TaskPackagePickerModal";
import { TaskTagSelector } from "./TaskTagSelector";

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
  excludeTags: string[];
  triggerImmediate: boolean;
  triggerRecurring: boolean;
  triggerOnUserLogin: boolean;
  triggerOnAgentCheckIn: boolean;
  scheduleCron: string;
  notificationMode: string;
  toastTiming: string;
  allowDefer: boolean;
  closeProcesses: string[];
  promptTimeoutSeconds: string;
  collectorFieldDefinitionId: string;
  writeOutputToNote: boolean;
  taskRespectMaintenanceWindow: boolean;
  key: string;
  executionOrder: string;
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
  excludeTags: [],
  triggerImmediate: true,
  triggerRecurring: false,
  triggerOnUserLogin: false,
  triggerOnAgentCheckIn: false,
  scheduleCron: "",
  notificationMode: String(AutomationNotificationMode.Silent),
  toastTiming: String(AutomationToastTiming.After),
  allowDefer: true,
  closeProcesses: [],
  promptTimeoutSeconds: "60",
  collectorFieldDefinitionId: "",
  writeOutputToNote: false,
  taskRespectMaintenanceWindow: false,
  key: "",
  executionOrder: String(DEFAULT_EXECUTION_ORDER_BY_ACTION.RunScript ?? 50),
  isActive: true,
};

interface TaskFormModalProps {
  open: boolean;
  editing: AutomationTaskSummary | null;
  editingId: string;
  duplicateSource?: AutomationTaskSummary | AutomationTaskDetail | null;
  onClose: () => void;
  onTransitionToEdit?: (task: AutomationTaskDetail) => void;
}

export function TaskFormModal({
  open,
  editing,
  editingId,
  duplicateSource,
  onClose,
  onTransitionToEdit,
}: TaskFormModalProps) {
  const { keyForTitle, markTouched, setTouched } = useAutoKey(editing !== null);
  const [form, setForm] = useState<TaskFormState>(defaultForm);
  const [executionOrderTouched, setExecutionOrderTouched] = useState(false);
  const [scopeClientId, setScopeClientId] = useState("");
  const [scopeSiteId, setScopeSiteId] = useState("");
  const [scopeAgentId, setScopeAgentId] = useState("");
  const [scriptSearch, setScriptSearch] = useState("");
  const [packagePickerOpen, setPackagePickerOpen] = useState(false);
  const [closeProcessInput, setCloseProcessInput] = useState("");
  const [triggersHelpOpen, setTriggersHelpOpen] = useState(false);
  const [packageNotice, setPackageNotice] = useState<string | null>(null);
  const [savedWithNotice, setSavedWithNotice] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const agentFieldMap = useAgentCustomFieldMap(open);
  const scripts = useAutomationScripts({ activeOnly: true, limit: 200 });
  const knownTags = useAutomationKnownTags();
  const clients = useClients();
  const sites = useSites(scopeClientId);
  const agents = useAgentsBySite(scopeSiteId);
  const taskDetail = useAutomationTask(editingId);
  const createMutation = useCreateAutomationTask();
  const updateMutation = useUpdateAutomationTask();

  const collectorFieldOptions = useMemo(
    () => [
      { value: "", label: "Não coletar (tarefa comum)" },
      ...(agentFieldMap.data?.definitions ?? [])
        .filter((definition) => definition.allowAgentWrite)
        .map((definition) => ({ value: definition.definitionId, label: definition.label })),
    ],
    [agentFieldMap.data],
  );

  const applyScopeCascade = (
    scopeType: AppApprovalScopeType,
    item: Pick<AutomationTaskSummary, "scopeId" | "scopeClientId" | "scopeSiteId">,
  ) => {
    const clientId = item.scopeClientId || "";
    const siteId = item.scopeSiteId || "";
    const scopeId = item.scopeId || "";
    switch (scopeType) {
      case AppApprovalScopeType.Client:
        setScopeClientId(scopeId || clientId);
        setScopeSiteId("");
        setScopeAgentId("");
        break;
      case AppApprovalScopeType.Site:
        setScopeClientId(clientId);
        setScopeSiteId(scopeId || siteId);
        setScopeAgentId("");
        break;
      case AppApprovalScopeType.Agent:
        setScopeClientId(clientId);
        setScopeSiteId(siteId);
        setScopeAgentId(scopeId);
        break;
      default:
        setScopeClientId("");
        setScopeSiteId("");
        setScopeAgentId("");
    }
  };

  const resetLocalState = () => {
    setScopeClientId("");
    setScopeSiteId("");
    setScopeAgentId("");
    setScriptSearch("");
    setCloseProcessInput("");
    setExecutionOrderTouched(false);
    setPackageNotice(null);
    setSavedWithNotice(false);
    setTriggersHelpOpen(false);
    setFieldErrors({});
    setForm(defaultForm);
  };

  // Inicializa o formulário ao abrir para criação, edição (resumo) ou duplicação.
  useEffect(() => {
    if (!open) {
      setTouched(false);
      resetLocalState();
      return;
    }

    setFieldErrors({});
    setSavedWithNotice(false);
    setTriggersHelpOpen(false);

    if (editing) {
      const normalizedScopeType = normalizeScopeType(editing.scopeType);
      setTouched(true);
      setForm({
        ...defaultForm,
        name: editing.name,
        description: editing.description || "",
        actionType: String(normalizeActionType(editing.actionType)),
        scopeType: String(normalizedScopeType),
        scopeId: editing.scopeId || "",
        notificationMode: String(
          notificationModeFromTask(editing.notificationMode, editing.requiresApproval),
        ),
        toastTiming: String(normalizeToastTiming(editing.toastTiming)),
        allowDefer: editing.allowDefer ?? true,
        closeProcesses: editing.closeProcesses ?? [],
        promptTimeoutSeconds: String(editing.promptTimeoutSeconds ?? 60),
        collectorFieldDefinitionId: editing.collectorFieldDefinitionId ?? "",
        writeOutputToNote: editing.writeOutputToNote ?? false,
        taskRespectMaintenanceWindow: editing.taskRespectMaintenanceWindow ?? false,
        key: editing.key ?? "",
        executionOrder: String(editing.executionOrder ?? 50),
        isActive: editing.isActive,
      });
      setExecutionOrderTouched(true);
      applyScopeCascade(normalizedScopeType, editing);
      return;
    }

    if (duplicateSource) {
      const detail = duplicateSource as Partial<AutomationTaskDetail>;
      const normalizedScopeType = normalizeScopeType(duplicateSource.scopeType);
      setTouched(false);
      setForm({
        ...defaultForm,
        name: `${duplicateSource.name} (cópia)`,
        description: duplicateSource.description || "",
        actionType: String(normalizeActionType(duplicateSource.actionType)),
        installationType:
          detail.installationType !== null && detail.installationType !== undefined
            ? String(normalizeInstallationType(detail.installationType))
            : String(AppInstallationType.Winget),
        packageId: detail.packageId || "",
        scriptId: detail.scriptId || "",
        commandPayload: detail.commandPayload || "",
        scopeType: String(normalizedScopeType),
        scopeId: duplicateSource.scopeId || "",
        includeTags: detail.includeTags ?? [],
        excludeTags: detail.excludeTags ?? [],
        triggerImmediate: detail.triggerImmediate ?? true,
        triggerRecurring: detail.triggerRecurring ?? false,
        triggerOnUserLogin: detail.triggerOnUserLogin ?? false,
        triggerOnAgentCheckIn: detail.triggerOnAgentCheckIn ?? false,
        scheduleCron: detail.scheduleCron || "",
        notificationMode: String(
          notificationModeFromTask(
            duplicateSource.notificationMode,
            duplicateSource.requiresApproval,
          ),
        ),
        toastTiming: String(normalizeToastTiming(duplicateSource.toastTiming)),
        allowDefer: duplicateSource.allowDefer ?? true,
        closeProcesses: duplicateSource.closeProcesses ?? [],
        promptTimeoutSeconds: String(duplicateSource.promptTimeoutSeconds ?? 60),
        collectorFieldDefinitionId: duplicateSource.collectorFieldDefinitionId ?? "",
        writeOutputToNote: duplicateSource.writeOutputToNote ?? false,
        taskRespectMaintenanceWindow: duplicateSource.taskRespectMaintenanceWindow ?? false,
        key: "",
        executionOrder: String(duplicateSource.executionOrder ?? 50),
        isActive: duplicateSource.isActive,
      });
      setExecutionOrderTouched(true);
      applyScopeCascade(normalizedScopeType, duplicateSource);
      return;
    }

    setTouched(false);
    resetLocalState();
  }, [open, editing, duplicateSource, setTouched]);

  // Hidrata detalhes completos quando editando.
  useEffect(() => {
    if (!open || !editingId || !taskDetail.data) return;
    const detail = taskDetail.data;
    const normalizedActionType = normalizeActionType(detail.actionType);
    const normalizedScopeType = normalizeScopeType(detail.scopeType);
    const normalizedInstallationType =
      detail.installationType !== null
        ? normalizeInstallationType(detail.installationType)
        : AppInstallationType.Winget;
    setForm({
      name: detail.name,
      description: detail.description || "",
      actionType: String(normalizedActionType),
      installationType: String(normalizedInstallationType),
      packageId: detail.packageId || "",
      scriptId: detail.scriptId || "",
      commandPayload: detail.commandPayload || "",
      scopeType: String(normalizedScopeType),
      scopeId: detail.scopeId || "",
      includeTags: detail.includeTags ?? [],
      excludeTags: detail.excludeTags ?? [],
      triggerImmediate: detail.triggerImmediate,
      triggerRecurring: detail.triggerRecurring,
      triggerOnUserLogin: detail.triggerOnUserLogin,
      triggerOnAgentCheckIn: detail.triggerOnAgentCheckIn,
      scheduleCron: detail.scheduleCron || "",
      notificationMode: String(
        notificationModeFromTask(detail.notificationMode, detail.requiresApproval),
      ),
      toastTiming: String(normalizeToastTiming(detail.toastTiming)),
      allowDefer: detail.allowDefer ?? true,
      closeProcesses: detail.closeProcesses ?? [],
      promptTimeoutSeconds: String(detail.promptTimeoutSeconds ?? 60),
      collectorFieldDefinitionId: detail.collectorFieldDefinitionId ?? "",
      writeOutputToNote: detail.writeOutputToNote ?? false,
      taskRespectMaintenanceWindow: detail.taskRespectMaintenanceWindow ?? false,
      key: detail.key ?? "",
      executionOrder: String(detail.executionOrder ?? 50),
      isActive: detail.isActive,
    });
    setExecutionOrderTouched(true);
    setPackageNotice(packageNoticeFrom(detail));
    applyScopeCascade(normalizedScopeType, detail);
  }, [open, editingId, taskDetail.data]);

  // Mantém scopeId sempre sincronizado com o nível selecionado na cascata (inclusive vazio).
  useEffect(() => {
    const currentScopeType = normalizeScopeType(form.scopeType);
    if (currentScopeType === AppApprovalScopeType.Client) {
      setForm((prev) => (prev.scopeId === scopeClientId ? prev : { ...prev, scopeId: scopeClientId }));
      return;
    }
    if (currentScopeType === AppApprovalScopeType.Site) {
      setForm((prev) => (prev.scopeId === scopeSiteId ? prev : { ...prev, scopeId: scopeSiteId }));
      return;
    }
    if (currentScopeType === AppApprovalScopeType.Agent) {
      setForm((prev) => (prev.scopeId === scopeAgentId ? prev : { ...prev, scopeId: scopeAgentId }));
      return;
    }
    setForm((prev) => (prev.scopeId === "" ? prev : { ...prev, scopeId: "" }));
  }, [form.scopeType, scopeAgentId, scopeClientId, scopeSiteId]);

  const clearError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const selectedActionType = normalizeActionType(form.actionType);
  const selectedScopeType = normalizeScopeType(form.scopeType);
  const formNotificationMode = normalizeNotificationMode(form.notificationMode);
  const formIsToast = isToastNotificationMode(formNotificationMode);
  const isPackageAction =
    selectedActionType === AutomationTaskActionType.InstallPackage ||
    selectedActionType === AutomationTaskActionType.UpdatePackage ||
    selectedActionType === AutomationTaskActionType.RemovePackage ||
    selectedActionType === AutomationTaskActionType.UpdateOrInstallPackage;

  const filteredScripts = useMemo(() => {
    const items = scripts.data?.items ?? [];
    const q = scriptSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) => item.name.toLowerCase().includes(q) || item.id === form.scriptId,
    );
  }, [scripts.data?.items, scriptSearch, form.scriptId]);

  const scriptOptions = [
    { value: "", label: "Selecione" },
    ...filteredScripts.map((item) => ({ value: item.id, label: item.name })),
  ];

  const scopeClientOptions = useMemo(
    () => [
      { value: "", label: "Selecione" },
      ...(Array.isArray(clients.data) ? clients.data : []).map((item) => ({
        value: item.id,
        label: item.name,
      })),
    ],
    [clients.data],
  );

  const scopeSiteOptions = useMemo(
    () => [
      { value: "", label: "Selecione" },
      ...(Array.isArray(sites.data) ? sites.data : []).map((item) => ({
        value: item.id,
        label: item.name,
      })),
    ],
    [sites.data],
  );

  const scopeAgentOptions = useMemo(
    () => [
      { value: "", label: "Selecione" },
      ...(Array.isArray(agents.data) ? agents.data : []).map((item) => ({
        value: item.id,
        label: item.displayName ?? item.hostname,
      })),
    ],
    [agents.data],
  );

  const addCloseProcess = (rawValue: string) => {
    const candidates = rawValue
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!candidates.length) return;
    setForm((prev) => {
      const next = [...prev.closeProcesses];
      for (const candidate of candidates) {
        if (!next.some((item) => item.toLowerCase() === candidate.toLowerCase())) {
          next.push(candidate);
        }
      }
      return { ...prev, closeProcesses: next };
    });
    setCloseProcessInput("");
    clearError("closeProcesses");
  };

  const removeCloseProcess = (processName: string) => {
    setForm((prev) => ({
      ...prev,
      closeProcesses: prev.closeProcesses.filter((item) => item !== processName),
    }));
  };

  const handleClose = () => {
    setTouched(false);
    resetLocalState();
    onClose();
  };

  const handleSubmit = () => {
    const errors: Record<string, string> = {};
    const name = form.name.trim();
    if (!name) {
      errors.name = "Informe o nome da tarefa.";
    } else if (name.length > 200) {
      errors.name = "O nome deve ter no máximo 200 caracteres.";
    }

    if (form.key.trim()) {
      const keyErr = fieldKeyError(form.key, { allowHyphen: true });
      if (keyErr) errors.key = keyErr;
    }

    const triggerCount = [
      form.triggerImmediate,
      form.triggerRecurring,
      form.triggerOnUserLogin,
      form.triggerOnAgentCheckIn,
    ].filter(Boolean).length;

    if (!triggerCount) {
      errors.triggers = "Ative pelo menos um trigger.";
    }

    const actionType = normalizeActionType(form.actionType);
    const scopeType = normalizeScopeType(form.scopeType);

    if (form.triggerRecurring) {
      if (!form.scheduleCron.trim()) {
        errors.scheduleCron = "Informe a expressão cron quando o trigger recorrente estiver ativo.";
      } else if (!isValidCron(form.scheduleCron)) {
        errors.scheduleCron =
          "Expressão cron inválida — use 5 campos: minuto hora dia mês dia-semana (ex.: 0 8 * * 1).";
      }
    }

    if (scopeType !== AppApprovalScopeType.Global && !form.scopeId.trim()) {
      errors.scopeId = "Selecione o alvo correspondente ao escopo escolhido.";
    }

    const closeProcesses = form.closeProcesses.map((item) => item.trim()).filter(Boolean);
    const notificationMode = normalizeNotificationMode(form.notificationMode);
    const promptMode = notificationMode === AutomationNotificationMode.Prompt;
    const rawTimeout = form.promptTimeoutSeconds.trim();
    const parsedTimeout = /^\d+$/.test(rawTimeout) ? Number(rawTimeout) : NaN;

    if (promptMode) {
      if (!Number.isInteger(parsedTimeout) || parsedTimeout < 5 || parsedTimeout > 3600) {
        errors.promptTimeoutSeconds = "Tempo para ação padrão deve ficar entre 5 e 3600 segundos.";
      }
      if (closeProcesses.length > 20) {
        errors.closeProcesses = "Informe no máximo 20 processos para fechar.";
      } else {
        const invalidProcess = closeProcesses.find((item) => !/^[A-Za-z0-9._ -]+$/.test(item));
        if (invalidProcess) {
          errors.closeProcesses = `Processo inválido: "${invalidProcess}" (use letras, números, ponto, hífen ou underscore).`;
        }
      }
    }

    if (
      (actionType === AutomationTaskActionType.InstallPackage ||
        actionType === AutomationTaskActionType.UpdatePackage ||
        actionType === AutomationTaskActionType.RemovePackage ||
        actionType === AutomationTaskActionType.UpdateOrInstallPackage) &&
      !form.packageId.trim()
    ) {
      errors.packageId = "Selecione um pacote para esta ação.";
    }

    if (actionType === AutomationTaskActionType.RunScript && !form.scriptId) {
      errors.scriptId = "Selecione um script para executar.";
    }

    if (actionType === AutomationTaskActionType.CustomCommand && !form.commandPayload.trim()) {
      errors.commandPayload = "Informe o comando personalizado.";
    }

    const executionOrderMessage = executionOrderError(form.executionOrder);
    if (executionOrderMessage) {
      errors.executionOrder = executionOrderMessage;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstError = Object.values(errors)[0];
      toast.error(firstError);
      return;
    }

    setFieldErrors({});
    const executionOrder = Number(form.executionOrder);
    const promptTimeoutSeconds = promptMode ? parsedTimeout : 60;

    const payload: CreateAutomationTaskRequest = {
      name,
      description: editing ? form.description.trim() || "" : form.description.trim() || null,
      actionType,
      installationType: isPackageAction
        ? (Number(form.installationType) as AppInstallationType)
        : null,
      packageId: isPackageAction ? form.packageId.trim() : null,
      scriptId: actionType === AutomationTaskActionType.RunScript ? form.scriptId : null,
      commandPayload:
        actionType === AutomationTaskActionType.CustomCommand
          ? form.commandPayload.trim()
          : null,
      scopeType,
      scopeId: scopeType === AppApprovalScopeType.Global ? null : form.scopeId.trim(),
      includeTags: form.includeTags,
      excludeTags: form.excludeTags,
      triggerImmediate: form.triggerImmediate,
      triggerRecurring: form.triggerRecurring,
      triggerOnUserLogin: form.triggerOnUserLogin,
      triggerOnAgentCheckIn: form.triggerOnAgentCheckIn,
      scheduleCron: form.triggerRecurring ? form.scheduleCron.trim() : null,
      requiresApproval: promptMode,
      notificationMode,
      toastTiming: normalizeToastTiming(form.toastTiming),
      allowDefer: promptMode ? form.allowDefer : true,
      closeProcesses: promptMode ? closeProcesses : [],
      promptTimeoutSeconds,
      collectorFieldDefinitionId:
        actionType === AutomationTaskActionType.RunScript
          ? form.collectorFieldDefinitionId ||
            (editing ? "00000000-0000-0000-0000-000000000000" : null)
          : null,
      writeOutputToNote: form.writeOutputToNote,
      taskRespectMaintenanceWindow: form.taskRespectMaintenanceWindow,
      key: form.key.trim() || null,
      executionOrder,
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
          onSuccess: (result) => {
            const notice = packageNoticeFrom(result);
            setPackageNotice(notice);
            if (notice) {
              setSavedWithNotice(true);
              toast(notice, { icon: "⚠️" });
              return;
            }
            toast.success("Tarefa atualizada");
            handleClose();
          },
          onError: (error) => {
            const message =
              error instanceof Error ? error.message : "Falha ao atualizar tarefa";
            toast.error(message);
          },
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
        onSuccess: (result) => {
          const notice = packageNoticeFrom(result);
          setPackageNotice(notice);
          if (notice) {
            setSavedWithNotice(true);
            toast(notice, { icon: "⚠️" });
            onTransitionToEdit?.(result);
            setTouched(true);
            return;
          }
          toast.success(
            payload.triggerImmediate
              ? "Tarefa criada — execução imediata será disparada nos agents do escopo em segundos"
              : "Tarefa criada",
          );
          handleClose();
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Falha ao criar tarefa";
          toast.error(message);
        },
      },
    );
  };

  const activeTriggers = [
    form.triggerImmediate && "Imediato",
    form.triggerRecurring && "Recorrente",
    form.triggerOnUserLogin && "Login",
    form.triggerOnAgentCheckIn && "Check-in",
  ].filter(Boolean) as string[];

  const selectedScopeTargetName = useMemo(() => {
    if (selectedScopeType === AppApprovalScopeType.Global) return "Todos os agents";
    if (selectedScopeType === AppApprovalScopeType.Client) {
      return scopeClientOptions.find((o) => o.value === scopeClientId)?.label || "Não selecionado";
    }
    if (selectedScopeType === AppApprovalScopeType.Site) {
      return scopeSiteOptions.find((o) => o.value === scopeSiteId)?.label || "Não selecionado";
    }
    return scopeAgentOptions.find((o) => o.value === scopeAgentId)?.label || "Não selecionado";
  }, [
    selectedScopeType,
    scopeClientId,
    scopeSiteId,
    scopeAgentId,
    scopeClientOptions,
    scopeSiteOptions,
    scopeAgentOptions,
  ]);

  const errorEntries = Object.entries(fieldErrors);

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
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

        {packageNotice && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-sm text-foreground"
          >
            <div className="flex items-start gap-2.5">
              <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="space-y-1">
                <p className="font-medium">
                  {savedWithNotice
                    ? "Tarefa salva — aviso de pacote fora da App Store aprovada"
                    : "Pacote fora da App Store aprovada"}
                </p>
                <p className="text-xs text-muted">{packageNotice}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
          <div className="space-y-5">
            {/* 1. Identificação e Ação */}
            <section className="space-y-3 rounded-xl border border-border bg-surface-light/40 p-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary-100">
                  1
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Identificação e Ação</h3>
                  <p className="text-xs text-muted">Defina o nome e o que esta tarefa executará.</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Nome *"
                  value={form.name}
                  placeholder="Ex.: Instalar Google Chrome"
                  error={fieldErrors.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    clearError("name");
                    setForm((p) => ({ ...p, name, key: keyForTitle(name, p.key) }));
                  }}
                />
                <Select
                  label="Tipo de ação"
                  options={[
                    { value: String(AutomationTaskActionType.InstallPackage), label: "Instalar pacote" },
                    { value: String(AutomationTaskActionType.UpdatePackage), label: "Atualizar pacote" },
                    { value: String(AutomationTaskActionType.RemovePackage), label: "Remover pacote" },
                    {
                      value: String(AutomationTaskActionType.UpdateOrInstallPackage),
                      label: "Atualizar/Instalar pacote",
                    },
                    { value: String(AutomationTaskActionType.RunScript), label: "Executar script" },
                    {
                      value: String(AutomationTaskActionType.CustomCommand),
                      label: "Comando personalizado",
                    },
                  ]}
                  value={form.actionType}
                  onChange={(e) => {
                    const nextActionType = e.target.value;
                    clearError("packageId");
                    clearError("scriptId");
                    clearError("commandPayload");
                    setPackageNotice(null);
                    setSavedWithNotice(false);
                    setForm((p) => ({
                      ...p,
                      actionType: nextActionType,
                      executionOrder: executionOrderTouched
                        ? p.executionOrder
                        : String(defaultExecutionOrderForAction(nextActionType)),
                    }));
                  }}
                />
                <div className="md:col-span-2">
                  <TextArea
                    label="Observação geral"
                    rows={2}
                    value={form.description}
                    placeholder="Descreva o objetivo da tarefa ou observações para auditoria."
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>
              </div>

              {isPackageAction && (
                <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
                  <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                    <Select
                      label="Tipo de instalador"
                      options={[
                        { value: String(AppInstallationType.Winget), label: "Winget" },
                        { value: String(AppInstallationType.Chocolatey), label: "Chocolatey" },
                        { value: String(AppInstallationType.Custom), label: "Custom" },
                      ]}
                      value={form.installationType}
                      onChange={(e) => {
                        clearError("packageId");
                        setPackageNotice(null);
                        setSavedWithNotice(false);
                        setForm((p) => ({
                          ...p,
                          installationType: e.target.value,
                          packageId: "",
                        }));
                      }}
                    />
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-muted-foreground">
                        Pacote *
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={form.packageId}
                          readOnly
                          placeholder="Nenhum pacote selecionado"
                          error={fieldErrors.packageId}
                          className="flex-1 font-mono text-xs"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setPackagePickerOpen(true)}
                          aria-label="Pesquisar pacote"
                        >
                          <Icon name="search" className="h-4 w-4" />
                          Selecionar
                        </Button>
                      </div>
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                      checked={form.taskRespectMaintenanceWindow}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          taskRespectMaintenanceWindow: e.target.checked,
                        }))
                      }
                    />
                    <span>
                      Respeitar janela de manutenção (Configurações → Servidor)
                      <span className="block text-xs text-muted">
                        Fora da janela efetiva a execução fica adiada (&quot;deferred&quot;) e não
                        conta como falha.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {selectedActionType === AutomationTaskActionType.RunScript && (
                <div className="grid gap-3 rounded-lg border border-border bg-surface p-3 md:grid-cols-2">
                  <Input
                    label="Filtrar scripts"
                    value={scriptSearch}
                    placeholder="Buscar por nome do script..."
                    onChange={(e) => setScriptSearch(e.target.value)}
                  />
                  <Select
                    label="Script *"
                    options={scriptOptions}
                    value={form.scriptId}
                    error={fieldErrors.scriptId}
                    onChange={(e) => {
                      clearError("scriptId");
                      setForm((p) => ({ ...p, scriptId: e.target.value }));
                    }}
                  />
                </div>
              )}

              {selectedActionType === AutomationTaskActionType.CustomCommand && (
                <div className="rounded-lg border border-border bg-surface p-3">
                  <TextArea
                    label="Comando *"
                    className="min-h-24 font-mono text-xs"
                    placeholder="Ex.: gpupdate /force"
                    value={form.commandPayload}
                    error={fieldErrors.commandPayload}
                    hint="Executado diretamente no shell padrão do sistema operacional do agent."
                    onChange={(e) => {
                      clearError("commandPayload");
                      setForm((p) => ({ ...p, commandPayload: e.target.value }));
                    }}
                  />
                </div>
              )}
            </section>

            {/* 2. Escopo e Segmentação */}
            <section className="space-y-3 rounded-xl border border-border bg-surface-light/40 p-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary-100">
                  2
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Escopo e Segmentação</h3>
                  <p className="text-xs text-muted">Escolha quais máquinas receberão a tarefa.</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  label="Escopo"
                  options={[
                    { value: String(AppApprovalScopeType.Global), label: "Global (todo o ambiente)" },
                    { value: String(AppApprovalScopeType.Client), label: "Client" },
                    { value: String(AppApprovalScopeType.Site), label: "Site" },
                    { value: String(AppApprovalScopeType.Agent), label: "Agent específico" },
                  ]}
                  value={form.scopeType}
                  onChange={(e) => {
                    const nextScopeType = e.target.value;
                    clearError("scopeId");
                    setForm((p) => ({ ...p, scopeType: nextScopeType }));
                    if (Number(nextScopeType) === AppApprovalScopeType.Global) {
                      setScopeClientId("");
                      setScopeSiteId("");
                      setScopeAgentId("");
                    }
                  }}
                />
                {selectedScopeType !== AppApprovalScopeType.Global && (
                  <Select
                    label="Cliente alvo *"
                    options={scopeClientOptions}
                    value={scopeClientId}
                    error={
                      selectedScopeType === AppApprovalScopeType.Client
                        ? fieldErrors.scopeId
                        : undefined
                    }
                    onChange={(e) => {
                      clearError("scopeId");
                      setScopeClientId(e.target.value);
                      setScopeSiteId("");
                      setScopeAgentId("");
                    }}
                  />
                )}
                {selectedScopeType !== AppApprovalScopeType.Global &&
                  selectedScopeType !== AppApprovalScopeType.Client && (
                    <Select
                      label="Site alvo *"
                      options={scopeSiteOptions}
                      value={scopeSiteId}
                      disabled={!scopeClientId}
                      error={
                        selectedScopeType === AppApprovalScopeType.Site
                          ? fieldErrors.scopeId
                          : undefined
                      }
                      onChange={(e) => {
                        clearError("scopeId");
                        setScopeSiteId(e.target.value);
                        setScopeAgentId("");
                      }}
                    />
                  )}
                {selectedScopeType === AppApprovalScopeType.Agent && (
                  <Select
                    label="Agent alvo *"
                    options={scopeAgentOptions}
                    value={scopeAgentId}
                    disabled={!scopeSiteId}
                    error={fieldErrors.scopeId}
                    onChange={(e) => {
                      clearError("scopeId");
                      setScopeAgentId(e.target.value);
                    }}
                  />
                )}
              </div>

              {selectedScopeType === AppApprovalScopeType.Global &&
                form.includeTags.length === 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground">
                    <Icon name="public" className="h-4 w-4 shrink-0 text-warning" />
                    <span>
                      Escopo Global sem tags de inclusão: esta tarefa será aplicada a{" "}
                      <strong>todos os agents</strong> do ambiente.
                    </span>
                  </div>
                )}

              <TaskTagSelector
                includeTags={form.includeTags}
                excludeTags={form.excludeTags}
                knownTags={knownTags.data ?? []}
                onChangeInclude={(includeTags) => setForm((p) => ({ ...p, includeTags }))}
                onChangeExclude={(excludeTags) => setForm((p) => ({ ...p, excludeTags }))}
              />
            </section>

            {/* 3. Triggers e Agendamento */}
            <section className="space-y-3 rounded-xl border border-border bg-surface-light/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary-100">
                    3
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Triggers e Agendamento
                    </h3>
                    <p className="text-xs text-muted">
                      Selecione pelo menos um gatilho de execução.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-expanded={triggersHelpOpen}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                  onClick={() => setTriggersHelpOpen((v) => !v)}
                >
                  <Icon name="info" className="h-3.5 w-3.5" />
                  {triggersHelpOpen ? "Ocultar guia" : "Como funcionam?"}
                </button>
              </div>

              {triggersHelpOpen && (
                <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
                  <p className="text-muted">
                    Você pode combinar múltiplos triggers — o agent deduplica execuções no mesmo
                    evento.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-surface p-2.5">
                      <p className="font-medium text-foreground">Imediato</p>
                      <p className="mt-0.5 text-muted">
                        Dispara em segundos após sincronizar a policy. Ideal para rollouts pontuais.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface p-2.5">
                      <p className="font-medium text-foreground">Recorrente</p>
                      <p className="mt-0.5 text-muted">
                        Executa conforme expressão cron (5 campos) no fuso local do agent.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface p-2.5">
                      <p className="font-medium text-foreground">Login do usuário</p>
                      <p className="mt-0.5 text-muted">
                        Dispara a cada logon interativo no Windows. Útil para ações por perfil.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface p-2.5">
                      <p className="font-medium text-foreground">Check-in do agent</p>
                      <p className="mt-0.5 text-muted">
                        Executa ao conectar/aplicar policy, garantindo conformidade contínua.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
                {(
                  [
                    { key: "triggerImmediate", label: "Imediato", hint: "Ao aplicar a policy" },
                    { key: "triggerRecurring", label: "Recorrente", hint: "Agendada por cron" },
                    { key: "triggerOnUserLogin", label: "Login do usuário", hint: "Ao logar no Windows" },
                    { key: "triggerOnAgentCheckIn", label: "Check-in do agent", hint: "Ao sincronizar" },
                  ] as const
                ).map((t) => {
                  const checked = form[t.key];
                  return (
                    <label
                      key={t.key}
                      className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                        checked
                          ? "border-primary/60 bg-primary/10"
                          : "border-border bg-surface hover:bg-surface-hover"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                        checked={checked}
                        onChange={(e) => {
                          clearError("triggers");
                          if (t.key === "triggerRecurring" && !e.target.checked) {
                            clearError("scheduleCron");
                          }
                          setForm((p) => ({ ...p, [t.key]: e.target.checked }));
                        }}
                      />
                      <span>
                        <span className="block font-medium text-foreground">{t.label}</span>
                        <span className="block text-xs text-muted">{t.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {fieldErrors.triggers && (
                <p className="text-xs text-danger">{fieldErrors.triggers}</p>
              )}

              {form.triggerRecurring && (
                <TaskCronAssistant
                  value={form.scheduleCron}
                  error={fieldErrors.scheduleCron}
                  onChange={(scheduleCron) => {
                    clearError("scheduleCron");
                    setForm((p) => ({ ...p, scheduleCron }));
                  }}
                />
              )}
            </section>

            {/* 4. Notificação, Coleta e Avançado */}
            <section className="space-y-4 rounded-xl border border-border bg-surface-light/40 p-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary-100">
                  4
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Notificação, Coleta e Avançado
                  </h3>
                  <p className="text-xs text-muted">
                    Experiência do usuário final, coleta de saída e prioridade.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Notificação ao usuário
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      {
                        value: String(AutomationNotificationMode.Silent),
                        title: "Silenciosa",
                        desc: "Executa em segundo plano sem avisar o usuário.",
                      },
                      {
                        value: String(AutomationNotificationMode.Toast),
                        title: "Toast na interface do agent",
                        desc: "Aviso informativo sem interação.",
                      },
                      {
                        value: String(AutomationNotificationMode.NativeToast),
                        title: "Toast nativo do sistema",
                        desc: "Notificação do Windows / Action Center.",
                      },
                      {
                        value: String(AutomationNotificationMode.Prompt),
                        title: "Prompt nativo (Continuar / Adiar)",
                        desc: "Permite adiar e fechar processos ao expirar.",
                      },
                    ] as const
                  ).map((opt) => {
                    const selected = String(formNotificationMode) === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition-colors ${
                          selected
                            ? "border-primary/60 bg-primary/10"
                            : "border-border bg-surface hover:bg-surface-hover"
                        }`}
                      >
                        <input
                          type="radio"
                          name="task-notification-mode"
                          value={opt.value}
                          checked={selected}
                          onChange={(e) =>
                            setForm((p) => ({ ...p, notificationMode: e.target.value }))
                          }
                          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                        />
                        <span>
                          <span className="block font-medium text-foreground">{opt.title}</span>
                          <span className="block text-xs text-muted">{opt.desc}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                {formIsToast && (
                  <div className="max-w-xs">
                    <Select
                      label="Quando notificar"
                      options={[
                        { value: String(AutomationToastTiming.Before), label: "Antes de executar" },
                        { value: String(AutomationToastTiming.After), label: "Após a conclusão" },
                      ]}
                      value={form.toastTiming}
                      onChange={(e) => setForm((p) => ({ ...p, toastTiming: e.target.value }))}
                    />
                  </div>
                )}

                {formNotificationMode === AutomationNotificationMode.Prompt && (
                  <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Select
                        label="Usuário pode adiar"
                        options={[
                          { value: "true", label: "Sim" },
                          { value: "false", label: "Não" },
                        ]}
                        value={String(form.allowDefer)}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, allowDefer: e.target.value === "true" }))
                        }
                      />
                      <Input
                        label="Tempo para ação padrão (segundos)"
                        type="number"
                        min={5}
                        max={3600}
                        value={form.promptTimeoutSeconds}
                        error={fieldErrors.promptTimeoutSeconds}
                        onChange={(e) => {
                          clearError("promptTimeoutSeconds");
                          setForm((p) => ({ ...p, promptTimeoutSeconds: e.target.value }));
                        }}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-muted-foreground">
                        Processos a fechar antes de executar
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={closeProcessInput}
                          placeholder="Ex.: WINWORD (Enter ou vírgula para adicionar)"
                          error={fieldErrors.closeProcesses}
                          onChange={(e) => setCloseProcessInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              addCloseProcess(closeProcessInput);
                            }
                          }}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!closeProcessInput.trim()}
                          onClick={() => addCloseProcess(closeProcessInput)}
                        >
                          Adicionar
                        </Button>
                      </div>
                      {!!form.closeProcesses.length && (
                        <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface-light p-2">
                          {form.closeProcesses.map((processName) => (
                            <span
                              key={processName}
                              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground"
                            >
                              {processName}
                              <button
                                type="button"
                                className="text-muted hover:text-foreground"
                                onClick={() => removeCloseProcess(processName)}
                                aria-label={`Remover processo ${processName}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-border/60 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Coleta de dados
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {selectedActionType === AutomationTaskActionType.RunScript && (
                    <Select
                      label="Gravar saída em campo (tarefa coletora)"
                      options={collectorFieldOptions}
                      value={form.collectorFieldDefinitionId}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, collectorFieldDefinitionId: e.target.value }))
                      }
                      hint="Última linha da saída. Não use o mesmo campo via MDZ_COLLECT."
                    />
                  )}
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                      checked={form.writeOutputToNote}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, writeOutputToNote: e.target.checked }))
                      }
                    />
                    <span>
                      Gravar saída como nota no agent
                      <span className="block text-xs text-muted">
                        Salva tarefa, resultado e saída (até 4000 caracteres) no histórico do agent.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="space-y-3 border-t border-border/60 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Configurações avançadas
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="Ordem de execução (0–99)"
                    type="number"
                    min={MIN_EXECUTION_ORDER}
                    max={MAX_EXECUTION_ORDER}
                    step={1}
                    value={form.executionOrder}
                    error={fieldErrors.executionOrder ?? (executionOrderError(form.executionOrder) ?? undefined)}
                    hint="Menor número roda primeiro. Empate desempata pela mais antiga."
                    onChange={(e) => {
                      clearError("executionOrder");
                      setExecutionOrderTouched(true);
                      setForm((p) => ({ ...p, executionOrder: e.target.value }));
                    }}
                  />
                  <Input
                    label="Chave (opcional)"
                    value={form.key}
                    placeholder="ex: coletar_anydesk"
                    hint="Identificador padronizado ([a-z0-9_-]) para relatórios e automações."
                    error={
                      fieldErrors.key ??
                      (form.key.trim()
                        ? fieldKeyError(form.key, { allowHyphen: true }) ?? undefined
                        : undefined)
                    }
                    onChange={(e) => {
                      clearError("key");
                      markTouched();
                      setForm((p) => ({ ...p, key: e.target.value.toLowerCase() }));
                    }}
                  />
                </div>
              </div>
            </section>

            {editing && editingId ? <CustomFieldsUsedByPanel taskId={editingId} /> : null}
          </div>

          {/* Coluna lateral: Resumo em tempo real */}
          <aside className="space-y-3">
            <div className="sticky top-0 space-y-3 rounded-xl border border-border bg-surface-light/60 p-4 text-xs">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                <span className="font-semibold text-foreground">Resumo da tarefa</span>
                <Badge color={form.isActive ? "success" : "slate"}>
                  {form.isActive ? "Ativa" : "Inativa"}
                </Badge>
              </div>

              <div className="space-y-2.5">
                <div>
                  <p className="text-muted">Ação</p>
                  <p className="font-medium text-foreground">
                    {actionDisplayLabel(selectedActionType)}
                  </p>
                  {isPackageAction && (
                    <p className="font-mono text-[11px] text-muted truncate">
                      {installationTypeLabel(form.installationType)} · {form.packageId || "sem pacote"}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-muted">Escopo</p>
                  <p className="font-medium text-foreground">
                    {scopeLabel(selectedScopeType)} · {selectedScopeTargetName}
                  </p>
                  {(form.includeTags.length > 0 || form.excludeTags.length > 0) && (
                    <p className="text-[11px] text-muted">
                      +{form.includeTags.length} incluída(s) · -{form.excludeTags.length} excluída(s)
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-muted">Gatilhos</p>
                  <p className="font-medium text-foreground">
                    {activeTriggers.length > 0 ? activeTriggers.join(", ") : "Nenhum"}
                  </p>
                  {form.triggerRecurring && form.scheduleCron.trim() && (
                    <p className="mt-0.5 text-[11px] text-muted">
                      {describeCron(form.scheduleCron)}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-muted">Notificação</p>
                  <p className="font-medium text-foreground">
                    {notificationModeLabel(formNotificationMode)}
                  </p>
                </div>

                <div>
                  <p className="text-muted">Ordem de execução</p>
                  <p className="font-mono font-medium text-foreground">
                    {form.executionOrder || "-"}
                  </p>
                </div>
              </div>

              {errorEntries.length > 0 && (
                <div className="rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-danger">
                  <p className="font-medium">
                    {errorEntries.length} pendência(s) para salvar:
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
                    {errorEntries.map(([k, msg]) => (
                      <li key={k}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Footer fixo */}
        <div className="sticky bottom-0 -mx-6 -mb-4 mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-6 py-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <button
              type="button"
              role="switch"
              aria-checked={form.isActive}
              aria-label="Tarefa ativa"
              onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                form.isActive ? "bg-success" : "bg-slate-600"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  form.isActive ? "translate-x-4.5" : "translate-x-1"
                }`}
              />
            </button>
            <span className="font-medium text-foreground">
              {form.isActive ? "Tarefa ativa" : "Tarefa inativa"}
            </span>
          </label>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancelar
            </Button>
            {savedWithNotice ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSubmit}
                  loading={createMutation.isPending || updateMutation.isPending}
                >
                  Salvar alterações
                </Button>
                <Button type="button" onClick={handleClose}>
                  Entendi, fechar
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                loading={createMutation.isPending || updateMutation.isPending}
                disabled={editing ? taskDetail.isLoading || taskDetail.isError : false}
                title={
                  editing && (taskDetail.isLoading || taskDetail.isError)
                    ? "Aguarde o carregamento dos detalhes da tarefa para não sobrescrever campos com valores vazios"
                    : undefined
                }
              >
                {editing ? "Salvar alterações" : "Criar tarefa"}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <TaskPackagePickerModal
        open={packagePickerOpen}
        onClose={() => setPackagePickerOpen(false)}
        installationType={form.installationType}
        onInstallationTypeChange={(installationType) => {
          setPackageNotice(null);
          setSavedWithNotice(false);
          setForm((p) => ({ ...p, installationType, packageId: "" }));
        }}
        onSelectPackage={(packageId) => {
          clearError("packageId");
          setPackageNotice(null);
          setSavedWithNotice(false);
          setForm((p) => ({ ...p, packageId }));
        }}
      />
    </>
  );
}
