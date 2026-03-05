import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { ApiError } from "@/api";
import type { ConfigurationValue } from "@/api";
import { ConfigurationFieldEditor } from "@/components/configuration";
import { Button, Card, CardHeader, ErrorDisplay, Loading, Select } from "@/components/ui";
import {
  useClientConfig,
  useDeleteSiteConfig,
  usePatchSiteConfig,
  useResetSiteProperty,
  useSiteConfig,
  useSiteEffectiveConfig,
  useUpsertSiteConfig,
} from "@/hooks/useConfigurationApi";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import {
  buildInheritedState,
  formatFieldValue,
  getEffectiveValue,
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

  const putMutation = useUpsertSiteConfig();
  const patchMutation = usePatchSiteConfig();
  const deleteMutation = useDeleteSiteConfig();
  const resetPropertyMutation = useResetSiteProperty();

  useEffect(() => {
    if (!localSiteQuery.data) {
      return;
    }

    for (const field of siteEditableFields) {
      const value = localSiteQuery.data[field.key] ?? getEffectiveValue(effectiveSiteQuery.data, field.key);
      setValue(`values.${field.key}` as never, formatFieldValue(value) as never);
    }

    setInherits(buildInheritedState(localSiteQuery.data, siteEditableFields));
  }, [effectiveSiteQuery.data, localSiteQuery.data, setValue]);

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
        const validation = validateFieldValue(field.kind, value);
        if (validation !== true) {
          toast.error(`${field.key}: ${validation}`);
          return;
        }

        payload[field.key] = parseFieldValue(field.kind, value);
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
    const payload = inherits[field.key]
      ? { [field.key]: null }
      : { [field.key]: parseFieldValue(field.kind, value) };

    if (!inherits[field.key]) {
      const validation = validateFieldValue(field.kind, value);
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

            {siteId && (localSiteQuery.isLoading || effectiveSiteQuery.isLoading || localClientQuery.isLoading) && (
              <Loading message="Carregando configuração do site..." />
            )}

            {siteId && (localSiteQuery.isError || effectiveSiteQuery.isError || localClientQuery.isError) && (
              <ErrorDisplay
                message={readEntityError(
                  localSiteQuery.error ?? effectiveSiteQuery.error ?? localClientQuery.error,
                )}
                onRetry={() => {
                  localSiteQuery.refetch();
                  effectiveSiteQuery.refetch();
                  localClientQuery.refetch();
                }}
              />
            )}

            {siteId && !localSiteQuery.isLoading && !effectiveSiteQuery.isLoading && !localClientQuery.isLoading && !localSiteQuery.isError && !effectiveSiteQuery.isError && !localClientQuery.isError && (
              <div className="space-y-4">
                {siteEditableFields.map((field) => {
                  const value = String(watch(`values.${field.key}` as never) ?? "");
                  const inherited = !!inherits[field.key];

                  return (
                    <ConfigurationFieldEditor
                      key={field.key}
                      fieldKey={field.key}
                      fieldLabel={field.label}
                      value={value}
                      inherited={inherited}
                      effectiveValue={getEffectiveValue(effectiveSiteQuery.data, field.key)}
                      origin={resolveSiteOrigin(localSiteQuery.data, localClientQuery.data, field.key)}
                      saving={patchMutation.isPending}
                      resetLoading={resetPropertyMutation.isPending}
                      onValueChange={(next) => {
                        setValue(`values.${field.key}` as never, next as never, {
                          shouldDirty: true,
                        });
                      }}
                      onToggleInherit={(next) => {
                        setInherits((prev) => ({ ...prev, [field.key]: next }));
                        if (next) {
                          setValue(`values.${field.key}` as never, "" as never, {
                            shouldDirty: true,
                          });
                        }
                      }}
                      onSavePatch={() => savePartial(field.key)}
                      onResetProperty={() => resetProperty(field.key)}
                    />
                  );
                })}
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
