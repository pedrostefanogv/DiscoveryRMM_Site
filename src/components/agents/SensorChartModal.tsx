import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Icon, Loading, Modal } from "@/components/ui";
import type { SensorItem, SensorSeries } from "@/api";
import { useSensorSeries } from "@/hooks/useSensorSeries";
import { describeSensorsError } from "@/api/sensors";
import {
  SENSOR_STATUS_META,
  downloadTextFile,
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

/**
 * Modal "Ver gráfico" da aba Sensores: série temporal por canal, limiares,
 * faixa de status, estatísticas e legenda. As faixas (1h..90d) são atalhos da
 * janela from/to enviada ao endpoint de série.
 */
export default function SensorChartModal({
  open,
  onClose,
  agentId,
  sensor,
}: SensorChartModalProps) {
  const [range, setRange] = useState<RangeKey>("24h");
  /**
   * "Agora" fixado na abertura/troca de faixa: a chave da query não pode mudar a
   * cada render, senão o gráfico refaz a consulta continuamente.
   */
  const [anchor, setAnchor] = useState(() => Date.now());

  useEffect(() => {
    if (open) setAnchor(Date.now());
  }, [open, range, sensor?.sensorId]);

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

  const series = useSensorSeries(agentId, sensor?.sensorId ?? "", params, open && Boolean(sensor));
  const data = series.data;

  // Exporta exatamente a série carregada (mesma janela/canais do gráfico): se o
  // usuário tem "6h" na tela, o CSV sai com 6h, não com todo o histórico.
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
          <button
            type="button"
            onClick={handleExport}
            disabled={!canExport}
            title="Baixa um CSV com os pontos exibidos nesta janela"
            className="ml-auto rounded-lg border border-border bg-surface-light px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Exportar CSV
          </button>
          {sensor?.targetKey ? (
            <span className="truncate font-mono text-xs text-muted" title={sensor.targetKey}>
              alvo: {sensor.targetKey}
            </span>
          ) : null}
        </div>

        {series.isLoading ? (
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
            <Suspense fallback={<Loading message="Carregando gráfico..." size="sm" />}>
              <SensorChartCanvas series={data} />
            </Suspense>
            <StatusStrip series={data} />
            <StatsTable series={data} />
            <ChannelLegend series={data} />
            <p className="flex items-center gap-2 text-xs text-muted">
              <Icon name="info" className="h-3.5 w-3.5" />
              Resolução {data.resolution} · passo de {data.stepSeconds}s · {formatSensorIntervalLabel(data)}
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

/** Barra colorida abaixo do eixo: um segmento por status observado. */
function StatusStrip({ series }: { series: SensorSeries }) {
  const from = new Date(series.from).getTime();
  const to = new Date(series.to).getTime();
  const span = to - from;
  if (!Number.isFinite(span) || span <= 0 || series.statusStrips.length === 0) return null;

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
      <p className="mt-1 text-[11px] text-muted">
        Faixa de status no período — verde OK, amarelo atenção, vermelho crítico.
      </p>
    </div>
  );
}

/** Estatísticas por canal (mín/média/máx/p95/último). */
function StatsTable({ series }: { series: SensorSeries }) {
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
          {series.channels.map((channel) => (
            <tr key={channel.key} className="border-b border-border last:border-b-0">
              <td className="px-3 py-1.5 text-foreground">
                {channel.label || channel.key}
                <span className="ml-1 text-muted">({sensorUnitSuffix(channel.unit) || "—"})</span>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Legenda com a cor exata de cada linha do gráfico. */
function ChannelLegend({ series }: { series: SensorSeries }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
      {series.channels.map((channel, index) => (
        <span key={channel.key} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: sensorChartColor(index) }}
            aria-hidden
          />
          {channel.label || channel.key}
        </span>
      ))}
      {series.warningThreshold !== null && series.warningThreshold !== undefined ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-warning" aria-hidden />
          limiar de atenção {formatSensorValue(series.warningThreshold, series.thresholdUnit)}
        </span>
      ) : null}
      {series.criticalThreshold !== null && series.criticalThreshold !== undefined ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-danger" aria-hidden />
          limiar crítico {formatSensorValue(series.criticalThreshold, series.thresholdUnit)}
        </span>
      ) : null}
    </div>
  );
}
