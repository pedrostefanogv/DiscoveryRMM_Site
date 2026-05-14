import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  Bot,
  Clock,
  MapPin,
  RotateCcw,
  Save,
  ShieldCheck,
  Store,
  UserSquare2,
} from "lucide-react";
import { ApiError } from "@/api";
import type { ConfigurationValue } from "@/api";
import {
  ConfigurationFieldEditor,
  ConfigurationPageHeader,
  ConfigurationSectionCard,
} from "@/components/configuration";
import { Button, ErrorDisplay, Loading, Select } from "@/components/ui";
import {
  useClientMetadata,
  useClientConfig,
  useDeleteSiteConfig,
  usePatchSiteConfig,
  useResetSiteProperty,
  useSiteConfig,
  useSiteEffectiveConfig,
  useSiteMetadata,
  useUpsertSiteConfig,
} from "../../hooks/useConfigurationApi";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import {
  canEditFieldAtScope,
  formatFieldValue,
  getFieldMetadata,
  getEffectiveValue,
  getLockOwnerForScope,
  isInheritedBySourceType,
  parseFieldValue,
  resolveSiteOrigin,
  siteEditableFields,
  validateFieldValue,
} from "@/utils/configurationEditors";

interface FormValues {
  values: Record<string, string>;
}

export default function SiteConfigurationPage() {
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [inherits, setInherits] = useState<Record<string, boolean>>({});

  const { setValue, getValues, watch } = useForm<FormValues>({
    defaultValues: { values: {} },
  });

  const clientsQuery = useClients();
  const sitesQuery = useSites(clientId, false);

  const localSiteQuery = useSiteConfig(siteId);
  const effectiveSiteQuery = useSiteEffectiveConfig(siteId);
  const localClientQuery = useClientConfig(clientId);
  const clientMetadataQuery = useClientMetadata(clientId);
  const siteMetadataQuery = useSiteMetadata(siteId);

  const putMutation = useUpsertSiteConfig();
  const patchMutation = usePatchSiteConfig();
  const deleteMutation = useDeleteSiteConfig();
  const resetPropertyMutation = useResetSiteProperty();

  useEffect(() => {
    if (!localSiteQuery.data) {
      return;
    }

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

  const clientOptions = useMemo(
    () => [
      { value: "", label: "Selecione um cliente" },
      ...((clientsQuery.data ?? []).map((client) => ({ value: client.id, label: client.name })) ?? []),
    ],
    [clientsQuery.data],
  );

  const siteOptions = useMemo(
    () => [
      {
        value: "",
        label: clientId ? "Selecione um site" : "Escolha um cliente primeiro",
      },
      ...((sitesQuery.data ?? []).map((site) => ({ value: site.id, label: site.name })) ?? []),
    ],
    [clientId, sitesQuery.data],
  );

  const saveFull = async () => {
    if (!siteId) {
      return;
    }

    const payload: Record<string, ConfigurationValue | null> = {};
    for (const field of siteEditableFields) {
      const value = String(getValues(`values.${field.key}` as never) ?? "");
      if (inherits[field.key]) {
        payload[field.key] = null;
      } else {
        const fieldMeta = getFieldMetadata(siteMetadataQuery.data?.fields, field.key);
        if (!canEditFieldAtScope(fieldMeta, "site")) {
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
      await putMutation.mutateAsync({ siteId, payload });
      toast.success("Configuração do site salva com PUT");
    } catch (error) {
      toast.error(readEntityError(error));
    }
  };

  const savePartial = async (fieldKey: string) => {
    if (!siteId) {
      return;
    }

    const field = siteEditableFields.find((item) => item.key === fieldKey);
    if (!field) {
      return;
    }

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
      toast.success(`Campo ${field.key} atualizado com PATCH`);
    } catch (error) {
      toast.error(readEntityError(error));
    }
  };

  const resetProperty = async (propertyName: string) => {
    if (!siteId) {
      return;
    }

    try {
      await resetPropertyMutation.mutateAsync({ siteId, propertyName });
      toast.success(`Propriedade ${propertyName} resetada`);
    } catch (error) {
      toast.error(readResetError(error));
    }
  };

  const removeLocalConfig = async () => {
    if (!siteId) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(siteId);
      toast.success("Configuração local removida. Herança total restaurada.");
    } catch (error) {
      toast.error(readEntityError(error));
    }
  };

  const featureFields = siteEditableFields.filter((field) => field.group === "features");
  const policyFields = siteEditableFields.filter((field) => field.group === "policy");
  const agentFields = siteEditableFields.filter((field) => field.group === "agent");
  const advancedFields = siteEditableFields.filter((field) => field.group === "advanced");
  const siteProfileFields = siteEditableFields.filter((field) => field.group === "siteProfile");

  const renderFieldEditor = (
    fieldKey: string,
    fieldLabel: string,
    fieldKind: "boolean" | "number" | "string" | "json" | "policy",
  ) => {
    const value = String(watch(`values.${fieldKey}` as never) ?? "");
    const inherited = !!inherits[fieldKey];
    const fieldMeta = getFieldMetadata(siteMetadataQuery.data?.fields, fieldKey);
    const canEditField = canEditFieldAtScope(fieldMeta, "site");
    const fieldDef = siteEditableFields.find((f) => f.key === fieldKey);

    return (
      <ConfigurationFieldEditor
        key={fieldKey}
        fieldKey={fieldKey}
        fieldLabel={fieldLabel}
        fieldKind={fieldKind}
        value={value}
        inherited={inherited}
        effectiveValue={getEffectiveValue(effectiveSiteQuery.data, fieldKey)}
        origin={resolveSiteOrigin(localSiteQuery.data, localClientQuery.data, fieldKey)}
        locked={!canEditField}
        lockOwner={
          getLockOwnerForScope(fieldMeta, "site") ??
          getLockOwnerForScope(
            getFieldMetadata(clientMetadataQuery.data?.fields, fieldKey),
            "site",
          )
        }
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
        title="Configuração de Site"
        subtitle="Configurações aplicáveis ao site e aos agentes deste site."
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
        title="Escopo de Site"
        subtitle="Selecione cliente e site para editar apenas configurações válidas neste escopo."
        icon={<MapPin className="h-4 w-4" />}
        iconClassName="bg-cyan-500/20 text-cyan-400"
      >

        {clientsQuery.isLoading && <Loading message="Carregando clientes..." />}
        {clientsQuery.isError && (
          <ErrorDisplay message={readEntityError(clientsQuery.error)} onRetry={clientsQuery.refetch} />
        )}

        {!clientsQuery.isLoading && !clientsQuery.isError && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label="Cliente"
                options={clientOptions}
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setSiteId("");
                }}
              />
              <Select
                label="Site"
                options={siteOptions}
                value={siteId}
                disabled={!clientId || sitesQuery.isLoading}
                onChange={(event) => setSiteId(event.target.value)}
              />
            </div>

            {clientId && sitesQuery.isLoading && <Loading message="Carregando sites..." />}
            {clientId && sitesQuery.isError && (
              <ErrorDisplay message={readEntityError(sitesQuery.error)} onRetry={sitesQuery.refetch} />
            )}
          </div>
        )}
      </ConfigurationSectionCard>

      {siteId && (localSiteQuery.isLoading || effectiveSiteQuery.isLoading || localClientQuery.isLoading || clientMetadataQuery.isLoading || siteMetadataQuery.isLoading) && (
        <Loading message="Carregando configuração do site..." />
      )}

      {siteId && (localSiteQuery.isError || effectiveSiteQuery.isError || localClientQuery.isError || clientMetadataQuery.isError || siteMetadataQuery.isError) && (
        <ErrorDisplay
          message={readEntityError(
            localSiteQuery.error ?? effectiveSiteQuery.error ?? localClientQuery.error ?? clientMetadataQuery.error ?? siteMetadataQuery.error,
          )}
          onRetry={() => {
            localSiteQuery.refetch();
            effectiveSiteQuery.refetch();
            localClientQuery.refetch();
            clientMetadataQuery.refetch();
            siteMetadataQuery.refetch();
          }}
        />
      )}

      {siteId && !localSiteQuery.isLoading && !effectiveSiteQuery.isLoading && !localClientQuery.isLoading && !clientMetadataQuery.isLoading && !siteMetadataQuery.isLoading && !localSiteQuery.isError && !effectiveSiteQuery.isError && !localClientQuery.isError && !clientMetadataQuery.isError && !siteMetadataQuery.isError && (
        <>
          {featureFields.length > 0 && (
            <ConfigurationSectionCard
              title="Funcionalidades do Sistema"
              subtitle="Ative ou desative módulos que impactam os agentes desse site."
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
              subtitle="Define quais aplicativos são permitidos para os agentes do site."
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
              subtitle="Frequência de heartbeat, detecção de offline e coleta de inventário no escopo do site."
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

          {siteProfileFields.length > 0 && (
            <ConfigurationSectionCard
              title="Perfil do Site"
              subtitle="Dados cadastrais e de contato específicos desta unidade."
              icon={<UserSquare2 className="h-4 w-4" />}
              iconClassName="bg-amber-500/20 text-amber-400"
            >
              <div className="grid gap-4 xl:grid-cols-2">
                {siteProfileFields.map((field) =>
                  renderFieldEditor(field.key, field.label, field.kind),
                )}
              </div>
            </ConfigurationSectionCard>
          )}

          {advancedFields.length > 0 && (
            <ConfigurationSectionCard
              title="Configurações Avançadas"
              subtitle="Campos estruturados de integração e atualização automática."
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

function readEntityError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "404: site ou cliente não encontrado";
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
