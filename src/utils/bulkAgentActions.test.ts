import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BULK_CONCURRENCY,
  describeBulkError,
  formatBulkResult,
  runBulkAgentAction,
} from './bulkAgentActions';

describe('runBulkAgentAction', () => {
  it('agrega sucessos e falhas sem abortar o lote', async () => {
    const items = ['a', 'b', 'c', 'd'];
    const seen: string[] = [];

    const result = await runBulkAgentAction(items, async (item) => {
      seen.push(item);
      if (item === 'b') throw new Error('agente offline');
    });

    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(result).toEqual({ ok: 3, failed: 1, total: 4, firstError: 'agente offline' });
  });

  it('respeita o limite de concorrência', async () => {
    const items = Array.from({ length: 12 }, (_, index) => index);
    let inFlight = 0;
    let peak = 0;

    await runBulkAgentAction(
      items,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
      },
      3,
    );

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('não dispara nada para uma lista vazia', async () => {
    let calls = 0;
    const result = await runBulkAgentAction([], async () => { calls += 1; });
    expect(calls).toBe(0);
    expect(result).toEqual({ ok: 0, failed: 0, total: 0 });
  });

  it('normaliza concorrência inválida para pelo menos 1 worker', async () => {
    const items = [1, 2, 3];
    const result = await runBulkAgentAction(items, async () => {}, 0);
    expect(result.ok).toBe(3);
  });

  it('expõe um limite padrão conservador', () => {
    expect(DEFAULT_BULK_CONCURRENCY).toBeGreaterThan(1);
    expect(DEFAULT_BULK_CONCURRENCY).toBeLessThanOrEqual(10);
  });
});

describe('formatBulkResult', () => {
  it('resume o sucesso total', () => {
    expect(formatBulkResult('Notificação', { ok: 3, failed: 0, total: 3 })).toBe(
      'Notificação: 3 de 3 agente(s) com sucesso.',
    );
  });

  it('inclui a contagem de falhas e o primeiro erro', () => {
    const message = formatBulkResult('Desligamento', {
      ok: 1,
      failed: 2,
      total: 3,
      firstError: 'sem permissão',
    });
    expect(message).toContain('1 de 3 agente(s)');
    expect(message).toContain('2 falha(s)');
    expect(message).toContain('sem permissão');
  });

  it('omite o detalhe quando não há mensagem de erro', () => {
    expect(formatBulkResult('Ligar', { ok: 0, failed: 2, total: 2 })).toBe(
      'Ligar: 0 de 2 agente(s) — 2 falha(s).',
    );
  });
});

describe('describeBulkError', () => {
  it('prefere a mensagem do Error', () => {
    expect(describeBulkError(new Error('falhou'))).toBe('falhou');
  });

  it('aceita string e cai em um rótulo padrão para o resto', () => {
    expect(describeBulkError('erro textual')).toBe('erro textual');
    expect(describeBulkError(undefined)).toBe('erro desconhecido');
    expect(describeBulkError(new Error(''))).toBe('erro desconhecido');
  });
});
