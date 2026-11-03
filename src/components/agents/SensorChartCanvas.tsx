import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SensorSeries } from "@/api";
import { sensorChartColor, sensorUnitSuffix } from "./sensorUtils";

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

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string | null;
  color?: string;
}

/** Tooltip próprio: mostra valor + unidade do canal e o instante completo. */
function ChartTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number | string;
  series: SensorSeries;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const timestamp = Number(label);
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-foreground">
        {Number.isNaN(timestamp) ? "—" : new Date(timestamp).toLocaleString("pt-BR")}
      </p>
      {payload.map((entry) => {
        const channel = series.channels.find((item) => item.key === entry.dataKey);
        const value = typeof entry.value === "number" ? entry.value : Number(entry.value);
        return (
          <p key={String(entry.dataKey)} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span>{channel?.label ?? String(entry.dataKey)}:</span>
            <span className="font-medium text-foreground">
              {Number.isFinite(value)
                ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}${
                    channel ? sensorUnitSuffix(channel.unit) : ""
                  }`
                : "—"}
            </span>
          </p>
        );
      })}
    </div>
  );
}

/**
 * Gráfico da série temporal do sensor (recharts).
 *
 * Este módulo é carregado SOB DEMANDA pelo SensorChartModal (React.lazy): o
 * recharts só entra no bundle de quem abre o gráfico, não no da aba.
 */
export default function SensorChartCanvas({ series, height = 260 }: SensorChartCanvasProps) {
  const rows = useMemo<ChartRow[]>(() => {
    const byTimestamp = new Map<number, ChartRow>();
    for (const channel of series.channels) {
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
    return Array.from(byTimestamp.values()).sort((a, b) => a.t - b.t);
  }, [series.channels]);

  const spanMs = useMemo(() => {
    const from = new Date(series.from).getTime();
    const to = new Date(series.to).getTime();
    return Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, to - from) : 0;
  }, [series.from, series.to]);

  const hasValue = rows.some((row) =>
    series.channels.some((channel) => typeof row[channel.key] === "number"),
  );
  if (!hasValue) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        Nenhuma amostra numérica nesta janela.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 20, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(value) => formatTick(Number(value), spanMs)}
          stroke="var(--color-muted)"
          tick={{ fontSize: 11, fill: "var(--color-muted)" }}
        />
        <YAxis
          domain={["auto", "auto"]}
          stroke="var(--color-muted)"
          tick={{ fontSize: 11, fill: "var(--color-muted)" }}
          width={56}
          tickFormatter={(value) =>
            new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Number(value))
          }
        />
        <Tooltip content={<ChartTooltip series={series} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.warningThreshold !== null && series.warningThreshold !== undefined ? (
          <ReferenceLine
            y={series.warningThreshold}
            stroke="var(--color-warning)"
            strokeDasharray="4 4"
            label={{ value: "atenção", position: "insideTopRight", fontSize: 10, fill: "var(--color-warning)" }}
          />
        ) : null}
        {series.criticalThreshold !== null && series.criticalThreshold !== undefined ? (
          <ReferenceLine
            y={series.criticalThreshold}
            stroke="var(--color-danger)"
            strokeDasharray="4 4"
            label={{ value: "crítico", position: "insideTopRight", fontSize: 10, fill: "var(--color-danger)" }}
          />
        ) : null}
        {series.channels.map((channel, index) => (
          <Line
            key={channel.key}
            type="monotone"
            dataKey={channel.key}
            name={`${channel.label || channel.key} (${sensorUnitSuffix(channel.unit) || "valor"})`}
            stroke={sensorChartColor(index)}
            strokeWidth={1.8}
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
