import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { ApiError } from "@/api";
import type { ConfigurationValue } from "@/api";
import { ConfigurationFieldEditor } from "@/components/configuration";
import { Button, Card, CardHeader, ErrorDisplay, Loading, Select } from "@/components/ui";
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
      setValue(`values.${field.key}` as never, formatFieldValue(value) as never);
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

  const primaryFields = siteEditableFields.filter((field) => field.kind !== "json");
  const jsonFields = siteEditableFields.filter((field) => field.kind === "json");

  const renderFieldEditor = (
    fieldKey: string,
    fieldLabel: string,
    fieldKind: "boolean" | "number" | "string" | "json" | "policy",
  ) => {
    const value = String(watch(`values.${fieldKey}` as never) ?? "");
    const inherited = !!inherits[fieldKey];
    const fieldMeta = getFieldMetadata(siteMetadataQuery.data?.fields, fieldKey);
    const canEditField = canEditFieldAtScope(fieldMeta, "site");

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
      <Card>
        <CardHeader
          title="Configuração de Site"
          subtitle="Null significa herdar do cliente e servidor"
          action={
            <div className="flex gap-2">
              <Button size="sm" onClick={saveFull} loading={putMutation.isPending}>
                Salvar completo (PUT)
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={removeLocalConfig}
                loading={deleteMutation.isPending}
              >
                Remover config local (DELETE)
              </Button>
            </div>
          }
        />

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
              <div className="space-y-6">
                <section className="space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100">Campos principais</h4>
                    <p className="text-xs text-slate-400">Configuracoes operacionais herdadas de cliente e servidor.</p>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {primaryFields.map((field) =>
                      renderFieldEditor(field.key, field.label, field.kind),
                    )}
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100">Campos JSON</h4>
                    <p className="text-xs text-slate-400">Payloads estruturados para update e IA no escopo do site.</p>
                  </div>
                  <div className="space-y-4">
                    {jsonFields.map((field) =>
                      renderFieldEditor(field.key, field.label, field.kind),
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function readEntityError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "404: site ou cliente nao encontrado";
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
