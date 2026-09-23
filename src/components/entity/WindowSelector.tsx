import type { DashboardWindow } from '@/api/dashboard';

export const DASHBOARD_WINDOWS: { value: DashboardWindow; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

export function normalizeDashboardWindow(value: string | null): DashboardWindow {
  if (value === '7d' || value === '30d') return value;
  return '24h';
}

interface WindowSelectorProps {
  value: DashboardWindow;
  onChange: (value: DashboardWindow) => void;
}

/** Seletor de janela de tempo padronizado (ClientDetail e SiteDetail). */
export function WindowSelector({ value, onChange }: WindowSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Janela de tempo"
      className="inline-flex w-fit rounded-xl border border-border bg-surface-light p-1"
    >
      {DASHBOARD_WINDOWS.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={[
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              active ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-foreground',
            ].join(' ')}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
