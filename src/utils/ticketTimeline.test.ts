import { describe, expect, it } from 'vitest';
import type { TicketTimelineEntry } from '@/api';
import { formatRelativeTime, groupTimelineByDay, timelineMetaFor } from './ticketTimeline';

function entry(createdAt: string, type: TicketTimelineEntry['activityType'] = 'Created'): TicketTimelineEntry {
  return {
    id: createdAt + type,
    ticketId: 't1',
    activityType: type,
    changedByUserId: null,
    changedByName: null,
    oldValue: null,
    newValue: null,
    oldLabel: null,
    newLabel: null,
    comment: null,
    description: null,
    createdAt,
  };
}

describe('ticketTimeline', () => {
  it('agrupa por dia preservando a ordem', () => {
    const groups = groupTimelineByDay([
      entry('2024-01-15T12:00:00'),
      entry('2024-01-15T09:00:00'),
      entry('2024-01-13T10:00:00'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
    expect(groups[0].label).toBe('15/01/2024');
  });

  it('rotula Hoje e Ontem', () => {
    const now = new Date();
    const today = now.toISOString();
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString();

    const groups = groupTimelineByDay([entry(today), entry(yesterday, 'Commented')]);
    expect(groups.map((group) => group.label)).toEqual(['Hoje', 'Ontem']);
  });

  it('formata tempo relativo e tolera valor inválido', () => {
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('há 5 min');
    expect(formatRelativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('há 3 h');
    expect(formatRelativeTime(null)).toBe('agora');
    expect(formatRelativeTime('não é data')).toBe('agora');
  });

  it('usa fallback para tipo desconhecido', () => {
    expect(timelineMetaFor('Created').label).toBe('Chamado criado');
    expect(timelineMetaFor('AlgoNovo').label).toBe('AlgoNovo');
    expect(timelineMetaFor('AlgoNovo').tone).toBe('neutral');
  });
});
