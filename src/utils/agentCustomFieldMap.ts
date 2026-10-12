import type { AgentCustomFieldMap, AgentCustomFieldMapDefinition } from '@/api';

/** agentId -> definitionId -> valor já formatado para exibição/busca. */
export type AgentCustomFieldIndex = Map<string, Map<string, string>>;

export function formatAgentCustomFieldValue(valueJson: string | null | undefined): string {
  if (valueJson === null || valueJson === undefined) return '';
  const text = valueJson.trim();
  if (!text || text === 'null') return '';

  try {
    return formatParsed(JSON.parse(text));
  } catch {
    return text;
  }
}

function formatParsed(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(item => String(item ?? '')).join(', ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function buildAgentCustomFieldIndex(map: AgentCustomFieldMap | undefined): AgentCustomFieldIndex {
  const index: AgentCustomFieldIndex = new Map();
  if (!map) return index;

  for (const value of map.values) {
    const formatted = formatAgentCustomFieldValue(value.valueJson);
    if (!formatted) continue;

    const byDefinition = index.get(value.agentId) ?? new Map<string, string>();
    byDefinition.set(value.definitionId, formatted);
    index.set(value.agentId, byDefinition);
  }

  return index;
}

export function getAgentCustomFieldValue(
  index: AgentCustomFieldIndex,
  agentId: string,
  definitionId: string,
): string {
  return index.get(agentId)?.get(definitionId) ?? '';
}

/** Filtro por campo/valor da lista de agentes (contains, sem diferenciar caixa). */
export function agentMatchesCustomFieldValue(
  index: AgentCustomFieldIndex,
  agentId: string,
  definitionId: string,
  query: string,
): boolean {
  const trimmed = query.trim();
  if (!definitionId || !trimmed) return true;

  return getAgentCustomFieldValue(index, agentId, definitionId)
    .toLowerCase()
    .includes(trimmed.toLowerCase());
}

/** Opções do seletor de campos (label + contagem de valores preenchidos). */
export function agentCustomFieldOptions(
  definitions: AgentCustomFieldMapDefinition[] | undefined,
  index: AgentCustomFieldIndex,
): Array<{ value: string; label: string }> {
  const filledByDefinition = new Map<string, number>();
  for (const byDefinition of index.values()) {
    for (const definitionId of byDefinition.keys()) {
      filledByDefinition.set(definitionId, (filledByDefinition.get(definitionId) ?? 0) + 1);
    }
  }

  return (definitions ?? []).map(definition => ({
    value: definition.definitionId,
    label: filledByDefinition.get(definition.definitionId)
      ? `${definition.label} (${filledByDefinition.get(definition.definitionId)})`
      : definition.label,
  }));
}
