import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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
   *
   * Quando informado, o componente TAMBÉM liga cada aba ao painel via
   * `aria-controls="{prefix}-panel"` — os 8 chamadores de produção seguem essa
   * convenção de id para o painel.
   */
  panelIdPrefix?: string;
}

/**
 * Barra de abas padronizada do sistema (linha única com borda inferior ativa).
 * Presentational: o estado ativo fica com quem chama.
 *
 * Mobile (a barra pode ter mais abas do que cabe na tela — o detalhe do agente
 * tem 13): a barra rola horizontalmente e, agora,
 *   1. centraliza a aba ativa no scroll ao abrir (deep link `?tab=...` deixava a
 *      aba ativa escondida fora da janela visível — o operador não via onde estava);
 *   2. mostra um degradê nas bordas quando existe conteúdo escondido, que era a
 *      única pista faltante de que há mais abas para os lados;
 *   3. mantém 44px de altura no toque (< sm), o mínimo recomendado em mobile.
 * O scroll é sempre LIMITADO à própria barra (`scrollTo`), nunca
 * `scrollIntoView` — que podia arrastar ancestrais roláveis junto.
 */
export function DetailTabs<Id extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  panelIdPrefix,
}: DetailTabsProps<Id>) {
  const generatedId = useId();
  // Prefixo vazio conta como ausente: `panelIdPrefix=""` geraria ids
  // "-tab-x"/"-panel" e um aria-controls apontando para o nada.
  const hasStablePrefix = panelIdPrefix !== undefined && panelIdPrefix.trim().length > 0;
  const prefix = hasStablePrefix ? panelIdPrefix : generatedId;
  const tabId = (id: Id) => `${prefix}-tab-${id}`;

  const listRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  /** Recalcula quais degradês de borda devem aparecer. */
  const syncEdges = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const maxScroll = list.scrollWidth - list.clientWidth;
    const start = list.scrollLeft > 1;
    const end = maxScroll > 1 && list.scrollLeft < maxScroll - 1;
    setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
  }, []);

  /**
   * Centraliza uma aba dentro da PRÓPRIA barra. Usa a diferença entre os
   * retângulos (e não `offsetLeft`, que depende do offsetParent) para ser
   * imune ao aninhamento de cada página.
   */
  const centerTab = useCallback(
    (id: Id, behavior: ScrollBehavior = 'smooth') => {
      const list = listRef.current;
      if (!list) return;
      // Id montado aqui dentro (em vez de chamar `tabId`) para o useCallback
      // depender só de `prefix`: com `tabId` nas deps, `centerTab` mudaria de
      // identidade a cada render e o efeito de centralização rodaria sempre —
      // brigando com a rolagem manual do usuário.
      const tab = document.getElementById(`${prefix}-tab-${id}`);
      // Só mexe se a aba é filha direta desta barra: ids com prefixo estável
      // podem colidir entre duas barras da mesma página.
      if (!tab || tab.parentElement !== list) return;
      const listRect = list.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      const maxScroll = list.scrollWidth - list.clientWidth;
      if (maxScroll <= 0) return;
      const delta = tabRect.left - listRect.left - (list.clientWidth - tabRect.width) / 2;
      const left = Math.min(Math.max(0, list.scrollLeft + delta), maxScroll);
      list.scrollTo({ left, behavior });
    },
    [prefix],
  );

  // Mantém os degradês coerentes com o conteúdo/scroll atuais.
  useEffect(() => {
    syncEdges();
    const list = listRef.current;
    if (!list) return;
    list.addEventListener('scroll', syncEdges, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncEdges) : null;
    observer?.observe(list);
    return () => {
      list.removeEventListener('scroll', syncEdges);
      observer?.disconnect();
    };
  }, [syncEdges, tabs.length]);

  // Ao trocar de aba (inclusive no primeiro render, com deep link) a aba ativa
  // vai para o centro da barra. No primeiro render sem animação, para a página
  // não "pular" ao abrir.
  const centeredOnceRef = useRef(false);
  useEffect(() => {
    // 'instant' explícito (e não 'auto'): com scroll-behavior no CSS, o 'auto'
    // herdaria a animação e a barra "deslizaria" sozinha ao abrir a página.
    centerTab(active, centeredOnceRef.current ? 'smooth' : 'instant');
    centeredOnceRef.current = true;
    syncEdges();
  }, [active, centerTab, syncEdges]);

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
    centerTab(target.id);
    document.getElementById(tabId(target.id))?.focus();
  };

  return (
    <div className="relative min-w-0">
      <div
        ref={listRef}
        id={`${prefix}-tablist`}
        role="tablist"
        aria-label={ariaLabel}
        className="flex flex-nowrap gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map(({ id, label, icon, badge }, index) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              id={tabId(id)}
              type="button"
              role="tab"
              // Liga a aba ao painel correspondente. Só quando o chamador declarou
              // o prefixo ESTÁVEL: é ele que garante que existe um elemento com o
              // id `${prefix}-panel` (o painel é renderizado pelo chamador e aponta
              // de volta com aria-labelledby). Sem o prefixo, `${prefix}` seria o id
              // gerado pelo useId — que o chamador não conhece — e o atributo
              // apontaria para algo inexistente, pior que não ter o atributo.
              aria-controls={hasStablePrefix ? `${prefix}-panel` : undefined}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => {
                onChange(id);
                centerTab(id);
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={[
                // min-h-11 garante alvo de toque de 44px no mobile; a partir de
                // sm a altura volta a ser a compacta do design desktop.
                'relative flex-none whitespace-nowrap inline-flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-0',
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

      {/* Pistas de rolagem: só aparecem quando há abas escondidas para aquele lado. */}
      {edges.start && (
        <div
          aria-hidden="true"
          data-testid="detail-tabs-fade-start"
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent"
        />
      )}
      {edges.end && (
        <div
          aria-hidden="true"
          data-testid="detail-tabs-fade-end"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent"
        />
      )}
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
