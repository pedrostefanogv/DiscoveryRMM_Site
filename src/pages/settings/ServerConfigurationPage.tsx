import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Cloud,
  FileStack,
  HardDrive,
  KeyRound,
  Layers,
  Lock,
  RotateCcw,
  Save,
  ShieldCheck,
  Store,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";
import { ConfigurationFieldEditor } from "@/components/configuration";
import { Button, Card, CardHeader, ErrorDisplay, Loading, Modal } from "@/components/ui";
import {
  usePatchServerConfig,
  useResetServerConfig,
  useServerConfig,
  useGenerateNatsAccountKey,
  useTestNatsServer,
  useTestObjectStorage,
  useTicketAttachmentSettings,
  useUpdateServerConfig,
  useUpdateTicketAttachmentSettings,
} from "../../hooks/useConfigurationApi";
import {
  buildServerDraft,
  parseFieldValue,
  serverEditableFields,
  validateFieldValue,
} from "@/utils/configurationEditors";
import { ApiError } from "@/api";
import type { ConfigurationValue, TicketAttachmentSettings } from "@/api";
import type { EditableField } from "@/utils/configurationEditors";

interface FormValues {
  values: Record<string, string>;
}

const featureIcons: Record<string, React.ReactNode> = {
  recoveryEnabled: <HardDrive className="h-4 w-4" />,
  discoveryEnabled: <Wifi className="h-4 w-4" />,
  p2PFilesEnabled: <Layers className="h-4 w-4" />,
  cloudBootstrapEnabled: <Cloud className="h-4 w-4" />,
  chatAIEnabled: <Bot className="h-4 w-4" />,
  supportEnabled: <Activity className="h-4 w-4" />,
  knowledgeBaseEnabled: <ShieldCheck className="h-4 w-4" />,
};

export default function ServerConfigurationPage() {
  const serverQuery = useServerConfig();
  const patchMutation = usePatchServerConfig();
  const putMutation = useUpdateServerConfig();
  const resetMutation = useResetServerConfig();
  const generateNatsAccountKeyMutation = useGenerateNatsAccountKey();
  const testNatsMutation = useTestNatsServer();
  const testStorageMutation = useTestObjectStorage();

  const [confirmReset, setConfirmReset] = useState(false);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [savingNats, setSavingNats] = useState(false);
  const [natsKeys, setNatsKeys] = useState<{
    accountSeed: string;
    accountPublicKey: string;
    xKeySeed?: string;
    xKeyPublicKey?: string;
  } | null>(null);
  const [savingStorage, setSavingStorage] = useState(false);
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
    handleSubmit,
  } = useForm<FormValues>({
    defaultValues: { values: {} },
    mode: "onBlur",
  });

  const formValues = watch();

  useEffect(() => {
    if (!serverQuery.data) return;
    const draft = buildServerDraft(serverQuery.data, serverEditableFields);
    for (const field of serverEditableFields) {
      setValue(`values.${field.key}` as never, draft[field.key] as never);
    }
  }, [serverQuery.data, setValue]);

  const saveFull = handleSubmit(async () => {
    const payload: Record<string, ConfigurationValue> = {};
    for (const field of serverEditableFields) {
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
      await patchMutation.mutateAsync(payload);
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

  const generateNatsAccountKey = async () => {
    try {
      const result = await generateNatsAccountKeyMutation.mutateAsync();
      setNatsKeys({
        accountSeed: result?.accountSeed ?? "",
        accountPublicKey: result?.accountPublicKey ?? "",
        xKeySeed: result?.xKeySeed,
        xKeyPublicKey: result?.xKeyPublicKey,
      });
      toast.success("Account key NATS gerada com sucesso.");
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
  const natsFields = serverEditableFields.filter((f) => f.group === "nats");
  const advancedFields = serverEditableFields.filter(
    (f) => f.group === "advanced" && f.key !== "brandingSettingsJson",
  );
  const storageTextFields = serverEditableFields.filter(
    (f) => f.group === "storage" && (f.kind === "string" || f.kind === "number"),
  );
  const storageToggleFields = serverEditableFields.filter(
    (f) => f.group === "storage" && f.kind === "boolean",
  );

  const renderStorageFieldEditor = (field: EditableField) => {
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
        hideSaveButton
        onValueChange={(next) => {
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

  const renderNatsFieldEditor = (field: EditableField) => {
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
        hideSaveButton
        onValueChange={(next) => {
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
                <div key={field.key}>{renderFieldEditor(field)}</div>
              ))}
            </div>
          </div>
        </Card>

        {/* Object Storage */}
        <Card>
          <CardHeader
            title="Armazenamento de Objetos (S3 / MinIO)"
            subtitle="Configuração do backend S3-compatível usado para arquivos de tickets e outros uploads."
          />
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {storageTextFields.map((field) => renderStorageFieldEditor(field))}
            </div>

            {storageToggleFields.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {storageToggleFields.map((field) => renderBooleanToggleCard(field))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/5 pt-4">
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
                  testResult.success
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                    : "border-red-500/20 bg-red-500/10 text-red-300"
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
        </Card>

        {/* NATS */}
        <Card>
          <CardHeader
            title="Servidor NATS"
            subtitle="Configuração exclusiva do servidor. Informe apenas host/IP; porta 4222 é fixa."
          />
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {natsFields.map((field) => renderNatsFieldEditor(field))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/5 pt-4">
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
                  natsTestResult.ok
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                    : "border-red-500/20 bg-red-500/10 text-red-300"
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

            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Account Key + xKey</p>
                  <p className="mt-1 text-xs text-slate-400">
                    O account seed e privado (salvar na API). A public key vai no nats-server.conf.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={generateNatsAccountKey}
                  loading={generateNatsAccountKeyMutation.isPending}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Gerar Account Key
                </Button>
              </div>

              {natsKeys ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-300">Account Seed (privado)</label>
                      <textarea
                        readOnly
                        value={natsKeys.accountSeed}
                        className="min-h-[96px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-300">Account Public Key</label>
                      <textarea
                        readOnly
                        value={natsKeys.accountPublicKey}
                        className="min-h-[96px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 outline-none"
                      />
                    </div>
                  </div>
                  {(natsKeys.xKeySeed || natsKeys.xKeyPublicKey) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-300">xKey Seed (opcional)</label>
                        <textarea
                          readOnly
                          value={natsKeys.xKeySeed ?? ""}
                          className="min-h-[96px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-300">xKey Public Key (opcional)</label>
                        <textarea
                          readOnly
                          value={natsKeys.xKeyPublicKey ?? ""}
                          className="min-h-[96px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  Clique em “Gerar Account Key” para obter o account seed/public key e, se habilitado, a xKey.
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Anexos de Tickets */}
        <TicketAttachmentSettingsCard />

        {/* Configurações avançadas (JSON) */}
        <Card>
          <CardHeader
            title="Configurações Avançadas"
            subtitle="Auto-update, IA estruturada e bloqueio de campos. Branding fica em /settings/branding."
          />
          <div className="space-y-6">
            {advancedFields.map((field) => {
              const icons: Record<string, React.ReactNode> = {
                autoUpdateSettingsJson: <Zap className="h-4 w-4" />,
                aiIntegrationSettingsJson: <Bot className="h-4 w-4" />,
                lockedFieldsJson: <Lock className="h-4 w-4" />,
              };
              const colors: Record<string, string> = {
                autoUpdateSettingsJson: "bg-blue-500/20 text-blue-400",
                aiIntegrationSettingsJson: "bg-purple-500/20 text-purple-400",
                lockedFieldsJson: "bg-red-500/20 text-red-400",
              };
              return (
                <div key={field.key} className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      colors[field.key] ?? "bg-white/5 text-slate-400"
                    }`}
                  >
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

function TicketAttachmentSettingsCard() {
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
        <div className="py-2 text-sm text-slate-400">Carregando configurações de anexos…</div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Anexos de Tickets"
        subtitle="Controla o upload de arquivos via URL pré-assinada (S3). Requer Object Storage configurado."
      />
      <div className="space-y-5">
        {/* Enable toggle */}
        <button
          type="button"
          onClick={() => set("enabled", !form.enabled)}
          className={`group relative flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all ${
            form.enabled
              ? "border-sky-500/30 bg-sky-500/10 hover:border-sky-500/50"
              : "border-white/5 bg-white/[0.03] hover:border-white/10"
          }`}
        >
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
              form.enabled ? "bg-sky-500/20 text-sky-400" : "bg-white/5 text-slate-500"
            }`}
          >
            <FileStack className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium ${form.enabled ? "text-white" : "text-slate-400"}`}>
              Upload de Anexos Habilitado
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Permite que usuários anexem arquivos aos tickets via upload direto ao storage.
            </p>
          </div>
          <div
            className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
              form.enabled ? "bg-sky-500" : "bg-white/10"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                form.enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
        </button>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="max-file-size-mb" className="block text-sm font-medium text-slate-300">
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
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
            <p className="text-xs text-slate-500">
              Valor salvo: {form.maxFileSizeBytes.toLocaleString("pt-BR")} bytes (máx. 1024 MB)
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="presigned-ttl-minutes" className="block text-sm font-medium text-slate-300">
              TTL da URL pré-assinada (minutos)
            </label>
            <input
              id="presigned-ttl-minutes"
              type="number"
              min={1}
              max={120}
              value={form.presignedUploadUrlTtlMinutes}
              onChange={(e) => set("presignedUploadUrlTtlMinutes", Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
            <p className="text-xs text-slate-500">Entre 1 e 120 minutos.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="custom-mime-type" className="block text-sm font-medium text-slate-300">
              Tipos de conteúdo permitidos
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
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
                      ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"
                      : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-slate-300"
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
                    className="flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300"
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
            <p className="text-xs text-slate-500">
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
              className={`flex-1 rounded-lg border bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-500 focus:ring-1 ${
                customTypeError
                  ? "border-danger/50 focus:border-danger/70 focus:ring-danger/20"
                  : "border-white/10 focus:border-primary/50 focus:ring-primary/30"
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
      </div>
    </Card>
  );
}
