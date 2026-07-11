/**
 * Normaliza o valor `data` de uma query React Query para um array plano,
 * tratando tanto arrays diretos quanto objetos paginados (CursorPageDto).
 *
 * Use este helper sempre que `query.data` for consumido como array
 * (filter, map, slice, etc.) para evitar erros quando a API retornar
 * um objeto paginado inesperadamente.
 */
export function ensureArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (
    data &&
    typeof data === "object" &&
    "items" in data &&
    Array.isArray((data as Record<string, unknown>).items)
  ) {
    return (data as Record<string, unknown>).items as T[];
  }
  return [];
}
