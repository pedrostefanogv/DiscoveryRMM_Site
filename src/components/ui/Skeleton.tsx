import type { ReactNode } from 'react';

type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'card';

interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string;
  height?: string;
  className?: string;
}

const variantClasses: Record<SkeletonVariant, string> = {
  text: 'h-4 rounded',
  circular: 'rounded-full',
  rectangular: 'rounded-lg',
  card: 'rounded-xl',
};

export function Skeleton({ variant = 'text', width, height, className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-shimmer bg-white/[0.03] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent bg-[length:400%_100%] ${variantClasses[variant]} ${className}`}
      style={{ width, height: height ?? (variant === 'text' ? undefined : '100%') }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="surface-card rounded-2xl border border-white/10 bg-surface/90 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width="40px" height="40px" />
        <div className="flex-1 space-y-2">
          <Skeleton width="60%" />
          <Skeleton width="40%" />
        </div>
      </div>
      <Skeleton variant="rectangular" width="100%" height="8px" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton variant="rectangular" height="56px" />
        <Skeleton variant="rectangular" height="56px" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-surface">
      <div className="border-b border-white/5 bg-white/[0.02] px-4 py-3">
        <div className="flex gap-6">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} width={`${100 / cols}%`} />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-6 border-b border-white/5 px-4 py-3 last:border-b-0">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} width={`${100 / cols}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/5 bg-surface p-5">
      <Skeleton variant="circular" width="48px" height="48px" />
      <div className="flex-1 space-y-2">
        <Skeleton width="50%" />
        <Skeleton width="35%" height="28px" />
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton width="180px" height="32px" />
          <Skeleton width="140px" />
        </div>
        <Skeleton width="280px" height="36px" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

interface SkeletonListProps {
  title?: ReactNode;
  count?: number;
}

export function SkeletonList({ title, count = 3 }: SkeletonListProps) {
  return (
    <div className="space-y-4">
      {title}
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-white/5 bg-surface p-4">
            <Skeleton variant="circular" width="36px" height="36px" />
            <div className="flex-1 space-y-2">
              <Skeleton width="45%" />
              <Skeleton width="65%" />
            </div>
            <Skeleton width="60px" height="24px" />
          </div>
        ))}
      </div>
    </div>
  );
}
