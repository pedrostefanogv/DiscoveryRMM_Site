import { Icon } from "@/components/ui";
import type { SensorStatus } from "@/api";
import { sensorStatusMeta } from "./sensorUtils";

interface SensorStatusBadgeProps {
  status: SensorStatus;
  /**
   * Coleta atrasada (mais de N× o intervalo sem resultado). Muda o rótulo para
   * "Sem dados recentes" — menos para Crítico, que continua crítico.
   */
  isStale?: boolean;
  /** Só o ponto colorido (sem badge), para células onde o texto é redundante. */
  dotOnly?: boolean;
  className?: string;
}

/**
 * Estado do sensor com o ponto colorido do padrão dos painéis do agente
 * (mesmo formato de HEALTH_DOT_CLASSES em AgentWindowsUpdatesPanel).
 */
export default function SensorStatusBadge({
  status,
  isStale = false,
  dotOnly = false,
  className = "",
}: SensorStatusBadgeProps) {
  const meta = sensorStatusMeta(status, isStale);
  const dot = (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${meta.dotClass}`}
      aria-hidden
    />
  );

  if (dotOnly) {
    return (
      <span
        className={`inline-flex items-center ${className}`}
        title={meta.label}
        aria-label={`Estado: ${meta.label}`}
      >
        {dot}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {dot}
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeTone(meta.color)}`}
      >
        <Icon name={meta.icon} className="h-3.5 w-3.5" />
        {meta.label}
      </span>
    </span>
  );
}

/** Mesmas classes do Badge do kit — replicadas aqui para colocar o ícone. */
function badgeTone(color: "success" | "warning" | "danger" | "slate"): string {
  switch (color) {
    case "success":
      return "bg-success/20 text-success";
    case "warning":
      return "bg-warning/20 text-warning";
    case "danger":
      return "bg-danger/20 text-danger";
    default:
      return "bg-surface-light text-muted-foreground border border-border";
  }
}
