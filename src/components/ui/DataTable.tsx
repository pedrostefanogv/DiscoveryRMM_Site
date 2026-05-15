import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  sortKey?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  rowHoverCard?: (item: T) => React.ReactNode;
  rowHoverDelayMs?: number;
  onRowHoverCardChange?: (item: T | null) => void;
  emptyMessage?: string;
  emptyIcon?: string;
  pageSize?: number;
  showPagination?: boolean;
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
  rowHoverCard,
  rowHoverDelayMs = 1200,
  onRowHoverCardChange,
  emptyMessage = 'Nenhum registro encontrado',
  pageSize = 20,
  showPagination = true,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [activeHover, setActiveHover] = useState<{ key: string; item: T } | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const sorted = useMemo(() => {
    if (!sort || !sort.key || !sort.direction) return data;
    return [...data].sort((a, b) => {
      const col = columns.find(c => (c.sortKey ?? c.key) === sort.key);
      if (!col) return 0;
      const valA = String((a as Record<string, unknown>)[col.sortKey ?? col.key] ?? '');
      const valB = String((b as Record<string, unknown>)[col.sortKey ?? col.key] ?? '');
      const cmp = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base', numeric: true });
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [data, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
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
      <div className="overflow-hidden rounded-xl border border-white/10 bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" role="grid">
            <caption className="sr-only">Tabela de dados</caption>
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 ${col.className ?? ''} ${col.sortable !== false ? 'cursor-pointer select-none hover:text-slate-200 transition-colors' : ''}`}
                    onClick={() => col.sortable !== false && handleSort(col)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable !== false && sort?.key === (col.sortKey ?? col.key) && (
                        sort.direction === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </th>
                ))}
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
                    onMouseEnter={() => handleRowMouseEnter(item, rowKey)}
                    onKeyDown={(event) => handleRowKeyDown(event, item)}
                    tabIndex={onRowClick ? 0 : -1}
                    className={`border-b border-white/5 transition-colors last:border-b-0 ${
                      onRowClick ? 'cursor-pointer hover:bg-white/[0.04] focus-visible:bg-white/[0.06] focus-visible:outline-none' : idx % 2 === 1 ? 'bg-white/[0.01]' : ''
                    } ${isHoverActive ? 'bg-white/[0.04]' : ''}`}
                  >
                    {columns.map(col => (
                      <td key={col.key} className={`px-4 py-3 text-slate-300 ${col.className ?? ''}`}>
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
          <div className="rounded-xl border border-white/15 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-sm">
            {rowHoverCard(activeHover.item)}
          </div>
        </div>
      )}

      {showPagination && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-500">
            Mostrando {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} de {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Primeira página"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-slate-400 tabular-nums">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Última página"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { Column };
