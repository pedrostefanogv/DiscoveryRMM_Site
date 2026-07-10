import { memo } from 'react';
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

export const EmptyState = memo(function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 py-16 px-4 ${className}`}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-light ring-1 ring-border">
        <Icon className="h-8 w-8 text-muted" strokeWidth={1.5} />
      </div>
      <div className="text-center space-y-1">
        <p className="text-base font-medium text-muted-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted max-w-sm">{description}</p>
        )}
      </div>
      {action && (
        <Button variant="secondary" onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      )}
    </div>
  );
});
