import { useId, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface DetailTab<Id extends string> {
  id: Id;
  label: string;
  icon: LucideIcon;
  /**
   * Contador/rótulo curto exibido ao lado do texto (ex.: quantidade de itens).
   * Opcional: as abas de Clientes/Sites usam só texto.
   */
  badge?: ReactNode;
}

interface DetailTabsProps<Id extends string> {
  tabs: ReadonlyArray<DetailTab<Id>>;
  active: Id;
  onChange: (id: Id) => void;
  /** Rótulo acessível do tablist (ex.: "Seções do cliente"). */
  ariaLabel: string;
  /**
   * Prefixo estável usado para os ids de aba e do painel, permitindo ao
   * chamador apontar `aria-labelledby`/scroll para o painel ativo.
   * Ex.: prefix "client-tabs" -> aba "client-tabs-tab-sites" e painel
   * "client-tabs-panel".
   */
  panelIdPrefix?: string;
}

/**
 * Barra de abas em "segmented control", no mesmo estilo visual usado em
 * DepartmentDetailPage (Geral / Campos customizados / Equipe).
 * Presentational: o estado ativo fica com quem chama.
 */
export function DetailTabs<Id extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  panelIdPrefix,
}: DetailTabsProps<Id>) {
  // Fallback de id para quando o chamador não informa um prefixo estável.
  const generatedId = useId();
  const prefix = panelIdPrefix ?? generatedId;
  const tabId = (id: Id) => `${prefix}-tab-${id}`;
  const panelId = `${prefix}-panel`;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (tabs.length === 0) return;

    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight') targetIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') targetIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') targetIndex = 0;
    else if (event.key === 'End') targetIndex = tabs.length - 1;

    if (targetIndex === null) return;

    event.preventDefault();
    const target = tabs[targetIndex];
    onChange(target.id);
    document.getElementById(tabId(target.id))?.focus();
  };

  return (
    <div
      id={`${prefix}-tablist`}
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap rounded-xl border border-border bg-surface-light p-1"
    >
      {tabs.map(({ id, label, icon: Icon, badge }, index) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            id={tabId(id)}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={panelId}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-primary/20 text-foreground' : 'text-muted hover:text-foreground'}`}
          >
            <Icon className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
            {label}
            {badge !== undefined && badge !== null ? (
              <span className="ml-1.5 rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Normaliza o slug lido da querystring (?tab=...). Valores desconhecidos ou
 * ausentes caem no fallback, para que uma URL inválida nunca quebre a página.
 */
export function resolveDetailTab<Id extends string>(
  value: string | null,
  ids: readonly Id[],
  fallback: Id,
): Id {
  return value !== null && (ids as readonly string[]).includes(value) ? (value as Id) : fallback;
}
