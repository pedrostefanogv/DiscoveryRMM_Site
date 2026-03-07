import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  Activity,
  AlertTriangle,
  Bot,
  Clock,
  HardDrive,
  Key,
  Layers,
  Lock,
  Paintbrush,
  RotateCcw,
  Save,
  ShieldCheck,
  Store,
  Wifi,
  Zap,
} from "lucide-react";
import { ConfigurationFieldEditor } from "@/components/configuration";
import { Button, Card, CardHeader, ErrorDisplay, Loading, Modal } from "@/components/ui";
import {
  usePatchServerConfig,
  useResetServerConfig,
  useServerConfig,
  useUpdateServerConfig,
} from "../../hooks/useConfigurationApi";
import {
  buildServerDraft,
  parseFieldValue,
  serverEditableFields,
  validateFieldValue,
} from "@/utils/configurationEditors";
import { ApiError } from "@/api";
import type { ConfigurationValue } from "@/api";
import type { EditableField } from "@/utils/configurationEditors";

interface FormValues {
  values: Record<string, string>;
}

const featureIcons: Record<string, React.ReactNode> = {
  recoveryEnabled: <HardDrive className="h-4 w-4" />,
  discoveryEnabled: <Wifi className="h-4 w-4" />,
  p2PFilesEnabled: <Layers className="h-4 w-4" />,
  supportEnabled: <Activity className="h-4 w-4" />,
  knowledgeBaseEnabled: <ShieldCheck className="h-4 w-4" />,
};

export default function ServerConfigurationPage() {
  const serverQuery = useServerConfig();
  const patchMutation = usePatchServerConfig();
  const putMutation = useUpdateServerConfig();
  const resetMutation = useResetServerConfig();
  const [confirmReset, setConfirmReset] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

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

  // Assina todos os valores do formulário de uma vez — garante re-render
  // para qualquer campo, inclusive os booleanos dos toggle cards.
  const formValues = watch();

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
      let value = String(getValues(`values.${field.key}` as never) ?? "");
      // normalise: empty string for boolean means "false" (field not set on server)
      if (field.kind === "boolean" && value === "") value = "false";
      const validation = validateFieldValue(field.kind, value, field.key);
      if (validation !== true) {
        toast.error(`${field.label}: ${validation}`);
        return;
      }
      payload[field.key] = parseFieldValue(field.kind, value, field.key);
    }

    try {
      await putMutation.mutateAsync(payload);
      toast.success("Configuração do servidor salva com sucesso.");
    } catch (error) {
      toast.error(readApiError(error));
    }
  });

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
      toast.success(`"${field.label}" atualizado.`);
    } catch (error) {
      toast.error(readApiError(error));
    }
  };

  const resetServer = async () => {
    setConfirmReset(false);
    try {
      await resetMutation.mutateAsync();
      toast.success("Configuração do servidor restaurada para os padrões.");
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

  const featureFields = serverEditableFields.filter((f) => f.group === "features");
  const policyFields = serverEditableFields.filter((f) => f.group === "policy");
  const agentFields = serverEditableFields.filter((f) => f.group === "agent");
  const tokenFields = serverEditableFields.filter((f) => f.group === "tokens");
  const advancedFields = serverEditableFields.filter((f) => f.group === "advanced");

  const renderFieldEditor = (field: EditableField) => {
    const value = formValues.values?.[field.key] ?? "";
    const error = errors.values?.[field.key]?.message;

    return (
      <ConfigurationFieldEditor
        key={field.key}
        fieldLabel={field.label}
        fieldKey={field.key}
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

  const renderBooleanToggleCard = (field: EditableField) => {
    const rawValue = formValues.values?.[field.key];
    const isEnabled = String(rawValue ?? "false") === "true";
    const isToggling = togglingKey === field.key;

    const toggle = async () => {
      if (isToggling) return;
      const next = isEnabled ? "false" : "true";
      setValue(`values.${field.key}` as never, next as never, {
        shouldDirty: true,
        shouldTouch: true,
      });
      setTogglingKey(field.key);
      try {
        await patchMutation.mutateAsync({
          [field.key]: parseFieldValue("boolean", next, field.key),
        });
        toast.success(`"${field.label}" ${next === "true" ? "ativado" : "desativado"}.`);
      } catch (error) {
        toast.error(readApiError(error));
        // revert on error
        setValue(`values.${field.key}` as never, String(isEnabled) as never);
      } finally {
        setTogglingKey(null);
      }
    };

    return (
      <button
        key={field.key}
        type="button"
        onClick={toggle}
        disabled={isToggling}
        className={`group relative flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all ${
          isEnabled
            ? "border-sky-500/30 bg-sky-500/10 hover:border-sky-500/50"
            : "border-white/5 bg-white/[0.03] hover:border-white/10"
        }`}
      >
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            isEnabled ? "bg-sky-500/20 text-sky-400" : "bg-white/5 text-slate-500"
          }`}
        >
          {featureIcons[field.key] ?? <Zap className="h-4 w-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${isEnabled ? "text-white" : "text-slate-400"}`}>
            {field.label}
          </p>
          {field.description && (
            <p className="mt-0.5 text-xs text-slate-500">{field.description}</p>
          )}
        </div>

        {/* Toggle pill / spinner */}
        {isToggling ? (
          <div className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-sky-500/30 border-t-sky-400" />
        ) : (
          <div
            className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
              isEnabled ? "bg-sky-500" : "bg-white/10"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                isEnabled ? "translate-x-4" : "translate-x-0.5"
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
            <h2 className="text-xl font-semibold text-white">Configuração Global do Servidor</h2>
            <p className="mt-1 text-sm text-slate-400">
              Valores base aplicados a todos os clientes e sites via herança.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={saveFull}
              loading={putMutation.isPending}
            >
              <Save className="h-3.5 w-3.5" />
              Salvar tudo
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar padrões
            </Button>
          </div>
        </div>

        {/* Funcionalidades */}
        <Card>
          <CardHeader
            title="Funcionalidades do Sistema"
            subtitle="Ative ou desative módulos globalmente. Clique no card para alternar."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {featureFields.map((field) => renderBooleanToggleCard(field))}
          </div>
        </Card>

        {/* Política de loja */}
        <Card>
          <CardHeader
            title="Política da Loja de Aplicativos"
            subtitle="Define quais aplicativos podem ser instalados pelos agentes."
          />
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400">
              <Store className="h-4 w-4" />
            </div>
            <div className="flex-1">
              {policyFields.map((field) => renderFieldEditor(field))}
            </div>
          </div>
        </Card>

        {/* Agente */}
        <Card>
          <CardHeader
            title="Intervalos e Comportamento do Agente"
            subtitle="Frequência de heartbeat, detecção de offline e coleta de inventário."
          />
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <Clock className="h-4 w-4" />
            </div>
            <div className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {agentFields.map((field) => (
                <div key={field.key}>
                  {renderFieldEditor(field)}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Tokens */}
        <Card>
          <CardHeader
            title="Tokens de Deploy"
            subtitle="Controle a validade e o limite de tokens emitidos por agente."
          />
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              <Key className="h-4 w-4" />
            </div>
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              {tokenFields.map((field) => (
                <div key={field.key}>
                  {renderFieldEditor(field)}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Configurações avançadas (JSON) */}
        <Card>
          <CardHeader
            title="Configurações Avançadas"
            subtitle="Estruturas JSON para auto-update, branding, IA e bloqueio de campos."
          />
          <div className="space-y-6">
            {advancedFields.map((field) => {
              const icons: Record<string, React.ReactNode> = {
                autoUpdateSettingsJson: <Zap className="h-4 w-4" />,
                brandingSettingsJson: <Paintbrush className="h-4 w-4" />,
                aiIntegrationSettingsJson: <Bot className="h-4 w-4" />,
                lockedFieldsJson: <Lock className="h-4 w-4" />,
              };
              const colors: Record<string, string> = {
                autoUpdateSettingsJson: "bg-blue-500/20 text-blue-400",
                brandingSettingsJson: "bg-pink-500/20 text-pink-400",
                aiIntegrationSettingsJson: "bg-purple-500/20 text-purple-400",
                lockedFieldsJson: "bg-red-500/20 text-red-400",
              };
              return (
                <div key={field.key} className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors[field.key] ?? "bg-white/5 text-slate-400"}`}>
                    {icons[field.key] ?? <Layers className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    {field.description && (
                      <p className="text-xs text-slate-500">{field.description}</p>
                    )}
                    {renderFieldEditor(field)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Modal de confirmação de reset */}
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Restaurar configurações padrão?"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <p className="text-sm text-red-300">
              Esta ação irá apagar todas as configurações personalizadas do servidor e restaurar
              os valores padrão do sistema. A operação não pode ser desfeita.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={resetServer}
              loading={resetMutation.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Confirmar reset
            </Button>
          </div>
        </div>
      </Modal>
    </>
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
