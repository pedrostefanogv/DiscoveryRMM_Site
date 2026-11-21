import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type MaterialSymbolName } from "@/components/ui";

export interface DetailTab<Id extends string> {
  id: Id;
  label: string;
  icon: MaterialSymbolName;
  /**
   * Contador/rótulo curto exibido ao lado do texto (ex.: quantidade de itens).
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
   */
  panelIdPrefix?: string;
}

/**
 * Barra de abas padronizada do sistema (linha única com borda inferior ativa).
 * Presentational: o estado ativo fica com quem chama.
 */
export function DetailTabs<Id extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  panelIdPrefix,
}: DetailTabsProps<Id>) {
  const generatedId = useId();
  const prefix = panelIdPrefix ?? generatedId;
  const tabId = (id: Id) => `${prefix}-tab-${id}`;

  const selectWithScroll = (id: Id) => {
    onChange(id);
    document.getElementById(tabId(id))?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  };

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
    selectWithScroll(target.id);
    document.getElementById(tabId(target.id))?.focus();
  };

  return (
    <div
      id={`${prefix}-tablist`}
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-nowrap overflow-x-auto border-b border-border gap-1"
    >
      {tabs.map(({ id, label, icon, badge }, index) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            id={tabId(id)}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => selectWithScroll(id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={[
              'relative flex-none whitespace-nowrap inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              isActive
                ? 'text-primary after:absolute after:inset-x-0 after:bottom-0 after:border-b-2 after:border-primary'
                : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            <Icon name={icon} className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
            {badge !== undefined && badge !== null ? (
              <span className="rounded-full bg-surface-light px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
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
