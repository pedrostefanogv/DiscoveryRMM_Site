import type { SensorStatus } from "@/api";

interface SensorSparklineProps {
  /** Amostras na ordem cronológica (a última é a mais recente). */
  values: number[];
  width?: number;
  height?: number;
  /** Cor pela saúde do sensor (mesma paleta do badge). */
  status?: SensorStatus;
  /** Coleta atrasada: a linha fica neutra para não sugerir saúde atual. */
  isStale?: boolean;
  title?: string;
  className?: string;
}

/** Cor do traço conforme o status (token do tema via currentColor). */
function toneClass(status: SensorStatus): string {
  switch (status) {
    case "Passing":
      return "text-success";
    case "Warning":
      return "text-warning";
    case "Failing":
      return "text-danger";
    default:
      return "text-muted";
  }
}

/**
 * Sparkline em SVG puro (sem dependência de gráfico — o recharts é carregado
 * sob demanda só no modal de série). Com menos de 2 pontos não há tendência a
 * desenhar: devolve null e a célula fica sem o gráfico.
 */
export default function SensorSparkline({
  values,
  width = 72,
  height = 22,
  status = "Unknown",
  isStale = false,
  title,
  className = "",
}: SensorSparklineProps) {
  const points = values.filter((value) => Number.isFinite(value));
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  // Série constante: span 0 dividiria por zero — desenha a linha no meio.
  const span = max - min || 1;
  const padding = 2;
  const usableHeight = Math.max(1, height - padding * 2);
  const stepX = width / (points.length - 1);
  const polyline = points
    .map((value, index) => {
      const x = index * stepX;
      const y = padding + (1 - (value - min) / span) * usableHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const tone = isStale ? "text-muted" : toneClass(status);

  return (
    <svg
      role="img"
      aria-label={title ?? "Tendência do sensor"}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`${tone} ${className}`}
      data-status={status}
    >
      {title ? <title>{title}</title> : null}
      <polyline
        points={polyline}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
