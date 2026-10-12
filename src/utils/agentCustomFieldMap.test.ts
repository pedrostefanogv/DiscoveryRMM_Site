import { describe, expect, it } from 'vitest';
import type { AgentCustomFieldMap } from '@/api';
import {
  agentCustomFieldOptions,
  agentMatchesCustomFieldValue,
  buildAgentCustomFieldIndex,
  formatAgentCustomFieldValue,
  getAgentCustomFieldValue,
} from './agentCustomFieldMap';

const map: AgentCustomFieldMap = {
  definitions: [
    { definitionId: 'd1', name: 'anydesk', label: 'ID do anydesk', dataType: 0, allowAgentWrite: true },
    { definitionId: 'd2', name: 'ativo', label: 'Ativo', dataType: 3, allowAgentWrite: false },
  ],
  values: [
    { definitionId: 'd1', agentId: 'a1', valueJson: '"123 456 789"' },
    { definitionId: 'd1', agentId: 'a2', valueJson: '"999 888 777"' },
    { definitionId: 'd2', agentId: 'a1', valueJson: 'true' },
  ],
};

describe('agentCustomFieldMap', () => {
  it('formata valores JSON por tipo', () => {
    expect(formatAgentCustomFieldValue('"abc"')).toBe('abc');
    expect(formatAgentCustomFieldValue('16')).toBe('16');
    expect(formatAgentCustomFieldValue('true')).toBe('true');
    expect(formatAgentCustomFieldValue('["a","b"]')).toBe('a, b');
    expect(formatAgentCustomFieldValue('null')).toBe('');
    expect(formatAgentCustomFieldValue(null)).toBe('');
  });

  it('indexa valores por agente e definição', () => {
    const index = buildAgentCustomFieldIndex(map);
    expect(getAgentCustomFieldValue(index, 'a1', 'd1')).toBe('123 456 789');
    expect(getAgentCustomFieldValue(index, 'a2', 'd1')).toBe('999 888 777');
    expect(getAgentCustomFieldValue(index, 'a1', 'd2')).toBe('true');
    expect(getAgentCustomFieldValue(index, 'a2', 'd2')).toBe('');
  });

  it('filtra por valor sem diferenciar caixa e ignora espaços', () => {
    const index = buildAgentCustomFieldIndex(map);
    expect(agentMatchesCustomFieldValue(index, 'a1', 'd1', '456')).toBe(true);
    expect(agentMatchesCustomFieldValue(index, 'a1', 'd1', '123 456')).toBe(true);
    expect(agentMatchesCustomFieldValue(index, 'a1', 'd1', '999')).toBe(false);
    expect(agentMatchesCustomFieldValue(index, 'a1', 'd1', '   ')).toBe(true);
    expect(agentMatchesCustomFieldValue(index, 'a2', 'd1', '888')).toBe(true);
  });

  it('monta as opções do seletor com contagem de preenchidos', () => {
    const index = buildAgentCustomFieldIndex(map);
    expect(agentCustomFieldOptions(map.definitions, index)).toEqual([
      { value: 'd1', label: 'ID do anydesk (2)' },
      { value: 'd2', label: 'Ativo (1)' },
    ]);
  });
});
