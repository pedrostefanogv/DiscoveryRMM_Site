import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Icon } from "@/components/ui";

import { EmptyState } from './EmptyState';
import { Pagination } from './Pagination';

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  sortKey?: string;
  /**
   * Valor usado na ordenação. Sem ele, o DataTable tenta `item[sortKey ?? key]` —
   * o que falha silenciosamente quando a coluna renderiza um campo com outro
   * nome (ex.: coluna "action" que lê `actionType`). Devolver `null`/`undefined`
   * trata o item como vazio.
   */
  sortValue?: (item: T) => string | number | Date | null | undefined;
  /**
   * Largura CSS da coluna (ex.: '30%'). Só tem efeito com `fixedLayout`, quando
   * a tabela respeita as larguras e trunca o conteúdo em vez de crescer para os
   * lados com valores longos (caminhos de registro, gatilhos etc.).
   */
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  onRowContextMenu?: (event: MouseEvent<HTMLTableRowElement>, item: T) => void;
  rowHoverCard?: (item: T) => React.ReactNode;
  rowHoverDelayMs?: number;
  onRowHoverCardChange?: (item: T | null) => void;
  emptyMessage?: string;
  emptyIcon?: string;
  pageSize?: number;
  showPagination?: boolean;
  /**
   * Altura máxima da área de rolagem da tabela. Quando informada, a própria
   * tabela passa a rolar nos dois eixos (a barra horizontal fica fixa no
   * rodapé da área), impedindo que a página cresça para exibir o conteúdo.
   */
  maxHeight?: string;
  /**
   * Usa layout fixo (`table-fixed`): as larguras definidas em `Column.width`
   * são respeitadas e o conteúdo longo é truncado/contido, evitando que a
   * tabela estique horizontalmente em telas pequenas.
   */
  fixedLayout?: boolean;
  /**
   * Remove o contêiner arredondado/borda própria da tabela. Use quando ela é
   * embutida num card que já tem barras acima/abaixo (paginação): assim o
   * cabeçalho alinha com as linhas em vez de ficar com os cantos "soltos".
   */
  flush?: boolean;
  /** Ordenação inicial da tabela (o usuário pode trocar clicando no cabeçalho). */
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  key: string;
  direction: SortDirection;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  onRowContextMenu,
  rowHoverCard,
  rowHoverDelayMs = 1200,
  onRowHoverCardChange,
  emptyMessage = 'Nenhum registro encontrado',
  pageSize = 20,
  showPagination = true,
  maxHeight,
  fixedLayout = false,
  flush = false,
  defaultSort,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(() => {
    if (!defaultSort) return null;
    // Aceita tanto a `key` da coluna quanto o `sortKey` resolvido: sem isso, um
    // defaultSort apontando para uma coluna com sortKey diferente era ignorado.
    const col = columns.find(
      (c) => c.key === defaultSort.key || (c.sortKey ?? c.key) === defaultSort.key,
    );
    return {
      key: col ? col.sortKey ?? col.key : defaultSort.key,
      direction: defaultSort.direction,
    };
  });
  const [page, setPage] = useState(1);
  const [activeHover, setActiveHover] = useState<{ key: string; item: T } | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const sorted = useMemo(() => {
    if (!sort || !sort.key || !sort.direction) return data;
    const col = columns.find(c => (c.sortKey ?? c.key) === sort.key);
    if (!col) return data;

    const valueOf = (item: T): string | number => {
      if (col.sortValue) {
        const raw = col.sortValue(item);
        if (raw === null || raw === undefined) return '';
        if (raw instanceof Date) return raw.getTime();
        return typeof raw === 'number' ? raw : String(raw);
      }
      return String((item as Record<string, unknown>)[col.sortKey ?? col.key] ?? '');
    };

    return [...data].sort((a, b) => {
      const valA = valueOf(a);
      const valB = valueOf(b);
      const cmp =
        typeof valA === 'number' && typeof valB === 'number'
          ? valA - valB
          : String(valA).localeCompare(String(valB), 'pt-BR', { sensitivity: 'base', numeric: true });
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [data, sort, columns]);

  /**
   * Uma coluna só oferece ordenação se conseguir resolver um valor: sem
   * `sortValue`, a chave (`sortKey ?? key`) precisa existir no item. Sem isso,
   * colunas que renderizam valor derivado (ex.: "Ação" lendo `actionType`)
   * ficavam clicáveis e não ordenavam nada.
   */
  const canSortColumn = useCallback(
    (col: Column<T>) => {
      if (col.sortable === false) return false;
      if (col.sortValue) return true;
      const key = col.sortKey ?? col.key;
      return data.some((item) => (item as Record<string, unknown>)[key] !== undefined);
    },
    [data],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);

  // Quando um filtro reduz a lista, a página corrente pode ficar fora do
  // intervalo: normaliza o estado para não reabrir numa página vazia depois.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginated = showPagination ? sorted.slice((safePage - 1) * pageSize, safePage * pageSize) : sorted;

  const clearHoverTimeout = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const updateHoverPopoverPosition = useCallback(() => {
    if (!rowHoverCard || !activeHover) {
      setPopoverPosition(null);
      return;
    }

    const rowElement = rowRefs.current.get(activeHover.key);
    const containerElement = containerRef.current;
    if (!rowElement || !containerElement) {
      setPopoverPosition(null);
      return;
    }

    const offset = 10;
    const preferredWidth = 460;
    const containerRect = containerElement.getBoundingClientRect();
    const availableWidth = Math.max(260, containerRect.width - 16);
    const width = Math.min(preferredWidth, availableWidth);

    const rowRect = rowElement.getBoundingClientRect();
    const rowTop = rowRect.top - containerRect.top;
    const rowBottom = rowRect.bottom - containerRect.top;
    const estimatedHeight = popoverRef.current?.offsetHeight ?? 220;
    const viewportPadding = 12;

    const canShowBelow = rowRect.bottom + offset + estimatedHeight <= window.innerHeight - viewportPadding;
    const top = canShowBelow
      ? rowBottom + offset
      : Math.max(0, rowTop - estimatedHeight - offset);

    const left = Math.max(0, Math.min(rowRect.left - containerRect.left + 8, containerRect.width - width));

    setPopoverPosition({ top, left, width });
  }, [activeHover, rowHoverCard]);

  const closeHoverCard = () => {
    if (!rowHoverCard) return;
    clearHoverTimeout();
    setActiveHover((current) => {
      if (current?.key) {
        onRowHoverCardChange?.(null);
      }
      return null;
    });
    setPopoverPosition(null);
  };

  const handleRowMouseEnter = (item: T, rowKey: string) => {
    if (!rowHoverCard) return;

    clearHoverTimeout();

    setActiveHover((current) => {
      if (current && current.key !== rowKey) {
        onRowHoverCardChange?.(null);
        return null;
      }
      return current;
    });

    hoverTimeoutRef.current = setTimeout(() => {
      setActiveHover({ key: rowKey, item });
      onRowHoverCardChange?.(item);
      updateHoverPopoverPosition();
    }, rowHoverDelayMs);
  };

  const handleBodyMouseLeave = () => {
    clearHoverTimeout();
    closeHoverCard();
  };

  useEffect(() => {
    if (!rowHoverCard || !activeHover) return;

    const stillVisible = paginated.some((item) => keyExtractor(item) === activeHover.key);
    if (!stillVisible) {
      closeHoverCard();
    }
  }, [activeHover, closeHoverCard, keyExtractor, paginated, rowHoverCard]);

  useLayoutEffect(() => {
    if (!rowHoverCard || !activeHover) return;

    updateHoverPopoverPosition();
    const rafId = window.requestAnimationFrame(() => {
      updateHoverPopoverPosition();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [activeHover, rowHoverCard, updateHoverPopoverPosition]);

  useEffect(() => {
    if (!rowHoverCard || !activeHover) return;

    const handleViewportChange = () => {
      updateHoverPopoverPosition();
    };

    window.addEventListener('resize', handleViewportChange);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [activeHover, rowHoverCard, updateHoverPopoverPosition]);

  useEffect(() => {
    return () => {
      clearHoverTimeout();
    };
  }, []);

  const handleSort = (col: Column<T>) => {
    const key = col.sortKey ?? col.key;
    setSort(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        if (prev.direction === 'desc') return null;
        return { key, direction: 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, item: T) => {
    if (!onRowClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(item);
    }
  };

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <div ref={containerRef} className="relative space-y-3">
      <div className={`overflow-hidden bg-surface ${flush ? '' : 'rounded-xl border border-border'}`}>
        <div
          className="w-full max-w-full overflow-auto overscroll-auto"
          style={maxHeight ? { maxHeight } : undefined}
        >
          <table
            className={`w-full min-w-full text-left text-sm ${fixedLayout ? 'table-fixed' : ''}`}
            role="grid"
          >
            <caption className="sr-only">Tabela de dados</caption>
            <thead>
              <tr className="border-b border-border bg-surface-light">
                {columns.map(col => {
                  const sortable = canSortColumn(col);
                  const active = sortable && !!sort && sort.key === (col.sortKey ?? col.key) && sort.direction !== null;
                  return (
                    <th
                      key={col.key}
                      style={col.width ? { width: col.width } : undefined}
                      aria-sort={active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                      tabIndex={sortable ? 0 : undefined}
                      onKeyDown={(event) => {
                        if (!sortable) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSort(col);
                        }
                      }}
                      className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted ${fixedLayout ? 'overflow-hidden' : ''} ${col.className ?? ''} ${sortable ? 'cursor-pointer select-none hover:text-foreground transition-colors' : ''}`}
                      onClick={() => sortable && handleSort(col)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.header}
                        {active && (sort?.direction === 'asc' ? <Icon name="expand_less" className="h-3.5 w-3.5" /> : <Icon name="expand_more" className="h-3.5 w-3.5" />)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody onMouseLeave={handleBodyMouseLeave}>
              {paginated.map((item, idx) => {
                const rowKey = keyExtractor(item);
                const isHoverActive = !!rowHoverCard && activeHover?.key === rowKey;

                return (
                  <tr
                    key={rowKey}
                    ref={(node) => {
                      if (node) {
                        rowRefs.current.set(rowKey, node);
                        return;
                      }

                      rowRefs.current.delete(rowKey);
                    }}
                    onClick={() => onRowClick?.(item)}
                    onContextMenu={(event) => onRowContextMenu?.(event, item)}
                    onMouseEnter={() => handleRowMouseEnter(item, rowKey)}
                    onKeyDown={(event) => handleRowKeyDown(event, item)}
                    tabIndex={onRowClick ? 0 : -1}
                    className={`border-b border-border transition-colors last:border-b-0 ${
                      onRowClick ? 'cursor-pointer hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none' : idx % 2 === 1 ? 'bg-surface-light' : ''
                    } ${isHoverActive ? 'bg-surface-hover' : ''}`}
                  >
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-muted-foreground ${fixedLayout ? 'overflow-hidden' : ''} ${col.className ?? ''}`}
                      >
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {rowHoverCard && activeHover && popoverPosition && (
        <div
          ref={popoverRef}
          className="pointer-events-none absolute z-50"
          style={{
            top: popoverPosition.top,
            left: popoverPosition.left,
            width: popoverPosition.width,
          }}
          role="dialog"
          aria-live="polite"
        >
          <div className="rounded-xl border border-border-strong bg-background/95 p-4 shadow-2xl backdrop-blur-sm">
            {rowHoverCard(activeHover.item)}
          </div>
        </div>
      )}

      {showPagination && totalPages > 1 && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={sorted.length}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}

export type { Column };
