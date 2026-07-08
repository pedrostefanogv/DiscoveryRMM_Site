import { useState, useCallback, useMemo } from "react";

export interface UseCursorPaginationOptions {
  initialLimit?: number;
}

export interface CursorPaginationState {
  /** Página atual (1-based) */
  page: number;
  /** Stack de cursores indexado por página: pageCursors[page-1] */
  pageCursors: Array<string | undefined>;
  /** Cursor da página atual */
  cursor: string | undefined;
  /** Limite de itens por página */
  limit: number;
  /** Navegar para uma página específica (precisa ter cursor no stack) */
  goToPage: (page: number) => void;
  /** Avançar para próxima página usando o nextCursor */
  goToNext: (nextCursor: string | null | undefined) => void;
  /** Voltar para página anterior */
  goToPrev: () => void;
  /** Resetar paginação para página 1 */
  reset: () => void;
  /** Alterar limite e resetar */
  setLimit: (limit: number) => void;
}

/**
 * Hook compartilhado para gerenciar paginação cursor-based com stack de cursores.
 *
 * Mantém um array `pageCursors` onde `pageCursors[page-1]` é o cursor
 * usado para buscar a página `page`. Isso permite navegação página-a-página
 * mesmo sem saber o total de páginas.
 *
 * @example
 * ```tsx
 * const pag = useCursorPagination({ initialLimit: 50 });
 * const list = useSomeList({ cursor: pag.cursor, limit: pag.limit });
 *
 * const canNext = Boolean(list.data?.hasMore && list.data?.nextCursor);
 * const canPrev = pag.page > 1;
 *
 * <button onClick={() => pag.goToNext(list.data?.nextCursor)} disabled={!canNext}>
 *   Próxima
 * </button>
 * <button onClick={pag.goToPrev} disabled={!canPrev}>
 *   Anterior
 * </button>
 * ```
 */
export function useCursorPagination(
  options: UseCursorPaginationOptions = {},
): CursorPaginationState {
  const { initialLimit = 50 } = options;

  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [limit, setLimitState] = useState(initialLimit);

  const cursor = useMemo(() => pageCursors[page - 1], [pageCursors, page]);

  const goToPage = useCallback((targetPage: number) => {
    if (targetPage < 1) return;
    setPageCursors((prev) => {
      // Garantir que o stack tenha tamanho suficiente
      if (targetPage <= prev.length) return prev;
      return [...prev, ...Array(targetPage - prev.length).fill(undefined)];
    });
    setPage(targetPage);
  }, []);

  const goToNext = useCallback(
    (nextCursor: string | null | undefined) => {
      if (!nextCursor) return;
      setPageCursors((prev) => {
        const next = [...prev];
        next[page] = nextCursor;
        return next;
      });
      setPage((p) => p + 1);
    },
    [page],
  );

  const goToPrev = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  const reset = useCallback(() => {
    setPage(1);
    setPageCursors([undefined]);
  }, []);

  const setLimit = useCallback(
    (newLimit: number) => {
      setLimitState(newLimit);
      reset();
    },
    [reset],
  );

  return {
    page,
    pageCursors,
    cursor,
    limit,
    goToPage,
    goToNext,
    goToPrev,
    reset,
    setLimit,
  };
}
