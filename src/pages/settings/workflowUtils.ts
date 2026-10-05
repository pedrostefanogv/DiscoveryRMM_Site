import type { WorkflowState } from '@/api';

/** Ordena estados pela Ordem configurada (empate pelo nome). */
export function sortStatesByOrder(states: WorkflowState[]): WorkflowState[] {
  return [...states].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export interface WorkflowReorderItem {
  id: string;
  sortOrder: number;
}

/**
 * Calcula os novos SortOrder depois de arrastar `activeId` para a posição de
 * `overId`. Retorna só os estados cuja ordem realmente mudou (evita updates
 * desnecessários na API).
 */
export function buildWorkflowReorder(
  states: WorkflowState[],
  activeId: string,
  overId: string,
): WorkflowReorderItem[] {
  const ordered = sortStatesByOrder(states);
  const oldIndex = ordered.findIndex((state) => state.id === activeId);
  const newIndex = ordered.findIndex((state) => state.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return [];

  const moved = [...ordered];
  const [item] = moved.splice(oldIndex, 1);
  moved.splice(newIndex, 0, item);

  const changes: WorkflowReorderItem[] = [];
  moved.forEach((state, index) => {
    const sortOrder = index + 1;
    if (state.sortOrder !== sortOrder) changes.push({ id: state.id, sortOrder });
  });
  return changes;
}

/** Mapa estadoId -> quantidade de chamados, a partir do KPI (byState). */
export function buildStateTicketCounts(
  byState?: { workflowStateId: string | null; count: number }[] | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of byState ?? []) {
    if (item.workflowStateId) counts.set(item.workflowStateId, item.count);
  }
  return counts;
}
