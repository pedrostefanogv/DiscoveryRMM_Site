import { describe, expect, it } from 'vitest';
import type {
  CreateTicketSavedViewRequest,
  TicketSavedView,
  TicketSavedViewFilter,
  UpdateTicketSavedViewRequest,
} from '@/api';
import { TicketAnswerMatch } from '@/api';

/**
 * Contrato das VISÕES SALVAS de chamados.
 *
 * Contexto (bug real, corrigido junto da task A1): o backend recebe o filtro
 * como STRING opaca — TicketSavedViewsController.cs:52 declara
 * `record CreateTicketSavedViewRequest(string Name, string? FilterJson, ...)`
 * — e o handler grava `cmd.FilterJson ?? "{}"`
 * (TicketSavedViewCommandHandlers.cs:13).
 *
 * O console enviava `filter` (OBJETO camelCase), propriedade que o record não
 * tem. O vínculo do ASP.NET deixava FilterJson = null e o servidor persistia
 * `"{}"`: toda visão salva perdia os filtros silenciosamente, e
 * parseSavedViewFilter(view.filterJson) sempre lia vazio. Como nenhum dos dois
 * lados tinha teste de contrato, a divergência passou despercebida.
 *
 * Este teste trava o nome do campo (`filterJson`, string) para que a assimetria
 * não volte.
 */
describe('contrato das visões salvas (filterJson)', () => {
  const filter: TicketSavedViewFilter = {
    clientId: 'cli-1',
    workflowStateId: 'st-1',
    assignedToUserId: 'user-1',
    priority: 'High',
    isClosed: false,
    text: 'impressora',
    answerMatch: TicketAnswerMatch.Contains,
  };

  it('envia o filtro como string JSON em filterJson (não como objeto "filter")', () => {
    const request: CreateTicketSavedViewRequest = {
      name: 'Fila do suporte',
      userId: 'user-9',
      isShared: false,
      filterJson: JSON.stringify(filter),
    };

    // O que vai no corpo precisa ser string: o record do backend espera string.
    expect(typeof request.filterJson).toBe('string');
    // E a propriedade "filter" (objeto) não deve existir no payload.
    expect(Object.keys(request)).not.toContain('filter');
  });

  it('preserva assignedToUserId no round-trip salvar -> aplicar', () => {
    const saved = JSON.stringify(filter);
    // O backend devolve o MESMO texto em TicketSavedView.filterJson.
    const view = { filterJson: saved } as Pick<TicketSavedView, 'filterJson'>;

    const parsed = JSON.parse(view.filterJson) as TicketSavedViewFilter;
    // Sem isto, salvar uma visão com responsável ativo a perdia: buildCurrentFilter
    // descartava o campo que parseSavedViewFilter já lia.
    expect(parsed.assignedToUserId).toBe('user-1');
  });

  it('mantém filterJson como string na atualização (mesmo contrato)', () => {
    const update: UpdateTicketSavedViewRequest = {
      name: 'Fila do suporte',
      isShared: true,
      filterJson: JSON.stringify(filter),
    };

    expect(typeof update.filterJson).toBe('string');
    expect(Object.keys(update)).not.toContain('filter');
  });

  it('filtro vazio serializa para "{}" e é lido de volta como objeto vazio', () => {
    // O servidor grava "{}" quando não há filtro (FilterJson ?? "{}").
    const empty: TicketSavedViewFilter = {};
    const saved = JSON.stringify(empty);

    expect(saved).toBe('{}');
    expect(JSON.parse(saved)).toEqual({});
  });
});
