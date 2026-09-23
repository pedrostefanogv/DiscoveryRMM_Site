import { useQuery } from '@tanstack/react-query';
import { agentLabelsApi } from '@/modules/agent-labels/api';
import type { AgentLabel } from '@/modules/agent-labels/types';

/**
 * Carrega as labels de vários agentes em uma única chamada por agente, com cache
 * compartilhado por id. As labels antes só existiam na página de detalhe, o que
 * tornava impossível filtrar a lista — e fazer uma requisição por agente criaria
 * um N+1 na interface.
 */
export function useAgentLabels(agentIds: readonly string[]) {
  const sortedIds = [...new Set(agentIds)].sort();

  const query = useQuery({
    queryKey: ['agentLabels', 'byAgentIds', sortedIds],
    queryFn: async () => {
      const entries = await Promise.all(
        sortedIds.map(async agentId => [agentId, await agentLabelsApi.getAgentLabels(agentId).catch(() => [])] as const),
      );
      return Object.fromEntries(entries) as Record<string, AgentLabel[]>;
    },
    enabled: sortedIds.length > 0,
    staleTime: 60_000,
  });

  return query;
}

/** Índice agentId -> nomes de labels, pronto para filtro/busca. */
export function useAgentLabelsByAgentIds(agentIds: readonly string[]): Map<string, string[]> {
  const { data } = useAgentLabels(agentIds);

  const map = new Map<string, string[]>();
  if (!data) return map;

  for (const [agentId, labels] of Object.entries(data)) {
    map.set(agentId, labels.map(label => label.label));
  }

  return map;
}
