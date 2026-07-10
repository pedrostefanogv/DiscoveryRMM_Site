import { memo, type ReactNode } from 'react';

type MetricBarColor = 'success' | 'warning' | 'danger' | 'primary' | 'accent';

interface MetricBarProps {
  /** Label displayed on the left */
  label: string;
  /** Current value (0-100) */
  value: number | undefined | null;
  /** Optional suffix (e.g. "%") */
  suffix?: string;
  /** Whether value should be hidden (e.g. for sparkline-only) */
  hideValue?: boolean;
  /** Custom color — auto-calculated from value if not provided */
  color?: MetricBarColor;
  /** Optional icon to show before the label */
  icon?: ReactNode;
  /** Optional subtitle (shown right below the label, extra info) */
  subtitle?: string;
  /** Compact mode — smaller bars for table/list views */
  compact?: boolean;
  /** Custom class */
  className?: string;
}

const colorStyles: Record<MetricBarColor, { bar: string; bg: string; text: string }> = {
  success: { bar: 'bg-success', bg: 'bg-success/20', text: 'text-success' },
  warning: { bar: 'bg-warning', bg: 'bg-warning/20', text: 'text-warning' },
  danger: { bar: 'bg-danger', bg: 'bg-danger/20', text: 'text-danger' },
  primary: { bar: 'bg-primary', bg: 'bg-primary/20', text: 'text-primary' },
  accent: { bar: 'bg-accent', bg: 'bg-accent/20', text: 'text-accent' },
};

function autoColor(value: number | undefined | null): MetricBarColor {
  if (value == null) return 'primary';
  if (value >= 90) return 'danger';
  if (value >= 70) return 'warning';
  return 'success';
}

function formatMetricValue(value: number | undefined | null): string {
  if (value == null) return '\u2014';
  if (!Number.isFinite(value)) return '\u2014';
  return String(Math.round(value));
}

export const MetricBar = memo(function MetricBar({
  label,
  value,
  suffix = '%',
  hideValue = false,
  color,
  icon,
  subtitle,
  compact = false,
  className = '',
}: MetricBarProps) {
  const resolvedColor = color ?? autoColor(value);
  const styles = colorStyles[resolvedColor];
  const displayValue = formatMetricValue(value);
  const barWidth = value != null && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`} title={`${label}: ${displayValue}${suffix}`}>
        {icon && <span className="shrink-0 text-muted">{icon}</span>}
        <span className="shrink-0 text-xs text-muted min-w-[2rem]">{label}</span>
        <div className={`h-1.5 flex-1 overflow-hidden rounded-full ${styles.bg}`}>
          <div
            className={`h-full rounded-full ${styles.bar} transition-all duration-500`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        {!hideValue && (
          <span className={`shrink-0 text-xs font-medium tabular-nums ${styles.text}`}>
            {displayValue}{suffix}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-muted">{icon}</span>}
          <span className="text-xs text-muted">{label}</span>
          {subtitle && <span className="text-[10px] text-muted">{subtitle}</span>}
        </div>
        {!hideValue && (
          <span className={`text-xs font-semibold tabular-nums ${styles.text}`}>
            {displayValue}{suffix}
          </span>
        )}
      </div>
      <div className={`h-2 overflow-hidden rounded-full ${styles.bg}`}>
        <div
          className={`h-full rounded-full ${styles.bar} transition-all duration-500 ease-out`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
});
