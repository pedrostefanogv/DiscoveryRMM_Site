import { describe, expect, it } from 'vitest';
import {
  formatNotificationMessage,
  parseNavigationTarget,
  sanitizeTicketIds,
  shortTicketRef,
} from './notificationNavigation';

const TICKET_ID = '01a0de51-f18c-7050-9063-0a22ea412020';

describe('parseNavigationTarget', () => {
  it('monta o destino do chamado e lê o título do payload', () => {
    const target = parseNavigationTarget(
      JSON.stringify({ ticketId: TICKET_ID, ticketTitle: 'Notebook não liga' }),
    );

    expect(target).toEqual({
      path: `/tickets/${TICKET_ID}`,
      label: 'chamado',
      ticketId: TICKET_ID,
      ticketTitle: 'Notebook não liga',
    });
  });

  it('aceita as chaves em snake_case', () => {
    const target = parseNavigationTarget(
      JSON.stringify({ ticket_id: TICKET_ID, ticket_title: 'Servidor fora' }),
    );

    expect(target?.path).toBe(`/tickets/${TICKET_ID}`);
    expect(target?.ticketTitle).toBe('Servidor fora');
  });

  it('cai para agente e cliente quando não há chamado', () => {
    expect(parseNavigationTarget(JSON.stringify({ agentId: 'a1' }))).toEqual({
      path: '/agents/a1',
      label: 'agente',
    });
    expect(parseNavigationTarget(JSON.stringify({ clientId: 'c1' }))).toEqual({
      path: '/clients/c1',
      label: 'cliente',
    });
  });

  it('retorna nulo para payload ausente, inválido ou sem destino', () => {
    expect(parseNavigationTarget(null)).toBeNull();
    expect(parseNavigationTarget(undefined)).toBeNull();
    expect(parseNavigationTarget('')).toBeNull();
    expect(parseNavigationTarget('{invalid')).toBeNull();
    expect(parseNavigationTarget(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });
});

describe('shortTicketRef', () => {
  it('usa os 8 primeiros caracteres', () => {
    expect(shortTicketRef(TICKET_ID)).toBe('#01a0de51');
  });

  it('retorna nulo para id vazio', () => {
    expect(shortTicketRef(null)).toBeNull();
    expect(shortTicketRef('   ')).toBeNull();
  });
});

describe('sanitizeTicketIds', () => {
  it('troca o GUID completo pela referência curta', () => {
    expect(sanitizeTicketIds(`Ticket #${TICKET_ID}`)).toBe('Ticket #01a0de51');
  });

  it('troca múltiplos GUIDs', () => {
    const text = `#${TICKET_ID} e #${TICKET_ID}`;
    expect(sanitizeTicketIds(text)).toBe('#01a0de51 e #01a0de51');
  });
});

describe('formatNotificationMessage', () => {
  it('mantém a mensagem enriquecida quando já contém o título', () => {
    const message = 'Chamado "Notebook não liga" atribuído a você.';
    expect(
      formatNotificationMessage({
        message,
        payloadJson: JSON.stringify({ ticketId: TICKET_ID, ticketTitle: 'Notebook não liga' }),
      }),
    ).toBe(message);
  });

  it('usa o título do payload para notificações antigas com só o ID', () => {
    expect(
      formatNotificationMessage({
        message: `Ticket #${TICKET_ID}`,
        payloadJson: JSON.stringify({ ticketId: TICKET_ID, ticketTitle: 'Notebook não liga' }),
      }),
    ).toBe('Chamado "Notebook não liga" — Ticket #01a0de51');
  });

  it('não mostra o GUID completo quando o payload não traz o título', () => {
    expect(
      formatNotificationMessage({
        message: `Ticket #${TICKET_ID}`,
        payloadJson: JSON.stringify({ ticketId: TICKET_ID }),
      }),
    ).toBe('Ticket #01a0de51');
  });
});
