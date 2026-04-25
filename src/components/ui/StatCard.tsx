import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: ReactNode;
  tone?: 'primary' | 'accent' | 'success' | 'warning';
}

const toneMap: Record<NonNullable<StatCardProps['tone']>, { bg: string; icon: string }> = {
  primary: { bg: 'bg-primary/15', icon: 'text-primary' },
  accent: { bg: 'bg-accent/15', icon: 'text-accent' },
  success: { bg: 'bg-success/15', icon: 'text-success' },
  warning: { bg: 'bg-warning/15', icon: 'text-warning' },
};

export function StatCard({ icon: Icon, label, value, trend, tone = 'primary' }: StatCardProps) {
  const styles = toneMap[tone];

  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/5 bg-surface p-5">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${styles.bg}`}>
        <Icon className={`h-6 w-6 ${styles.icon}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
      {trend && <div className="text-sm">{trend}</div>}
    </div>
  );
}
