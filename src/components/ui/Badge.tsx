import { memo, type ReactNode } from 'react';

type BadgeColor = 'primary' | 'success' | 'warning' | 'danger' | 'slate' | 'accent';

interface BadgeProps {
  children: ReactNode;
  color?: BadgeColor;
  className?: string;
}

const colors: Record<BadgeColor, string> = {
  primary: 'bg-primary/20 text-primary',
  success: 'bg-success/20 text-success',
  warning: 'bg-warning/20 text-warning',
  danger: 'bg-danger/20 text-danger',
  slate: 'bg-surface-light text-muted-foreground border border-border',
  accent: 'bg-accent/20 text-accent',
};

export const Badge = memo(function Badge({ children, color = 'slate', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[color]} ${className}`}
    >
      {children}
    </span>
  );
});
