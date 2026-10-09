import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Cloud,
  Download,
  FileStack,
  Handshake,
  HardDrive,
  Layers,
  Lock,
  RotateCcw,
  Save,
  ShieldCheck,
  Store,
  Upload,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";
import {
  ConfigurationFieldEditor,
  AiIntegrationCard,
  BackgroundProcessingCard,
  ConfigHealthCard,
  LockedFieldsEditor,
  chipActive,
  chipCustom,
  parseBackgroundProcessingSettings,
  selectedIcon,
  selectedSurface,
  statusSurface,
  statusText,
  tintedIcon,
  unselectedIcon,
  unselectedSurface,
} from "@/components/configuration";
import { Button, Card, CardHeader, ErrorDisplay, Input, Loading, Modal } from "@/components/ui";
import {
  useExportServerConfig,
  useImportServerConfig,
  usePatchServerNatsConfig,
  usePatchServerConfig,
  useResetServerConfig,
  useServerConfig,
  useTestNatsServer,
  useTestObjectStorage,
  useTicketAttachmentSettings,
  useUpdateTicketAttachmentSettings,
} from "../../hooks/useConfigurationApi";
import {
  buildServerDraft,
  formatFieldValue,
  getDependentsToDisable,
  getFeatureDependencyIssue,
  parseFieldValue,
  serverEditableFields,
  validateFieldValue,
} from "@/utils/configurationEditors";
import { parseAIIntegrationSettings } from "@/services/configurationApi";
import { ApiError } from "@/api";
import type { ConfigurationValue, TicketAttachmentSettings } from "@/api";
import type { EditableField } from "@/utils/configurationEditors";

interface FormValues {
  values: Record<string, string>;
}

type SectionKey =
  | "features"
  | "policy"
  | "agent"
  | "storage"
  | "nats"
  | "attachments"
  | "advanced";

const featureIcons: Record<string, React.ReactNode> = {
  recoveryEnabled: <HardDrive className="h-4 w-4" />,
  discoveryEnabled: <Wifi className="h-4 w-4" />,
  p2PFilesEnabled: <Layers className="h-4 w-4" />,
  cloudBootstrapEnabled: <Cloud className="h-4 w-4" />,
  chatAIEnabled: <Bot className="h-4 w-4" />,
  supportEnabled: <Activity className="h-4 w-4" />,
  knowledgeBaseEnabled: <ShieldCheck className="h-4 w-4" />,
  zeroTouchEnabled: <Handshake className="h-4 w-4" />,
};

export default function ServerConfigurationPage() {
  const serverQuery = useServerConfig();
  const patchMutation = usePatchServerConfig();
  const patchNatsMutation = usePatchServerNatsConfig();
  const resetMutation = useResetServerConfig();
  const exportMutation = useExportServerConfig();
  const importMutation = useImportServerConfig();
  const testNatsMutation = useTestNatsServer();
  const testStorageMutation = useTestObjectStorage();

  const [confirmReset, setConfirmReset] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [confirmSave, setConfirmSave] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<{ applied: string[]; unknown: string[] } | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [savingNats, setSavingNats] = useState(false);
  const [savingStorage, setSavingStorage] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
    features: false,
    policy: false,
    agent: false,
    storage: false,
    nats: false,
    attachments: false,
    advanced: false,
  });
  const [natsTestResult, setNatsTestResult] = useState<{
    ok: boolean;
    errors: string[];
    latencyMs?: number;
    host: string;
  } | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    configurationValid: boolean;
    bucketReachable: boolean;
    errors: string[];
    latencyMs: number;
  } | null>(null);

  const {
    setValue,
    getValues,
    watch,
    formState: { errors },
    trigger,
  } = useForm<FormValues>({
    defaultValues: { values: {} },
    mode: "onBlur",
  });

  const formValues = watch();

  const markPending = (key: string) => {
    setPendingKeys((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  };

  const clearPending = (keys: string[] | Set<string>) => {
    const list = keys instanceof Set ? [...keys] : keys;
    setPendingKeys((current) => {
      const next = new Set(current);
      let changed = false;
      for (const key of list) changed = next.delete(key) || changed;
      return changed ? next : current;
    });
  };

  // Ref evita que o reseed por refetch (ex.: após salvar) sobrescreva edições pendentes.
  const pendingKeysRef = useRef(pendingKeys);
  useEffect(() => {
    pendingKeysRef.current = pendingKeys;
  }, [pendingKeys]);

  useEffect(() => {
    if (!serverQuery.data) return;
    const draft = buildServerDraft(serverQuery.data, serverEditableFields);
    for (const field of serverEditableFields) {
      if (pendingKeysRef.current.has(field.key)) continue;
      setValue(`values.${field.key}` as never, draft[field.key] as never);
    }
  }, [serverQuery.data, setValue]);

  /**
   * Salva apenas os campos alterados (PATCH). Antes, o botão "Salvar tudo" fazia PUT
   * da entidade inteira e apagava campos fora da tela (anexos, IA, storage, retenção).
   */
  const saveChanges = async () => {
    if (pendingKeys.size === 0) {
      toast("Nenhuma alteração pendente.");
      return;
    }

    const payload: Record<string, ConfigurationValue> = {};
    for (const field of serverEditableFields) {
      if (!pendingKeys.has(field.key)) continue;
      let value = String(getValues(`values.${field.key}` as never) ?? "");
      if (field.kind === "boolean" && value === "") value = "false";
      const validation = validateFieldValue(field.kind, value, field.key);
      if (validation !== true) {
        toast.error(`${field.label}: ${validation}`);
        return;
      }
      payload[field.key] = parseFieldValue(field.kind, value, field.key);
    }

    try {
      await patchMutation.mutateAsync(payload);
      clearPending(pendingKeys);
      toast.success("Alterações salvas.");
    } catch (error) {
      toast.error(readApiError(error));
    }
  };

  const discardChanges = () => {
    if (!serverQuery.data) return;
    const draft = buildServerDraft(serverQuery.data, serverEditableFields);
    for (const field of serverEditableFields) {
      setValue(`values.${field.key}` as never, draft[field.key] as never, {
        shouldDirty: false,
        shouldTouch: false,
      });
    }
    setPendingKeys(new Set());
    toast("Alterações descartadas.");
  };

  const pendingChanges = useMemo(
    () =>
      serverEditableFields
        .filter((field) => pendingKeys.has(field.key))
        .map((field) => ({
          fieldKey: field.key,
          label: field.label,
          before: describePendingValue(field.key, formatFieldValue(serverQuery.data?.[field.key], field.key)),
          after: describePendingValue(
            field.key,
            formatFieldValue(getValues(`values.${field.key}` as never) as never, field.key),
          ),
        })),
    [pendingKeys, serverQuery.data, formValues, getValues],
  );

  const handleExport = async () => {
    try {
      const data = await exportMutation.mutateAsync();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `server-config-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Configuração exportada (sem segredos).");
    } catch (error) {
      toast.error(readApiError(error));
    }
  };

  const parseImportSettings = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(importText) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const record = parsed as Record<string, unknown>;
      const settings = record.settings;
      if (settings && typeof settings === "object" && !Array.isArray(settings)) {
        return settings as Record<string, unknown>;
      }
      return record;
    } catch {
      return null;
    }
  };

  const handleValidateImport = async () => {
    const settings = parseImportSettings();
    if (!settings) {
      toast.error("JSON inválido.");
      return;
    }
    try {
      const result = await importMutation.mutateAsync({ settings, dryRun: true });
      setImportPreview({ applied: result.appliedFields, unknown: result.unknownFields });
    } catch (error) {
      toast.error(readApiError(error));
    }
  };

  const handleImport = async () => {
    const settings = parseImportSettings();
    if (!settings) {
      toast.error("JSON inválido.");
      return;
    }
    try {
      const result = await importMutation.mutateAsync({ settings, dryRun: false });
      setImportOpen(false);
      setImportPreview(null);
      setImportText("");
      setPendingKeys(new Set());
      toast.success(`Configuração importada (${result.appliedFields.length} campo(s)).`);
    } catch (error) {
      toast.error(readApiError(error));
    }
  };

  const savePartial = async (fieldKey: string) => {
    const field = serverEditableFields.find((item) => item.key === fieldKey);
    if (!field) return;
    const isValid = await trigger(`values.${field.key}` as never);
    if (!isValid) return;
    const value = getValues(`values.${field.key}` as never) ?? "";
    try {
      await patchMutation.mutateAsync({
        [field.key]: parseFieldValue(field.kind, String(value), field.key),
      });
      clearPending([field.key]);
      toast.success(`"${field.label}" atualizado.`);
    } catch (error) {
      toast.error(readApiError(error));
    }
  };

  const saveStorageFields = async () => {
    setSavingStorage(true);
    const storageFields = serverEditableFields.filter((f) => f.group === "storage");
    const payload: Record<string, ConfigurationValue> = {};
    for (const field of storageFields) {
      let value = String(getValues(`values.${field.key}` as never) ?? "");
      if (field.kind === "boolean" && value === "") value = "false";
      payload[field.key] = parseFieldValue(field.kind, value, field.key);
    }
    try {
      await patchMutation.mutateAsync(payload);
      clearPending(storageFields.map((field) => field.key));
      toast.success("Configurações de armazenamento salvas.");
      setTestResult(null);
    } catch (error) {
      toast.error(readApiError(error));
    } finally {
      setSavingStorage(false);
    }
  };

  const saveNatsFields = async () => {
    setSavingNats(true);
    const natsFields = serverEditableFields.filter((f) => f.group === "nats");
    const payload: Record<string, ConfigurationValue> = {};
    for (const field of natsFields) {
      const value = String(getValues(`values.${field.key}` as never) ?? "");
      const validation = validateFieldValue(field.kind, value, field.key);
      if (validation !== true) {
        toast.error(`${field.label}: ${validation}`);
        setSavingNats(false);
        return;
      }
      payload[field.key] = parseFieldValue(field.kind, value, field.key);
    }
    try {
      await patchNatsMutation.mutateAsync(payload);
      clearPending(natsFields.map((field) => field.key));
      toast.success("Configuração NATS salva.");
      setNatsTestResult(null);
    } catch (error) {
      toast.error(readApiError(error));
    } finally {
      setSavingNats(false);
    }
  };

  const testConnection = async () => {
    setTestResult(null);
    try {
      const result = await testStorageMutation.mutateAsync();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        configurationValid: false,
        bucketReachable: false,
        errors: [readApiError(error)],
        latencyMs: 0,
      });
    }
  };

  const testNatsConnection = async () => {
    setNatsTestResult(null);
    const externalHost = String(getValues("values.natsServerHostExternal" as never) ?? "").trim();
    const internalHost = String(getValues("values.natsServerHostInternal" as never) ?? "").trim();
    const host = externalHost || internalHost;

    if (!host) {
      toast.error("Informe um host externo ou interno para testar.");
      return;
    }

    const validation = validateFieldValue("string", host, "natsServerHostExternal");
    if (validation !== true) {
      toast.error(String(validation));
      return;
    }

    try {
      const result = await testNatsMutation.mutateAsync({ url: host });
      setNatsTestResult({
        ok: !!result?.ok,
        errors: result?.errors ?? [],
        latencyMs: result?.latencyMs,
        host,
      });
    } catch (error) {
      setNatsTestResult({
        ok: false,
        errors: [readApiError(error)],
        host,
      });
    }
  };

  const resetServer = async () => {
    setConfirmReset(false);
    setResetConfirmText("");
    try {
      await resetMutation.mutateAsync();
      toast.success("Configuração do servidor restaurada para os padrões.");
    } catch (error) {
      toast.error(readApiError(error));
    }
  };

  const toggleSection = (section: SectionKey) => {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const renderSectionAction = (section: SectionKey) => {
    const collapsed = collapsedSections[section];
    return (
      <button
        type="button"
        onClick={() => toggleSection(section)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-light px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
      >
        {collapsed ? "Expandir" : "Recolher"}
        {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>
    );
  };

  if (serverQuery.isLoading) {
    return <Loading message="Carregando configuração do servidor..." />;
  }

  if (serverQuery.isError) {
    return <ErrorDisplay message={readApiError(serverQuery.error)} onRetry={serverQuery.refetch} />;
  }

  const featureFields = serverEditableFields.filter((f) => f.group === "features");
  const policyFields = serverEditableFields.filter((f) => f.group === "policy");
  const agentFields = serverEditableFields.filter((f) => f.group === "agent");
  const natsFields = serverEditableFields.filter((f) => f.group === "nats");
  const hiddenAdvancedFieldKeys = new Set(["brandingSettingsJson"]);
  const advancedFields = serverEditableFields.filter(
    (f) => f.group === "advanced" && !hiddenAdvancedFieldKeys.has(f.key),
  );
  const storageTextFields = serverEditableFields.filter(
    (f) => f.group === "storage" && (f.kind === "string" || f.kind === "number"),
  );
  const storageToggleFields = serverEditableFields.filter(
    (f) => f.group === "storage" && f.kind === "boolean",
  );
  const enabledFeatureCount = featureFields.filter(
    (field) => String(formValues.values?.[field.key] ?? "false") === "true",
  ).length;
  const natsEnabled = String(formValues.values?.natsEnabled ?? "false") === "true";
  const storageConfigured =
    String(formValues.values?.objectStorageEndpoint ?? "").trim().length > 0 &&
    String(formValues.values?.objectStorageBucketName ?? "").trim().length > 0;

  const renderStorageFieldEditor = (field: EditableField) => {
    const value = formValues.values?.[field.key] ?? "";
    const error = errors.values?.[field.key]?.message;
    return (
      <ConfigurationFieldEditor
        key={field.key}
        fieldLabel={field.label}
        fieldKey={field.key}
        showFieldKey={false}
        fieldKind={field.kind}
        value={String(value)}
        error={typeof error === "string" ? error : undefined}
        inherited={false}
        effectiveValue={serverQuery.data?.[field.key]}
        origin="Server"
        disableInheritance
        description={field.description}
        unit={field.unit}
        hideSaveButton
        variant="plain"
        secret={field.key === "objectStorageSecretKey"}
        secretConfigured={Boolean(serverQuery.data?.objectStorageSecretKeyConfigured)}
        onValueChange={(next) => {
          markPending(field.key);
          setValue(`values.${field.key}` as never, next as never, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          });
        }}
        onToggleInherit={() => undefined}
        onSavePatch={() => undefined}
        saving={false}
      />
    );
  };

  // Campos de texto do storage renderizados na variante compacta ("plain"),
  // agrupados por assunto nos painéis abaixo.
  const renderStorageTextField = (key: string) => {
    const field = storageTextFields.find((item) => item.key === key);
    return field ? renderStorageFieldEditor(field) : null;
  };

  const renderNatsFieldEditor = (field: EditableField) => {
    const value = formValues.values?.[field.key] ?? "";
    const error = errors.values?.[field.key]?.message;
    return (
      <ConfigurationFieldEditor
        key={field.key}
        fieldLabel={field.label}
        fieldKey={field.key}
        showFieldKey={false}
        fieldKind={field.kind}
        value={String(value)}
        error={typeof error === "string" ? error : undefined}
        inherited={false}
        effectiveValue={serverQuery.data?.[field.key]}
        origin="Server"
        disableInheritance
        description={field.description}
        hideSaveButton
        onValueChange={(next) => {
          markPending(field.key);
          setValue(`values.${field.key}` as never, next as never, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          });
        }}
        onToggleInherit={() => undefined}
        onSavePatch={() => undefined}
        saving={false}
      />
    );
  };

  const renderFieldEditor = (field: EditableField) => {
    const value = formValues.values?.[field.key] ?? "";
    const error = errors.values?.[field.key]?.message;
    return (
      <ConfigurationFieldEditor
        key={field.key}
        fieldLabel={field.label}
        fieldKey={field.key}
        showFieldKey={false}
        fieldKind={field.kind}
        value={String(value)}
        error={typeof error === "string" ? error : undefined}
        inherited={false}
        effectiveValue={serverQuery.data?.[field.key]}
        origin="Server"
        disableInheritance
        description={field.description}
        unit={field.unit}
        onValueChange={(next) => {
          markPending(field.key);
          setValue(`values.${field.key}` as never, next as never, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          });
        }}
        onToggleInherit={() => undefined}
        onSavePatch={async () => {
          setValue(`values.${field.key}` as never, String(value) as never, {
            shouldValidate: true,
          });
          const result = validateFieldValue(field.kind, String(value), field.key);
          if (result !== true) {
            toast.error(result);
            return;
          }
          await savePartial(field.key);
        }}
        saving={patchMutation.isPending}
      />
    );
  };

  const collectFeatureValues = (): Record<string, string> => {
    const values: Record<string, string> = {};
    for (const featureField of serverEditableFields) {
      values[featureField.key] = String(
        formValues.values?.[featureField.key] ?? "false",
      );
    }
    return values;
  };

  const renderBooleanToggleCard = (field: EditableField) => {
    const rawValue = formValues.values?.[field.key];
    const isEnabled = String(rawValue ?? "false") === "true";
    const isToggling = togglingKey === field.key;
    const dependencyIssue = isEnabled
      ? getFeatureDependencyIssue(field.key, collectFeatureValues())
      : null;

    const toggle = async () => {
      if (isToggling) return;
      const next = isEnabled ? "false" : "true";
      const currentValues = collectFeatureValues();

      // Não permite ativar uma funcionalidade cuja dependência está desligada:
      // o agent ignoraria a combinação (ex.: P2P sem caminho de descoberta).
      if (next === "true") {
        const issue = getFeatureDependencyIssue(field.key, currentValues);
        if (issue) {
          toast.error(issue);
          return;
        }
      }

      // Desativar uma dependência desliga junto as funcionalidades que ficariam
      // sem caminho de descoberta (ex.: Descoberta de Rede → P2P e Zero-Touch).
      const dependents =
        next === "false" ? getDependentsToDisable(field.key, currentValues) : [];

      setValue(`values.${field.key}` as never, next as never, {
        shouldDirty: true,
        shouldTouch: true,
      });
      markPending(field.key);
      for (const dependent of dependents) {
        setValue(`values.${dependent}` as never, "false" as never, {
          shouldDirty: true,
          shouldTouch: true,
        });
        markPending(dependent);
      }
      setTogglingKey(field.key);
      try {
        const payload: Record<string, ConfigurationValue> = {
          [field.key]: parseFieldValue("boolean", next, field.key),
        };
        for (const dependent of dependents) {
          payload[dependent] = false;
        }

        await patchMutation.mutateAsync(payload);
        clearPending([field.key, ...dependents]);

        const dependentsSuffix =
          dependents.length > 0
            ? ` ${dependents
                .map(
                  (key) =>
                    serverEditableFields.find((item) => item.key === key)?.label ??
                    key,
                )
                .join(", ")} também desativado.`
            : "";
        toast.success(
          `"${field.label}" ${next === "true" ? "ativado" : "desativado"}.${dependentsSuffix}`,
        );
      } catch (error) {
        toast.error(readApiError(error));
        setValue(`values.${field.key}` as never, String(isEnabled) as never);
        for (const dependent of dependents) {
          setValue(`values.${dependent}` as never, "true" as never);
        }
        clearPending([field.key, ...dependents]);
      } finally {
        setTogglingKey(null);
      }
    };

    return (
      <button
        key={field.key}
        type="button"
        role="switch"
        aria-checked={isEnabled}
        onClick={toggle}
        disabled={isToggling}
        className={`group relative flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all ${
          isEnabled ? `${selectedSurface} hover:border-sky-500/50` : unselectedSurface
        }`}
      >
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            isEnabled ? selectedIcon : unselectedIcon
          }`}
        >
          {featureIcons[field.key] ?? <Zap className="h-4 w-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${isEnabled ? "text-foreground" : "text-muted"}`}>
            {field.label}
          </p>
          {field.description && (
            <p className="mt-0.5 text-xs text-muted">{field.description}</p>
          )}
          {dependencyIssue && (
            <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{dependencyIssue}</span>
            </p>
          )}
        </div>

        {isToggling ? (
          <div className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-sky-500/30 border-t-sky-600 dark:border-t-sky-400" />
        ) : (
          <div
            className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
              isEnabled ? "bg-sky-500" : "bg-surface-hover"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                isEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </div>
        )}
      </button>
    );
  };

  return (
    <>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Configuração Global do Servidor</h2>
            <p className="mt-1 text-sm text-muted">
              Valores base aplicados a todos os clientes e sites via herança.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs ${
                pendingKeys.size > 0 ? statusSurface.warning : statusSurface.neutral
              }`}
            >
              {pendingKeys.size > 0
                ? `${pendingKeys.size} alteração(ões) pendente(s)`
                : "Sem alterações pendentes"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleExport}
              loading={exportMutation.isPending}
            >
              <Download className="h-3.5 w-3.5" />
              Exportar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setImportPreview(null);
                setImportOpen(true);
              }}
            >
              <Upload className="h-3.5 w-3.5" />
              Importar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={discardChanges}
              disabled={pendingKeys.size === 0}
            >
              Descartar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setConfirmSave(true)}
              disabled={pendingKeys.size === 0}
            >
              <Save className="h-3.5 w-3.5" />
              Salvar alterações
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setResetConfirmText("");
                setConfirmReset(true);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar padrões
            </Button>
          </div>
        </div>

        <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface-light p-3">
              <p className="text-xs uppercase tracking-wide text-muted">Módulos ativos</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {enabledFeatureCount}/{featureFields.length}
              </p>
              <p className="text-xs text-muted">Funcionalidades globais habilitadas</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-light p-3">
              <p className="text-xs uppercase tracking-wide text-muted">NATS</p>
              <p className={`mt-1 text-lg font-semibold ${natsEnabled ? statusText.success : statusText.warning}`}>
                {natsEnabled ? "Habilitado" : "Desabilitado"}
              </p>
              <p className="text-xs text-muted">Canal de realtime e comunicação</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-light p-3">
              <p className="text-xs uppercase tracking-wide text-muted">Object Storage</p>
              <p className={`mt-1 text-lg font-semibold ${storageConfigured ? statusText.success : statusText.warning}`}>
                {storageConfigured ? "Configurado" : "Pendente"}
              </p>
              <p className="text-xs text-muted">Endpoint + bucket para anexos</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-light p-3">
              <p className="text-xs uppercase tracking-wide text-muted">Alterações pendentes</p>
              <p className={`mt-1 text-lg font-semibold ${pendingKeys.size > 0 ? statusText.warning : statusText.neutral}`}>
                {pendingKeys.size}
              </p>
              <p className="text-xs text-muted">
                Versão {serverQuery.data?.version ?? "-"} · Branding em /settings/branding
              </p>
            </div>
          </div>
        </Card>

        <ConfigHealthCard config={serverQuery.data} />

        {/* Funcionalidades */}
        <Card>
          <CardHeader
            title="Funcionalidades do Sistema"
            subtitle="Ative ou desative módulos globalmente. Clique no card para alternar."
            action={renderSectionAction("features")}
          />
          {!collapsedSections.features && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {featureFields.map((field) => renderBooleanToggleCard(field))}
            </div>
          )}
        </Card>

        {/* Política de loja */}
        <Card>
          <CardHeader
            title="Política da Loja de Aplicativos"
            subtitle="Define quais aplicativos podem ser instalados pelos agentes."
            action={renderSectionAction("policy")}
          />
          {!collapsedSections.policy && (
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tintedIcon.violet}`}>
                <Store className="h-4 w-4" />
              </div>
              <div className="flex-1">
                {policyFields.map((field) => renderFieldEditor(field))}
              </div>
            </div>
          )}
        </Card>

        {/* Agente */}
        <Card>
          <CardHeader
            title="Intervalos e Comportamento do Agente"
            subtitle="Frequência de heartbeat, detecção de offline e coleta de inventário."
            action={renderSectionAction("agent")}
          />
          {!collapsedSections.agent && (
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tintedIcon.emerald}`}>
                <Clock className="h-4 w-4" />
              </div>
              <div className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {agentFields.map((field) => (
                  <div key={field.key}>{renderFieldEditor(field)}</div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Object Storage */}
        <Card>
          <CardHeader
            title="Armazenamento de Objetos (S3 / MinIO)"
            subtitle="Configuração do backend S3-compatível usado para arquivos de tickets e outros uploads."
            action={renderSectionAction("storage")}
          />
          {!collapsedSections.storage && (
            <div className="space-y-5">
              <div className="space-y-4">
                {/* Conexão — endereço do backend e bucket */}
                <div className="rounded-lg border border-border bg-surface-light p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Conexão</p>
                  <p className="mt-1 text-[11px] text-muted">
                    Endereço do servidor S3-compatível, bucket e região onde os arquivos ficam.
                  </p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="sm:col-span-2">{renderStorageTextField("objectStorageEndpoint")}</div>
                    {renderStorageTextField("objectStorageBucketName")}
                    {renderStorageTextField("objectStorageRegion")}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Credenciais de acesso */}
                  <div className="rounded-lg border border-border bg-surface-light p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">Credenciais</p>
                    <p className="mt-1 text-[11px] text-muted">
                      Chaves de acesso ao bucket. A Secret Key não é retornada pela API — preencha apenas para trocá-la.
                    </p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      {renderStorageTextField("objectStorageAccessKey")}
                      {renderStorageTextField("objectStorageSecretKey")}
                    </div>
                  </div>

                  {/* Validade das URLs geradas pelo servidor */}
                  <div className="rounded-lg border border-border bg-surface-light p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">URLs assinadas</p>
                    <p className="mt-1 text-[11px] text-muted">
                      Validade dos links temporários gerados pelo servidor para download dos arquivos.
                    </p>
                    <div className="mt-3">{renderStorageTextField("objectStorageUrlTtlHours")}</div>
                  </div>
                </div>
              </div>

              {storageToggleFields.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {storageToggleFields.map((field) => renderBooleanToggleCard(field))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
                <Button size="sm" onClick={saveStorageFields} loading={savingStorage}>
                  <Save className="h-3.5 w-3.5" />
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={testConnection}
                  loading={testStorageMutation.isPending}
                  disabled={savingStorage}
                >
                  <Cloud className="h-3.5 w-3.5" />
                  Testar Conexão
                </Button>
              </div>

              {testResult && (
                <div
                  className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                    testResult.success ? statusSurface.success : statusSurface.danger
                  }`}
                >
                  {testResult.success ? (
                    <>
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Conexão OK — {testResult.latencyMs}ms</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium">
                          {!testResult.configurationValid
                            ? "Configuração inválida"
                            : !testResult.bucketReachable
                              ? "Bucket inacessível"
                              : "Falha na conexão"}
                        </p>
                        <p className="mt-1 text-xs">
                          Configuração válida: {testResult.configurationValid ? "sim" : "não"} · Bucket acessível: {testResult.bucketReachable ? "sim" : "não"}
                        </p>
                        <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                          {testResult.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* NATS */}
        <Card>
          <CardHeader
            title="Servidor NATS"
            subtitle="Configuração exclusiva do servidor. Informe apenas host/IP; porta 4222 é fixa."
            action={renderSectionAction("nats")}
          />
          {!collapsedSections.nats && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {natsFields.map((field) => renderNatsFieldEditor(field))}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
                <Button size="sm" onClick={saveNatsFields} loading={savingNats}>
                  <Save className="h-3.5 w-3.5" />
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={testNatsConnection}
                  loading={testNatsMutation.isPending}
                  disabled={savingNats}
                >
                  <Wifi className="h-3.5 w-3.5" />
                  Testar Conexão
                </Button>
              </div>

              {natsTestResult && (
                <div
                  className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                    natsTestResult.ok ? statusSurface.success : statusSurface.danger
                  }`}
                >
                  {natsTestResult.ok ? (
                    <>
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p>
                          Conexão OK{typeof natsTestResult.latencyMs === "number" ? ` — ${natsTestResult.latencyMs}ms` : ""}
                        </p>
                        <p className="mt-1 text-xs">Host testado: {natsTestResult.host}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium">Falha na conexão</p>
                        <p className="mt-1 text-xs">Host testado: {natsTestResult.host}</p>
                        {natsTestResult.errors.length > 0 && (
                          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
                            {natsTestResult.errors.map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className={`rounded-lg border p-4 text-sm ${statusSurface.warning}`}>
                <p className="font-medium">Geração de Account Key fora do escopo atual da API</p>
                <p className="mt-1 text-xs opacity-80">
                  O OpenAPI publicado não expõe endpoint de geração de account seed/xKey. Esta tela segue apenas os endpoints documentados para configuração e teste de conectividade.
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* Anexos de Tickets */}
        <TicketAttachmentSettingsCard
          collapsed={collapsedSections.attachments}
          onToggleCollapse={() => toggleSection("attachments")}
        />

        {/* Configurações avançadas */}
        <Card>
          <CardHeader
            title="Configurações Avançadas"
            subtitle="IA, auto-update e governança de herança. Branding permanece em /settings/branding."
            action={renderSectionAction("advanced")}
          />
          {!collapsedSections.advanced && (
            <div className="space-y-6">
              <div className={`rounded-lg border p-3 text-xs ${statusSurface.info}`}>
                Apenas o campo de branding foi separado para a tela dedicada. IA e auto-update continuam editáveis aqui.
              </div>

              {advancedFields.length === 0 && (
                <div className="rounded-lg border border-border bg-surface-light p-3 text-sm text-muted-foreground">
                  Nenhum campo adicional de governança disponível neste momento.
                </div>
              )}

              {advancedFields.map((field) => {
                // Processamento em segundo plano usa card dedicado
                if (field.key === "backgroundProcessingSettingsJson") {
                  return (
                    <div key={field.key} className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tintedIcon.emerald}`}>
                        <Activity className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <BackgroundProcessingCard
                          mode="global"
                          settings={parseBackgroundProcessingSettings(
                            serverQuery.data?.backgroundProcessingSettingsJson,
                          )}
                          onSave={async (json) => {
                            await patchMutation.mutateAsync({ backgroundProcessingSettingsJson: json });
                            clearPending(["backgroundProcessingSettingsJson"]);
                            toast.success("Processamento em segundo plano salvo.");
                            serverQuery.refetch();
                          }}
                          saving={patchMutation.isPending}
                        />
                      </div>
                    </div>
                  );
                }

                // Campos bloqueados usam editor com checkboxes + prévia de impacto
                if (field.key === "lockedFieldsJson") {
                  return (
                    <div key={field.key} className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tintedIcon.red}`}>
                        <Lock className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <LockedFieldsEditor
                          value={String(formValues.values?.[field.key] ?? "[]")}
                          fields={serverEditableFields.filter((candidate) => candidate.key !== field.key)}
                          disabled={patchMutation.isPending}
                          onChange={(next) => {
                            markPending(field.key);
                            setValue(`values.${field.key}` as never, next as never, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }}
                        />
                      </div>
                    </div>
                  );
                }

                // IA usa componente dedicado
                if (field.key === "aiIntegrationSettingsJson") {
                  return (
                    <div key={field.key} className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tintedIcon.purple}`}>
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <AiIntegrationCard
                          aiSettings={parseAIIntegrationSettings(serverQuery.data?.aiIntegrationSettingsJson)}
                          onSave={async (json) => {
                            await patchMutation.mutateAsync({ aiIntegrationSettingsJson: json });
                            clearPending(["aiIntegrationSettingsJson"]);
                            toast.success("Configuração de IA salva.");
                            serverQuery.refetch();
                          }}
                          saving={patchMutation.isPending}
                        />
                      </div>
                    </div>
                  );
                }
                const icons: Record<string, React.ReactNode> = {
                  aiIntegrationSettingsJson: <Bot className="h-4 w-4" />,
                  lockedFieldsJson: <Lock className="h-4 w-4" />,
                };
                const colors: Record<string, string> = {
                  aiIntegrationSettingsJson: tintedIcon.purple,
                  lockedFieldsJson: tintedIcon.red,
                };
                return (
                  <div key={field.key} className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        colors[field.key] ?? "bg-surface-light text-muted"
                      }`}
                    >
                      {icons[field.key] ?? <Layers className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      {field.description && (
                        <p className="text-xs text-muted">{field.description}</p>
                      )}
                      {renderFieldEditor(field)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Modal de confirmação de reset */}
      <Modal
        open={confirmReset}
        onClose={() => {
          setResetConfirmText("");
          setConfirmReset(false);
        }}
        title="Restaurar configurações padrão?"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-700 dark:text-red-300">
              Esta ação irá apagar todas as configurações personalizadas do servidor e restaurar
              os valores padrão do sistema. A operação não pode ser desfeita.
            </p>
          </div>
          <Input
            label='Digite "RESET" para confirmar'
            value={resetConfirmText}
            onChange={(event) => setResetConfirmText(event.target.value)}
            placeholder="RESET"
            autoComplete="off"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setResetConfirmText("");
                setConfirmReset(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={resetServer}
              loading={resetMutation.isPending}
              disabled={resetConfirmText.trim().toUpperCase() !== "RESET"}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Confirmar reset
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de confirmação de alterações pendentes (diff antes → depois) */}
      <Modal
        open={confirmSave}
        onClose={() => setConfirmSave(false)}
        title="Confirmar alterações"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {pendingChanges.length} campo(s) serão alterados no servidor e herdados por clientes e sites.
          </p>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {pendingChanges.map((change) => (
              <div key={change.fieldKey} className="rounded-lg border border-border bg-surface-light p-3 text-xs">
                <p className="font-medium text-foreground">
                  {change.label} <span className="font-mono text-muted">{change.fieldKey}</span>
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-muted">Antes</p>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-background/40 p-2 font-mono text-[11px] text-muted-foreground">
                      {truncateValue(change.before)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-muted">Depois</p>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded border border-emerald-500/20 bg-emerald-500/5 p-2 font-mono text-[11px] text-foreground">
                      {truncateValue(change.after)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmSave(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                setConfirmSave(false);
                await saveChanges();
              }}
              loading={patchMutation.isPending}
            >
              <Save className="h-3.5 w-3.5" />
              Confirmar e salvar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de importação */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importar configuração"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Cole o JSON exportado de outro ambiente. Segredos não são importados nem sobrescritos.
          </p>
          <textarea
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setImportPreview(null);
            }}
            rows={10}
            aria-label="JSON de configuração para importar"
            placeholder='{ "settings": { "discoveryEnabled": true } }'
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary/50"
          />
          <div aria-live="polite">
            {importPreview && (
              <div className={`rounded-lg border p-3 text-xs ${statusSurface.info}`}>
                <p className="font-medium">{importPreview.applied.length} campo(s) serão aplicados.</p>
                {importPreview.unknown.length > 0 && (
                  <p className={`mt-1 ${statusText.warning}`}>
                    Campos desconhecidos (bloquearão a importação): {importPreview.unknown.join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="secondary"
              onClick={handleValidateImport}
              loading={importMutation.isPending}
              disabled={!importText.trim()}
            >
              Validar
            </Button>
            <Button
              onClick={handleImport}
              loading={importMutation.isPending}
              disabled={!importText.trim()}
            >
              <Upload className="h-3.5 w-3.5" />
              Importar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function truncateValue(value: string, max = 600): string {
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}… (${value.length} caracteres)`;
}

/** Nunca exibir segredos no diff de confirmação. */
function describePendingValue(fieldKey: string, value: string): string {
  if (fieldKey === "objectStorageSecretKey") {
    return value ? "•••••••• (novo valor)" : "—";
  }
  return value;
}

function readApiError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.status}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Erro inesperado";
}

// ── Ticket Attachment Settings Card ────────────────────────────────────────────

const ALLOWED_TYPES_DEFAULT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MIME_PRESETS: { label: string; value: string }[] = [
  { label: "JPEG", value: "image/jpeg" },
  { label: "PNG", value: "image/png" },
  { label: "WebP", value: "image/webp" },
  { label: "GIF", value: "image/gif" },
  { label: "PDF", value: "application/pdf" },
  { label: "Word", value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { label: "Excel", value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { label: "ZIP", value: "application/zip" },
  { label: "Texto", value: "text/plain" },
  { label: "CSV", value: "text/csv" },
];

const MIME_TYPE_REGEX = /^[a-z]+\/[a-z0-9!#$&\-^_.+]+$/i;
const BYTES_PER_MB = 1024 * 1024;

interface TicketAttachmentSettingsCardProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function TicketAttachmentSettingsCard({
  collapsed,
  onToggleCollapse,
}: TicketAttachmentSettingsCardProps) {
  const query = useTicketAttachmentSettings();
  const mutation = useUpdateTicketAttachmentSettings();

  const [form, setForm] = useState<TicketAttachmentSettings>({
    enabled: true,
    maxFileSizeBytes: 10485760,
    allowedContentTypes: ALLOWED_TYPES_DEFAULT,
    presignedUploadUrlTtlMinutes: 15,
  });
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [customTypeError, setCustomTypeError] = useState("");
  const [typesError, setTypesError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const collapseButton = (
    <button
      type="button"
      onClick={onToggleCollapse}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-light px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
    >
      {collapsed ? "Expandir" : "Recolher"}
      {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
    </button>
  );

  useEffect(() => {
    if (query.data && !loaded) {
      setForm(query.data);
      setLoaded(true);
    }
  }, [query.data, loaded]);

  const toggleType = (mime: string) => {
    setTypesError("");
    setForm((f) => {
      const has = f.allowedContentTypes.includes(mime);
      return {
        ...f,
        allowedContentTypes: has
          ? f.allowedContentTypes.filter((t) => t !== mime)
          : [...f.allowedContentTypes, mime],
      };
    });
  };

  const addCustomType = () => {
    const val = customTypeInput.trim().toLowerCase();
    if (!val) return;
    if (!MIME_TYPE_REGEX.test(val)) {
      setCustomTypeError("Formato inválido. Use o padrão tipo/subtipo (ex.: image/svg+xml).");
      return;
    }
    if (form.allowedContentTypes.includes(val)) {
      setCustomTypeError("Este tipo já está na lista.");
      return;
    }
    setCustomTypeError("");
    setTypesError("");
    setForm((f) => ({ ...f, allowedContentTypes: [...f.allowedContentTypes, val] }));
    setCustomTypeInput("");
  };

  const set = <K extends keyof TicketAttachmentSettings>(
    key: K,
    value: TicketAttachmentSettings[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    let hasError = false;

    if (form.allowedContentTypes.length === 0) {
      setTypesError("Selecione ao menos um tipo de conteúdo permitido.");
      hasError = true;
    } else {
      setTypesError("");
    }

    const maxBytes = Number(form.maxFileSizeBytes);
    if (isNaN(maxBytes) || maxBytes < BYTES_PER_MB || maxBytes > 1073741824) {
      toast.error("Tamanho máximo deve estar entre 1 MB e 1024 MB.");
      hasError = true;
    }

    const ttl = Number(form.presignedUploadUrlTtlMinutes);
    if (isNaN(ttl) || ttl < 1 || ttl > 120) {
      toast.error("TTL da URL deve estar entre 1 e 120 minutos.");
      hasError = true;
    }

    if (hasError) return;

    try {
      await mutation.mutateAsync({
        ...form,
        maxFileSizeBytes: maxBytes,
        presignedUploadUrlTtlMinutes: ttl,
      });
      toast.success("Configurações de anexos salvas.");
    } catch (err) {
      toast.error(readApiError(err));
    }
  };

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader
          title="Anexos de Tickets"
          subtitle="Controla o upload de arquivos via URL pré-assinada (S3). Requer Object Storage configurado."
          action={collapseButton}
        />
        {!collapsed && (
          <div className="py-2 text-sm text-muted">Carregando configurações de anexos…</div>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Anexos de Tickets"
        subtitle="Controla o upload de arquivos via URL pré-assinada (S3). Requer Object Storage configurado."
        action={collapseButton}
      />
      {!collapsed && <div className="space-y-5">
        {/* Enable toggle */}
        <button
          type="button"
          onClick={() => set("enabled", !form.enabled)}
          className={`group relative flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all ${
            form.enabled ? `${selectedSurface} hover:border-sky-500/50` : unselectedSurface
          }`}
        >
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
              form.enabled ? selectedIcon : unselectedIcon
            }`}
          >
            <FileStack className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium ${form.enabled ? "text-foreground" : "text-muted"}`}>
              Upload de Anexos Habilitado
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Permite que usuários anexem arquivos aos tickets via upload direto ao storage.
            </p>
          </div>
          <div
            className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
              form.enabled ? "bg-sky-500" : "bg-surface-hover"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                form.enabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </div>
        </button>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="max-file-size-mb" className="block text-sm font-medium text-muted-foreground">
              Tamanho máximo por arquivo (MB)
            </label>
            <input
              id="max-file-size-mb"
              type="number"
              min={1}
              max={1024}
              step={1}
              value={Math.max(1, Math.round(form.maxFileSizeBytes / BYTES_PER_MB))}
              onChange={(e) => {
                const mb = Number(e.target.value);
                set("maxFileSizeBytes", Number.isFinite(mb) ? Math.round(mb * BYTES_PER_MB) : 0);
              }}
              className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
            <p className="text-xs text-muted">
              Valor salvo: {form.maxFileSizeBytes.toLocaleString("pt-BR")} bytes (máx. 1024 MB)
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="presigned-ttl-minutes" className="block text-sm font-medium text-muted-foreground">
              TTL da URL pré-assinada (minutos)
            </label>
            <input
              id="presigned-ttl-minutes"
              type="number"
              min={1}
              max={120}
              value={form.presignedUploadUrlTtlMinutes}
              onChange={(e) => set("presignedUploadUrlTtlMinutes", Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
            <p className="text-xs text-muted">Entre 1 e 120 minutos.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="custom-mime-type" className="block text-sm font-medium text-muted-foreground">
              Tipos de conteúdo permitidos
            </label>
            <p className="mt-0.5 text-xs text-muted">
              Clique nos presets para adicionar/remover. Tipos ativos ficam destacados.
            </p>
          </div>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-2">
            {MIME_PRESETS.map((preset) => {
              const active = form.allowedContentTypes.includes(preset.value);
              return (
                <button
                  key={preset.value}
                  type="button"
                  title={preset.value}
                  onClick={() => toggleType(preset.value)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    active
                      ? chipActive
                      : "border-border bg-surface-hover text-muted hover:border-border-strong hover:text-muted-foreground"
                  }`}
                >
                  {active && (
                    <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor">
                      <circle cx="5" cy="5" r="5" />
                    </svg>
                  )}
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Active custom types (chips com remoção) */}
          {form.allowedContentTypes.filter(
            (t) => !MIME_PRESETS.some((p) => p.value === t),
          ).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.allowedContentTypes
                .filter((t) => !MIME_PRESETS.some((p) => p.value === t))
                .map((mime) => (
                  <span
                    key={mime}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${chipCustom}`}
                  >
                    {mime}
                    <button
                      type="button"
                      aria-label={`Remover ${mime}`}
                      onClick={() => toggleType(mime)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-violet-500/30"
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="2" y1="2" x2="10" y2="10" />
                        <line x1="10" y1="2" x2="2" y2="10" />
                      </svg>
                    </button>
                  </span>
                ))}
            </div>
          )}

          {/* Resumo de todos os tipos ativos */}
          {form.allowedContentTypes.length > 0 && (
            <p className="text-xs text-muted">
              Ativos ({form.allowedContentTypes.length}):{" "}
              {form.allowedContentTypes.join(", ")}
            </p>
          )}

          {/* Input para tipo customizado */}
          <div className="flex gap-2">
            <input
              id="custom-mime-type"
              type="text"
              value={customTypeInput}
              onChange={(e) => {
                setCustomTypeInput(e.target.value);
                setCustomTypeError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomType();
                }
              }}
              placeholder="Outro MIME type (ex.: image/svg+xml)"
              className={`flex-1 rounded-lg border bg-surface-light px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:ring-1 ${
                customTypeError
                  ? "border-danger/50 focus:border-danger/70 focus:ring-danger/20"
                  : "border-border focus:border-primary/50 focus:ring-primary/30"
              }`}
            />
            <Button size="sm" variant="ghost" onClick={addCustomType} type="button">
              Adicionar
            </Button>
          </div>
          {customTypeError && <p className="text-xs text-danger">{customTypeError}</p>}
          {typesError && <p className="text-xs text-danger">{typesError}</p>}
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} loading={mutation.isPending}>
            <Save className="h-3.5 w-3.5" />
            Salvar Configurações de Anexos
          </Button>
        </div>
      </div>}
    </Card>
  );
}
