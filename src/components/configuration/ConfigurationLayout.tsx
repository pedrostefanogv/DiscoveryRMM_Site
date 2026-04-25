import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui";

interface ConfigurationPageHeaderProps {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}

interface ConfigurationSectionCardProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  iconClassName: string;
  children: ReactNode;
}

export function ConfigurationPageHeader({
  title,
  subtitle,
  actions,
}: ConfigurationPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function ConfigurationSectionCard({
  title,
  subtitle,
  icon,
  iconClassName,
  children,
}: ConfigurationSectionCardProps) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Card>
  );
}
