import { memo, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: ReactNode;
  tone?: 'primary' | 'accent' | 'success' | 'warning';
  onClick?: () => void;
  active?: boolean;
}

const toneMap: Record<NonNullable<StatCardProps['tone']>, { bg: string; icon: string }> = {
  primary: { bg: 'bg-primary/15', icon: 'text-primary' },
  accent: { bg: 'bg-accent/15', icon: 'text-accent' },
  success: { bg: 'bg-success/15', icon: 'text-success' },
  warning: { bg: 'bg-warning/15', icon: 'text-warning' },
};

export const StatCard = memo(function StatCard({ icon: Icon, label, value, trend, tone = 'primary', onClick, active = false }: StatCardProps) {
  const styles = toneMap[tone];
  const baseClassName = 'glass-card flex items-center gap-4 rounded-xl border border-border bg-surface p-5 h-full';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`${baseClassName} cursor-pointer text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface-light/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${active ? 'border-primary/40 bg-surface-light/80 ring-1 ring-primary/30' : ''}`}
      >
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${styles.bg} ring-1 ring-white/5`}>
          <Icon className={`h-6 w-6 ${styles.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
          <p className="text-xl font-bold text-foreground tabular-nums [overflow-wrap:anywhere] sm:text-2xl">{value}</p>
        </div>
        {trend && <div className="text-sm">{trend}</div>}
      </button>
    );
  }

  return (
    <div className={baseClassName}>
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${styles.bg} ring-1 ring-border`}>
        <Icon className={`h-6 w-6 ${styles.icon}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
        <p className="text-xl font-bold text-foreground tabular-nums [overflow-wrap:anywhere] sm:text-2xl">{value}</p>
      </div>
      {trend && <div className="text-sm">{trend}</div>}
    </div>
  );
});
