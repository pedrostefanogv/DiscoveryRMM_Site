import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { ApiError } from "@/api";
import type { ConfigurationValue } from "@/api";
import {
  ConfigurationFieldEditor,
  BackgroundProcessingCard,
  MaintenanceWindowCard,
  McpToolPolicyCard,
  parseBackgroundProcessingSettings,
  ConfigurationPageHeader,
  ConfigurationSectionCard,
  RemoteAccessConsentSection,
  tintedIcon,
  type RemoteConsentFieldState,
} from "@/components/configuration";
import { Icon, Button, ErrorDisplay, Loading, Select } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import {
  useClientConfig,
  useClientEffectiveConfig,
  useClientMetadata,
  useDeleteClientConfig,
  usePatchClientConfig,
  useResetClientProperty,
  useUpsertClientConfig,
} from "../../hooks/useConfigurationApi";
import {
  buildInheritedState,
  canEditFieldAtScope,
  clientEditableFields,
  formatFieldValue,
  getAgentHomeTabOptions,
  getFieldMetadata,
  getEffectiveValue,
  getLockOwnerForScope,
  parseFieldValue,
  resolveClientOrigin,
  validateFieldValue,
} from "@/utils/configurationEditors";

interface FormValues {
  values: Record<string, string>;
}

export default function ClientConfigurationPage() {
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [inherits, setInherits] = useState<Record<string, boolean>>({});
  // Campos da seção de acesso remoto alterados e ainda não salvos (salvos de uma
  // vez, em um único PATCH, em vez de um por campo).
  const [remoteDirty, setRemoteDirty] = useState<Record<string, boolean>>({});

  const clientsQuery = useClients();
  const localQuery = useClientConfig(clientId);
  const effectiveQuery = useClientEffectiveConfig(clientId);
  const metadataQuery = useClientMetadata(clientId);
  // Catálogo de abas (agentHomeTab) publicado pelo servidor na metadata.
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
  // Snapshot reativo de todos os valores (a seção de acesso remoto recebe os
  // valores como prop e precisa refletir a edição imediatamente).
  const watchedValues = watch("values") ?? {};

  // Trocar de cliente reinicia os marcadores de "não salvo" da seção de acesso remoto.
  useEffect(() => {
    setRemoteDirty({});
  }, [clientId]);

  useEffect(() => {
    if (!localQuery.data) {
      return;
    }

    for (const field of clientEditableFields) {
      const value = localQuery.data[field.key] ?? getEffectiveValue(effectiveQuery.data, field.key);
      setValue(`values.${field.key}` as never, formatFieldValue(value, field.key) as never);
    }

    setInherits(buildInheritedState(localQuery.data, clientEditableFields));
  }, [effectiveQuery.data, localQuery.data, setValue]);

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Selecione um cliente" },
      ...((clientsQuery.data ?? []).map((client) => ({ value: client.id, label: client.name })) ?? []),
    ],
    [clientsQuery.data],
  );

  const saveFull = async () => {
    if (!clientId) {
      return;
    }

    const payload: Record<string, ConfigurationValue | null> = {};
    for (const field of clientEditableFields) {
      const value = String(getValues(`values.${field.key}` as never) ?? "");
      if (inherits[field.key]) {
        payload[field.key] = null;
      } else {
        const fieldMeta = getFieldMetadata(metadataQuery.data?.fields, field.key);
        if (!canEditFieldAtScope(fieldMeta, "client")) {
          continue;
        }

        const validation = validateFieldValue(field.kind, value, field.key);
        if (validation !== true) {
          toast.error(`${field.key}: ${validation}`);
          return;
        }

        payload[field.key] = parseFieldValue(field.kind, value, field.key);
      }
    }

    normalizeRemoteConsentTextPayloads(payload);

    try {
      await putMutation.mutateAsync({ clientId, payload });
      setRemoteDirty({});
      toast.success("Configuração do cliente salva com PUT");
    } catch (error) {
      toast.error(readEntityError(error, "client"));
    }
  };

  const savePartial = async (fieldKey: string) => {
    if (!clientId) {
      return;
    }

    const field = clientEditableFields.find((item) => item.key === fieldKey);
    if (!field) {
      return;
    }

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
      toast.success(`Campo ${field.key} atualizado com PATCH`);
    } catch (error) {
      toast.error(readEntityError(error, "client"));
    }
  };

  const resetProperty = async (propertyName: string) => {
    if (!clientId) {
      return;
    }

    try {
      await resetPropertyMutation.mutateAsync({ clientId, propertyName });
      toast.success(`Propriedade ${propertyName} resetada`);
    } catch (error) {
      toast.error(readResetError(error));
    }
  };

  const removeLocalConfig = async () => {
    if (!clientId) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(clientId);
      setRemoteDirty({});
      toast.success("Configuração local removida. Herança total restaurada.");
    } catch (error) {
      toast.error(readEntityError(error, "client"));
    }
  };

  const featureFields = clientEditableFields.filter((field) => field.group === "features");
  const policyFields = clientEditableFields.filter((field) => field.group === "policy");
  const remoteAccessFields = useMemo(
    () => clientEditableFields.filter((field) => field.group === "remoteAccess"),
    [],
  );
  const agentFields = clientEditableFields.filter((field) => field.group === "agent");
  const advancedFields = clientEditableFields.filter((field) => field.group === "advanced");

  // ── Autorização de acesso remoto (seção dedicada) ──────────────
  // Calculado a cada render (sem useMemo): o watch() do react-hook-form devolve a
  // referência viva de _formValues e memoizar por identidade congelaria os campos.
  const remoteConsentState = (() => {
    const next: Record<string, RemoteConsentFieldState> = {};
    for (const field of remoteAccessFields) {
      const fieldMeta = getFieldMetadata(metadataQuery.data?.fields, field.key);
      next[field.key] = {
        value: String(watchedValues[field.key] ?? ""),
        inherited: !!inherits[field.key],
        origin: resolveClientOrigin(localQuery.data, field.key),
        locked: !canEditFieldAtScope(fieldMeta, "client"),
        lockOwner: getLockOwnerForScope(fieldMeta, "client"),
        dirty: !!remoteDirty[field.key],
      };
    }
    return next;
  })();

  const markRemoteDirty = (fieldKey: string) =>
    setRemoteDirty((previous) => ({ ...previous, [fieldKey]: true }));

  const changeRemoteField = (fieldKey: string, value: string) => {
    setValue(`values.${fieldKey}` as never, value as never, { shouldDirty: true });
    markRemoteDirty(fieldKey);
  };

  const toggleRemoteInherit = (fieldKey: string, inherit: boolean) => {
    setInherits((previous) => ({ ...previous, [fieldKey]: inherit }));
    markRemoteDirty(fieldKey);

    if (inherit) {
      return;
    }

    // Ao começar a sobrescrever, parte do valor efetivo em vez de zerar o campo.
    const current = String(getValues(`values.${fieldKey}` as never) ?? "").trim();
    if (current.length > 0) {
      return;
    }

    const effective = formatFieldValue(
      localQuery.data?.[fieldKey] ?? getEffectiveValue(effectiveQuery.data, fieldKey),
      fieldKey,
    );
    if (effective) {
      setValue(`values.${fieldKey}` as never, effective as never, { shouldDirty: true });
    }
  };

  const saveRemoteAccess = async () => {
    if (!clientId) {
      return;
    }

    const changedKeys = remoteAccessFields
      .map((field) => field.key)
      .filter((fieldKey) => remoteDirty[fieldKey]);
    if (changedKeys.length === 0) {
      return;
    }

    const payload: Record<string, ConfigurationValue | null> = {};
    for (const fieldKey of changedKeys) {
      const field = remoteAccessFields.find((item) => item.key === fieldKey);
      if (!field) {
        continue;
      }

      const fieldMeta = getFieldMetadata(metadataQuery.data?.fields, fieldKey);
      if (!canEditFieldAtScope(fieldMeta, "client")) {
        continue;
      }

      if (inherits[fieldKey]) {
        payload[fieldKey] = null;
        continue;
      }

      const rawValue = String(getValues(`values.${fieldKey}` as never) ?? "");
      const validation = validateFieldValue(field.kind, rawValue, fieldKey);
      if (validation !== true) {
        toast.error(field.label + ": " + validation);
        return;
      }
      payload[fieldKey] = parseFieldValue(field.kind, rawValue, fieldKey);
    }

    normalizeRemoteConsentTextPayloads(payload);

    if (Object.keys(payload).length === 0) {
      return;
    }

    try {
      await patchMutation.mutateAsync({ clientId, payload });
      setRemoteDirty({});
      toast.success("Autorização de acesso remoto atualizada");
    } catch (error) {
      toast.error(readEntityError(error, "client"));
    }
  };

  const discardRemoteAccess = () => {
    const inheritedState = buildInheritedState(localQuery.data, remoteAccessFields);
    for (const field of remoteAccessFields) {
      const value =
        localQuery.data?.[field.key] ?? getEffectiveValue(effectiveQuery.data, field.key);
      setValue(`values.${field.key}` as never, formatFieldValue(value, field.key) as never);
      setInherits((previous) => ({ ...previous, [field.key]: inheritedState[field.key] }));
    }
    setRemoteDirty({});
  };

  const resetRemoteField = (fieldKey: string) => {
    setRemoteDirty((previous) => ({ ...previous, [fieldKey]: false }));
    void resetProperty(fieldKey);
  };

  const renderFieldEditor = (
    fieldKey: string,
    fieldLabel: string,
    fieldKind: "boolean" | "number" | "string" | "json" | "policy" | "select",
  ) => {
    const value = String(watch(`values.${fieldKey}` as never) ?? "");
    const inherited = !!inherits[fieldKey];
    const fieldMeta = getFieldMetadata(metadataQuery.data?.fields, fieldKey);
    const canEditField = canEditFieldAtScope(fieldMeta, "client");
    const fieldDef = clientEditableFields.find((f) => f.key === fieldKey);

    // Janela de manutenção e política MCP: cards dedicados no modo override.
    if (fieldKey === "maintenanceWindowJson") {
      return (
        <MaintenanceWindowCard
          key={fieldKey}
          value={String(value ?? "")}
          inheritedFrom={resolveClientOrigin(localQuery.data, fieldKey) || "Servidor"}
          canManage={canEditFieldAtScope(fieldMeta, "client")}
          saving={patchMutation.isPending}
          onSave={async (json) => {
            setValue(`values.${fieldKey}` as never, json as never, { shouldDirty: true });
            await patchMutation.mutateAsync({ clientId, payload: { [fieldKey]: json } });
            toast.success("Janela de manutenção (override) atualizada.");
          }}
        />
      );
    }
    if (fieldKey === "mcpToolPolicyJson") {
      return (
        <McpToolPolicyCard
          key={fieldKey}
          value={String(value ?? "")}
          inheritedFrom={resolveClientOrigin(localQuery.data, fieldKey) || "Servidor"}
          canManage={canEditFieldAtScope(fieldMeta, "client")}
          saving={patchMutation.isPending}
          onSave={async (json) => {
            setValue(`values.${fieldKey}` as never, json as never, { shouldDirty: true });
            await patchMutation.mutateAsync({ clientId, payload: { [fieldKey]: json } });
            toast.success("Política de tools MCP (override) atualizada.");
          }}
        />
      );
    }

    // Processamento em segundo plano usa card dedicado no modo override.
    if (fieldKey === "backgroundProcessingSettingsJson") {
      return (
        <BackgroundProcessingCard
          key={fieldKey}
          mode="override"
          settings={parseBackgroundProcessingSettings(value)}
          clientId={clientId || null}
          canManage={canEditFieldAtScope(fieldMeta, "client")}
          onSave={async (json) => {
            setValue(`values.${fieldKey}` as never, json as never, { shouldDirty: true });
            await patchMutation.mutateAsync({ clientId, payload: { [fieldKey]: json } });
            toast.success("Processamento em segundo plano (override) atualizado.");
          }}
          saving={patchMutation.isPending}
        />
      );
    }

    return (
      <ConfigurationFieldEditor
        key={fieldKey}
        fieldKey={fieldKey}
        fieldLabel={fieldLabel}
        fieldKind={fieldKind}
        value={value}
        inherited={inherited}
        effectiveValue={getEffectiveValue(effectiveQuery.data, fieldKey)}
        origin={resolveClientOrigin(localQuery.data, fieldKey)}
        locked={!canEditField}
        lockOwner={getLockOwnerForScope(fieldMeta, "client")}
        saving={patchMutation.isPending}
        resetLoading={resetPropertyMutation.isPending}
        description={fieldDef?.description}
        unit={fieldDef?.unit}
        options={
          fieldKey === "agentHomeTab" ? agentHomeTabOptions : fieldDef?.options
        }
        onValueChange={(next) => {
          setValue(`values.${fieldKey}` as never, next as never, {
            shouldDirty: true,
          });
        }}
        onToggleInherit={(next) => {
          setInherits((prev) => ({ ...prev, [fieldKey]: next }));
          if (next) {
            setValue(`values.${fieldKey}` as never, "" as never, {
              shouldDirty: true,
            });
          }
        }}
        onSavePatch={() => savePartial(fieldKey)}
        onResetProperty={() => resetProperty(fieldKey)}
      />
    );
  };

  return (
    <div className="space-y-6">
      <ConfigurationPageHeader
        title="Configuração de Cliente"
        subtitle="Configurações aplicáveis ao cliente e aos agentes/sites desse cliente via herança."
        breadcrumb={<Link to="/settings" className="transition-colors hover:text-foreground">Configurações</Link>}
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={saveFull} loading={putMutation.isPending}>
              <Icon name="save" className="h-3.5 w-3.5" aria-hidden="true" />
              Salvar tudo
            </Button>
            {/* Ação destrutiva isolada no menu para não ficar ao lado do salvar */}
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
                        removeLocalConfig();
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Icon name="restart_alt" className="h-4 w-4" aria-hidden="true" /> Restaurar herança
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        }
      />

      <ConfigurationSectionCard
        title="Escopo de Cliente"
        subtitle="Selecione o cliente para editar apenas configurações válidas neste escopo."
        icon={<Icon name="apartment" className="h-4 w-4" />}
        iconClassName={tintedIcon.violet}
      >
        {clientsQuery.isLoading && <Loading message="Carregando clientes..." />}
        {clientsQuery.isError && (
          <ErrorDisplay message={readEntityError(clientsQuery.error, "client")} onRetry={clientsQuery.refetch} />
        )}
        {!clientsQuery.isLoading && !clientsQuery.isError && (
          <div className="space-y-4">
            <Select label="Cliente" options={clientOptions} value={clientId} onChange={(event) => setClientId(event.target.value)} />
            {!clientId && <p className="text-sm text-muted">Selecione um cliente para editar a configuração.</p>}
          </div>
        )}
      </ConfigurationSectionCard>

      {clientId && (localQuery.isLoading || effectiveQuery.isLoading || metadataQuery.isLoading) && (
        <Loading message="Carregando configuração do cliente..." />
      )}

      {clientId && (localQuery.isError || effectiveQuery.isError || metadataQuery.isError) && (
        <ErrorDisplay
          message={readEntityError(localQuery.error ?? effectiveQuery.error ?? metadataQuery.error, "client")}
          onRetry={() => {
            localQuery.refetch();
            effectiveQuery.refetch();
            metadataQuery.refetch();
          }}
        />
      )}

      {clientId && !localQuery.isLoading && !effectiveQuery.isLoading && !metadataQuery.isLoading && !localQuery.isError && !effectiveQuery.isError && !metadataQuery.isError && (
        <>
          {featureFields.length > 0 && (
            <ConfigurationSectionCard
              title="Funcionalidades do Sistema"
              subtitle="Ative ou desative módulos que impactam os agentes e sites desse cliente."
              icon={<Icon name="verified_user" className="h-4 w-4" />}
              iconClassName={tintedIcon.sky}
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {featureFields.map((field) =>
                  renderFieldEditor(field.key, field.label, field.kind),
                )}
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
              <div className="space-y-4">
                {policyFields.map((field) =>
                  renderFieldEditor(field.key, field.label, field.kind),
                )}
              </div>
            </ConfigurationSectionCard>
          )}

          {remoteAccessFields.length > 0 && (
            <ConfigurationSectionCard
              title="Autorização de Acesso Remoto"
              subtitle="Somente sessões de área de trabalho. Terminal, arquivos, proxy e processos não pedem autorização."
              icon={<Icon name="devices" className="h-4 w-4" />}
              iconClassName={tintedIcon.emerald}
            >
              <RemoteAccessConsentSection
                state={remoteConsentState}
                previewContext={{
                  client:
                    (clientsQuery.data ?? []).find((client) => client.id === clientId)?.name ?? "",
                }}
                saving={patchMutation.isPending || putMutation.isPending}
                resetLoading={resetPropertyMutation.isPending}
                onChange={changeRemoteField}
                onToggleInherit={toggleRemoteInherit}
                onResetField={resetRemoteField}
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
                {agentFields.map((field) =>
                  renderFieldEditor(field.key, field.label, field.kind),
                )}
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
              <div className="space-y-4">
                {advancedFields.map((field) =>
                  renderFieldEditor(field.key, field.label, field.kind),
                )}
              </div>
            </ConfigurationSectionCard>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Texto em branco em cliente/site significa "herdar": o resolvedor do backend
 * ignora strings em branco, mas gravar "" deixa um override inútil no registro.
 */
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
    return `404: ${entity} não encontrado`;
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
