import { describe, expect, it } from 'vitest';
import type { WorkflowState } from '@/api';
import { buildStateTicketCounts, buildWorkflowReorder, sortStatesByOrder } from './workflowUtils';

const state = (id: string, sortOrder: number, name = id): WorkflowState => ({
  id,
  clientId: null,
  name,
  color: null,
  isInitial: false,
  isFinal: false,
  sortOrder,
  pausesSla: false,
});

describe('sortStatesByOrder', () => {
  it('ordena por sortOrder sem mutar o array original', () => {
    const input = [state('c', 3), state('a', 1), state('b', 2)];
    const sorted = sortStatesByOrder(input);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(input.map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('desempata pelo nome', () => {
    expect(sortStatesByOrder([state('b', 1, 'Zeta'), state('a', 1, 'Alfa')]).map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('buildWorkflowReorder', () => {
  it('move o último para a primeira posição e renumera 1..N', () => {
    const states = [state('a', 1), state('b', 2), state('c', 3)];
    expect(buildWorkflowReorder(states, 'c', 'a')).toEqual([
      { id: 'c', sortOrder: 1 },
      { id: 'a', sortOrder: 2 },
      { id: 'b', sortOrder: 3 },
    ]);
  });

  it('move para baixo e só devolve o que mudou', () => {
    const states = [state('a', 1), state('b', 2), state('c', 3)];
    expect(buildWorkflowReorder(states, 'a', 'b')).toEqual([
      { id: 'b', sortOrder: 1 },
      { id: 'a', sortOrder: 2 },
    ]);
  });

  it('não devolve nada quando o destino é o mesmo item', () => {
    expect(buildWorkflowReorder([state('a', 1), state('b', 2)], 'a', 'a')).toEqual([]);
  });

  it('ignora ids desconhecidos', () => {
    expect(buildWorkflowReorder([state('a', 1)], 'x', 'a')).toEqual([]);
    expect(buildWorkflowReorder([state('a', 1)], 'a', 'x')).toEqual([]);
  });

  it('normaliza ordens duplicadas mesmo sem mudar de posição', () => {
    const states = [state('a', 2), state('b', 2)];
    // Desempate por nome (a antes de b): mover 'a' para a posição de 'b'
    // resulta em [b, a] => b passa a 1 e 'a' permanece 2.
    expect(buildWorkflowReorder(states, 'a', 'b')).toEqual([{ id: 'b', sortOrder: 1 }]);
  });
});

describe('buildStateTicketCounts', () => {
  it('mapeia estado -> contagem ignorando estado nulo', () => {
    const counts = buildStateTicketCounts([
      { workflowStateId: 's1', count: 4 },
      { workflowStateId: null, count: 9 },
    ]);
    expect(counts.get('s1')).toBe(4);
    expect(counts.size).toBe(1);
  });

  it('tolera byState ausente', () => {
    expect(buildStateTicketCounts(undefined).size).toBe(0);
    expect(buildStateTicketCounts(null).size).toBe(0);
  });
});
