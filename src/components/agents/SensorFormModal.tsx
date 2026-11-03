import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Button, Icon, Input, Loading, Modal, Select, TextArea } from "@/components/ui";
import { AppApprovalScopeType } from "@/api/types";
import { describeSensorsError } from "@/api/sensors";
import type {
  SensorChannel,
  SensorChannelUnit,
  SensorComparison,
  SensorDefinition,
  SensorItem,
  SensorSeverity,
  SensorType,
  SensorUpsertRequest,
} from "@/api";
import { useSensorDefinitions } from "@/hooks/useSensors";
import { useAutomationScripts } from "@/hooks/useAutomation";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import {
  SENSOR_COMPARISON_OPTIONS,
  SENSOR_NO_THRESHOLD_TYPES,
  SENSOR_PRIMARY_CHANNEL,
  SENSOR_SEVERITY_OPTIONS,
  SENSOR_THRESHOLD_REQUIRED_TYPES,
  SENSOR_TYPE_LABELS,
  SENSOR_TYPE_OPTIONS,
  SENSOR_UNIT_OPTIONS,
  DEFAULT_SUSTAIN_SAMPLES,
  MAX_SUSTAIN_SAMPLES,
  MIN_SUSTAIN_SAMPLES,
  defaultComparison,
  describeSustainSamples,
  defaultThresholdUnit,
  emptySensorChannelRow,
  sensorChannelRowsFromChannels,
  sensorChannelsFromRows,
  mergeSensorOptionsJson,
  sensorOptionsFromJson,
  sensorScopeLabel,
  validateSensorChannelRows,
  type SensorChannelRow,
} from "./sensorUtils";

/** Intervalo/limites espelhados de SensorDefaults/SensorDefinitionService no backend. */
const MIN_INTERVAL_SECONDS = 30;
const MAX_INTERVAL_SECONDS = 86_400;
const MIN_TIMEOUT_SECONDS = 5;
const MAX_TIMEOUT_SECONDS = 3_600;
const MIN_FAILS_BEFORE_ALERT = 1;
const MAX_FAILS_BEFORE_ALERT = 100;
const MAX_NAME_LENGTH = 200;

/** Dica de alvo por tipo — o backend não valida o formato, o operador precisa da pista. */
const TARGET_HINTS: Partial<Record<SensorType, string>> = {
  DiskSpace: "Volume (ex.: C:). Vazio = todos os volumes.",
  Service: "Nome do serviço do Windows (ex.: Spooler).",
  Process: "Nome do processo (ex.: explorer).",
  Ping: "Host ou IP (ex.: 8.8.8.8).",
  TcpPort: "host:porta (ex.: 10.0.0.1:443).",
  HttpProbe: "URL completa (https://...).",
  HttpThroughput: "URL usada para medir download/upload.",
  DnsLatency: "Nome a resolver (ex.: exemplo.com).",
  Bandwidth: "Adaptador/interface (opcional).",
  EventLogRate: "Log/ canal de eventos (ex.: System).",
  SmartStatus: "Disco físico (ex.: 0 ou C:).",
  CertificateExpiry: "Host:porta ou nome do certificado.",
  DefenderStatus: "Vazio = estado geral do Defender.",
  BitLocker: "Volume (ex.: C:).",
  Script: "Alvo repassado ao script (opcional).",
};

interface FormValues {
  name: string;
  key: string;
  description: string;
  sensorType: SensorType;
  scopeType: AppApprovalScopeType;
  clientId: string;
  siteId: string;
  target: string;
  warningThreshold: string;
  criticalThreshold: string;
  thresholdUnit: SensorChannelUnit;
  comparison: SensorComparison;
  intervalSeconds: string;
  timeoutSeconds: string;
  failsBeforeAlert: string;
  /** Histerese: amostras ruins consecutivas antes de agravar (1 = imediato). */
  sustainSamples: string;
  /** Só sensores de Serviço: reiniciar o serviço quando estiver parado. */
  restartIfStopped: boolean;
  minSeverityToAlert: SensorSeverity;
  severityWhenFailing: SensorSeverity;
  isActive: boolean;
  scriptId: string;
  extractorsJson: string;
  exitCodeMapJson: string;
}

type FormErrors = Partial<
  Record<keyof FormValues | "scope" | "general" | "channels", string>
>;

function emptyValues(
  clientId: string | null,
  siteId: string | null,
): FormValues {
  return {
    name: "",
    key: "",
    description: "",
    sensorType: "DiskSpace",
    scopeType: AppApprovalScopeType.Agent,
    clientId: clientId ?? "",
    siteId: siteId ?? "",
    target: "",
    warningThreshold: "",
    criticalThreshold: "",
    thresholdUnit: "Percent",
    comparison: "LowerIsWorse",
    intervalSeconds: "0",
    timeoutSeconds: "10",
    failsBeforeAlert: "2",
    sustainSamples: String(DEFAULT_SUSTAIN_SAMPLES),
    restartIfStopped: false,
    minSeverityToAlert: "Warning",
    severityWhenFailing: "Critical",
    isActive: true,
    scriptId: "",
    extractorsJson: "",
    exitCodeMapJson: "",
  };
}

function numberToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Fallback quando a definição completa não veio na listagem (catálogo grande ou
 * erro de rede): hidrata com o que a aba já tem, para não abrir um formulário
 * vazio em modo edição. O servidor continua validando tudo.
 */
function valuesFromItem(
  item: SensorItem,
  clientId: string | null,
  siteId: string | null,
): FormValues {
  // sustainSamples/restartIfStopped não têm coluna no contrato: vêm do optionsJson.
  const options = sensorOptionsFromJson(item.optionsJson);
  return {
    name: item.name,
    key: item.key ?? "",
    description: item.description ?? "",
    sensorType: item.sensorType,
    scopeType: item.scopeType,
    clientId: clientId ?? "",
    siteId: siteId ?? "",
    target: item.target ?? "",
    warningThreshold: numberToInput(item.warningThreshold),
    criticalThreshold: numberToInput(item.criticalThreshold),
    thresholdUnit: item.thresholdUnit,
    comparison: item.comparison,
    intervalSeconds: String(item.intervalSeconds),
    timeoutSeconds: String(item.timeoutSeconds),
    failsBeforeAlert: String(item.failsBeforeAlert),
    sustainSamples: String(options.sustainSamples),
    restartIfStopped: options.restartIfStopped,
    minSeverityToAlert: item.minSeverityToAlert,
    severityWhenFailing: "Critical",
    isActive: true,
    scriptId: item.scriptId ?? "",
    extractorsJson: "",
    exitCodeMapJson: "",
  };
}

function valuesFromDefinition(
  definition: SensorDefinition,
  clientId: string | null,
  siteId: string | null,
): FormValues {
  const options = sensorOptionsFromJson(definition.optionsJson);
  return {
    name: definition.name,
    key: definition.key ?? "",
    description: definition.description ?? "",
    sensorType: definition.sensorType,
    scopeType: definition.scopeType,
    clientId: definition.clientId ?? clientId ?? "",
    siteId: definition.siteId ?? siteId ?? "",
    target: definition.target ?? "",
    warningThreshold: numberToInput(definition.warningThreshold),
    criticalThreshold: numberToInput(definition.criticalThreshold),
    thresholdUnit: definition.thresholdUnit,
    comparison: definition.comparison,
    intervalSeconds: String(definition.intervalSeconds),
    timeoutSeconds: String(definition.timeoutSeconds),
    failsBeforeAlert: String(definition.failsBeforeAlert),
    sustainSamples: String(options.sustainSamples),
    restartIfStopped: options.restartIfStopped,
    minSeverityToAlert: definition.minSeverityToAlert,
    severityWhenFailing: definition.severityWhenFailing,
    isActive: definition.isActive,
    scriptId: definition.scriptId ?? "",
    extractorsJson: definition.extractorsJson ?? "",
    exitCodeMapJson: definition.exitCodeMapJson ?? "",
  };
}

/** Limiar opcional: texto vazio = sem limiar (null), não zero. */
function parseThreshold(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Validação que espelha SensorDefinitionService.ValidateAsync (mesmas regras/mensagens). */
function validate(values: FormValues, channelRows: SensorChannelRow[]): FormErrors {
  const errors: FormErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = "Nome do sensor é obrigatório.";
  else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Nome do sensor deve ter no máximo ${MAX_NAME_LENGTH} caracteres.`;
  }

  if (!(values.sensorType in SENSOR_TYPE_LABELS)) {
    errors.sensorType = "Tipo de sensor inválido.";
  }

  if (values.scopeType === AppApprovalScopeType.Client && !values.clientId) {
    errors.scope = "Escopo Cliente exige um cliente.";
  }
  if (values.scopeType === AppApprovalScopeType.Site) {
    if (!values.clientId) errors.scope = "Escopo Site exige um cliente.";
    else if (!values.siteId) errors.scope = "Escopo Site exige um site.";
  }

  const interval = Number(values.intervalSeconds || "0");
  if (!Number.isFinite(interval)) {
    errors.intervalSeconds = "Intervalo inválido.";
  } else if (
    interval !== 0 &&
    (interval < MIN_INTERVAL_SECONDS || interval > MAX_INTERVAL_SECONDS)
  ) {
    errors.intervalSeconds = `Intervalo deve ser 0 (herdar) ou estar entre ${MIN_INTERVAL_SECONDS} e ${MAX_INTERVAL_SECONDS} segundos.`;
  }

  const timeout = Number(values.timeoutSeconds);
  if (!Number.isFinite(timeout) || timeout < MIN_TIMEOUT_SECONDS || timeout > MAX_TIMEOUT_SECONDS) {
    errors.timeoutSeconds = `Timeout deve estar entre ${MIN_TIMEOUT_SECONDS} e ${MAX_TIMEOUT_SECONDS} segundos.`;
  }

  const fails = Number(values.failsBeforeAlert);
  if (
    !Number.isFinite(fails) ||
    fails < MIN_FAILS_BEFORE_ALERT ||
    fails > MAX_FAILS_BEFORE_ALERT
  ) {
    errors.failsBeforeAlert = `Falhas antes de alertar deve estar entre ${MIN_FAILS_BEFORE_ALERT} e ${MAX_FAILS_BEFORE_ALERT}.`;
  }

  // Histerese: 1 = a primeira amostra ruim já agrava. Vazio assume o padrão.
  const sustainRaw = values.sustainSamples.trim();
  if (sustainRaw) {
    const sustain = Number(sustainRaw);
    if (
      !Number.isFinite(sustain) ||
      !Number.isInteger(sustain) ||
      sustain < MIN_SUSTAIN_SAMPLES ||
      sustain > MAX_SUSTAIN_SAMPLES
    ) {
      errors.sustainSamples = `Amostras para agravar deve ser um inteiro entre ${MIN_SUSTAIN_SAMPLES} e ${MAX_SUSTAIN_SAMPLES}.`;
    }
  }

  const warning = parseThreshold(values.warningThreshold);
  const critical = parseThreshold(values.criticalThreshold);
  const hasWarningText = values.warningThreshold.trim().length > 0;
  const hasCriticalText = values.criticalThreshold.trim().length > 0;
  if (hasWarningText && warning === null) errors.warningThreshold = "Limiar inválido.";
  if (hasCriticalText && critical === null) errors.criticalThreshold = "Limiar inválido.";

  if (SENSOR_NO_THRESHOLD_TYPES.has(values.sensorType)) {
    if (warning !== null || critical !== null) {
      errors.warningThreshold = "Sensores de serviço/processo não usam limiares numéricos.";
    }
  } else {
    if (warning === null && critical === null) {
      if (SENSOR_THRESHOLD_REQUIRED_TYPES.has(values.sensorType)) {
        errors.warningThreshold = "Informe o limiar de atenção e/ou crítico.";
      }
    }
    if (values.thresholdUnit === "Percent") {
      if (warning !== null && (warning < 0 || warning > 100)) {
        errors.warningThreshold = "Limiares em percentual devem estar entre 0 e 100.";
      }
      if (critical !== null && (critical < 0 || critical > 100)) {
        errors.criticalThreshold = "Limiares em percentual devem estar entre 0 e 100.";
      }
    }
    if (warning !== null && critical !== null) {
      const invalid =
        values.comparison === "LowerIsWorse" ? warning <= critical : warning >= critical;
      if (invalid) {
        errors.warningThreshold =
          values.comparison === "LowerIsWorse"
            ? "Com “quanto menor, pior” o limiar de atenção deve ser MAIOR que o crítico (ex.: atenção 15%, crítico 10%)."
            : "Com “quanto maior, pior” o limiar de atenção deve ser MENOR que o crítico (ex.: atenção 85%, crítico 95%).";
      }
    }
  }

  if (values.sensorType === "Script") {
    if (!values.scriptId.trim()) {
      errors.scriptId = "Sensor de script exige um script do catálogo.";
    }
    // O backend recusa sensor de script sem canal declarado: o editor estruturado
    // valida chave obrigatória (e chaves repetidas) antes de montar o request.
    const channelsError = validateSensorChannelRows(channelRows);
    if (channelsError) errors.channels = channelsError;
    const extractorsError = validateJsonArray(values.extractorsJson);
    if (extractorsError) errors.extractorsJson = extractorsError;
    const exitMapError = validateJsonArray(values.exitCodeMapJson);
    if (exitMapError) errors.exitCodeMapJson = exitMapError;
  }

  return errors;
}

/** Campo JSON opcional: quando preenchido precisa ser uma lista (array). */
function validateJsonArray(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? null : "Use uma lista JSON (array).";
  } catch {
    return "JSON inválido.";
  }
}

function buildRequest(
  values: FormValues,
  agentId: string,
  channels: SensorChannel[],
  /** optionsJson atual do sensor em edição — preserva chaves de outros recursos. */
  currentOptionsJson: string | null = null,
): SensorUpsertRequest {
  // channels vem do editor estruturado (linhas convertidas): só o sensor de
  // script os usa; os built-in têm canais definidos pelo servidor.
  const isScript = values.sensorType === "Script";
  const sustainText = values.sustainSamples.trim();
  const sustainSamples =
    sustainText === ""
      ? DEFAULT_SUSTAIN_SAMPLES
      : Math.min(Math.max(Number(sustainText), MIN_SUSTAIN_SAMPLES), MAX_SUSTAIN_SAMPLES);
  return {
    name: values.name.trim(),
    // Chave vazia = o backend normaliza a partir do nome na criação.
    key: values.key.trim() || null,
    description: values.description.trim() || null,
    sensorType: values.sensorType,
    scopeType: values.scopeType,
    clientId: values.scopeType === AppApprovalScopeType.Client ? values.clientId || null : null,
    siteId: values.scopeType === AppApprovalScopeType.Site ? values.siteId || null : null,
    agentId: values.scopeType === AppApprovalScopeType.Agent ? agentId : null,
    target: values.target.trim() || null,
    warningThreshold: parseThreshold(values.warningThreshold),
    criticalThreshold: parseThreshold(values.criticalThreshold),
    thresholdUnit: values.thresholdUnit,
    comparison: values.comparison,
    intervalSeconds: Number(values.intervalSeconds || "0"),
    timeoutSeconds: Number(values.timeoutSeconds),
    failsBeforeAlert: Number(values.failsBeforeAlert),
    minSeverityToAlert: values.minSeverityToAlert,
    severityWhenFailing: values.severityWhenFailing,
    isActive: values.isActive,
    scriptId: isScript ? values.scriptId.trim() || null : null,
    extractorsJson: isScript ? values.extractorsJson.trim() || null : null,
    exitCodeMapJson: isScript ? values.exitCodeMapJson.trim() || null : null,
    // Preserva os canais já declarados do sensor de script (não há editor aqui).
    channels: isScript ? channels : null,
    // Merge (não substituição): mantém outras chaves que o optionsJson já tinha.
    optionsJson: mergeSensorOptionsJson(currentOptionsJson, {
      sustainSamples,
      // O reinício só faz sentido para sensor de serviço; nos demais o campo é
      // ignorado pelo agente, mas gravamos explicitamente para não herdar lixo.
      restartIfStopped: values.sensorType === "Service" ? values.restartIfStopped : false,
    }),
  };
}

/** Bloco do formulário com título — o modal é longo e precisa de seções visíveis. */
function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface-light/40 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {children}
    </section>
  );
}

interface SensorFormModalProps {
  open: boolean;
  onClose: () => void;
  agentId: string;
  clientId: string | null;
  siteId: string | null;
  /** Sensor em edição; null = criar. */
  sensor: SensorItem | null;
  isSaving: boolean;
  onSave: (data: SensorUpsertRequest, sensorId?: string) => Promise<void>;
}

/**
 * Formulário de criação/edição de sensor.
 *
 * Em edição a definição completa vem de GET /api/v1/sensors (o item da aba não
 * traz extratores/script/opções): busca-se a lista e filtra-se pelo id, já que o
 * contrato não expõe GET /sensors/{id} no console.
 */
export default function SensorFormModal({
  open,
  onClose,
  agentId,
  clientId,
  siteId,
  sensor,
  isSaving,
  onSave,
}: SensorFormModalProps) {
  const [values, setValues] = useState<FormValues>(() => emptyValues(clientId, siteId));
  // O editor de canais trabalha com LINHAS (key/label/unit/isPrimary) e converte
  // para o contrato da API só no submit — ver sensorChannelsFromRows.
  const [channelRows, setChannelRows] = useState<SensorChannelRow[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const channels = useMemo(() => sensorChannelsFromRows(channelRows), [channelRows]);

  const definitions = useSensorDefinitions(
    { includeInactive: true },
    open && Boolean(sensor),
  );
  const definition = useMemo(
    () => definitions.data?.find((item) => item.id === sensor?.sensorId) ?? null,
    [definitions.data, sensor?.sensorId],
  );

  const clients = useClients(open);
  const sites = useSites(values.clientId || undefined);
  const scripts = useAutomationScripts({ limit: 100, activeOnly: true });

  // Hidrata o formulário na abertura: edição usa a definição completa; criação
  // começa do zero com os defaults do escopo do agente.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (!sensor) {
      setValues(emptyValues(clientId, siteId));
      setChannelRows([]);
      return;
    }
    if (definition) {
      setValues(valuesFromDefinition(definition, clientId, siteId));
      setChannelRows(sensorChannelRowsFromChannels(definition.channels));
      return;
    }
    // Ainda carregando a definição completa: mantém o formulário como está.
    if (definitions.isLoading) return;
    // Sem a definição na listagem, usa o item da aba (evita formulário vazio).
    setValues(valuesFromItem(sensor, clientId, siteId));
    setChannelRows(sensorChannelRowsFromChannels(sensor.channels));
  }, [open, sensor, definition, definitions.isLoading, clientId, siteId]);

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  /** Trocar o tipo reajusta unidade/direção para as do tipo (evita combinação inválida). */
  const handleTypeChange = (sensorType: SensorType) => {
    setValues((current) => ({
      ...current,
      sensorType,
      thresholdUnit: defaultThresholdUnit(sensorType),
      comparison: defaultComparison(sensorType),
      warningThreshold: SENSOR_NO_THRESHOLD_TYPES.has(sensorType) ? "" : current.warningThreshold,
      criticalThreshold: SENSOR_NO_THRESHOLD_TYPES.has(sensorType)
        ? ""
        : current.criticalThreshold,
    }));
  };

  const scopeOptions = [
    { value: String(AppApprovalScopeType.Agent), label: sensorScopeLabel(AppApprovalScopeType.Agent) },
    { value: String(AppApprovalScopeType.Site), label: sensorScopeLabel(AppApprovalScopeType.Site) },
    { value: String(AppApprovalScopeType.Client), label: sensorScopeLabel(AppApprovalScopeType.Client) },
    { value: String(AppApprovalScopeType.Global), label: sensorScopeLabel(AppApprovalScopeType.Global) },
  ];

  const clientOptions = [
    { value: "", label: "Selecione o cliente..." },
    ...(clients.data ?? []).map((item) => ({ value: item.id, label: item.name })),
  ];
  const siteOptions = [
    { value: "", label: "Selecione o site..." },
    ...(sites.data ?? []).map((item) => ({ value: item.id, label: item.name })),
  ];

  const scriptOptions = useMemo(() => {
    const options = [{ value: "", label: "Selecione o script..." }];
    for (const script of scripts.data?.items ?? []) {
      options.push({ value: script.id, label: `${script.name} v${script.version}` });
    }
    // Sensor já vinculado a um script inativo: mantém a opção para não parecer
    // que o vínculo sumiu ao abrir o formulário.
    if (values.scriptId && !options.some((option) => option.value === values.scriptId)) {
      options.push({ value: values.scriptId, label: "Script atual (indisponível na lista)" });
    }
    return options;
  }, [scripts.data, values.scriptId]);

  const isEditing = Boolean(sensor);
  const isScript = values.sensorType === "Script";
  const scopeNeedsClient =
    values.scopeType === AppApprovalScopeType.Client ||
    values.scopeType === AppApprovalScopeType.Site;

  /** Editor de canais do sensor Script: adiciona/remove/edita linhas. */
  const addChannelRow = () => {
    setChannelRows((rows) => [...rows, emptySensorChannelRow()]);
  };
  const removeChannelRow = (index: number) => {
    setChannelRows((rows) => rows.filter((_, position) => position !== index));
  };
  const updateChannelRow = <K extends keyof SensorChannelRow>(
    index: number,
    key: K,
    value: SensorChannelRow[K],
  ) => {
    setChannelRows((rows) =>
      rows.map((row, position) => (position === index ? { ...row, [key]: value } : row)),
    );
  };
  /** Marcar um canal como primário desmarca os demais (o servidor espera no máx. 1). */
  const markPrimaryChannelRow = (index: number) => {
    setChannelRows((rows) =>
      rows.map((row, position) => ({ ...row, isPrimary: position === index })),
    );
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(values, channelRows);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      await onSave(
        buildRequest(values, agentId, channels, sensor?.optionsJson ?? null),
        sensor?.sensorId,
      );
      onClose();
    } catch (error) {
      setErrors({ general: describeSensorsError(error, "Falha ao salvar o sensor.") });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `Editar sensor — ${sensor?.name ?? ""}` : "Novo sensor"}
      maxWidth="max-w-3xl"
    >
      {isEditing && definitions.isLoading ? (
        <Loading message="Carregando definição do sensor..." />
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          {errors.general ? (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
              {errors.general}
            </p>
          ) : null}

          <FormSection title="Identificação">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Nome"
                value={values.name}
                onChange={(event) => setField("name", event.target.value)}
                error={errors.name}
                autoFocus
              />
              <Input
                label="Chave (opcional)"
                value={values.key}
                onChange={(event) => setField("key", event.target.value)}
                error={errors.key}
                hint="Gerada do nome quando vazia. Minúsculas, números, - e _."
              />
            </div>
            <TextArea
              label="Descrição (opcional)"
              value={values.description}
              rows={2}
              onChange={(event) => setField("description", event.target.value)}
            />
          </FormSection>

          <FormSection title="Escopo">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Escopo"
                value={String(values.scopeType)}
                options={scopeOptions}
                onChange={(event) =>
                  setField("scopeType", Number(event.target.value) as AppApprovalScopeType)
                }
                error={errors.scope}
              />
              {scopeNeedsClient ? (
                <Select
                  label="Cliente"
                  value={values.clientId}
                  options={clientOptions}
                  onChange={(event) => {
                    setField("clientId", event.target.value);
                    setField("siteId", "");
                  }}
                  error={errors.scope}
                />
              ) : null}
              {values.scopeType === AppApprovalScopeType.Site ? (
                <Select
                  label="Site"
                  value={values.siteId}
                  options={siteOptions}
                  onChange={(event) => setField("siteId", event.target.value)}
                />
              ) : null}
            </div>
            {values.scopeType === AppApprovalScopeType.Agent ? (
              <p className="text-xs text-muted">
                O sensor vale apenas para este agente — herança de cliente/site/global é
                resolvida pelo servidor.
              </p>
            ) : null}
          </FormSection>

          <FormSection title="Coleta">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Tipo"
                value={values.sensorType}
                options={SENSOR_TYPE_OPTIONS}
                onChange={(event) => handleTypeChange(event.target.value as SensorType)}
                error={errors.sensorType}
                hint={
                  SENSOR_PRIMARY_CHANNEL[values.sensorType]
                    ? `Canal primário: ${SENSOR_PRIMARY_CHANNEL[values.sensorType]}`
                    : "Canais declarados pelo script definem o valor primário."
                }
              />
              <Input
                label="Alvo"
                value={values.target}
                onChange={(event) => setField("target", event.target.value)}
                hint={TARGET_HINTS[values.sensorType] ?? "Alvo opcional para este tipo."}
              />
              <Input
                label="Intervalo (segundos)"
                type="number"
                min={0}
                value={values.intervalSeconds}
                onChange={(event) => setField("intervalSeconds", event.target.value)}
                error={errors.intervalSeconds}
                hint="0 = herdar o intervalo padrão do agente."
              />
              <Input
                label="Timeout (segundos)"
                type="number"
                min={MIN_TIMEOUT_SECONDS}
                max={MAX_TIMEOUT_SECONDS}
                value={values.timeoutSeconds}
                onChange={(event) => setField("timeoutSeconds", event.target.value)}
                error={errors.timeoutSeconds}
              />
              <Input
                label="Falhas antes de alertar"
                type="number"
                min={MIN_FAILS_BEFORE_ALERT}
                max={MAX_FAILS_BEFORE_ALERT}
                value={values.failsBeforeAlert}
                onChange={(event) => setField("failsBeforeAlert", event.target.value)}
                error={errors.failsBeforeAlert}
                hint="Amostras consecutivas falhando antes de abrir alerta."
              />
              <Input
                label="Amostras para agravar (histerese)"
                type="number"
                min={MIN_SUSTAIN_SAMPLES}
                max={MAX_SUSTAIN_SAMPLES}
                value={values.sustainSamples}
                onChange={(event) => setField("sustainSamples", event.target.value)}
                error={errors.sustainSamples}
                hint={describeSustainSamples(
                  Number(values.sustainSamples.trim() || DEFAULT_SUSTAIN_SAMPLES),
                )}
              />
            </div>
          </FormSection>

          <FormSection title="Limiares">
            {SENSOR_NO_THRESHOLD_TYPES.has(values.sensorType) ? (
              <p className="text-xs text-muted">
                Sensores de serviço/processo usam o estado coletado (em execução ou não) e
                não limiares numéricos.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select
                    label="Direção"
                    value={values.comparison}
                    options={SENSOR_COMPARISON_OPTIONS}
                    onChange={(event) =>
                      setField("comparison", event.target.value as SensorComparison)
                    }
                  />
                  <Input
                    label="Atenção"
                    type="number"
                    step="any"
                    value={values.warningThreshold}
                    onChange={(event) => setField("warningThreshold", event.target.value)}
                    error={errors.warningThreshold}
                  />
                  <Input
                    label="Crítico"
                    type="number"
                    step="any"
                    value={values.criticalThreshold}
                    onChange={(event) => setField("criticalThreshold", event.target.value)}
                    error={errors.criticalThreshold}
                  />
                </div>
                <Select
                  label="Unidade dos limiares"
                  value={values.thresholdUnit}
                  options={SENSOR_UNIT_OPTIONS}
                  onChange={(event) =>
                    setField("thresholdUnit", event.target.value as SensorChannelUnit)
                  }
                />
                <p className="text-xs text-muted">
                  {values.comparison === "LowerIsWorse"
                    ? "Quanto menor, pior: atenção deve ser MAIOR que o crítico (espaço livre, uptime)."
                    : "Quanto maior, pior: atenção deve ser MENOR que o crítico (CPU, latência)."}
                </p>
              </>
            )}
          </FormSection>

          <FormSection title="Alertas">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Severidade mínima para alertar"
                value={values.minSeverityToAlert}
                options={SENSOR_SEVERITY_OPTIONS}
                onChange={(event) =>
                  setField("minSeverityToAlert", event.target.value as SensorSeverity)
                }
              />
              <Select
                label="Severidade quando falha"
                value={values.severityWhenFailing}
                options={SENSOR_SEVERITY_OPTIONS}
                onChange={(event) =>
                  setField("severityWhenFailing", event.target.value as SensorSeverity)
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={values.isActive}
                onChange={(event) => setField("isActive", event.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Sensor ativo (entra na policy enviada ao agente)
            </label>
            {values.sensorType === "Service" ? (
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={values.restartIfStopped}
                    onChange={(event) => setField("restartIfStopped", event.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  Reiniciar se parado
                </label>
                <p className="pl-6 text-[11px] text-muted">
                  Tenta reiniciar o serviço automaticamente quando ele estiver parado.
                  O resultado volta no próprio sensor (tentativa e sucesso do reinício).
                </p>
              </div>
            ) : null}
          </FormSection>

          {isScript ? (
            <FormSection title="Script">
              <Select
                label="Script do catálogo"
                value={values.scriptId}
                options={scriptOptions}
                onChange={(event) => setField("scriptId", event.target.value)}
                error={errors.scriptId}
                hint="O script deve emitir as métricas no protocolo MDZ_METRIC."
              />
              <div className="space-y-2 rounded-lg border border-border bg-surface-light/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Canais de métrica
                    </p>
                    <p className="text-[11px] text-muted">
                      Cada canal vira uma série no gráfico. A chave é obrigatória e única;
                      um deles deve ser o primário (valor exibido na tabela).
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={addChannelRow}
                  >
                    <Icon name="add" className="h-4 w-4" />
                    Adicionar canal
                  </Button>
                </div>
                {channelRows.length === 0 ? (
                  <p className="text-xs text-muted">
                    Nenhum canal declarado — o backend exige ao menos um.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {channelRows.map((row, index) => (
                      <div
                        key={index}
                        className="grid items-end gap-2 sm:grid-cols-[1.1fr_1.1fr_1.2fr_auto_auto]"
                      >
                        <Input
                          aria-label={`Chave do canal ${index + 1}`}
                          placeholder="ex.: uso_cpu"
                          value={row.key}
                          onChange={(event) =>
                            updateChannelRow(index, "key", event.target.value)
                          }
                        />
                        <Input
                          aria-label={`Rótulo do canal ${index + 1}`}
                          placeholder="ex.: Uso de CPU"
                          value={row.label}
                          onChange={(event) =>
                            updateChannelRow(index, "label", event.target.value)
                          }
                        />
                        <Select
                          aria-label={`Unidade do canal ${index + 1}`}
                          value={row.unit}
                          options={SENSOR_UNIT_OPTIONS}
                          onChange={(event) =>
                            updateChannelRow(
                              index,
                              "unit",
                              event.target.value as SensorChannelUnit,
                            )
                          }
                        />
                        <label className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={row.isPrimary}
                            aria-label={`Canal ${index + 1} é o primário`}
                            onChange={(event) => {
                              if (event.target.checked) markPrimaryChannelRow(index);
                              else updateChannelRow(index, "isPrimary", false);
                            }}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                          Primário
                        </label>
                        <button
                          type="button"
                          aria-label={`Remover canal ${index + 1}`}
                          title="Remover canal"
                          onClick={() => removeChannelRow(index)}
                          className="mb-1 rounded-lg p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-danger"
                        >
                          <Icon name="delete" className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {errors.channels ? (
                  <p role="alert" className="text-xs text-danger">
                    {errors.channels}
                  </p>
                ) : null}
              </div>
              <TextArea
                label="Extratores (JSON)"
                value={values.extractorsJson}
                rows={5}
                onChange={(event) => setField("extractorsJson", event.target.value)}
                error={errors.extractorsJson}
                hint="Lista de extratores (regex/json/mdz) por canal. Use as mesmas chaves declaradas acima."
              />
              <TextArea
                label="Mapa de exit codes (JSON)"
                value={values.exitCodeMapJson}
                rows={4}
                onChange={(event) => setField("exitCodeMapJson", event.target.value)}
                error={errors.exitCodeMapJson}
                hint="Regras de status/severidade por código de saída (status/severity por exit code)."
              />
            </FormSection>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-muted-foreground hover:bg-surface-hover disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {isSaving ? "Salvando..." : isEditing ? "Salvar" : "Criar sensor"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
