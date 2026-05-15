import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
  const [activeHoverKey, setActiveHoverKey] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const closeHoverCard = () => {
    if (!rowHoverCard) return;
    setActiveHoverKey((current) => {
      if (current) {
        onRowHoverCardChange?.(null);
      }
      return null;
    });
  };

  const handleRowMouseEnter = (item: T) => {
    if (!rowHoverCard) return;
    const rowKey = keyExtractor(item);

    clearHoverTimeout();

    setActiveHoverKey((current) => {
      if (current && current !== rowKey) {
        onRowHoverCardChange?.(null);
        return null;
      }
      return current;
    });

    hoverTimeoutRef.current = setTimeout(() => {
      setActiveHoverKey(rowKey);
      onRowHoverCardChange?.(item);
    }, rowHoverDelayMs);
  };

  const handleBodyMouseLeave = () => {
    clearHoverTimeout();
    closeHoverCard();
  };

  useEffect(() => {
    if (!rowHoverCard || !activeHoverKey) return;

    const stillVisible = paginated.some((item) => keyExtractor(item) === activeHoverKey);
    if (!stillVisible) {
      closeHoverCard();
    }
  }, [activeHoverKey, closeHoverCard, keyExtractor, paginated, rowHoverCard]);

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
    <div className="space-y-3">
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
                const showHoverCard = !!rowHoverCard && activeHoverKey === rowKey;

                return (
                  <Fragment key={rowKey}>
                    <tr
                      onClick={() => onRowClick?.(item)}
                      onMouseEnter={() => handleRowMouseEnter(item)}
                      onKeyDown={(event) => handleRowKeyDown(event, item)}
                      tabIndex={onRowClick ? 0 : -1}
                      className={`border-b border-white/5 transition-colors ${
                        onRowClick ? 'cursor-pointer hover:bg-white/[0.04] focus-visible:bg-white/[0.06] focus-visible:outline-none' : idx % 2 === 1 ? 'bg-white/[0.01]' : ''
                      } ${showHoverCard ? 'border-b-0' : 'last:border-b-0'}`}
                    >
                      {columns.map(col => (
                        <td key={col.key} className={`px-4 py-3 text-slate-300 ${col.className ?? ''}`}>
                          {col.render(item)}
                        </td>
                      ))}
                    </tr>

                    {showHoverCard && (
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <td colSpan={columns.length} className="px-4 pb-4 pt-0">
                          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                            {rowHoverCard(item)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
