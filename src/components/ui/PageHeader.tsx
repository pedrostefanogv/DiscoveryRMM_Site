import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
  /** Quando informado, renderiza um botão de voltar acessível antes do título. */
  onBack?: () => void;
  backLabel?: string;
  /** Trilha de navegação exibida acima do título (ex.: Clientes / Acme / Matriz). */
  breadcrumb?: ReactNode;
}

export function PageHeader({
  title,
  description,
  children,
  onBack,
  backLabel = 'Voltar',
  breadcrumb,
}: PageHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-surface-light hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {breadcrumb && <nav aria-label="Trilha de navegação" className="mb-1 text-xs text-muted">{breadcrumb}</nav>}
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
