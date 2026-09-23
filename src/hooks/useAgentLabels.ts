import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { agentLabelsApi } from '@/modules/agent-labels/api';
import type { AgentLabel } from '@/modules/agent-labels/types';

/** Limite alinhado ao backend (ListAgentLabelsBatchQueryHandler). */
const MAX_AGENTS_PER_REQUEST = 500;

/**
 * Carrega as labels de vários agentes em UMA requisição (endpoint /agent-labels/batch).
 * Antes as labels só existiam na página de detalhe, o que impedia filtrar a lista de
 * agentes; fazer uma requisição por agente criaria um N+1 na interface.
 */
export function useAgentLabels(agentIds: readonly string[]) {
  // Chave estável e curta: derivada do conteúdo, não do array de entrada (que muda de
  // identidade a cada render da lista).
  const ids = useMemo(
    () => [...new Set(agentIds)].filter(Boolean).sort().slice(0, MAX_AGENTS_PER_REQUEST),
    [agentIds],
  );
  const cacheKey = useMemo(() => ids.join(','), [ids]);

  return useQuery({
    queryKey: ['agentLabels', 'batch', cacheKey],
    queryFn: async () => {
      const labels = await agentLabelsApi.getAgentLabelsBatch(ids);

      const byAgent: Record<string, AgentLabel[]> = {};
      for (const label of labels) {
        (byAgent[label.agentId] ??= []).push(label);
      }
      return byAgent;
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}

/**
 * Índice agentId -> nomes de labels, pronto para filtro/busca.
 *
 * O Map é memoizado por dados+ids: sem isso, um novo Map era criado a cada render e
 * invalidava o useMemo do consumidor (o filtro recalculava a lista inteira sempre).
 */
export function useAgentLabelsByAgentIds(agentIds: readonly string[]): Map<string, string[]> {
  const { data } = useAgentLabels(agentIds);

  return useMemo(() => {
    const map = new Map<string, string[]>();
    if (!data) return map;

    for (const [agentId, labels] of Object.entries(data)) {
      map.set(agentId, labels.map(label => label.label));
    }

    return map;
  }, [data]);
}
