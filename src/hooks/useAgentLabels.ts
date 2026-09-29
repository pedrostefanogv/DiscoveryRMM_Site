import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { agentLabelsApi } from '@/modules/agent-labels/api';
import type { AgentLabel } from '@/modules/agent-labels/types';

/** Limite alinhado ao backend (ListAgentLabelsBatchQueryHandler). */
const MAX_AGENTS_PER_REQUEST = 500;

/**
 * Carrega as labels de vários agentes em UMA requisição (endpoint /agent-labels/batch).
 *
 * Uso: exibir as labels dos agentes VISÍVEIS na tela. Para filtrar a frota por label,
 * prefira useAgentIdsByLabel, que resolve no servidor e não depende deste limite.
 *
 * Frotas maiores que o limite do endpoint são divididas em vários lotes de 500.
 */

/**
 * Hash FNV-1a dos ids: a chave de cache nao pode ser a lista inteira (frotas
 * grandes produziriam uma query key gigante).
 */
function hashAgentIds(ids: readonly string[]): string {
  let hash = 2166136261;
  for (const id of ids) {
    for (let index = 0; index < id.length; index += 1) {
      hash ^= id.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }

  return (hash >>> 0).toString(36);
}

export function useAgentLabels(agentIds: readonly string[]) {
  // Chave estável e curta: derivada do conteúdo, não do array de entrada (que muda de
  // identidade a cada render da lista).
  const ids = useMemo(
    () => [...new Set(agentIds)].filter(Boolean).sort(),
    [agentIds],
  );
  const cacheKey = useMemo(() => `${ids.length}:${hashAgentIds(ids)}`, [ids]);

  return useQuery({
    queryKey: ['agentLabels', 'batch', cacheKey],
    queryFn: async () => {
      const byAgent: Record<string, AgentLabel[]> = {};

      // Chunks de 500. Antes a lista era TRUNCADA no limite do endpoint: agentes
      // além dos 500 primeiros ficavam sem labels (quebrava exibição e a busca
      // textual por label em frotas maiores).
      for (let offset = 0; offset < ids.length; offset += MAX_AGENTS_PER_REQUEST) {
        const chunk = ids.slice(offset, offset + MAX_AGENTS_PER_REQUEST);
        const labels = await agentLabelsApi.getAgentLabelsBatch(chunk);

        for (const label of labels) {
          const bucket = byAgent[label.agentId] ?? [];
          bucket.push(label);
          byAgent[label.agentId] = bucket;
        }
      }

      return byAgent;
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}

/**
 * Índice agentId -> nomes de labels dos agentes informados.
 *
 * O Map é memoizado por dados: sem isso, um novo Map era criado a cada render e
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

/** Labels disponíveis para filtro, com contagem de agentes. Não depende do tamanho da frota. */
export function useAgentLabelUsage(limit = 200) {
  return useQuery({
    queryKey: ['agentLabels', 'usage', limit],
    queryFn: () => agentLabelsApi.getLabelUsage(limit),
    staleTime: 60_000,
  });
}

/**
 * Ids de TODOS os agentes que possuem uma label, paginando por cursor até o fim.
 *
 * Era o caso que estourava o limite de 500 do endpoint em lote: com uma frota maior
 * que isso, a UI não conseguia mais filtrar. Aqui o filtro é resolvido no servidor e
 * o resultado é acumulado por cursor, sem limite prático de frota.
 */
export function useAgentIdsByLabel(label: string | null, pageSize = 500) {
  return useQuery({
    queryKey: ['agentLabels', 'agentsByLabel', label, pageSize],
    queryFn: async () => {
      if (!label) return { ids: [] as string[], total: 0, truncated: false };

      const ids: string[] = [];
      let cursor: string | null = null;
      let total = 0;

      // Teto de segurança: 40 páginas x 500 = 20.000 agentes.
      for (let page = 0; page < 40; page += 1) {
        const response = await agentLabelsApi.getAgentIdsByLabel(label, cursor, pageSize);
        ids.push(...response.agentIds);
        total = response.total;

        if (!response.hasMore || !response.nextCursor) {
          return { ids, total, truncated: false };
        }

        cursor = response.nextCursor;
      }

      return { ids, total, truncated: true };
    },
    enabled: Boolean(label),
    staleTime: 60_000,
  });
}
