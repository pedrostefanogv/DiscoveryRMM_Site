/**
 * Execução de uma ação (comando) para VÁRIOS agentes de uma vez.
 *
 * As telas de cliente/site só têm endpoints por agente para energia,
 * notificação, update e refresh de inventário — não existe um `/fanout` de
 * power por cliente. As ações em massa da aba Agentes, então, são um fan-out no
 * cliente: N chamadas independentes cujo resultado agregamos para o operador.
 *
 * Por que não `Promise.all` puro: um cliente grande (centenas de agentes)
 * abriria centenas de requisições simultâneas no mesmo navegador, o que estoura
 * o limite de conexões do host e faz as respostas demoradas parecerem falhas. O
 * pool mantém no máximo `concurrency` chamadas em voo.
 *
 * A falha de UM agente nunca aborta o lote: cada chamada é isolada e o total de
 * sucessos/falhas é o que a UI reporta.
 */

/** Limite padrão de requisições simultâneas por lote. */
export const DEFAULT_BULK_CONCURRENCY = 5;

export interface BulkActionResult {
  /** Agentes que responderam sem erro. */
  ok: number;
  /** Agentes cuja chamada rejeitou. */
  failed: number;
  /** Total de itens tentados (ok + failed). */
  total: number;
  /** Mensagem do PRIMEIRO erro encontrado, para diagnóstico rápido na UI. */
  firstError?: string;
}

/** Extrai uma mensagem legível de um motivo de rejeição desconhecido. */
export function describeBulkError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'erro desconhecido';
}

/**
 * Roda `action` para cada item com concorrência limitada e agrega o resultado.
 * Nunca lança: erros viram contagem em `failed`.
 */
export async function runBulkAgentAction<T>(
  items: readonly T[],
  action: (item: T) => Promise<unknown>,
  concurrency: number = DEFAULT_BULK_CONCURRENCY,
): Promise<BulkActionResult> {
  const total = items.length;
  if (total === 0) return { ok: 0, failed: 0, total: 0 };

  const workers = Math.max(1, Math.min(Math.trunc(concurrency) || 1, total));
  let cursor = 0;
  let ok = 0;
  let firstError: string | undefined;

  const consume = async () => {
    // `cursor++` é atômico do ponto de vista do event loop: entre a leitura e o
    // incremento não existe await, então dois workers nunca pegam o mesmo item.
    while (cursor < total) {
      const item = items[cursor++];
      try {
        await action(item);
        ok += 1;
      } catch (error) {
        if (firstError === undefined) firstError = describeBulkError(error);
      }
    }
  };

  await Promise.all(Array.from({ length: workers }, consume));
  return { ok, failed: total - ok, total, firstError };
}

/**
 * Mensagem padrão do toast de uma ação em massa, no mesmo tom das demais telas
 * ("N de M ..."). O primeiro erro entra entre parênteses para o operador saber o
 * motivo sem precisar abrir o console.
 */
export function formatBulkResult(label: string, result: BulkActionResult): string {
  const base = `${label}: ${result.ok} de ${result.total} agente(s)`;
  if (result.failed === 0) return `${base} com sucesso.`;
  const detail = result.firstError ? ` — ${result.firstError}` : '';
  return `${base} — ${result.failed} falha(s)${detail}.`;
}
