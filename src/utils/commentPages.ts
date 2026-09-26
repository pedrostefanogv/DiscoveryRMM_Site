/** Uma página de comentários acumulada por cursor (a 1ª tem cursor undefined). */
export interface CommentPage<T> {
  cursor?: string;
  items: T[];
}

/**
 * Insere ou ATUALIZA uma página pelo cursor.
 *
 * O refetch da MESMA página (ex.: depois de adicionar um comentário) precisa
 * substituir os itens. Quando isso era ignorado, o comentário novo só aparecia
 * após um reload manual (F5).
 */
export function upsertCommentPage<T>(
  pages: CommentPage<T>[],
  cursor: string | undefined,
  items: T[],
): CommentPage<T>[] {
  const index = pages.findIndex((page) => page.cursor === cursor);
  if (index === -1) return [...pages, { cursor, items }];
  const next = [...pages];
  next[index] = { cursor, items };
  return next;
}
