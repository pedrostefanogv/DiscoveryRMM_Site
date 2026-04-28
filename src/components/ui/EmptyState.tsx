import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-16 px-4 ${className}`}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03] ring-1 ring-white/5">
        <Icon className="h-8 w-8 text-slate-500" strokeWidth={1.5} />
      </div>
      <div className="text-center space-y-1">
        <p className="text-base font-medium text-slate-300">{title}</p>
        {description && (
          <p className="text-sm text-slate-500 max-w-sm">{description}</p>
        )}
      </div>
      {action && (
        <Button variant="secondary" onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      )}
    </div>
  );
}
