import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownToLine, Gauge, History, Play, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui";
import { jobsApi } from "@/api";
import type { BackgroundProcessingSettings, ProcessingScopeStateDto } from "@/api";
import {
  useBackgroundProcessingEffective,
  useBackgroundProcessingSchedule,
  useBackgroundProcessingStatus,
  useCancelBackgroundBackfill,
  useRequestBackgroundBackfill,
} from "@/hooks/useBackgroundProcessing";

type SectionKey = "metrics" | "triage";

interface FieldDef {
  section: SectionKey;
  key: string;
  label: string;
  kind: "boolean" | "number";
  min?: number;
  max?: number;
  unit?: string;
  help?: string;
  globalOnly?: boolean;
}

const FIELDS: FieldDef[] = [
  { section: "metrics", key: "enabled", label: "Ciclo habilitado", kind: "boolean", help: "Desligado, o escopo não é processado em nenhum tick." },
  { section: "metrics", key: "tickSeconds", label: "Tick do job", kind: "number", min: 60, max: 3600, unit: "s", globalOnly: true, help: "Granularidade mínima de varredura (aplicada no Quartz em runtime). Intervalos por cliente são verificados dentro do ciclo." },
  { section: "metrics", key: "intervalMinutes", label: "Intervalo por cliente", kind: "number", min: 10, max: 1440, unit: "min", help: "Intervalo mínimo entre ciclos do mesmo cliente (piso de 10 minutos)." },
  { section: "metrics", key: "staleThresholdMinutes", label: "Validade do snapshot", kind: "number", min: 5, max: 1440, unit: "min", help: "A partir daqui o snapshot é considerado vencido para o ciclo." },
  { section: "metrics", key: "windowDays", label: "Janela das métricas", kind: "number", min: 1, max: 365, unit: "d", help: "Período considerado nas taxas e médias." },
  { section: "metrics", key: "batchSize", label: "Atendentes por lote", kind: "number", min: 10, max: 2000 },
  { section: "metrics", key: "maxBatchesPerRun", label: "Máx. lotes por execução", kind: "number", min: 1, max: 50 },
  { section: "metrics", key: "maxRunSeconds", label: "Orçamento de tempo", kind: "number", min: 10, max: 600, unit: "s" },
  { section: "metrics", key: "bootstrapMissingSnapshots", label: "Bootstrap de quem nunca teve snapshot", kind: "boolean", help: "Único caso de cálculo fora do ciclo. Snapshot vencido nunca é recalculado em requisição." },
  { section: "triage", key: "enabled", label: "Ciclo habilitado", kind: "boolean" },
  { section: "triage", key: "tickSeconds", label: "Tick do job", kind: "number", min: 10, max: 3600, unit: "s", globalOnly: true },
  { section: "triage", key: "enqueueOnCreate", label: "Enfileirar na abertura", kind: "boolean", help: "Ligado: fast lane (o chamado entra na fila ao ser aberto). Desligado: somente lotes periódicos." },
  { section: "triage", key: "intervalSeconds", label: "Intervalo por cliente", kind: "number", min: 10, max: 86400, unit: "s" },
  { section: "triage", key: "batchSize", label: "Itens por execução", kind: "number", min: 1, max: 200 },
  { section: "triage", key: "maxPerClientPerRun", label: "Cota por cliente", kind: "number", min: 1, max: 500, help: "Garante que um cliente com fila grande não consuma a vez dos demais." },
  { section: "triage", key: "maxAttempts", label: "Tentativas antes do fallback", kind: "number", min: 1, max: 10 },
  { section: "triage", key: "retryAfterMinutes", label: "Idade p/ varredura", kind: "number", min: 1, max: 1440, unit: "min" },
  { section: "triage", key: "batchDelaySeconds", label: "Atraso no modo lotes", kind: "number", min: 0, max: 86400, unit: "s" },
];

interface Props {
  mode: "global" | "override";
  settings: BackgroundProcessingSettings | null;
  clientId?: string | null;
  canManage?: boolean;
  onSave: (json: string) => Promise<void>;
  saving?: boolean;
}

/** Lê o JSON de configuração (global ou override) com fallback seguro. */
export function parseBackgroundProcessingSettings(
  json: string | null | undefined,
): BackgroundProcessingSettings | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as BackgroundProcessingSettings;
  } catch {
    return null;
  }
}

function sectionOf(source: BackgroundProcessingSettings | null, section: SectionKey): Record<string, unknown> {
  if (!source) return {};
  const value = section === "metrics" ? source.metrics : source.triage;
  return (value ?? {}) as unknown as Record<string, unknown>;
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return minutes + " min atrás";
  if (minutes < 1440) return Math.round(minutes / 60) + " h atrás";
  return Math.round(minutes / 1440) + " d atrás";
}

function summarizeScope(row: ProcessingScopeStateDto): string {
  if (!row.lastResultJson) return "—";
  try {
    const parsed = JSON.parse(row.lastResultJson) as Record<string, unknown>;
    if (typeof parsed.updated === "number" || typeof parsed.pending === "number") {
      return "snapshots " + (parsed.updated ?? 0) + " · pendentes " + (parsed.pending ?? 0);
    }
    if (typeof parsed.triaged === "number" || typeof parsed.swept === "number") {
      return "triados " + (parsed.triaged ?? 0) + " · fallback " + (parsed.swept ?? 0);
    }
    if (typeof parsed.processed === "number") {
      return "backfill " + parsed.processed + "/" + (parsed.total ?? 0) + " (" + String(parsed.status ?? "") + ")";
    }
    return "—";
  } catch {
    return "—";
  }
}

const SCOPE_LABELS: Record<string, string> = {
  technician_metrics: "Métricas",
  ticket_triage: "Triagem",
  technician_metrics_backfill: "Backfill de métricas",
};

export function BackgroundProcessingCard({
  mode,
  settings,
  clientId,
  canManage = true,
  onSave,
  saving,
}: Props) {
  const isOverride = mode === "override";
  const effective = useBackgroundProcessingEffective(clientId ?? null);
  const schedule = useBackgroundProcessingSchedule(!isOverride);

  const [values, setValues] = useState<Record<string, Record<string, unknown>>>({ metrics: {}, triage: {} });
  const [overridden, setOverridden] = useState<Set<string>>(new Set());

  // Semeia o formulário: global parte do efetivo (defaults + salvo); override
  // parte do que o cliente realmente sobrescreveu.
  useEffect(() => {
    if (isOverride) {
      setOverridden(new Set(overriddenKeys(settings)));
      setValues({ metrics: sectionOf(settings, "metrics"), triage: sectionOf(settings, "triage") });
      return;
    }
    const source = effective.data ?? settings;
    setValues({ metrics: sectionOf(source, "metrics"), triage: sectionOf(source, "triage") });
    setOverridden(new Set());
  }, [settings, effective.data, isOverride]);

  const status = useBackgroundProcessingStatus(clientId ?? null, {
    enabled: true,
    refetchIntervalMs: 20000,
  });
  const backfill = useBackgroundBackfillState(status.data);
  const requestBackfill = useRequestBackgroundBackfill();
  const cancelBackfill = useCancelBackgroundBackfill();

  const scopeRows = useMemo(
    () => (status.data ?? []).filter((row) => !clientId || row.scopeId === clientId),
    [status.data, clientId],
  );

  function updateValue(section: SectionKey, key: string, value: unknown) {
    setValues((current) => ({ ...current, [section]: { ...current[section], [key]: value } }));
  }

  function toggleOverride(section: SectionKey, key: string) {
    const id = section + "." + key;
    setOverridden((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        setValues((values) => {
          const copy = { ...values[section] };
          delete copy[key];
          return { ...values, [section]: copy };
        });
      } else {
        next.add(id);
        const inheritedValue = sectionOf(effective.data ?? null, section)[key];
        updateValue(section, key, inheritedValue ?? (FIELDS.find((f) => f.section === section && f.key === key)?.kind === "boolean"));
      }
      return next;
    });
  }

  async function handleSave() {
    const payload = isOverride
      ? JSON.stringify({
          metrics: pick(values.metrics, overridden, "metrics"),
          triage: pick(values.triage, overridden, "triage"),
        })
      : JSON.stringify({ metrics: values.metrics, triage: values.triage });

    try {
      await onSave(payload);
    } catch {
      toast.error("Erro ao salvar a configuração de processamento.");
    }
  }

  const globalDisabled = !isOverride
    ? false
    : !(settings?.metrics?.enabled ?? true) || !(settings?.triage?.enabled ?? true);

  return (
    <Card>
      <CardHeader
        title={isOverride ? "Processamento em Segundo Plano (override do cliente)" : "Processamento em Segundo Plano"}
        subtitle={
          isOverride
            ? "Sobrescreva apenas o que este cliente precisa; o restante herda do global."
            : "Ciclos agendados das métricas por atendente e da triagem por IA. Clientes herdam estes valores."
        }
      />
      <div className="space-y-5">
        {globalDisabled && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            Um dos ciclos deste cliente está desligado: nenhum trabalho será processado para ele.
          </div>
        )}

        {(["metrics", "triage"] as SectionKey[]).map((section) => (
          <div key={section} className="space-y-3 rounded-xl border border-border bg-surface-light p-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              {section === "metrics" ? <Gauge className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
              <p className="text-sm font-medium">
                {section === "metrics" ? "Métricas por atendente" : "Triagem por IA"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.filter((field) => field.section === section && (!field.globalOnly || !isOverride)).map((field) => {
                const isOn = !isOverride || overridden.has(section + "." + field.key);
                const inheritedValue = sectionOf(effective.data ?? null, section)[field.key];
                const value = values[section][field.key];

                if (field.kind === "boolean") {
                  return (
                    <label key={field.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          disabled={!canManage || (isOverride && !isOn)}
                          onChange={(event) => updateValue(section, field.key, event.target.checked)}
                          className="rounded border-border bg-surface-light"
                        />
                        {field.label}
                      </span>
                      {isOverride && (
                        <OverrideToggle
                          overridden={isOn}
                          disabled={!canManage}
                          inherited={String(inheritedValue ?? "false")}
                          onToggle={() => toggleOverride(section, field.key)}
                        />
                      )}
                    </label>
                  );
                }

                return (
                  <div key={field.key} className="space-y-1">
                    <Input
                      label={field.label + (field.unit ? " (" + field.unit + ")" : "")}
                      type="number"
                      min={field.min}
                      max={field.max}
                      disabled={!canManage || (isOverride && !isOn)}
                      value={String(value ?? "")}
                      onChange={(event) => updateValue(section, field.key, Number(event.target.value))}
                    />
                    {field.help && <p className="text-[11px] text-muted">{field.help}</p>}
                    {isOverride && (
                      <OverrideToggle
                        overridden={isOn}
                        disabled={!canManage}
                        inherited={String(inheritedValue ?? "—")}
                        onToggle={() => toggleOverride(section, field.key)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {canManage && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => void handleSave()} loading={saving}>
              Salvar configuração
            </Button>
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <History className="h-4 w-4" />
            <p className="text-sm font-medium">Últimos ciclos</p>
          </div>

          {schedule.data && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {schedule.data.processes.map((process) => (
                <Badge key={process.jobName} color={process.enabled ? "slate" : "warning"}>
                  {process.process === "technician_metrics" ? "Métricas" : "Triagem"}: tick {process.appliedTickSeconds ?? process.tickSeconds}s
                  {process.enabled ? "" : " (desligado)"}
                </Badge>
              ))}
            </div>
          )}

          {status.isLoading && <p className="text-xs text-muted">Carregando estado dos ciclos...</p>}
          {!status.isLoading && scopeRows.length === 0 && (
            <p className="text-xs text-muted">Nenhum ciclo executado ainda para este escopo.</p>
          )}

          {scopeRows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-light px-3 py-2 text-xs">
              <span className="text-foreground">{SCOPE_LABELS[row.scopeType] ?? row.scopeType}</span>
              <span className="text-muted">{formatRelative(row.lastRunAt)}</span>
              <span className="text-muted">{summarizeScope(row)}</span>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button
              size="sm"
              variant="secondary"
              disabled={!canManage}
              onClick={() =>
                jobsApi
                  .trigger("tickets", "technician-metrics-refresh")
                  .then(() => toast.success("Ciclo de métricas disparado."))
                  .catch(() => toast.error("Não foi possível disparar o ciclo de métricas."))
              }
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Rodar métricas agora
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canManage}
              onClick={() =>
                jobsApi
                  .trigger("tickets", "ai-ticket-assignment")
                  .then(() => toast.success("Ciclo de triagem disparado."))
                  .catch(() => toast.error("Não foi possível disparar o ciclo de triagem."))
              }
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Rodar triagem agora
            </Button>

            {backfill.isRunning ? (
              <Button
                size="sm"
                variant="danger"
                disabled={!canManage}
                loading={cancelBackfill.isPending}
                onClick={() =>
                  cancelBackfill.mutate(
                    { clientId: clientId ?? null },
                    {
                      onSuccess: () => toast.success("Backfill cancelado."),
                      onError: () => toast.error("Não foi possível cancelar o backfill."),
                    },
                  )
                }
              >
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                Cancelar backfill
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!canManage}
                loading={requestBackfill.isPending}
                onClick={() => {
                  if (!window.confirm("Recalcular os snapshots de métricas deste escopo agora? A operação roda em lotes.")) return;
                  requestBackfill.mutate(
                    { clientId: clientId ?? null },
                    {
                      onSuccess: (state) =>
                        toast.success("Backfill solicitado (" + state.status + ")."),
                      onError: () => toast.error("Não foi possível solicitar o backfill."),
                    },
                  );
                }}
              >
                <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
                Backfill de snapshots
              </Button>
            )}
          </div>

          {backfill.state && (
            <p className="text-[11px] text-muted">
              Backfill: {backfill.state.status} — {backfill.state.processed}/{backfill.state.total || "?"}
              {backfill.state.lastError ? " (" + backfill.state.lastError + ")" : ""}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function OverrideToggle({
  overridden,
  disabled,
  inherited,
  onToggle,
}: {
  overridden: boolean;
  disabled: boolean;
  inherited: string;
  onToggle: () => void;
}) {
  return (
    <span className="flex items-center gap-2 text-[11px] text-muted">
      <button
        type="button"
        disabled={disabled}
        className="rounded border border-border px-1.5 py-0.5 hover:text-foreground disabled:opacity-50"
        onClick={onToggle}
      >
        {overridden ? "Sobrescrevendo" : "Herdando"}
      </button>
      {!overridden && <span>herdado do global: {inherited}</span>}
    </span>
  );
}

function overriddenKeys(settings: BackgroundProcessingSettings | null): string[] {
  const keys: string[] = [];
  for (const section of ["metrics", "triage"] as SectionKey[]) {
    const source = sectionOf(settings, section);
    for (const [key, value] of Object.entries(source)) {
      if (value !== null && value !== undefined) keys.push(section + "." + key);
    }
  }
  return keys;
}

function pick(values: Record<string, unknown>, overridden: Set<string>, section: SectionKey): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (overridden.has(section + "." + key)) result[key] = value;
  }
  return result;
}

function useBackgroundBackfillState(rows: ProcessingScopeStateDto[] | undefined) {
  const state = useMemo(() => {
    const row = (rows ?? []).find((item) => item.scopeType === "technician_metrics_backfill");
    if (!row?.lastResultJson) return null;
    try {
      const parsed = JSON.parse(row.lastResultJson) as {
        status?: string;
        total?: number;
        processed?: number;
        lastError?: string | null;
      };
      return parsed;
    } catch {
      return null;
    }
  }, [rows]);

  const isRunning = state?.status === "pending" || state?.status === "running";
  return { state, isRunning };
}
