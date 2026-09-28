import { describe, expect, it } from 'vitest';

import { wingetDecisionFromMetadata } from './automationTasksUtils';

/**
 * Parser da decisão do winget no metadata de resultado: permite explicar na UI
 * por que uma execução não instalou nada (pacote já instalado) e qual fonte
 * decidiu (winget ou inventory-cache).
 */
describe('wingetDecisionFromMetadata', () => {
  it('extrai skip/reason/decidedBy do wingetDecision', () => {
    const raw = JSON.stringify({
      wingetDecision: {
        skip: true,
        benign: true,
        reason: 'pacote ja instalado',
        decidedBy: 'winget',
      },
    });
    expect(wingetDecisionFromMetadata(raw)).toEqual({
      skip: true,
      benign: true,
      reason: 'pacote ja instalado',
      decidedBy: 'winget',
    });
  });

  it('retorna null quando não há wingetDecision', () => {
    expect(wingetDecisionFromMetadata('{"other":1}')).toBeNull();
    expect(wingetDecisionFromMetadata(null)).toBeNull();
    expect(wingetDecisionFromMetadata(undefined)).toBeNull();
    expect(wingetDecisionFromMetadata('')).toBeNull();
  });

  it('retorna null em JSON inválido ou tipo inesperado', () => {
    expect(wingetDecisionFromMetadata('nao-e-json')).toBeNull();
    expect(wingetDecisionFromMetadata('{"wingetDecision":"x"}')).toBeNull();
  });

  it('normaliza campos ausentes', () => {
    expect(wingetDecisionFromMetadata('{"wingetDecision":{"skip":false}}')).toEqual({
      skip: false,
      benign: false,
      reason: null,
      decidedBy: null,
    });
  });
});
