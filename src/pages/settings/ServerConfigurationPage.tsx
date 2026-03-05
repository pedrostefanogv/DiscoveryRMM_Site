import { useEffect } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { ConfigurationFieldEditor } from "@/components/configuration";
import { Button, Card, CardHeader, ErrorDisplay, Loading } from "@/components/ui";
import {
  usePatchServerConfig,
  useResetServerConfig,
  useServerConfig,
  useUpdateServerConfig,
} from "@/hooks/useConfigurationApi";
import {
  buildServerDraft,
  parseFieldValue,
  serverEditableFields,
  validateFieldValue,
} from "@/utils/configurationEditors";
import { ApiError } from "@/api";
import type { ConfigurationValue } from "@/api";

interface FormValues {
  values: Record<string, string>;
}

export default function ServerConfigurationPage() {
  const serverQuery = useServerConfig();
  const patchMutation = usePatchServerConfig();
  const putMutation = useUpdateServerConfig();
  const resetMutation = useResetServerConfig();

  const {
    setValue,
    getValues,
    watch,
    formState: { errors },
    trigger,
    handleSubmit,
  } = useForm<FormValues>({
    defaultValues: { values: {} },
    mode: "onBlur",
  });

  useEffect(() => {
    if (!serverQuery.data) {
      return;
    }

    const draft = buildServerDraft(serverQuery.data, serverEditableFields);
    for (const field of serverEditableFields) {
      setValue(`values.${field.key}` as never, draft[field.key] as never);
    }
  }, [serverQuery.data, setValue]);

  const saveFull = handleSubmit(async () => {
    const payload: Record<string, ConfigurationValue> = {};

    for (const field of serverEditableFields) {
      const value = getValues(`values.${field.key}` as never) ?? "";
      payload[field.key] = parseFieldValue(field.kind, String(value));
    }

    try {
      await putMutation.mutateAsync(payload);
      toast.success("Configuração do servidor salva com PUT");
    } catch (error) {
      toast.error(readApiError(error));
    }
  });

  const savePartial = async (fieldKey: string) => {
    const field = serverEditableFields.find((item) => item.key === fieldKey);
    if (!field) {
      return;
    }

    const isValid = await trigger(`values.${field.key}` as never);
    if (!isValid) {
      return;
    }

    const value = getValues(`values.${field.key}` as never) ?? "";

    try {
      await patchMutation.mutateAsync({
        [field.key]: parseFieldValue(field.kind, String(value)),
      });
      toast.success(`Campo ${field.key} atualizado com PATCH`);
    } catch (error) {
      toast.error(readApiError(error));
    }
  };

  const resetServer = async () => {
    try {
      await resetMutation.mutateAsync();
      toast.success("Configuração do servidor resetada");
    } catch (error) {
      toast.error(readApiError(error));
    }
  };

  if (serverQuery.isLoading) {
    return <Loading message="Carregando configuração do servidor..." />;
  }

  if (serverQuery.isError) {
    return <ErrorDisplay message={readApiError(serverQuery.error)} onRetry={serverQuery.refetch} />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Configuração de Servidor"
          subtitle="Valores base aplicados globalmente para herança"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={saveFull} loading={putMutation.isPending}>
                Salvar completo (PUT)
              </Button>
              <Button size="sm" variant="danger" onClick={resetServer} loading={resetMutation.isPending}>
                Reset completo
              </Button>
            </div>
          }
        />

        <div className="space-y-4">
          {serverEditableFields.map((field) => {
            const value = watch(`values.${field.key}` as never) ?? "";
            const error = errors.values?.[field.key]?.message;

            return (
              <ConfigurationFieldEditor
                key={field.key}
                fieldLabel={field.label}
                fieldKey={field.key}
                value={String(value)}
                error={typeof error === "string" ? error : undefined}
                inherited={false}
                effectiveValue={serverQuery.data?.[field.key]}
                origin="Server"
                disableInheritance
                onValueChange={(next) => {
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
                  const result = validateFieldValue(field.kind, String(value));
                  if (result !== true) {
                    toast.error(result);
                    return;
                  }
                  await savePartial(field.key);
                }}
                saving={patchMutation.isPending}
              />
            );
          })}
        </div>
      </Card>
    </div>
  );
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
