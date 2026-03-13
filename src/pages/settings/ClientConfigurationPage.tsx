import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  Building2,
  Bot,
  Clock,
  Key,
  RotateCcw,
  Save,
  ShieldCheck,
  Store,
} from "lucide-react";
import { ApiError } from "@/api";
import type { ConfigurationValue } from "@/api";
import {
  ConfigurationFieldEditor,
  ConfigurationPageHeader,
  ConfigurationSectionCard,
} from "@/components/configuration";
import { Button, ErrorDisplay, Loading, Select } from "@/components/ui";
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
  const [clientId, setClientId] = useState("");
  const [inherits, setInherits] = useState<Record<string, boolean>>({});

  const clientsQuery = useClients();
  const localQuery = useClientConfig(clientId);
  const effectiveQuery = useClientEffectiveConfig(clientId);
  const metadataQuery = useClientMetadata(clientId);

  const putMutation = useUpsertClientConfig();
  const patchMutation = usePatchClientConfig();
  const deleteMutation = useDeleteClientConfig();
  const resetPropertyMutation = useResetClientProperty();

  const { setValue, getValues, watch } = useForm<FormValues>({
    defaultValues: { values: {} },
  });

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

    try {
      await putMutation.mutateAsync({ clientId, payload });
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
      toast.success("Configuração local removida. Herança total restaurada.");
    } catch (error) {
      toast.error(readEntityError(error, "client"));
    }
  };

  const featureFields = clientEditableFields.filter((field) => field.group === "features");
  const policyFields = clientEditableFields.filter((field) => field.group === "policy");
  const agentFields = clientEditableFields.filter((field) => field.group === "agent");
  const tokenFields = clientEditableFields.filter((field) => field.group === "tokens");
  const advancedFields = clientEditableFields.filter((field) => field.group === "advanced");

  const renderFieldEditor = (
    fieldKey: string,
    fieldLabel: string,
    fieldKind: "boolean" | "number" | "string" | "json" | "policy",
  ) => {
    const value = String(watch(`values.${fieldKey}` as never) ?? "");
    const inherited = !!inherits[fieldKey];
    const fieldMeta = getFieldMetadata(metadataQuery.data?.fields, fieldKey);
    const canEditField = canEditFieldAtScope(fieldMeta, "client");
    const fieldDef = clientEditableFields.find((f) => f.key === fieldKey);

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
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={saveFull} loading={putMutation.isPending}>
              <Save className="h-3.5 w-3.5" />
              Salvar tudo
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={removeLocalConfig}
              loading={deleteMutation.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar herança
            </Button>
          </>
        }
      />

      <ConfigurationSectionCard
        title="Escopo de Cliente"
        subtitle="Selecione o cliente para editar apenas configurações válidas neste escopo."
        icon={<Building2 className="h-4 w-4" />}
        iconClassName="bg-violet-500/20 text-violet-400"
      >
        {clientsQuery.isLoading && <Loading message="Carregando clientes..." />}
        {clientsQuery.isError && (
          <ErrorDisplay message={readEntityError(clientsQuery.error, "client")} onRetry={clientsQuery.refetch} />
        )}
        {!clientsQuery.isLoading && !clientsQuery.isError && (
          <div className="space-y-4">
            <Select label="Cliente" options={clientOptions} value={clientId} onChange={(event) => setClientId(event.target.value)} />
            {!clientId && <p className="text-sm text-slate-400">Selecione um cliente para editar a configuração.</p>}
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
              icon={<ShieldCheck className="h-4 w-4" />}
              iconClassName="bg-sky-500/20 text-sky-400"
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
              icon={<Store className="h-4 w-4" />}
              iconClassName="bg-violet-500/20 text-violet-400"
            >
              <div className="space-y-4">
                {policyFields.map((field) =>
                  renderFieldEditor(field.key, field.label, field.kind),
                )}
              </div>
            </ConfigurationSectionCard>
          )}

          {agentFields.length > 0 && (
            <ConfigurationSectionCard
              title="Intervalos e Comportamento do Agente"
              subtitle="Frequência de heartbeat, detecção de offline e coleta de inventário no escopo do cliente."
              icon={<Clock className="h-4 w-4" />}
              iconClassName="bg-emerald-500/20 text-emerald-400"
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {agentFields.map((field) =>
                  renderFieldEditor(field.key, field.label, field.kind),
                )}
              </div>
            </ConfigurationSectionCard>
          )}

          {tokenFields.length > 0 && (
            <ConfigurationSectionCard
              title="Tokens de Deploy"
              subtitle="Controle a validade e o limite de tokens emitidos por agente no escopo do cliente."
              icon={<Key className="h-4 w-4" />}
              iconClassName="bg-amber-500/20 text-amber-400"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {tokenFields.map((field) =>
                  renderFieldEditor(field.key, field.label, field.kind),
                )}
              </div>
            </ConfigurationSectionCard>
          )}

          {advancedFields.length > 0 && (
            <ConfigurationSectionCard
              title="Configurações Avançadas"
              subtitle="Auto-update e IA estruturada no escopo do cliente."
              icon={<Bot className="h-4 w-4" />}
              iconClassName="bg-blue-500/20 text-blue-400"
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

function readEntityError(error: unknown, entity: "client" | "site"): string {
  if (error instanceof ApiError && error.status === 404) {
    return `404: ${entity} nao encontrado`;
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
