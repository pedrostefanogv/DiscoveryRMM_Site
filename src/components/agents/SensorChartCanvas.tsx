import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  SensorChannelUnit,
  SensorEvent,
  SensorEventKind,
  SensorSeries,
  SensorSeriesChannel,
  SensorSeriesPoint,
} from "@/api";
import {
  SENSOR_EVENT_KIND_LABELS,
  formatSensorAxisTick,
  formatSensorChannelLabel,
  formatSensorChannelValue,
  formatSensorValue,
  sensorChartColor,
} from "./sensorUtils";

const COMPARE_KEY = "__compare__";

export interface CompareChannelData {
  key: string;
  label: string;
  unit: SensorChannelUnit;
  points: SensorSeriesPoint[];
  sensorName: string;
}

/**
 * Linha do gráfico já achatada num registro por instante (uma coluna por
 * canal). O recharts precisa de UM array de dados com todas as séries.
 */
interface ChartRow {
  t: number;
  [channel: string]: number | null;
}

interface SensorChartCanvasProps {
  series: SensorSeries;
  /** Canais visíveis no gráfico; se omitido, plota todos os canais da série. */
  visibleChannelKeys?: string[];
  /** Eventos do sensor no período para marcar na linha do tempo. */
  events?: SensorEvent[];
  /** Domínio de zoom no eixo X [fromMs, toMs]. */
  zoomDomain?: [number, number] | null;
  onZoomChange?: (domain: [number, number] | null) => void;
  /** Canal de um segundo sensor para correlação na mesma linha do tempo. */
  compareChannel?: CompareChannelData | null;
  height?: number;
}

/** Tick do eixo X: hora:minuto para janelas curtas, dia/mês para longas. */
function formatTick(timestamp: number, spanMs: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  if (spanMs <= 36 * 3600 * 1000) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function eventStrokeColor(kind: SensorEventKind): string {
  switch (kind) {
    case "AlertRaised":
      return "var(--color-danger)";
    case "AlertResolved":
      return "var(--color-success)";
    case "RunError":
      return "var(--color-warning)";
    default:
      return "var(--color-muted)";
  }
}

/** Calcula o domínio do eixo Y: 0..100 para porcentagens dentro da faixa padrão. */
function computeAxisDomain(
  unit: SensorChannelUnit,
  channels: SensorSeriesChannel[],
  series: SensorSeries,
): [number, number] | ["auto", "auto"] {
  if (unit !== "Percent") return ["auto", "auto"];

  for (const channel of channels) {
    for (const point of channel.points) {
      if (point.v !== null && (point.v < 0 || point.v > 100)) return ["auto", "auto"];
    }
  }
  if (series.thresholdUnit === "Percent") {
    if (
      series.warningThreshold !== null &&
      series.warningThreshold !== undefined &&
      (series.warningThreshold < 0 || series.warningThreshold > 100)
    ) {
      return ["auto", "auto"];
    }
    if (
      series.criticalThreshold !== null &&
      series.criticalThreshold !== undefined &&
      (series.criticalThreshold < 0 || series.criticalThreshold > 100)
    ) {
      return ["auto", "auto"];
    }
  }
  return [0, 100];
}

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string | null;
  color?: string;
}

/** Tooltip próprio: mostra valor + unidade formatados do canal e o instante completo. */
function ChartTooltip({
  active,
  payload,
  label,
  series,
  compareChannel,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number | string;
  series: SensorSeries;
  compareChannel?: CompareChannelData | null;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const timestamp = Number(label);
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-foreground">
        {Number.isNaN(timestamp) ? "—" : new Date(timestamp).toLocaleString("pt-BR")}
      </p>
      {payload.map((entry) => {
        const isCompare = entry.dataKey === COMPARE_KEY && compareChannel;
        const channel = isCompare
          ? null
          : series.channels.find((item) => item.key === entry.dataKey);
        const value = typeof entry.value === "number" ? entry.value : Number(entry.value);
        const unit = isCompare ? compareChannel.unit : (channel?.unit ?? "Count");
        const friendlyLabel = isCompare
          ? `${compareChannel.sensorName} · ${formatSensorChannelLabel(compareChannel.label, compareChannel.key, unit)}`
          : formatSensorChannelLabel(
              channel?.label,
              channel?.key ?? String(entry.dataKey),
              unit,
            );
        return (
          <p key={String(entry.dataKey)} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span>{friendlyLabel}:</span>
            <span className="font-medium tabular-nums text-foreground">
              {Number.isFinite(value)
                ? formatSensorChannelValue(isCompare ? compareChannel.key : channel?.key, value, unit)
                : "—"}
            </span>
          </p>
        );
      })}
    </div>
  );
}

/**
 * Gráfico da série temporal do sensor (recharts) com suporte a duplo eixo Y por
 * unidade, linhas de limiar alinhadas à unidade correspondente, marcadores de
 * eventos, correlação com outro sensor e zoom por seleção (drag).
 */
export default function SensorChartCanvas({
  series,
  visibleChannelKeys,
  events,
  zoomDomain,
  onZoomChange,
  compareChannel,
  height = 280,
}: SensorChartCanvasProps) {
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  const activeChannels = useMemo(() => {
    if (!visibleChannelKeys) return series.channels;
    const allowed = new Set(visibleChannelKeys);
    return series.channels.filter((channel) => allowed.has(channel.key));
  }, [series.channels, visibleChannelKeys]);

  const colorIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    series.channels.forEach((channel, idx) => map.set(channel.key, idx));
    return map;
  }, [series.channels]);

  const { leftUnit, rightUnit, leftChannels, rightChannels } = useMemo(() => {
    const distinctUnits: SensorChannelUnit[] = [];
    for (const channel of activeChannels) {
      if (!distinctUnits.includes(channel.unit)) {
        distinctUnits.push(channel.unit);
      }
    }
    if (compareChannel && !distinctUnits.includes(compareChannel.unit)) {
      distinctUnits.push(compareChannel.unit);
    }
    const left = distinctUnits[0] ?? "Count";
    const right = distinctUnits[1] ?? null;
    return {
      leftUnit: left,
      rightUnit: right,
      leftChannels: activeChannels.filter((c) => c.unit !== right),
      rightChannels: right ? activeChannels.filter((c) => c.unit === right) : [],
    };
  }, [activeChannels, compareChannel]);

  const leftDomain = useMemo(
    () => computeAxisDomain(leftUnit, leftChannels, series),
    [leftUnit, leftChannels, series],
  );
  const rightDomain = useMemo(
    () => (rightUnit ? computeAxisDomain(rightUnit, rightChannels, series) : (["auto", "auto"] as const)),
    [rightUnit, rightChannels, series],
  );

  const thresholdAxisId: "left" | "right" | null = useMemo(() => {
    if (activeChannels.length === 0) return null;
    if (leftUnit === series.thresholdUnit) return "left";
    if (rightUnit === series.thresholdUnit) return "right";
    return null;
  }, [activeChannels.length, leftUnit, rightUnit, series.thresholdUnit]);

  const rows = useMemo<ChartRow[]>(() => {
    const byTimestamp = new Map<number, ChartRow>();
    for (const channel of activeChannels) {
      for (const point of channel.points) {
        const timestamp = new Date(point.t).getTime();
        if (Number.isNaN(timestamp)) continue;
        let row = byTimestamp.get(timestamp);
        if (!row) {
          row = { t: timestamp };
          byTimestamp.set(timestamp, row);
        }
        row[channel.key] = point.v;
      }
    }
    if (compareChannel) {
      for (const point of compareChannel.points) {
        const timestamp = new Date(point.t).getTime();
        if (Number.isNaN(timestamp)) continue;
        let row = byTimestamp.get(timestamp);
        if (!row) {
          row = { t: timestamp };
          byTimestamp.set(timestamp, row);
        }
        row[COMPARE_KEY] = point.v;
      }
    }
    return Array.from(byTimestamp.values()).sort((a, b) => a.t - b.t);
  }, [activeChannels, compareChannel]);

  const spanMs = useMemo(() => {
    if (zoomDomain) return Math.max(0, zoomDomain[1] - zoomDomain[0]);
    const from = new Date(series.from).getTime();
    const to = new Date(series.to).getTime();
    return Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, to - from) : 0;
  }, [series.from, series.to, zoomDomain]);

  const visibleEvents = useMemo(() => {
    if (!events || events.length === 0 || rows.length === 0) return [];
    const minT = zoomDomain ? zoomDomain[0] : rows[0].t;
    const maxT = zoomDomain ? zoomDomain[1] : rows[rows.length - 1].t;
    return events
      .map((event) => ({
        event,
        ts: event.occurredAt ? new Date(event.occurredAt).getTime() : Number.NaN,
      }))
      .filter((item) => Number.isFinite(item.ts) && item.ts >= minT && item.ts <= maxT);
  }, [events, rows, zoomDomain]);

  const hasValue = rows.some(
    (row) =>
      activeChannels.some((channel) => typeof row[channel.key] === "number") ||
      (compareChannel ? typeof row[COMPARE_KEY] === "number" : false),
  );
  if (!hasValue) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        Nenhuma amostra numérica nesta janela para os canais selecionados.
      </p>
    );
  }

  const hasWarning = series.warningThreshold !== null && series.warningThreshold !== undefined;
  const hasCritical = series.criticalThreshold !== null && series.criticalThreshold !== undefined;
  const warningHigher =
    hasWarning &&
    hasCritical &&
    (series.warningThreshold as number) > (series.criticalThreshold as number);

  const handleMouseDown = (state: { activeLabel?: string | number } | null | undefined) => {
    if (!onZoomChange || state?.activeLabel === undefined) return;
    const ts = Number(state.activeLabel);
    if (!Number.isFinite(ts)) return;
    setDragStart(ts);
    setDragEnd(ts);
  };

  const handleMouseMove = (state: { activeLabel?: string | number } | null | undefined) => {
    if (dragStart === null || state?.activeLabel === undefined) return;
    const ts = Number(state.activeLabel);
    if (Number.isFinite(ts)) setDragEnd(ts);
  };

  const handleMouseUp = () => {
    if (dragStart !== null && dragEnd !== null && onZoomChange) {
      const left = Math.min(dragStart, dragEnd);
      const right = Math.max(dragStart, dragEnd);
      if (Number.isFinite(left) && Number.isFinite(right) && right - left > 0) {
        onZoomChange([left, right]);
      }
    }
    setDragStart(null);
    setDragEnd(null);
  };

  const compareAxisId = compareChannel && rightUnit && compareChannel.unit === rightUnit ? "right" : "left";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={rows}
        margin={{ top: 14, right: rightUnit ? 12 : 20, bottom: 4, left: 4 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="t"
          type="number"
          domain={zoomDomain ?? ["dataMin", "dataMax"]}
          allowDataOverflow={Boolean(zoomDomain)}
          tickFormatter={(value) => formatTick(Number(value), spanMs)}
          stroke="var(--color-muted)"
          tick={{ fontSize: 11, fill: "var(--color-muted)" }}
        />
        <YAxis
          yAxisId="left"
          domain={leftDomain}
          stroke="var(--color-muted)"
          tick={{ fontSize: 11, fill: "var(--color-muted)" }}
          width={64}
          tickFormatter={(value) => formatSensorAxisTick(Number(value), leftUnit)}
        />
        {rightUnit ? (
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={rightDomain}
            stroke="var(--color-muted)"
            tick={{ fontSize: 11, fill: "var(--color-muted)" }}
            width={64}
            tickFormatter={(value) => formatSensorAxisTick(Number(value), rightUnit)}
          />
        ) : null}
        <Tooltip content={<ChartTooltip series={series} compareChannel={compareChannel} />} />
        {thresholdAxisId && hasWarning ? (
          <ReferenceLine
            yAxisId={thresholdAxisId}
            y={series.warningThreshold as number}
            stroke="var(--color-warning)"
            strokeDasharray="4 4"
            label={{
              value: `Atenção ${formatSensorValue(series.warningThreshold, series.thresholdUnit)}`,
              position: hasCritical && !warningHigher ? "insideBottomRight" : "insideTopRight",
              fontSize: 10,
              fill: "var(--color-warning)",
            }}
          />
        ) : null}
        {thresholdAxisId && hasCritical ? (
          <ReferenceLine
            yAxisId={thresholdAxisId}
            y={series.criticalThreshold as number}
            stroke="var(--color-danger)"
            strokeDasharray="4 4"
            label={{
              value: `Crítico ${formatSensorValue(series.criticalThreshold, series.thresholdUnit)}`,
              position: hasWarning && !warningHigher ? "insideTopRight" : "insideBottomRight",
              fontSize: 10,
              fill: "var(--color-danger)",
            }}
          />
        ) : null}
        {visibleEvents.map(({ event, ts }) => (
          <ReferenceLine
            key={event.id}
            yAxisId="left"
            x={ts}
            stroke={eventStrokeColor(event.kind)}
            strokeDasharray="2 2"
            strokeWidth={1.5}
            label={{
              value: SENSOR_EVENT_KIND_LABELS[event.kind] ?? event.kind,
              position: "insideTopLeft",
              fontSize: 9,
              fill: eventStrokeColor(event.kind),
            }}
          />
        ))}
        {dragStart !== null && dragEnd !== null && dragStart !== dragEnd ? (
          <ReferenceArea
            yAxisId="left"
            x1={Math.min(dragStart, dragEnd)}
            x2={Math.max(dragStart, dragEnd)}
            fill="var(--color-primary)"
            fillOpacity={0.14}
          />
        ) : null}
        {activeChannels.map((channel) => {
          const colorIdx = colorIndexByKey.get(channel.key) ?? 0;
          const axisId = rightUnit && channel.unit === rightUnit ? "right" : "left";
          return (
            <Line
              key={channel.key}
              yAxisId={axisId}
              type="monotone"
              dataKey={channel.key}
              name={formatSensorChannelLabel(channel.label, channel.key, channel.unit)}
              stroke={sensorChartColor(colorIdx)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3.5 }}
              connectNulls
              isAnimationActive={false}
            />
          );
        })}
        {compareChannel ? (
          <Line
            key={COMPARE_KEY}
            yAxisId={compareAxisId}
            type="monotone"
            dataKey={COMPARE_KEY}
            name={`${compareChannel.sensorName} · ${compareChannel.label}`}
            stroke="var(--color-accent)"
            strokeWidth={1.8}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 3.5 }}
            connectNulls
            isAnimationActive={false}
          />
        ) : null}
      </LineChart>
    </ResponsiveContainer>
  );
}
