import { Icon } from "./Icon";

/**
 * Componente compartilhado de paginação — o rodapé padrão usado pelo
 * `DataTable` e por listas server-side paginadas.
 *
 * Formato único: à esquerda o resumo ("Mostrando X–Y de Z" quando há total
 * conhecido; caso contrário "Página N de M" + contagem da página), à direita
 * os botões primeira/anterior/próxima/última.
 */
interface PaginationProps {
  /** Página atual (1-based). */
  page: number;
  /** Total de páginas (mínimo 1). */
  totalPages: number;
  /** Callback de mudança de página (recebe a página destino, já limitada). */
  onPageChange: (page: number) => void;
  /**
   * Total de itens da lista. Quando informado junto com `pageSize`, o resumo
   * vira "Mostrando X–Y de Z".
   */
  totalItems?: number;
  /** Itens por página (server-side pode diferir do último). */
  pageSize?: number;
  /** Rótulo do item (ex.: "atualização"). Usado quando não há total conhecido. */
  itemLabel?: string;
  /**
   * Modo cursor (server-side sem total): sem `totalPages` confiável. Mostra
   * "Página N" e habilita "Próxima" somente quando `hasNext` for verdadeiro.
   * Quando usado, ignora totalPages/primeira/última.
   */
  cursor?: { hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void; loading?: boolean };
  /**
   * Exibe os botões de primeira/última página (padrão: sim). Desative em
   * listas com navegação por cursor, onde só existe anterior/próxima.
   */
  showFirstLast?: boolean;
  className?: string;
}

const navButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-light hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors';

export function Pagination(props: PaginationProps) {
  const { page, totalPages, onPageChange, totalItems, pageSize, itemLabel, showFirstLast = true, cursor, className = '' } = props;

  if (cursor) {
    return (
      <div className={`flex items-center justify-between text-sm ${className}`}>
        <p className="text-muted tabular-nums">Página {page}{itemLabel ? ` · ${itemLabel}` : ''}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={cursor.onPrev}
            disabled={!cursor.hasPrev || cursor.loading}
            className={navButtonClass}
            aria-label="Página anterior"
          >
            <Icon name="chevron_left" className="h-4 w-4" />
          </button>
          <span className="px-2 text-muted tabular-nums">{page}</span>
          <button
            type="button"
            onClick={cursor.onNext}
            disabled={!cursor.hasNext || cursor.loading}
            className={navButtonClass}
            aria-label="Próxima página"
          >
            <Icon name="chevron_right" className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // Saneamento: totalPages/page podem chegar como NaN/Infinity quando a API
  // ainda não respondeu (ex.: totalCount indefinido). Sem isso o rodapé
  // exibiria "Página NaN de NaN".
  const rawTotalPages = Number.isFinite(totalPages) ? totalPages : 1;
  const rawPage = Number.isFinite(page) ? page : 1;
  const safeTotalPages = Math.max(1, rawTotalPages);
  const safePage = Math.min(Math.max(1, rawPage), safeTotalPages);

  const hasRange = typeof totalItems === 'number' && typeof pageSize === 'number' && pageSize > 0;
  const summary = hasRange
    ? totalItems! === 0
      ? 'Nenhum item'
      : `Mostrando ${(safePage - 1) * pageSize! + 1}–${Math.min(safePage * pageSize!, totalItems!)} de ${totalItems!}`
    : `Página ${safePage} de ${safeTotalPages}${itemLabel ? ` · ${itemLabel}` : ''}`;

  return (
    <div className={`flex items-center justify-between text-sm ${className}`}>
      <p className="text-muted tabular-nums">{summary}</p>
      <div className="flex items-center gap-1">
        {showFirstLast && (
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={safePage === 1}
            className={navButtonClass}
            aria-label="Primeira página"
          >
            <Icon name="keyboard_double_arrow_left" className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage === 1}
          className={navButtonClass}
          aria-label="Página anterior"
        >
          <Icon name="chevron_left" className="h-4 w-4" />
        </button>
        <span className="px-2 text-muted tabular-nums">
          {safePage} / {safeTotalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
          disabled={safePage === safeTotalPages}
          className={navButtonClass}
          aria-label="Próxima página"
        >
          <Icon name="chevron_right" className="h-4 w-4" />
        </button>
        {showFirstLast && (
          <button
            type="button"
            onClick={() => onPageChange(safeTotalPages)}
            disabled={safePage === safeTotalPages}
            className={navButtonClass}
            aria-label="Última página"
          >
            <Icon name="keyboard_double_arrow_right" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
