import type { ReactNode } from "react";
import { Card, CardHeader, PageHeader } from "@/components/ui";

interface ConfigurationPageHeaderProps {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  /** Trilha de navegação exibida acima do título. */
  breadcrumb?: ReactNode;
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
  breadcrumb,
}: ConfigurationPageHeaderProps) {
  // Reutiliza o cabeçalho padrão do app (mesma tipografia/espaçamento das demais telas).
  return (
    <PageHeader title={title} description={subtitle} breadcrumb={breadcrumb}>
      {actions}
    </PageHeader>
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
