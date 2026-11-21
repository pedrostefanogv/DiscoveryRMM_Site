import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { ApiError } from "@/api";
import type { ConfigurationValue, ResolvedConfiguration } from "@/api";
import {
  BackgroundProcessingCard,
  ConfigurationFieldEditor,
  ConfigurationPageHeader,
  ConfigurationSectionCard,
  MaintenanceWindowCard,
  RemoteAccessConsentSection,
  parseBackgroundProcessingSettings,
  statusSurface,
  tintedIcon,
  toApiFieldName,
  type RemoteConsentFieldState,
} from "@/components/configuration";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorDisplay,
  Icon,
  Input,
  Loading,
  Select,
  type MaterialSymbolName,
} from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import {
  useClientConfig,
  useClientEffectiveConfig,
  useClientMetadata,
  useDeleteClientConfig,
  useDeleteSiteConfig,
  usePatchClientConfig,
  usePatchSiteConfig,
  useResetClientProperty,
  useResetSiteProperty,
  useSiteConfig,
  useSiteEffectiveConfig,
  useSiteMetadata,
  useUpsertClientConfig,
  useUpsertSiteConfig,
} from "@/hooks/useConfigurationApi";
import {
  AGENT_HOME_TAB_OPTIONS,
  buildInheritedState,
  canEditFieldAtScope,
  clientEditableFields,
  formatAppStorePolicyValue,
  formatFieldValue,
  getAgentHomeTabOptions,
  getEffectiveValue,
  getFieldMetadata,
  getLockOwnerForScope,
  isInheritedBySourceType,
  parseFieldValue,
  resolveClientOrigin,
  resolveSiteOrigin,
  serverEditableFields,
  siteEditableFields,
  validateFieldValue,
  type EditableField,
} from "@/utils/configurationEditors";

export type ScopeConfigurationTab = "client" | "site" | "effective";

interface ScopeConfigurationPageProps {
  initialTab?: ScopeConfigurationTab;
}

interface FormValues {
  values: Record<string, string>;
}

const SEPARATE_POLICY_KEYS = new Set(["maintenanceWindowJson"]);

const TABS: { id: ScopeConfigurationTab; label: string; icon: MaterialSymbolName }[] = [
  { id: "client", label: "Cliente", icon: "apartment" },
  { id: "site", label: "Site", icon: "location_on" },
  { id: "effective", label: "Simulador Efetivo", icon: "layers" },
];

const ORIGIN_LABELS: Record<number, string> = {
  0: "Bloqueado",
  2: "Servidor",
  3: "Cliente",
  4: "Site",
};

const SCALAR_FIELDS = serverEditableFields.filter(
  (field) =>
    field.kind === "boolean" ||
    field.kind === "number" ||
    field.kind === "policy" ||
    field.kind === "select",
);

const OBJECT_FIELDS: { label: string; inheritanceKey: string }[] = [
  { label: "Atualização do Agente", inheritanceKey: "AgentUpdate" },
  { label: "Integração com IA", inheritanceKey: "AIIntegration" },
  { label: "Processamento em Segundo Plano", inheritanceKey: "BackgroundProcessing" },
];

function normalizeRemoteConsentTextPayloads(
  payload: Record<string, ConfigurationValue | null>,
): void {
  for (const key of ["remoteConsentMessage", "remoteConsentBannerText"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length === 0) {
      payload[key] = null;
    }
  }
}

function readEntityError(error: unknown, entity: "client" | "site"): string {
  if (error instanceof ApiError && error.status === 404) {
    return entity === "client" ? "404: client não encontrado" : "404: site ou cliente não encontrado";
  }
  if (error instanceof ApiError) {
    return `${error.status}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Erro inesperado";
}

function readResetError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    return "400: propriedade invalida para reset";
  }
  if (error instanceof ApiError) {
    return `${error.status}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Erro inesperado";
}

function formatEffectiveValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Ativado" : "Desativado";
  if (key === "appStorePolicy") return formatAppStorePolicyValue(value) || "—";
  if (key === "agentHomeTab") {
    const raw = String(value).trim();
    if (!raw) return "—";
    return AGENT_HOME_TAB_OPTIONS.find((option) => option.value === raw)?.label ?? raw;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function OriginBadge({ sourceType }: { sourceType: number | undefined }) {
  const label = sourceType === undefined ? "—" : ORIGIN_LABELS[sourceType] ?? String(sourceType);
  const color =
    sourceType === 0
      ? "danger"
      : sourceType === 4
        ? "accent"
        : sourceType === 3
          ? "primary"
          : "slate";
  return <Badge color={color}>{label}</Badge>;
}

function matchesFieldFilter(
  field: EditableField,
  term: string,
  inherited: boolean,
  onlyOverrides: boolean,
): boolean {
  if (onlyOverrides && inherited) return false;
  if (!term) return true;
  const hay = `${field.label} ${field.key} ${field.description ?? ""}`.toLowerCase();
  return hay.includes(term);
}

function ScopeActionToolbar({
  fieldQuery,
  onFieldQueryChange,
  onlyOverrides,
  onToggleOnlyOverrides,
  overrideCount,
  onSaveFull,
  savingFull,
  onRestoreInheritance,
  restoring,
  scopeEntityLabel,
}: {
  fieldQuery: string;
  onFieldQueryChange: (value: string) => void;
  onlyOverrides: boolean;
  onToggleOnlyOverrides: () => void;
  overrideCount: number;
  onSaveFull: () => void;
  savingFull: boolean;
  onRestoreInheritance: () => void;
  restoring: boolean;
  scopeEntityLabel: string;
}) {
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  return (
    <>
      <Card padding={false} className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
              <Input
                aria-label="Filtrar campos de configuração"
                placeholder="Filtrar campos por nome ou chave…"
                value={fieldQuery}
                onChange={(event) => onFieldQueryChange(event.target.value)}
                className="pl-9 pr-8"
              />
              {fieldQuery && (
                <button
                  type="button"
                  onClick={() => onFieldQueryChange("")}
                  aria-label="Limpar filtro de campos"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground"
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              aria-pressed={onlyOverrides}
              onClick={onToggleOnlyOverrides}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                onlyOverrides
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-surface-light text-muted-foreground hover:border-border-strong hover:text-foreground"
              }`}
            >
              <Icon name="filter_alt" className="h-3.5 w-3.5" />
              <span>Apenas sobrescritos</span>
              <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[11px] tabular-nums">
                {overrideCount}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onSaveFull} loading={savingFull}>
              <Icon name="save" className="h-3.5 w-3.5" aria-hidden="true" />
              Salvar tudo
            </Button>

            <div className="relative">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setActionsMenuOpen((open) => !open)}
                aria-expanded={actionsMenuOpen}
                aria-haspopup="menu"
                aria-label="Mais ações"
                title="Mais ações"
              >
                <Icon name="more_vert" className="h-4 w-4" aria-hidden="true" />
              </Button>
              {actionsMenuOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default"
                    aria-label="Fechar menu de ações"
                    onClick={() => setActionsMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 text-sm shadow-xl"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-danger transition-colors hover:bg-danger/10"
                      onClick={() => {
                        setActionsMenuOpen(false);
                        setConfirmRestoreOpen(true);
                      }}
                      disabled={restoring}
                    >
                      <Icon name="restart_alt" className="h-4 w-4" aria-hidden="true" />
                      Restaurar herança
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmRestoreOpen}
        onClose={() => setConfirmRestoreOpen(false)}
        onConfirm={() => {
          setConfirmRestoreOpen(false);
          onRestoreInheritance();
        }}
        title="Restaurar herança completa?"
        message={`Todas as sobrescritas locais deste ${scopeEntityLabel} serão removidas, voltando a herdar os valores do nível superior.`}
        confirmLabel="Restaurar herança"
        tone="danger"
        isLoading={restoring}
      />
    </>
  );
}

// ── Painel: Cliente ────────────────────────────────────────────────────────────

function ClientScopePanel({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const [inherits, setInherits] = useState<Record<string, boolean>>({});
  const [remoteDirty, setRemoteDirty] = useState<Record<string, boolean>>({});
  const [fieldQuery, setFieldQuery] = useState("");
  const [onlyOverrides, setOnlyOverrides] = useState(false);

  const localQuery = useClientConfig(clientId);
  const effectiveQuery = useClientEffectiveConfig(clientId);
  const metadataQuery = useClientMetadata(clientId);

  const agentHomeTabOptions = useMemo(
    () => getAgentHomeTabOptions(metadataQuery.data?.agentHomeTabOptions),
    [metadataQuery.data],
  );

  const putMutation = useUpsertClientConfig();
  const patchMutation = usePatchClientConfig();
  const deleteMutation = useDeleteClientConfig();
  const resetPropertyMutation = useResetClientProperty();

  const { setValue, getValues, watch } = useForm<FormValues>({
    defaultValues: { values: {} },
  });
  const watchedValues = watch("values") ?? {};

  useEffect(() => {
    setRemoteDirty({});
  }, [clientId]);

  useEffect(() => {
    if (!localQuery.data) return;
    for (const field of clientEditableFields) {
      const value = localQuery.data[field.key] ?? getEffectiveValue(effectiveQuery.data, field.key);
      setValue(`values.${field.key}` as never, formatFieldValue(value, field.key) as never);
    }
    setInherits(buildInheritedState(localQuery.data, clientEditableFields));
  }, [effectiveQuery.data, localQuery.data, setValue]);

  const remoteAccessFields = useMemo(
    () => clientEditableFields.filter((field) => field.group === "remoteAccess"),
    [],
  );

  const overrideCount = useMemo(
    () => clientEditableFields.filter((field) => inherits[field.key] === false).length,
    [inherits],
  );

  if (!clientId) {
    return (
      <EmptyState
        icon="apartment"
        title="Nenhum cliente selecionado"
        description="Escolha um cliente acima para visualizar e sobrescrever configurações neste escopo."
      />
    );
  }

  if (localQuery.isLoading || effectiveQuery.isLoading || metadataQuery.isLoading) {
    return <Loading message="Carregando configuração do cliente..." />;
  }

  if (localQuery.isError || effectiveQuery.isError || metadataQuery.isError) {
    return (
      <ErrorDisplay
        message={readEntityError(localQuery.error ?? effectiveQuery.error ?? metadataQuery.error, "client")}
        onRetry={() => {
          localQuery.refetch();
          effectiveQuery.refetch();
          metadataQuery.refetch();
        }}
      />
    );
  }

  const saveFull = async () => {
    const payload: Record<string, ConfigurationValue | null> = {};
    for (const field of clientEditableFields) {
      const value = String(getValues(`values.${field.key}` as never) ?? "");
      if (inherits[field.key]) {
        payload[field.key] = null;
      } else {
        const fieldMeta = getFieldMetadata(metadataQuery.data?.fields, field.key);
        if (!canEditFieldAtScope(fieldMeta, "client")) continue;

        const validation = validateFieldValue(field.kind, value, field.key);
        if (validation !== true) {
          toast.error(`${field.label}: ${validation}`);
          return;
        }
        payload[field.key] = parseFieldValue(field.kind, value, field.key);
      }
    }
    normalizeRemoteConsentTextPayloads(payload);
    try {
      await putMutation.mutateAsync({ clientId, payload });
      setRemoteDirty({});
      toast.success("Configuração do cliente salva.");
    } catch (error) {
      toast.error(readEntityError(error, "client"));
    }
  };

  const savePartial = async (fieldKey: string) => {
    const field = clientEditableFields.find((item) => item.key === fieldKey);
    if (!field) return;
    const value = String(getValues(`values.${field.key}` as never) ?? "");
    const fieldMeta = getFieldMetadata(metadataQuery.data?.fields, field.key);
    if (!canEditFieldAtScope(fieldMeta, "client")) {
      toast.error(`Campo ${field.key} bloqueado`);
      return;
    }
    const payload = inherits[field.key]
      ? { [field.key]: null }
      : { [field.key]: parseFieldValue(field.kind, value, field.key) };
    if (!inherits[field.key]) {
      const validation = validateFieldValue(field.kind, value, field.key);
      if (validation !== true) {
        toast.error(validation);
        return;
      }
    }
    try {
      await patchMutation.mutateAsync({ clientId, payload });
      toast.success(`Campo ${field.label} atualizado.`);
    } catch (error) {
      toast.error(readEntityError(error, "client"));
    }
  };

  const resetProperty = async (propertyName: string) => {
    try {
      await resetPropertyMutation.mutateAsync({ clientId, propertyName });
      toast.success(`Propriedade ${propertyName} resetada.`);
    } catch (error) {
      toast.error(readResetError(error));
    }
  };

  const removeLocalConfig = async () => {
    try {
      await deleteMutation.mutateAsync(clientId);
      setRemoteDirty({});
      toast.success("Configuração local removida. Herança total restaurada.");
    } catch (error) {
      toast.error(readEntityError(error, "client"));
    }
  };

  const remoteConsentState: Record<string, RemoteConsentFieldState> = {};
  for (const field of remoteAccessFields) {
    const fieldMeta = getFieldMetadata(metadataQuery.data?.fields, field.key);
    remoteConsentState[field.key] = {
      value: String(watchedValues[field.key] ?? ""),
      inherited: !!inherits[field.key],
      origin: resolveClientOrigin(localQuery.data, field.key),
      locked: !canEditFieldAtScope(fieldMeta, "client"),
      lockOwner: getLockOwnerForScope(fieldMeta, "client"),
      dirty: !!remoteDirty[field.key],
    };
  }

  const changeRemoteField = (fieldKey: string, value: string) => {
    setValue(`values.${fieldKey}` as never, value as never, { shouldDirty: true });
    setRemoteDirty((prev) => ({ ...prev, [fieldKey]: true }));
  };

  const toggleRemoteInherit = (fieldKey: string, inherit: boolean) => {
    setInherits((prev) => ({ ...prev, [fieldKey]: inherit }));
    setRemoteDirty((prev) => ({ ...prev, [fieldKey]: true }));
    if (inherit) return;
    const current = String(getValues(`values.${fieldKey}` as never) ?? "").trim();
    if (current.length > 0) return;
    const effective = formatFieldValue(
      localQuery.data?.[fieldKey] ?? getEffectiveValue(effectiveQuery.data, fieldKey),
      fieldKey,
    );
    if (effective) {
      setValue(`values.${fieldKey}` as never, effective as never, { shouldDirty: true });
    }
  };

  const saveRemoteAccess = async () => {
    const changedKeys = remoteAccessFields
      .map((field) => field.key)
      .filter((fieldKey) => remoteDirty[fieldKey]);
    if (changedKeys.length === 0) return;

    const payload: Record<string, ConfigurationValue | null> = {};
    for (const fieldKey of changedKeys) {
      const field = remoteAccessFields.find((item) => item.key === fieldKey);
      if (!field) continue;
      const fieldMeta = getFieldMetadata(metadataQuery.data?.fields, fieldKey);
      if (!canEditFieldAtScope(fieldMeta, "client")) continue;
      if (inherits[fieldKey]) {
        payload[fieldKey] = null;
        continue;
      }
      const rawValue = String(getValues(`values.${fieldKey}` as never) ?? "");
      const validation = validateFieldValue(field.kind, rawValue, fieldKey);
      if (validation !== true) {
        toast.error(`${field.label}: ${validation}`);
        return;
      }
      payload[fieldKey] = parseFieldValue(field.kind, rawValue, fieldKey);
    }
    normalizeRemoteConsentTextPayloads(payload);
    if (Object.keys(payload).length === 0) return;

    try {
      await patchMutation.mutateAsync({ clientId, payload });
      setRemoteDirty({});
      toast.success("Autorização de acesso remoto atualizada.");
    } catch (error) {
      toast.error(readEntityError(error, "client"));
    }
  };

  const discardRemoteAccess = () => {
    const inheritedState = buildInheritedState(localQuery.data, remoteAccessFields);
    for (const field of remoteAccessFields) {
      const value = localQuery.data?.[field.key] ?? getEffectiveValue(effectiveQuery.data, field.key);
      setValue(`values.${field.key}` as never, formatFieldValue(value, field.key) as never);
      setInherits((prev) => ({ ...prev, [field.key]: inheritedState[field.key] }));
    }
    setRemoteDirty({});
  };

  const renderFieldEditor = (field: EditableField) => {
    const value = String(watch(`values.${field.key}` as never) ?? "");
    const inherited = !!inherits[field.key];
    const fieldMeta = getFieldMetadata(metadataQuery.data?.fields, field.key);
    const canEditField = canEditFieldAtScope(fieldMeta, "client");

    if (field.key === "maintenanceWindowJson") {
      const rawLocal = localQuery.data?.[field.key];
      const isOverride = rawLocal !== null && rawLocal !== undefined && String(rawLocal).trim() !== "";
      const localValue = isOverride ? String(rawLocal) : "";

      return (
        <MaintenanceWindowCard
          key={field.key}
          value={localValue}
          effectiveValue={String(getEffectiveValue(effectiveQuery.data, field.key) ?? "")}
          inherited={!isOverride}
          inheritedFrom={isOverride ? null : "Servidor"}
          canManage={canEditField}
          onSave={async (json) => {
            setValue(`values.${field.key}` as never, json as never, { shouldDirty: true });
            try {
              await patchMutation.mutateAsync({ clientId, payload: { [field.key]: json } });
              setInherits((prev) => ({ ...prev, [field.key]: false }));
              toast.success("Janela de manutenção (override) atualizada.");
            } catch (error) {
              toast.error(readEntityError(error, "client"));
              throw error;
            }
          }}
          onClear={async () => {
            try {
              await patchMutation.mutateAsync({ clientId, payload: { [field.key]: null } });
              setInherits((prev) => ({ ...prev, [field.key]: true }));
              setValue(`values.${field.key}` as never, "" as never, { shouldDirty: true });
              toast.success("Override removido: o campo voltou a herdar do servidor.");
            } catch (error) {
              toast.error(readEntityError(error, "client"));
              throw error;
            }
          }}
        />
      );
    }

    if (field.key === "backgroundProcessingSettingsJson") {
      return (
        <BackgroundProcessingCard
          key={field.key}
          mode="override"
          settings={parseBackgroundProcessingSettings(value)}
          clientId={clientId || null}
          canManage={canEditField}
          onSave={async (json) => {
            setValue(`values.${field.key}` as never, json as never, { shouldDirty: true });
            await patchMutation.mutateAsync({ clientId, payload: { [field.key]: json } });
            toast.success("Processamento em segundo plano (override) atualizado.");
          }}
          saving={patchMutation.isPending}
        />
      );
    }

    return (
      <ConfigurationFieldEditor
        key={field.key}
        fieldKey={field.key}
        fieldLabel={field.label}
        fieldKind={field.kind}
        value={value}
        inherited={inherited}
        effectiveValue={getEffectiveValue(effectiveQuery.data, field.key)}
        origin={resolveClientOrigin(localQuery.data, field.key)}
        locked={!canEditField}
        lockOwner={getLockOwnerForScope(fieldMeta, "client")}
        saving={patchMutation.isPending}
        resetLoading={resetPropertyMutation.isPending}
        description={field.description}
        unit={field.unit}
        options={field.key === "agentHomeTab" ? agentHomeTabOptions : field.options}
        onValueChange={(next) =>
          setValue(`values.${field.key}` as never, next as never, { shouldDirty: true })
        }
        onToggleInherit={(next) => {
          setInherits((prev) => ({ ...prev, [field.key]: next }));
          if (next) {
            setValue(`values.${field.key}` as never, "" as never, { shouldDirty: true });
          }
        }}
        onSavePatch={() => savePartial(field.key)}
        onResetProperty={() => resetProperty(field.key)}
      />
    );
  };

  const term = fieldQuery.trim().toLowerCase();
  const filterList = (list: EditableField[]) =>
    list.filter((field) => matchesFieldFilter(field, term, !!inherits[field.key], onlyOverrides));

  const featureFields = filterList(clientEditableFields.filter((f) => f.group === "features"));
  const policyFields = filterList(
    clientEditableFields.filter((f) => f.group === "policy" && !SEPARATE_POLICY_KEYS.has(f.key)),
  );
  const maintenanceField = clientEditableFields.find((f) => f.key === "maintenanceWindowJson");
  const showMaintenance =
    maintenanceField &&
    matchesFieldFilter(maintenanceField, term, !!inherits[maintenanceField.key], onlyOverrides);
  const filteredRemote = filterList(remoteAccessFields);
  const agentFields = filterList(clientEditableFields.filter((f) => f.group === "agent"));
  const advancedFields = filterList(clientEditableFields.filter((f) => f.group === "advanced"));

  const nothingVisible =
    featureFields.length === 0 &&
    policyFields.length === 0 &&
    !showMaintenance &&
    filteredRemote.length === 0 &&
    agentFields.length === 0 &&
    advancedFields.length === 0;

  return (
    <div className="space-y-5">
      <ScopeActionToolbar
        fieldQuery={fieldQuery}
        onFieldQueryChange={setFieldQuery}
        onlyOverrides={onlyOverrides}
        onToggleOnlyOverrides={() => setOnlyOverrides((v) => !v)}
        overrideCount={overrideCount}
        onSaveFull={saveFull}
        savingFull={putMutation.isPending}
        onRestoreInheritance={removeLocalConfig}
        restoring={deleteMutation.isPending}
        scopeEntityLabel="cliente"
      />

      {nothingVisible ? (
        <EmptyState
          icon="search"
          title="Nenhum campo encontrado"
          description={
            onlyOverrides && overrideCount === 0
              ? "Este cliente ainda não possui sobrescritas locais — todos os campos estão herdando do servidor."
              : "Nenhum campo corresponde ao filtro atual."
          }
        />
      ) : (
        <>
          {featureFields.length > 0 && (
            <ConfigurationSectionCard
              title="Funcionalidades do Sistema"
              subtitle="Ative ou desative módulos que impactam os agentes e sites desse cliente."
              icon={<Icon name="verified_user" className="h-4 w-4" />}
              iconClassName={tintedIcon.sky}
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {featureFields.map(renderFieldEditor)}
              </div>
            </ConfigurationSectionCard>
          )}

          {policyFields.length > 0 && (
            <ConfigurationSectionCard
              title="Política da Loja de Aplicativos"
              subtitle="Define quais aplicativos podem ser instalados pelos agentes."
              icon={<Icon name="storefront" className="h-4 w-4" />}
              iconClassName={tintedIcon.violet}
            >
              <div className="space-y-4">{policyFields.map(renderFieldEditor)}</div>
            </ConfigurationSectionCard>
          )}

          {showMaintenance && maintenanceField && (
            <ConfigurationSectionCard
              title="Janela de Manutenção (Reboot/Patches)"
              subtitle="Override da janela global. Vazio herda a janela do servidor; fora dela o agent adia patches e reboots."
              icon={<Icon name="schedule" className="h-4 w-4" />}
              iconClassName={tintedIcon.violet}
            >
              {renderFieldEditor(maintenanceField)}
            </ConfigurationSectionCard>
          )}

          {filteredRemote.length > 0 && (
            <ConfigurationSectionCard
              title="Autorização de Acesso Remoto"
              subtitle="Somente sessões de área de trabalho. Terminal, arquivos, proxy e processos não pedem autorização."
              icon={<Icon name="devices" className="h-4 w-4" />}
              iconClassName={tintedIcon.emerald}
            >
              <RemoteAccessConsentSection
                state={remoteConsentState}
                previewContext={{ client: clientName }}
                saving={patchMutation.isPending || putMutation.isPending}
                resetLoading={resetPropertyMutation.isPending}
                onChange={changeRemoteField}
                onToggleInherit={toggleRemoteInherit}
                onResetField={(fieldKey) => {
                  setRemoteDirty((prev) => ({ ...prev, [fieldKey]: false }));
                  void resetProperty(fieldKey);
                }}
                onSave={saveRemoteAccess}
                onDiscard={discardRemoteAccess}
              />
            </ConfigurationSectionCard>
          )}

          {agentFields.length > 0 && (
            <ConfigurationSectionCard
              title="Intervalos e Comportamento do Agente"
              subtitle="Frequência de heartbeat, detecção de offline e coleta de inventário no escopo do cliente."
              icon={<Icon name="schedule" className="h-4 w-4" />}
              iconClassName={tintedIcon.emerald}
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {agentFields.map(renderFieldEditor)}
              </div>
            </ConfigurationSectionCard>
          )}

          {advancedFields.length > 0 && (
            <ConfigurationSectionCard
              title="Configurações Avançadas"
              subtitle="Auto-update e IA estruturada no escopo do cliente."
              icon={<Icon name="smart_toy" className="h-4 w-4" />}
              iconClassName={tintedIcon.blue}
            >
              <div className="space-y-4">{advancedFields.map(renderFieldEditor)}</div>
            </ConfigurationSectionCard>
          )}
        </>
      )}
    </div>
  );
}

// ── Painel: Site ───────────────────────────────────────────────────────────────

function SiteScopePanel({
  clientId,
  siteId,
  clientName,
  siteName,
}: {
  clientId: string;
  siteId: string;
  clientName: string;
  siteName: string;
}) {
  const [inherits, setInherits] = useState<Record<string, boolean>>({});
  const [remoteDirty, setRemoteDirty] = useState<Record<string, boolean>>({});
  const [fieldQuery, setFieldQuery] = useState("");
  const [onlyOverrides, setOnlyOverrides] = useState(false);

  const localSiteQuery = useSiteConfig(siteId);
  const effectiveSiteQuery = useSiteEffectiveConfig(siteId);
  const localClientQuery = useClientConfig(clientId);
  const clientMetadataQuery = useClientMetadata(clientId);
  const siteMetadataQuery = useSiteMetadata(siteId);

  const agentHomeTabOptions = useMemo(
    () => getAgentHomeTabOptions(siteMetadataQuery.data?.agentHomeTabOptions),
    [siteMetadataQuery.data],
  );

  const putMutation = useUpsertSiteConfig();
  const patchMutation = usePatchSiteConfig();
  const deleteMutation = useDeleteSiteConfig();
  const resetPropertyMutation = useResetSiteProperty();

  const { setValue, getValues, watch } = useForm<FormValues>({
    defaultValues: { values: {} },
  });
  const watchedValues = watch("values") ?? {};

  useEffect(() => {
    setRemoteDirty({});
  }, [siteId]);

  useEffect(() => {
    if (!localSiteQuery.data) return;
    for (const field of siteEditableFields) {
      const value = getEffectiveValue(effectiveSiteQuery.data, field.key) ?? localSiteQuery.data[field.key];
      setValue(`values.${field.key}` as never, formatFieldValue(value, field.key) as never);
    }
    const nextInherited: Record<string, boolean> = {};
    for (const field of siteEditableFields) {
      const meta = getFieldMetadata(siteMetadataQuery.data?.fields, field.key);
      nextInherited[field.key] = isInheritedBySourceType(meta, "site");
    }
    setInherits(nextInherited);
  }, [effectiveSiteQuery.data, localSiteQuery.data, setValue, siteMetadataQuery.data?.fields]);

  const remoteAccessFields = useMemo(
    () => siteEditableFields.filter((field) => field.group === "remoteAccess"),
    [],
  );

  const overrideCount = useMemo(
    () => siteEditableFields.filter((field) => inherits[field.key] === false).length,
    [inherits],
  );

  if (!clientId || !siteId) {
    return (
      <EmptyState
        icon="location_on"
        title="Selecione um cliente e um site"
        description="Escolha cliente e site acima para editar sobrescritas exclusivas desta unidade."
      />
    );
  }

  if (
    localSiteQuery.isLoading ||
    effectiveSiteQuery.isLoading ||
    localClientQuery.isLoading ||
    clientMetadataQuery.isLoading ||
    siteMetadataQuery.isLoading
  ) {
    return <Loading message="Carregando configuração do site..." />;
  }

  if (
    localSiteQuery.isError ||
    effectiveSiteQuery.isError ||
    localClientQuery.isError ||
    clientMetadataQuery.isError ||
    siteMetadataQuery.isError
  ) {
    return (
      <ErrorDisplay
        message={readEntityError(
          localSiteQuery.error ??
            effectiveSiteQuery.error ??
            localClientQuery.error ??
            clientMetadataQuery.error ??
            siteMetadataQuery.error,
          "site",
        )}
        onRetry={() => {
          localSiteQuery.refetch();
          effectiveSiteQuery.refetch();
          localClientQuery.refetch();
          clientMetadataQuery.refetch();
          siteMetadataQuery.refetch();
        }}
      />
    );
  }

  const saveFull = async () => {
    const payload: Record<string, ConfigurationValue | null> = {};
    for (const field of siteEditableFields) {
      const value = String(getValues(`values.${field.key}` as never) ?? "");
      if (inherits[field.key]) {
        payload[field.key] = null;
      } else {
        const fieldMeta = getFieldMetadata(siteMetadataQuery.data?.fields, field.key);
        if (!canEditFieldAtScope(fieldMeta, "site")) continue;
        const validation = validateFieldValue(field.kind, value, field.key);
        if (validation !== true) {
          toast.error(`${field.label}: ${validation}`);
          return;
        }
        payload[field.key] = parseFieldValue(field.kind, value, field.key);
      }
    }
    normalizeRemoteConsentTextPayloads(payload);
    try {
      await putMutation.mutateAsync({ siteId, payload });
      setRemoteDirty({});
      toast.success("Configuração do site salva.");
    } catch (error) {
      toast.error(readEntityError(error, "site"));
    }
  };

  const savePartial = async (fieldKey: string) => {
    const field = siteEditableFields.find((item) => item.key === fieldKey);
    if (!field) return;
    const value = String(getValues(`values.${field.key}` as never) ?? "");
    const fieldMeta = getFieldMetadata(siteMetadataQuery.data?.fields, field.key);
    if (!canEditFieldAtScope(fieldMeta, "site")) {
      toast.error(`Campo ${field.key} bloqueado`);
      return;
    }
    const payload = inherits[field.key]
      ? { [field.key]: null }
      : { [field.key]: parseFieldValue(field.kind, value, field.key) };
    if (!inherits[field.key]) {
      const validation = validateFieldValue(field.kind, value, field.key);
      if (validation !== true) {
        toast.error(validation);
        return;
      }
    }
    try {
      await patchMutation.mutateAsync({ siteId, payload });
      toast.success(`Campo ${field.label} atualizado.`);
    } catch (error) {
      toast.error(readEntityError(error, "site"));
    }
  };

  const resetProperty = async (propertyName: string) => {
    try {
      await resetPropertyMutation.mutateAsync({ siteId, propertyName });
      toast.success(`Propriedade ${propertyName} resetada.`);
    } catch (error) {
      toast.error(readResetError(error));
    }
  };

  const removeLocalConfig = async () => {
    try {
      await deleteMutation.mutateAsync(siteId);
      setRemoteDirty({});
      toast.success("Configuração local removida. Herança total restaurada.");
    } catch (error) {
      toast.error(readEntityError(error, "site"));
    }
  };

  const remoteConsentState: Record<string, RemoteConsentFieldState> = {};
  for (const field of remoteAccessFields) {
    const fieldMeta = getFieldMetadata(siteMetadataQuery.data?.fields, field.key);
    remoteConsentState[field.key] = {
      value: String(watchedValues[field.key] ?? ""),
      inherited: !!inherits[field.key],
      origin: resolveSiteOrigin(localSiteQuery.data, localClientQuery.data, field.key),
      locked: !canEditFieldAtScope(fieldMeta, "site"),
      lockOwner:
        getLockOwnerForScope(fieldMeta, "site") ??
        getLockOwnerForScope(getFieldMetadata(clientMetadataQuery.data?.fields, field.key), "site"),
      dirty: !!remoteDirty[field.key],
    };
  }

  const changeRemoteField = (fieldKey: string, value: string) => {
    setValue(`values.${fieldKey}` as never, value as never, { shouldDirty: true });
    setRemoteDirty((prev) => ({ ...prev, [fieldKey]: true }));
  };

  const toggleRemoteInherit = (fieldKey: string, inherit: boolean) => {
    setInherits((prev) => ({ ...prev, [fieldKey]: inherit }));
    setRemoteDirty((prev) => ({ ...prev, [fieldKey]: true }));
    if (inherit) return;
    const current = String(getValues(`values.${fieldKey}` as never) ?? "").trim();
    if (current.length > 0) return;
    const effective = formatFieldValue(
      getEffectiveValue(effectiveSiteQuery.data, fieldKey) ?? localSiteQuery.data?.[fieldKey],
      fieldKey,
    );
    if (effective) {
      setValue(`values.${fieldKey}` as never, effective as never, { shouldDirty: true });
    }
  };

  const saveRemoteAccess = async () => {
    const changedKeys = remoteAccessFields
      .map((field) => field.key)
      .filter((fieldKey) => remoteDirty[fieldKey]);
    if (changedKeys.length === 0) return;

    const payload: Record<string, ConfigurationValue | null> = {};
    for (const fieldKey of changedKeys) {
      const field = remoteAccessFields.find((item) => item.key === fieldKey);
      if (!field) continue;
      const fieldMeta = getFieldMetadata(siteMetadataQuery.data?.fields, fieldKey);
      if (!canEditFieldAtScope(fieldMeta, "site")) continue;
      if (inherits[fieldKey]) {
        payload[fieldKey] = null;
        continue;
      }
      const rawValue = String(getValues(`values.${fieldKey}` as never) ?? "");
      const validation = validateFieldValue(field.kind, rawValue, fieldKey);
      if (validation !== true) {
        toast.error(`${field.label}: ${validation}`);
        return;
      }
      payload[fieldKey] = parseFieldValue(field.kind, rawValue, fieldKey);
    }
    normalizeRemoteConsentTextPayloads(payload);
    if (Object.keys(payload).length === 0) return;

    try {
      await patchMutation.mutateAsync({ siteId, payload });
      setRemoteDirty({});
      toast.success("Autorização de acesso remoto atualizada.");
    } catch (error) {
      toast.error(readEntityError(error, "site"));
    }
  };

  const discardRemoteAccess = () => {
    for (const field of remoteAccessFields) {
      const value =
        getEffectiveValue(effectiveSiteQuery.data, field.key) ?? localSiteQuery.data?.[field.key];
      setValue(`values.${field.key}` as never, formatFieldValue(value, field.key) as never);
      const fieldMeta = getFieldMetadata(siteMetadataQuery.data?.fields, field.key);
      setInherits((prev) => ({
        ...prev,
        [field.key]: isInheritedBySourceType(fieldMeta, "site"),
      }));
    }
    setRemoteDirty({});
  };

  const renderFieldEditor = (field: EditableField) => {
    const value = String(watch(`values.${field.key}` as never) ?? "");
    const inherited = !!inherits[field.key];
    const fieldMeta = getFieldMetadata(siteMetadataQuery.data?.fields, field.key);
    const canEditField = canEditFieldAtScope(fieldMeta, "site");

    if (field.key === "maintenanceWindowJson") {
      const rawLocal = localSiteQuery.data?.[field.key];
      const isOverride = rawLocal !== null && rawLocal !== undefined && String(rawLocal).trim() !== "";
      const localValue = isOverride ? String(rawLocal) : "";
      const origin = resolveSiteOrigin(localSiteQuery.data, localClientQuery.data, field.key);
      const inheritedLabel = isOverride
        ? null
        : origin === "Client"
          ? "Cliente"
          : origin === "Site"
            ? "Site"
            : "Servidor";

      return (
        <MaintenanceWindowCard
          key={field.key}
          value={localValue}
          effectiveValue={String(getEffectiveValue(effectiveSiteQuery.data, field.key) ?? "")}
          inherited={!isOverride}
          inheritedFrom={inheritedLabel}
          canManage={canEditField}
          onSave={async (json) => {
            setValue(`values.${field.key}` as never, json as never, { shouldDirty: true });
            try {
              await patchMutation.mutateAsync({ siteId, payload: { [field.key]: json } });
              setInherits((prev) => ({ ...prev, [field.key]: false }));
              toast.success("Janela de manutenção (override) atualizada.");
            } catch (error) {
              toast.error(readEntityError(error, "site"));
              throw error;
            }
          }}
          onClear={async () => {
            try {
              await patchMutation.mutateAsync({ siteId, payload: { [field.key]: null } });
              setInherits((prev) => ({ ...prev, [field.key]: true }));
              setValue(`values.${field.key}` as never, "" as never, { shouldDirty: true });
              toast.success("Override removido: o campo voltou a herdar do cliente/servidor.");
            } catch (error) {
              toast.error(readEntityError(error, "site"));
              throw error;
            }
          }}
        />
      );
    }

    return (
      <ConfigurationFieldEditor
        key={field.key}
        fieldKey={field.key}
        fieldLabel={field.label}
        fieldKind={field.kind}
        value={value}
        inherited={inherited}
        effectiveValue={getEffectiveValue(effectiveSiteQuery.data, field.key)}
        origin={resolveSiteOrigin(localSiteQuery.data, localClientQuery.data, field.key)}
        locked={!canEditField}
        lockOwner={
          getLockOwnerForScope(fieldMeta, "site") ??
          getLockOwnerForScope(getFieldMetadata(clientMetadataQuery.data?.fields, field.key), "site")
        }
        saving={patchMutation.isPending}
        resetLoading={resetPropertyMutation.isPending}
        description={field.description}
        unit={field.unit}
        options={field.key === "agentHomeTab" ? agentHomeTabOptions : field.options}
        onValueChange={(next) =>
          setValue(`values.${field.key}` as never, next as never, { shouldDirty: true })
        }
        onToggleInherit={(next) => {
          setInherits((prev) => ({ ...prev, [field.key]: next }));
          if (next) {
            setValue(`values.${field.key}` as never, "" as never, { shouldDirty: true });
          }
        }}
        onSavePatch={() => savePartial(field.key)}
        onResetProperty={() => resetProperty(field.key)}
      />
    );
  };

  const term = fieldQuery.trim().toLowerCase();
  const filterList = (list: EditableField[]) =>
    list.filter((field) => matchesFieldFilter(field, term, !!inherits[field.key], onlyOverrides));

  const featureFields = filterList(siteEditableFields.filter((f) => f.group === "features"));
  const policyFields = filterList(
    siteEditableFields.filter((f) => f.group === "policy" && !SEPARATE_POLICY_KEYS.has(f.key)),
  );
  const maintenanceField = siteEditableFields.find((f) => f.key === "maintenanceWindowJson");
  const showMaintenance =
    maintenanceField &&
    matchesFieldFilter(maintenanceField, term, !!inherits[maintenanceField.key], onlyOverrides);
  const filteredRemote = filterList(remoteAccessFields);
  const agentFields = filterList(siteEditableFields.filter((f) => f.group === "agent"));
  const siteProfileFields = filterList(siteEditableFields.filter((f) => f.group === "siteProfile"));
  const advancedFields = filterList(siteEditableFields.filter((f) => f.group === "advanced"));

  const nothingVisible =
    featureFields.length === 0 &&
    policyFields.length === 0 &&
    !showMaintenance &&
    filteredRemote.length === 0 &&
    agentFields.length === 0 &&
    siteProfileFields.length === 0 &&
    advancedFields.length === 0;

  return (
    <div className="space-y-5">
      <ScopeActionToolbar
        fieldQuery={fieldQuery}
        onFieldQueryChange={setFieldQuery}
        onlyOverrides={onlyOverrides}
        onToggleOnlyOverrides={() => setOnlyOverrides((v) => !v)}
        overrideCount={overrideCount}
        onSaveFull={saveFull}
        savingFull={putMutation.isPending}
        onRestoreInheritance={removeLocalConfig}
        restoring={deleteMutation.isPending}
        scopeEntityLabel="site"
      />

      {nothingVisible ? (
        <EmptyState
          icon="search"
          title="Nenhum campo encontrado"
          description={
            onlyOverrides && overrideCount === 0
              ? "Este site ainda não possui sobrescritas locais — todos os campos estão herdando."
              : "Nenhum campo corresponde ao filtro atual."
          }
        />
      ) : (
        <>
          {featureFields.length > 0 && (
            <ConfigurationSectionCard
              title="Funcionalidades do Sistema"
              subtitle="Ative ou desative módulos que impactam os agentes desse site."
              icon={<Icon name="verified_user" className="h-4 w-4" />}
              iconClassName={tintedIcon.sky}
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {featureFields.map(renderFieldEditor)}
              </div>
            </ConfigurationSectionCard>
          )}

          {policyFields.length > 0 && (
            <ConfigurationSectionCard
              title="Política da Loja de Aplicativos"
              subtitle="Define quais aplicativos são permitidos para os agentes do site."
              icon={<Icon name="storefront" className="h-4 w-4" />}
              iconClassName={tintedIcon.violet}
            >
              <div className="space-y-4">{policyFields.map(renderFieldEditor)}</div>
            </ConfigurationSectionCard>
          )}

          {showMaintenance && maintenanceField && (
            <ConfigurationSectionCard
              title="Janela de Manutenção (Reboot/Patches)"
              subtitle="Override da janela do cliente/servidor. Vazio herda; fora da janela o agent adia patches e reboots."
              icon={<Icon name="schedule" className="h-4 w-4" />}
              iconClassName={tintedIcon.violet}
            >
              {renderFieldEditor(maintenanceField)}
            </ConfigurationSectionCard>
          )}

          {filteredRemote.length > 0 && (
            <ConfigurationSectionCard
              title="Autorização de Acesso Remoto"
              subtitle="Somente sessões de área de trabalho. Terminal, arquivos, proxy e processos não pedem autorização."
              icon={<Icon name="devices" className="h-4 w-4" />}
              iconClassName={tintedIcon.emerald}
            >
              <RemoteAccessConsentSection
                state={remoteConsentState}
                previewContext={{ client: clientName, site: siteName }}
                saving={patchMutation.isPending || putMutation.isPending}
                resetLoading={resetPropertyMutation.isPending}
                onChange={changeRemoteField}
                onToggleInherit={toggleRemoteInherit}
                onResetField={(fieldKey) => {
                  setRemoteDirty((prev) => ({ ...prev, [fieldKey]: false }));
                  void resetProperty(fieldKey);
                }}
                onSave={saveRemoteAccess}
                onDiscard={discardRemoteAccess}
              />
            </ConfigurationSectionCard>
          )}

          {agentFields.length > 0 && (
            <ConfigurationSectionCard
              title="Intervalos e Comportamento do Agente"
              subtitle="Frequência de heartbeat, detecção de offline e coleta de inventário no escopo do site."
              icon={<Icon name="schedule" className="h-4 w-4" />}
              iconClassName={tintedIcon.emerald}
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {agentFields.map(renderFieldEditor)}
              </div>
            </ConfigurationSectionCard>
          )}

          {siteProfileFields.length > 0 && (
            <ConfigurationSectionCard
              title="Perfil do Site"
              subtitle="Dados cadastrais e de contato específicos desta unidade."
              icon={<Icon name="account_circle" className="h-4 w-4" />}
              iconClassName={tintedIcon.amber}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                {siteProfileFields.map(renderFieldEditor)}
              </div>
            </ConfigurationSectionCard>
          )}

          {advancedFields.length > 0 && (
            <ConfigurationSectionCard
              title="Configurações Avançadas"
              subtitle="Campos estruturados de integração e atualização automática."
              icon={<Icon name="smart_toy" className="h-4 w-4" />}
              iconClassName={tintedIcon.blue}
            >
              <div className="space-y-4">{advancedFields.map(renderFieldEditor)}</div>
            </ConfigurationSectionCard>
          )}
        </>
      )}
    </div>
  );
}

// ── Painel: Simulador Efetivo ──────────────────────────────────────────────────

function EffectiveScopePanel({ clientId, siteId }: { clientId: string; siteId: string }) {
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<string>("all");

  const clientEffective = useClientEffectiveConfig(clientId);
  const siteEffective = useSiteEffectiveConfig(siteId);

  const resolved: ResolvedConfiguration | undefined = siteId
    ? siteEffective.data
    : clientId
      ? clientEffective.data
      : undefined;

  const query = siteId ? siteEffective : clientEffective;
  const scopeLabel = siteId ? "Site" : clientId ? "Cliente" : null;

  const rows = useMemo(() => {
    if (!resolved) return [];
    const scalarRows = SCALAR_FIELDS.map((field) => ({
      key: field.key,
      label: field.label,
      valueText: formatEffectiveValue(
        field.key,
        (resolved as unknown as Record<string, unknown>)[field.key],
      ),
      sourceType: resolved.inheritance?.[toApiFieldName(field.key)],
    }));
    const objectRows = OBJECT_FIELDS.map((field) => ({
      key: field.inheritanceKey,
      label: field.label,
      valueText: "objeto (JSON)",
      sourceType: resolved.inheritance?.[field.inheritanceKey],
    }));
    return [...scalarRows, ...objectRows];
  }, [resolved]);

  const counts = useMemo(() => {
    let server = 0;
    let client = 0;
    let site = 0;
    let blocked = 0;
    for (const row of rows) {
      if (row.sourceType === 2) server++;
      else if (row.sourceType === 3) client++;
      else if (row.sourceType === 4) site++;
      else if (row.sourceType === 0) blocked++;
    }
    return { total: rows.length, server, client, site, blocked };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (originFilter !== "all" && String(row.sourceType ?? "") !== originFilter) {
        return false;
      }
      if (!term) return true;
      return (
        row.label.toLowerCase().includes(term) ||
        row.key.toLowerCase().includes(term) ||
        row.valueText.toLowerCase().includes(term)
      );
    });
  }, [rows, originFilter, search]);

  if (!clientId) {
    return (
      <EmptyState
        icon="layers"
        title="Selecione um cliente para simular"
        description="Escolha um cliente (e opcionalmente um site) acima para inspecionar o valor efetivo e a origem de cada campo."
      />
    );
  }

  if (query.isLoading) {
    return <Loading message="Resolvendo configuração efetiva..." />;
  }

  if (query.isError) {
    return (
      <ErrorDisplay
        message="Não foi possível resolver a configuração efetiva."
        onRetry={() => query.refetch()}
      />
    );
  }

  if (!resolved) return null;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-3.5">
          <p className="text-xs uppercase tracking-wide text-muted">Total resolvido</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{counts.total}</p>
          <p className="text-xs text-muted">Escopo ativo: {scopeLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3.5">
          <p className="text-xs uppercase tracking-wide text-muted">Herdados do Servidor</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{counts.server}</p>
          <p className="text-xs text-muted">Valores padrão da instância</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3.5">
          <p className="text-xs uppercase tracking-wide text-muted">Sobrescritas (Cliente/Site)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
            {counts.client + counts.site}
          </p>
          <p className="text-xs text-muted">
            {counts.client} cliente · {counts.site} site
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3.5">
          <p className="text-xs uppercase tracking-wide text-muted">Campos bloqueados</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-danger">
            {(resolved.blockedFields ?? []).length}
          </p>
          <p className="text-xs text-muted">Impedidos de sobrescrita</p>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Origem dos valores"
          subtitle={scopeLabel ? `Resolvido no escopo: ${scopeLabel}` : undefined}
          action={
            <Button size="sm" variant="ghost" onClick={() => query.refetch()}>
              <Icon name="refresh" className="h-3.5 w-3.5" />
              Atualizar
            </Button>
          }
        />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            />
            <Input
              aria-label="Buscar campo na configuração efetiva"
              placeholder="Buscar campo ou valor…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "Todas" },
              { id: "2", label: "Servidor" },
              { id: "3", label: "Cliente" },
              { id: "4", label: "Site" },
              { id: "0", label: "Bloqueado" },
            ].map((option) => {
              const active = originFilter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setOriginFilter(option.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-surface-light text-muted-foreground hover:border-border-strong hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-4">Campo</th>
                <th className="py-2 pr-4">Valor efetivo</th>
                <th className="py-2">Origem</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.key} className="border-b border-border/50 transition-colors hover:bg-surface-light/60">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-foreground">{row.label}</span>
                    <span className="ml-2 font-mono text-[11px] text-muted">{row.key}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{row.valueText}</td>
                  <td className="py-2.5">
                    <OriginBadge sourceType={row.sourceType} />
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-sm text-muted">
                    Nenhum campo corresponde ao filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Campos bloqueados"
          subtitle="Locks definidos no servidor ou no cliente que impedem sobrescrita nos níveis inferiores"
        />
        {(resolved.blockedFields ?? []).length === 0 ? (
          <p className="text-sm text-muted">Nenhum campo bloqueado neste escopo.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(resolved.blockedFields ?? []).map((field) => (
              <span
                key={field}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs ${statusSurface.danger}`}
              >
                <Icon name="lock" className="h-3 w-3" />
                {field}
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="apartment" className="h-3.5 w-3.5" />
          Resolvido em {new Date(resolved.resolvedAt).toLocaleString("pt-BR")}
        </span>
        {siteId && (
          <span className="inline-flex items-center gap-1.5">
            <Icon name="location_on" className="h-3.5 w-3.5" />
            Site {siteId}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Página Principal Unificada ─────────────────────────────────────────────────

export default function ScopeConfigurationPage({
  initialTab = "client",
}: ScopeConfigurationPageProps) {
  const [activeTab, setActiveTab] = useState<ScopeConfigurationTab>(initialTab);
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const tabRefs = useRef<Record<ScopeConfigurationTab, HTMLButtonElement | null>>({
    client: null,
    site: null,
    effective: null,
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const clientsQuery = useClients();
  const sitesQuery = useSites(clientId, false);

  const clients = clientsQuery.data ?? [];
  const sites = sitesQuery.data ?? [];

  const selectedClientName = useMemo(
    () => clients.find((c) => c.id === clientId)?.name ?? "",
    [clients, clientId],
  );
  const selectedSiteName = useMemo(
    () => sites.find((s) => s.id === siteId)?.name ?? "",
    [sites, siteId],
  );

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Selecione um cliente" },
      ...clients.map((client) => ({ value: client.id, label: client.name })),
    ],
    [clients],
  );

  const siteOptions = useMemo(
    () => [
      {
        value: "",
        label:
          activeTab === "effective"
            ? clientId
              ? "Cliente inteiro (sem site)"
              : "Escolha um cliente primeiro"
            : clientId
              ? "Selecione um site"
              : "Escolha um cliente primeiro",
      },
      ...sites.map((site) => ({ value: site.id, label: site.name })),
    ],
    [activeTab, clientId, sites],
  );

  const selectTab = (tab: ScopeConfigurationTab) => {
    setActiveTab(tab);
    tabRefs.current[tab]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const target = TABS[nextIndex];
    selectTab(target.id);
    tabRefs.current[target.id]?.focus();
  };

  return (
    <div className="space-y-6">
      <ConfigurationPageHeader
        title="Configuração por Escopo"
        subtitle="Gerencie sobrescritas de Cliente e Site e simule a herança efetiva (Servidor → Cliente → Site) sem perder o contexto."
        breadcrumb={
          <Link to="/settings" className="transition-colors hover:text-foreground">
            Configurações
          </Link>
        }
      />

      {/* Abas em linha única com indicador de borda inferior (WAI-ARIA tabs) */}
      <div
        role="tablist"
        aria-label="Níveis de configuração por escopo"
        className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-border"
      >
        {TABS.map((tab, index) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              id={`scope-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`relative flex-none inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                isSelected
                  ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 after:border-primary"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <Icon name={tab.icon} className="h-4 w-4" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Seletor de escopo compartilhado entre as abas */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">Contexto de herança</h2>
            <p className="text-xs text-muted">
              O escopo selecionado permanece ativo ao alternar entre Cliente, Site e Simulador Efetivo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Link
              to="/settings/server"
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-light px-2.5 py-1 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              <Icon name="dns" className="h-3.5 w-3.5" />
              Servidor
            </Link>
            <Icon name="chevron_right" className="h-3.5 w-3.5 text-muted" />
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                clientId
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-surface-light text-muted"
              }`}
            >
              <Icon name="apartment" className="h-3.5 w-3.5" />
              {selectedClientName || "Cliente"}
            </span>
            {activeTab !== "client" && (
              <>
                <Icon name="chevron_right" className="h-3.5 w-3.5 text-muted" />
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                    siteId
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border bg-surface-light text-muted"
                  }`}
                >
                  <Icon name="location_on" className="h-3.5 w-3.5" />
                  {selectedSiteName || (activeTab === "effective" ? "Todos os sites" : "Site")}
                </span>
              </>
            )}
          </div>
        </div>

        {clientsQuery.isLoading ? (
          <Loading message="Carregando clientes..." />
        ) : clientsQuery.isError ? (
          <ErrorDisplay
            message={readEntityError(clientsQuery.error, "client")}
            onRetry={clientsQuery.refetch}
          />
        ) : (
          <div className="space-y-3">
            <div className={`grid gap-3 ${activeTab === "client" ? "max-w-md" : "md:grid-cols-2"}`}>
              <Select
                label="Cliente"
                options={clientOptions}
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setSiteId("");
                }}
              />
              {activeTab !== "client" && (
                <Select
                  label={activeTab === "effective" ? "Site (opcional)" : "Site"}
                  options={siteOptions}
                  value={siteId}
                  disabled={!clientId || sitesQuery.isLoading}
                  onChange={(event) => setSiteId(event.target.value)}
                />
              )}
            </div>

            {activeTab !== "client" && clientId && sitesQuery.isLoading && (
              <Loading message="Carregando sites..." />
            )}
            {activeTab !== "client" && clientId && sitesQuery.isError && (
              <ErrorDisplay
                message={readEntityError(sitesQuery.error, "site")}
                onRetry={sitesQuery.refetch}
              />
            )}
          </div>
        )}
      </Card>

      <div
        role="tabpanel"
        aria-labelledby={`scope-tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === "client" && (
          <ClientScopePanel clientId={clientId} clientName={selectedClientName} />
        )}
        {activeTab === "site" && (
          <SiteScopePanel
            clientId={clientId}
            siteId={siteId}
            clientName={selectedClientName}
            siteName={selectedSiteName}
          />
        )}
        {activeTab === "effective" && (
          <EffectiveScopePanel clientId={clientId} siteId={siteId} />
        )}
      </div>
    </div>
  );
}
