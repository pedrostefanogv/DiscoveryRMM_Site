import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { ApiError } from "@/api";
import type { ConfigurationValue } from "@/api";
import { ConfigurationFieldEditor } from "@/components/configuration";
import { Button, Card, CardHeader, ErrorDisplay, Loading, Select } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import {
  useClientConfig,
  useClientEffectiveConfig,
  useDeleteClientConfig,
  usePatchClientConfig,
  useResetClientProperty,
  useUpsertClientConfig,
} from "@/hooks/useConfigurationApi";
import {
  buildInheritedState,
  clientEditableFields,
  formatFieldValue,
  getEffectiveValue,
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
      setValue(`values.${field.key}` as never, formatFieldValue(value) as never);
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
        const validation = validateFieldValue(field.kind, value);
        if (validation !== true) {
          toast.error(`${field.key}: ${validation}`);
          return;
        }

        payload[field.key] = parseFieldValue(field.kind, value);
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Configuração de Cliente"
          subtitle="Null significa herdar do servidor"
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
          <ErrorDisplay message={readEntityError(clientsQuery.error, "client")} onRetry={clientsQuery.refetch} />
        )}

        {!clientsQuery.isLoading && !clientsQuery.isError && (
          <div className="space-y-4">
            <Select label="Cliente" options={clientOptions} value={clientId} onChange={(event) => setClientId(event.target.value)} />

            {!clientId && <p className="text-sm text-slate-400">Selecione um cliente para editar a configuração.</p>}

            {clientId && (localQuery.isLoading || effectiveQuery.isLoading) && (
              <Loading message="Carregando configuração do cliente..." />
            )}

            {clientId && (localQuery.isError || effectiveQuery.isError) && (
              <ErrorDisplay
                message={readEntityError(localQuery.error ?? effectiveQuery.error, "client")}
                onRetry={() => {
                  localQuery.refetch();
                  effectiveQuery.refetch();
                }}
              />
            )}

            {clientId && !localQuery.isLoading && !effectiveQuery.isLoading && !localQuery.isError && !effectiveQuery.isError && (
              <div className="space-y-4">
                {clientEditableFields.map((field) => {
                  const value = String(watch(`values.${field.key}` as never) ?? "");
                  const inherited = !!inherits[field.key];

                  return (
                    <ConfigurationFieldEditor
                      key={field.key}
                      fieldKey={field.key}
                      fieldLabel={field.label}
                      value={value}
                      inherited={inherited}
                      effectiveValue={getEffectiveValue(effectiveQuery.data, field.key)}
                      origin={resolveClientOrigin(localQuery.data, field.key)}
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
