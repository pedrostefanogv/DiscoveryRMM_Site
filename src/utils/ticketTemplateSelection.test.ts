import { describe, expect, it } from 'vitest';
import type { TicketTemplateDto } from '@/api';
import { selectableTemplates } from './ticketTemplateSelection';

/**
 * As fixtures OMITEM clientId/departmentId quando o escopo é global — é o que
 * a API faz (JsonIgnoreCondition.WhenWritingNull). Escrever `null` explícito
 * escondia o bug em que template global sumia do seletor.
 */
const template = (
  over: { id: string; name?: string; clientId?: string; departmentId?: string },
): TicketTemplateDto =>
  ({
    // `id` vem de `...over` (obrigatório no tipo do parâmetro).
    name: over.name ?? 'Template',
    title: 'Abrir',
    description: '',
    priority: null,
    category: null,
    customFieldDefaultsJson: '{}',
    questionsJson: '[]',
    isActive: true,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }) as unknown as TicketTemplateDto;

const global = template({ id: 'g', name: 'Geral' });
const globalDept = template({ id: 'gd', name: 'Geral TI', departmentId: 'd1' });
const otherDept = template({ id: 'od', name: 'Outro depto', departmentId: 'd2' });
const clientTpl = template({ id: 'c', name: 'Do cliente', clientId: 'c1' });
const clientDept = template({ id: 'cd', name: 'Cliente TI', clientId: 'c1', departmentId: 'd1' });
const all = [global, globalDept, otherDept, clientTpl, clientDept];

describe('selectableTemplates', () => {
  it('sem cliente e sem departamento: apenas os gerais', () => {
    expect(selectableTemplates(all, {}).map((t) => t.id)).toEqual(['g']);
  });

  it('escopo global + departamento: gerais e do departamento escolhido', () => {
    expect(selectableTemplates(all, { departmentId: 'd1' }).map((t) => t.id)).toEqual(['g', 'gd']);
  });

  it('escopo cliente: do cliente + globais + do departamento', () => {
    expect(selectableTemplates(all, { clientId: 'c1' }).map((t) => t.id)).toEqual(['g', 'c']);
    expect(selectableTemplates(all, { clientId: 'c1', departmentId: 'd1' }).map((t) => t.id))
      .toEqual(['g', 'gd', 'c', 'cd']);
  });

  it('template global de departamento aparece com cliente escolhido (regressão)', () => {
    // Caso do chamado real: template vinculado a um departamento GLOBAL, com
    // cliente selecionado — antes sumia porque clientId vinha ausente.
    const found = selectableTemplates(all, { clientId: 'c1', departmentId: 'd1' })
      .find((t) => t.id === 'gd');
    expect(found).toBeTruthy();
  });

  it('template global (sem escopo) aparece com cliente escolhido (regressão)', () => {
    const found = selectableTemplates(all, { clientId: 'c1', departmentId: 'd1' })
      .find((t) => t.id === 'g');
    expect(found).toBeTruthy();
  });

  it('nunca devolve template de outro departamento', () => {
    expect(selectableTemplates(all, { departmentId: 'd1' }).some((t) => t.id === 'od')).toBe(false);
    expect(selectableTemplates(all, {}).some((t) => t.id === 'od')).toBe(false);
  });

  it('nunca devolve template de outro cliente', () => {
    const other = template({ id: 'oc', name: 'Outro cliente', clientId: 'c9' });
    expect(selectableTemplates([...all, other], { clientId: 'c1' }).some((t) => t.id === 'oc')).toBe(false);
  });
});
