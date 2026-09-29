import { describe, expect, it } from 'vitest';

import { AutomationNotificationMode, AutomationToastTiming } from '@/api/types';
import {
  describeCron,
  normalizeNotificationMode,
  normalizeToastTiming,
  notificationModeFromTask,
  notificationModeLabel,
  toastTimingLabel,
  wingetDecisionFromMetadata,
} from './automationTasksUtils';

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

describe('describeCron', () => {
  it('descreve horário e dia da semana', () => {
    expect(describeCron('0 8 * * 1')).toBe('Executa às 08:00, toda segunda-feira.');
    expect(describeCron('30 7 * * 1-5')).toBe('Executa às 07:30, de segunda-feira a sexta-feira.');
    // 0 e 7 são domingo no cron.
    expect(describeCron('0 8 * * 0')).toBe('Executa às 08:00, todo domingo.');
    expect(describeCron('0 8 * * 7')).toBe('Executa às 08:00, todo domingo.');
    expect(describeCron('0 8 * * 6')).toBe('Executa às 08:00, todo sábado.');
  });

  it('descreve intervalos e execuções por hora', () => {
    expect(describeCron('*/15 * * * *')).toBe('Executa a cada 15 minutos, todos os dias.');
    expect(describeCron('0 * * * *')).toBe('Executa a cada hora (no minuto 00), todos os dias.');
  });

  it('descreve dia do mês e mês', () => {
    expect(describeCron('0 3 1 * *')).toBe('Executa às 03:00, no dia 1 do mês.');
    expect(describeCron('0 0 1 1 *')).toBe('Executa às 00:00, no dia 1 do mês e em janeiro.');
  });

  it('avisa quando a expressão está vazia, incompleta ou inválida', () => {
    expect(describeCron('')).toContain('Informe uma expressão');
    expect(describeCron('0 8 * *')).toContain('5 campos');
    expect(describeCron('99 8 * * *')).toContain('minuto');
    expect(describeCron('0 8 * * 9')).toContain('dia da semana');
    expect(describeCron('0 8 * 13 *')).toContain('mês');
  });
});

describe('modo de notificação', () => {
  it('normaliza nome (string do servidor), número e valores inválidos', () => {
    expect(normalizeNotificationMode('Prompt')).toBe(AutomationNotificationMode.Prompt);
    expect(normalizeNotificationMode('Toast')).toBe(AutomationNotificationMode.Toast);
    expect(normalizeNotificationMode('Silent')).toBe(AutomationNotificationMode.Silent);
    expect(normalizeNotificationMode(2)).toBe(AutomationNotificationMode.Toast);
    expect(normalizeNotificationMode('2')).toBe(AutomationNotificationMode.Toast);
    expect(normalizeNotificationMode('qualquer')).toBe(AutomationNotificationMode.Silent);
    expect(normalizeNotificationMode(undefined)).toBe(AutomationNotificationMode.Silent);
  });

  it('normaliza o momento do toast (default After)', () => {
    expect(normalizeToastTiming('Before')).toBe(AutomationToastTiming.Before);
    expect(normalizeToastTiming('After')).toBe(AutomationToastTiming.After);
    expect(normalizeToastTiming(0)).toBe(AutomationToastTiming.Before);
    expect(normalizeToastTiming('0')).toBe(AutomationToastTiming.Before);
    expect(normalizeToastTiming('garbage')).toBe(AutomationToastTiming.After);
    expect(normalizeToastTiming(undefined)).toBe(AutomationToastTiming.After);
  });

  it('cai no requiresApproval quando o modo não veio (resposta antiga)', () => {
    expect(notificationModeFromTask(undefined, true)).toBe(AutomationNotificationMode.Prompt);
    expect(notificationModeFromTask(undefined, false)).toBe(AutomationNotificationMode.Silent);
    expect(notificationModeFromTask(null, true)).toBe(AutomationNotificationMode.Prompt);
    expect(notificationModeFromTask('', true)).toBe(AutomationNotificationMode.Prompt);
    // Modo explícito vence o booleano legado.
    expect(notificationModeFromTask('Toast', true)).toBe(AutomationNotificationMode.Toast);
    expect(notificationModeFromTask('Silent', true)).toBe(AutomationNotificationMode.Silent);
  });

  it('gera rótulos amigáveis', () => {
    expect(notificationModeLabel('Prompt')).toBe('Prompt PSADT (Continuar/Adiar)');
    expect(notificationModeLabel('Toast')).toBe('Toast simples');
    expect(notificationModeLabel('Silent')).toBe('Silencioso');
    expect(toastTimingLabel('Before')).toBe('Antes de executar');
    expect(toastTimingLabel('After')).toBe('Após a conclusão');
  });
});
