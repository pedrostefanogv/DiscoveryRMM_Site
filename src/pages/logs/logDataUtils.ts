/**
 * Leitura de campos de `logs.data_json`.
 *
 * O backend grava esse JSON com o default do System.Text.Json (PascalCase —
 * ex.: `{"Path":"...","StatusCode":400,"TraceId":"..."}`), enquanto a UI
 * naturalmente lê camelCase. Ler as duas formas evita campos vazios para
 * linhas antigas e novas.
 */
export function readDataField(
  data: Record<string, unknown> | null | undefined,
  key: string,
): unknown {
  if (!data) return undefined;
  const pascal = key.charAt(0).toUpperCase() + key.slice(1);
  return data[key] ?? data[pascal];
}
