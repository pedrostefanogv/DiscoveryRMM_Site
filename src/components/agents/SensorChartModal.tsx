import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Icon, Loading, Modal } from "@/components/ui";
import type { SensorChannelUnit, SensorItem, SensorSeries } from "@/api";
import { useSensorSeries } from "@/hooks/useSensorSeries";
import { useSensorEvents } from "@/hooks/useSensors";
import { describeSensorsError } from "@/api/sensors";
import type { CompareChannelData } from "./SensorChartCanvas";
import {
  SENSOR_STATUS_META,
  SENSOR_TYPE_CHANNEL_FALLBACK,
  computeSensorForecast,
  downloadTextFile,
  formatSensorChannelLabel,
  formatSensorNumber,
  formatSensorValue,
  sensorChartColor,
  sensorCsvFileName,
  sensorSeriesToCsv,
  sensorUnitSuffix,
} from "./sensorUtils";

/**
 * O recharts é carregado só quando o gráfico abre: `import` estático inflaria o
 * bundle da rota do detalhe do agente (o gráfico é uma ação secundária).
 */
const SensorChartCanvas = lazy(() => import("./SensorChartCanvas"));

/** Faixas de tempo do gráfico (a janela termina em "agora"). */
const RANGES = [
  { key: "1h", label: "1h", ms: 60 * 60 * 1000 },
  { key: "6h", label: "6h", ms: 6 * 60 * 60 * 1000 },
  { key: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "90d", label: "90d", ms: 90 * 24 * 60 * 60 * 1000 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

interface SensorChartModalProps {
  open: boolean;
  onClose: () => void;
  agentId: string;
  /** Sensor cujo histórico será plotado (null = modal fechado/sem alvo). */
  sensor: SensorItem | null;
  /** Outros sensores do mesmo agente para correlação opcional na mesma linha do tempo. */
  availableSensors?: SensorItem[];
}

/** Cor de fundo da faixa de status (mesma paleta do badge). */
function stripToneClass(status: keyof typeof SENSOR_STATUS_META): string {
  switch (status) {
    case "Passing":
      return "bg-success/80";
    case "Warning":
      return "bg-warning/80";
    case "Failing":
      return "bg-danger/80";
    default:
      return "bg-muted/50";
  }
}

/** Badge curto de unidade para o botão de canal. */
function unitBadgeText(unit: SensorChannelUnit): string {
  if (unit === "Bytes") return "B";
  return sensorUnitSuffix(unit).trim() || "val";
}

/**
 * Modal "Ver gráfico" da aba Sensores: série temporal por canal, seleção
 * interativa de canais (agrupada por unidade), previsão de tendência, correlação
 * multi-sensor, marcadores de eventos, zoom por seleção e estatísticas.
 */
export default function SensorChartModal({
  open,
  onClose,
  agentId,
  sensor,
  availableSensors = [],
}: SensorChartModalProps) {
  const [range, setRange] = useState<RangeKey>("24h");
  /**
   * "Agora" fixado na abertura/troca de faixa: a chave da query não pode mudar a
   * cada render, senão o gráfico refaz a consulta continuamente.
   */
  const [anchor, setAnchor] = useState(() => Date.now());
  const [visibleKeys, setVisibleKeys] = useState<string[]>([]);
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const [showEvents, setShowEvents] = useState(true);
  const [compareSensorId, setCompareSensorId] = useState("");

  useEffect(() => {
    if (open) {
      setAnchor(Date.now());
      setZoomDomain(null);
    }
  }, [open, range, sensor?.sensorId]);

  useEffect(() => {
    setCompareSensorId("");
  }, [sensor?.sensorId, open]);

  const otherSensors = useMemo(
    () => availableSensors.filter((item) => item.sensorId !== sensor?.sensorId),
    [availableSensors, sensor?.sensorId],
  );
  const compareSensor = useMemo(
    () => otherSensors.find((item) => item.sensorId === compareSensorId) ?? null,
    [otherSensors, compareSensorId],
  );

  const rangeMs = RANGES.find((item) => item.key === range)?.ms ?? RANGES[2].ms;
  const params = useMemo(
    () => ({
      from: new Date(anchor - rangeMs).toISOString(),
      to: new Date(anchor).toISOString(),
      // Sem lista de canais: o servidor devolve todos os declarados para o alvo.
      channels: undefined,
      targetKey: sensor?.targetKey ?? null,
      step: "auto",
    }),
    [anchor, rangeMs, sensor?.targetKey],
  );

  const compareParams = useMemo(
    () => ({
      from: params.from,
      to: params.to,
      channels: undefined,
      targetKey: compareSensor?.targetKey ?? null,
      step: "auto",
    }),
    [params.from, params.to, compareSensor?.targetKey],
  );

  const series = useSensorSeries(agentId, sensor?.sensorId ?? "", params, open && Boolean(sensor));
  const compareSeries = useSensorSeries(
    agentId,
    compareSensorId,
    compareParams,
    open && Boolean(compareSensor),
  );
  const sensorEvents = useSensorEvents(
    agentId,
    sensor?.sensorId ?? "",
    { limit: 50, targetKey: sensor?.targetKey ?? null },
    open && Boolean(sensor),
  );

  // Proteção contra placeholderData de outro sensor durante troca rápida.
  const rawData =
    series.data && (!sensor || series.data.sensorId === sensor.sensorId)
      ? series.data
      : undefined;

  // Enriquece rótulos quando a API devolve apenas a chave técnica (ex.: available_bytes).
  const data = useMemo<SensorSeries | undefined>(() => {
    if (!rawData) return undefined;
    const fallbackMeta = sensor ? SENSOR_TYPE_CHANNEL_FALLBACK[sensor.sensorType] ?? [] : [];
    return {
      ...rawData,
      channels: rawData.channels.map((channel) => {
        const declared = sensor?.channels.find((c) => c.key === channel.key);
        const fallback = fallbackMeta.find((c) => c.key === channel.key);
        const rawLabel =
          channel.label && channel.label !== channel.key
            ? channel.label
            : declared?.label || fallback?.label || channel.key;
        return {
          ...channel,
          label: formatSensorChannelLabel(rawLabel, channel.key, channel.unit),
        };
      }),
    };
  }, [rawData, sensor]);

  const compareChannel = useMemo<CompareChannelData | null>(() => {
    if (!compareSensor || !compareSeries.data) return null;
    if (compareSeries.data.sensorId !== compareSensor.sensorId) return null;
    const ch =
      (compareSensor.primaryChannel
        ? compareSeries.data.channels.find((c) => c.key === compareSensor.primaryChannel)
        : undefined) ?? compareSeries.data.channels[0];
    if (!ch || ch.points.length === 0) return null;
    return {
      key: ch.key,
      label: formatSensorChannelLabel(ch.label, ch.key, ch.unit),
      unit: ch.unit,
      points: ch.points,
      sensorName: compareSensor.name,
    };
  }, [compareSensor, compareSeries.data]);

  const windowEvents = useMemo(() => {
    const items = sensorEvents.data?.items ?? [];
    if (!data || items.length === 0) return [];
    const fromMs = new Date(data.from).getTime();
    const toMs = new Date(data.to).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return [];
    return items.filter((event) => {
      if (!event.occurredAt) return false;
      const ts = new Date(event.occurredAt).getTime();
      return Number.isFinite(ts) && ts >= fromMs && ts <= toMs;
    });
  }, [sensorEvents.data?.items, data]);

  // Previsão de tendência para o canal da unidade do limiar (ou primário).
  const forecast = useMemo(() => {
    if (!data) return null;
    const targetChannel =
      (sensor?.primaryChannel
        ? data.channels.find((c) => c.key === sensor.primaryChannel)
        : undefined) ??
      data.channels.find((c) => c.unit === data.thresholdUnit) ??
      data.channels[0];
    return computeSensorForecast(targetChannel, data);
  }, [data, sensor?.primaryChannel]);

  // Chave estável dos canais disponíveis para inicializar a seleção padrão.
  const channelSignature = useMemo(
    () => (data ? `${data.sensorId}:${data.channels.map((c) => c.key).join(",")}` : ""),
    [data],
  );

  useEffect(() => {
    if (!data || data.channels.length === 0) {
      setVisibleKeys([]);
      return;
    }
    const primaryChannel = sensor?.primaryChannel
      ? data.channels.find((c) => c.key === sensor.primaryChannel)
      : undefined;
    const thresholdChannel = data.channels.find((c) => c.unit === data.thresholdUnit);
    const defaultUnit =
      primaryChannel?.unit ?? thresholdChannel?.unit ?? data.channels[0].unit;
    setVisibleKeys(
      data.channels.filter((c) => c.unit === defaultUnit).map((c) => c.key),
    );
  }, [channelSignature, sensor?.primaryChannel]);

  const toggleChannel = (key: string) => {
    if (!data) return;
    const target = data.channels.find((c) => c.key === key);
    if (!target) return;

    setVisibleKeys((prev) => {
      if (prev.includes(key)) {
        // Sempre mantém ao menos 1 canal visível no gráfico.
        if (prev.length <= 1) return prev;
        return prev.filter((k) => k !== key);
      }
      const next = [...prev, key];
      const activeUnits: SensorChannelUnit[] = [];
      for (const ch of data.channels) {
        if (next.includes(ch.key) && !activeUnits.includes(ch.unit)) {
          activeUnits.push(ch.unit);
        }
      }
      // O gráfico suporta no máximo 2 eixos Y (esquerdo + direito). Ao ativar
      // uma 3ª unidade, remove os canais da 2ª unidade para evitar mistura de escala.
      if (activeUnits.length > 2) {
        const dropUnit = activeUnits[1];
        return next.filter((k) => {
          const ch = data.channels.find((c) => c.key === k);
          return ch ? ch.unit !== dropUnit || k === key : false;
        });
      }
      return next;
    });
  };

  // Exporta exatamente a série carregada (mesma janela/canais do gráfico).
  const canExport = Boolean(data && data.channels.some((channel) => channel.points.length > 0));
  const handleExport = () => {
    if (!data) return;
    const csv = sensorSeriesToCsv(data);
    if (!csv) return;
    downloadTextFile(sensorCsvFileName(data, sensor?.name), csv);
  };

  return (
    <Modal open={open} onClose={onClose} title={`Gráfico — ${sensor?.name ?? "sensor"}`} maxWidth="max-w-4xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRange(item.key)}
              aria-pressed={range === item.key}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                range === item.key
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border bg-surface-light text-muted-foreground hover:bg-surface-hover"
              }`}
            >
              {item.label}
            </button>
          ))}
          {otherSensors.length > 0 ? (
            <select
              aria-label="Comparar com outro sensor"
              value={compareSensorId}
              onChange={(event) => setCompareSensorId(event.target.value)}
              className="rounded-lg border border-border bg-surface-light px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Comparar sensor…</option>
              {otherSensors.map((item) => (
                <option key={item.sensorId} value={item.sensorId}>
                  {item.name}{item.target ? ` (${item.target})` : ""}
                </option>
              ))}
            </select>
          ) : null}
          {windowEvents.length > 0 ? (
            <button
              type="button"
              aria-pressed={showEvents}
              onClick={() => setShowEvents((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                showEvents
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-surface-light text-muted-foreground hover:bg-surface-hover"
              }`}
            >
              <Icon name="flag" className="h-3.5 w-3.5" />
              Eventos ({windowEvents.length})
            </button>
          ) : null}
          {zoomDomain ? (
            <button
              type="button"
              onClick={() => setZoomDomain(null)}
              className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
            >
              <Icon name="restart_alt" className="h-3.5 w-3.5" />
              Resetar zoom
            </button>
          ) : null}
          {series.isFetching && !series.isLoading ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Icon name="progress_activity" className="h-3.5 w-3.5 animate-spin" />
              Atualizando…
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setZoomDomain(null);
                setAnchor(Date.now());
              }}
              disabled={series.isFetching}
              title="Atualizar série até agora"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-light px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon
                name="refresh"
                className={`h-3.5 w-3.5 ${series.isFetching ? "animate-spin" : ""}`}
              />
              Atualizar
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!canExport}
              title="Baixa um CSV com os pontos exibidos nesta janela"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-light px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="download" className="h-3.5 w-3.5" />
              Exportar CSV
            </button>
          </div>
        </div>

        {forecast ? (
          <div
            role="status"
            className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              forecast.level === "critical"
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-warning/40 bg-warning/10 text-warning"
            }`}
          >
            <Icon name="trending_up" className="h-4 w-4 shrink-0" />
            <span>
              <strong>Previsão:</strong> pela tendência atual ({formatSensorValue(forecast.slopePerDay, data?.thresholdUnit ?? "Count")}/dia),
              atinge o limiar {forecast.level === "critical" ? "crítico" : "de atenção"} (
              {formatSensorValue(forecast.thresholdValue, data?.thresholdUnit ?? "Count")}) em{" "}
              <strong>{forecast.etaLabel}</strong>.
            </span>
          </div>
        ) : null}

        {series.isLoading || (series.isFetching && !data) ? (
          <Loading message="Carregando série do sensor..." />
        ) : series.isError ? (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            <Icon name="warning" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {describeSensorsError(series.error, "Não foi possível carregar a série do sensor.")}
            </span>
            <button
              type="button"
              onClick={() => void series.refetch()}
              className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-foreground"
            >
              Tentar novamente
            </button>
          </div>
        ) : !data || data.channels.length === 0 ? (
          <div className="py-12 text-center">
            <Icon name="monitoring" className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-2 text-sm font-medium text-muted-foreground">Sem amostras nesta janela</p>
            <p className="mt-1 text-xs text-muted">
              Não há pontos armazenados para este sensor no período selecionado. Tente uma janela maior.
            </p>
          </div>
        ) : (
          <>
            <ChannelToggleBar
              series={data}
              visibleKeys={visibleKeys}
              onToggle={toggleChannel}
              compareChannel={compareChannel}
              onClearCompare={() => setCompareSensorId("")}
            />
            <Suspense fallback={<Loading message="Carregando gráfico..." size="sm" />}>
              <SensorChartCanvas
                series={data}
                visibleChannelKeys={visibleKeys}
                events={showEvents ? windowEvents : undefined}
                zoomDomain={zoomDomain}
                onZoomChange={setZoomDomain}
                compareChannel={compareChannel}
              />
            </Suspense>
            <StatusStrip series={data} />
            <StatsTable
              series={data}
              visibleKeys={visibleKeys}
              onToggle={toggleChannel}
            />
            <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span className="inline-flex items-center gap-2">
                <Icon name="info" className="h-3.5 w-3.5" />
                Resolução {data.resolution} · passo de {data.stepSeconds}s · {formatSensorIntervalLabel(data)}
              </span>
              <span>Arraste no gráfico para dar zoom no intervalo</span>
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

function formatSensorIntervalLabel(series: SensorSeries): string {
  const from = new Date(series.from).getTime();
  const to = new Date(series.to).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return "janela inválida";
  const hours = (to - from) / 3_600_000;
  if (hours < 48) return `janela de ${Math.round(hours)}h`;
  return `janela de ${Math.round(hours / 24)} dias`;
}

/** Legenda interativa unificada: alterna visibilidade dos canais e indica limiares. */
function ChannelToggleBar({
  series,
  visibleKeys,
  onToggle,
  compareChannel,
  onClearCompare,
}: {
  series: SensorSeries;
  visibleKeys: string[];
  onToggle: (key: string) => void;
  compareChannel?: CompareChannelData | null;
  onClearCompare?: () => void;
}) {
  const visibleUnits = useMemo(() => {
    const set = new Set<SensorChannelUnit>();
    for (const ch of series.channels) {
      if (visibleKeys.includes(ch.key)) set.add(ch.unit);
    }
    return set;
  }, [series.channels, visibleKeys]);

  const thresholdVisible = visibleUnits.has(series.thresholdUnit);
  const thresholdUnitHint = `Ative um canal em ${unitBadgeText(series.thresholdUnit)} para exibir este limiar no gráfico`;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {series.channels.map((channel, index) => {
        const active = visibleKeys.includes(channel.key);
        return (
          <button
            key={channel.key}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(channel.key)}
            title={active ? "Clique para ocultar do gráfico" : "Clique para exibir no gráfico"}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors ${
              active
                ? "border-primary/40 bg-surface-light text-foreground"
                : "border-border bg-surface text-muted opacity-60 hover:opacity-100"
            }`}
          >
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: sensorChartColor(index) }}
              aria-hidden
            />
            <span>{channel.label || channel.key}</span>
            <span className="text-[10px] text-muted">({unitBadgeText(channel.unit)})</span>
          </button>
        );
      })}
      {compareChannel ? (
        <button
          type="button"
          onClick={onClearCompare}
          title="Remover comparação"
          className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-foreground"
        >
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent"
            aria-hidden
          />
          <span>
            {compareChannel.sensorName} · {compareChannel.label}
          </span>
          <Icon name="close" className="h-3 w-3 text-muted" />
        </button>
      ) : null}
      {series.warningThreshold !== null && series.warningThreshold !== undefined ? (
        <span
          title={thresholdVisible ? undefined : thresholdUnitHint}
          className={`inline-flex items-center gap-1.5 px-1.5 text-muted ${
            thresholdVisible ? "" : "opacity-45"
          }`}
        >
          <span className="inline-block h-0.5 w-4 bg-warning" aria-hidden />
          limiar de atenção {formatSensorValue(series.warningThreshold, series.thresholdUnit)}
        </span>
      ) : null}
      {series.criticalThreshold !== null && series.criticalThreshold !== undefined ? (
        <span
          title={thresholdVisible ? undefined : thresholdUnitHint}
          className={`inline-flex items-center gap-1.5 px-1.5 text-muted ${
            thresholdVisible ? "" : "opacity-45"
          }`}
        >
          <span className="inline-block h-0.5 w-4 bg-danger" aria-hidden />
          limiar crítico {formatSensorValue(series.criticalThreshold, series.thresholdUnit)}
        </span>
      ) : null}
    </div>
  );
}

/** Barra colorida abaixo do eixo: um segmento por status observado + resumo OK%. */
function StatusStrip({ series }: { series: SensorSeries }) {
  const from = new Date(series.from).getTime();
  const to = new Date(series.to).getTime();
  const span = to - from;
  if (!Number.isFinite(span) || span <= 0 || series.statusStrips.length === 0) return null;

  let passingMs = 0;
  let observedMs = 0;
  for (const strip of series.statusStrips) {
    const sFrom = new Date(strip.from).getTime();
    const sTo = new Date(strip.to).getTime();
    if (!Number.isFinite(sFrom) || !Number.isFinite(sTo) || sTo <= sFrom) continue;
    const dur = sTo - sFrom;
    observedMs += dur;
    if (strip.status === "Passing") passingMs += dur;
  }
  const okPercent = observedMs > 0 ? Math.round((passingMs / observedMs) * 100) : null;

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-light" role="img" aria-label="Faixa de status do período">
        {series.statusStrips.map((strip, index) => {
          const stripFrom = new Date(strip.from).getTime();
          const stripTo = new Date(strip.to).getTime();
          if (!Number.isFinite(stripFrom) || !Number.isFinite(stripTo)) return null;
          const width = Math.max(0.5, ((stripTo - stripFrom) / span) * 100);
          return (
            <span
              key={`${strip.from}-${index}`}
              className={stripToneClass(strip.status)}
              style={{ width: `${width}%` }}
              title={`${SENSOR_STATUS_META[strip.status]?.label ?? strip.status} · ${new Date(strip.from).toLocaleString("pt-BR")} → ${new Date(strip.to).toLocaleString("pt-BR")}`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>Faixa de status no período — verde OK, amarelo atenção, vermelho crítico.</span>
        {okPercent !== null ? (
          <span className="font-medium text-muted-foreground tabular-nums">
            {okPercent}% em OK no período
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Estatísticas por canal (mín/média/máx/p95/último). */
function StatsTable({
  series,
  visibleKeys,
  onToggle,
}: {
  series: SensorSeries;
  visibleKeys: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border bg-surface-light text-[11px] uppercase tracking-wide text-muted">
            <th className="px-3 py-2 font-semibold">Canal</th>
            <th className="px-3 py-2 font-semibold">Mín</th>
            <th className="px-3 py-2 font-semibold">Média</th>
            <th className="px-3 py-2 font-semibold">Máx</th>
            <th className="px-3 py-2 font-semibold">P95</th>
            <th className="px-3 py-2 font-semibold">Último</th>
            <th className="px-3 py-2 font-semibold">Amostras</th>
          </tr>
        </thead>
        <tbody>
          {series.channels.map((channel, index) => {
            const active = visibleKeys.includes(channel.key);
            const suffix = channel.unit === "Bytes" ? "" : sensorUnitSuffix(channel.unit);
            return (
              <tr
                key={channel.key}
                onClick={() => onToggle(channel.key)}
                title={active ? "Clique para ocultar do gráfico" : "Clique para exibir no gráfico"}
                className={`cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-surface-hover/50 ${
                  active ? "" : "opacity-55"
                }`}
              >
                <td className="px-3 py-1.5 text-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: sensorChartColor(index) }}
                      aria-hidden
                    />
                    <span>{channel.label || channel.key}</span>
                    {suffix ? <span className="text-muted">({suffix.trim()})</span> : null}
                  </span>
                </td>
                <td className="px-3 py-1.5 tabular-nums">{formatSensorValue(channel.stats.min, channel.unit)}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatSensorValue(channel.stats.avg, channel.unit)}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatSensorValue(channel.stats.max, channel.unit)}</td>
                <td className="px-3 py-1.5 tabular-nums">{formatSensorValue(channel.stats.p95, channel.unit)}</td>
                <td className="px-3 py-1.5 tabular-nums font-medium text-foreground">
                  {formatSensorValue(channel.stats.last, channel.unit)}
                </td>
                <td className="px-3 py-1.5 tabular-nums">{formatSensorNumber(channel.stats.count)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
