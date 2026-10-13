import { describe, expect, it } from 'vitest';
import { CustomFieldDataType, type CustomFieldSchemaItem } from '@/api';
import { schemaValueDisplay, schemaValueDraft } from './customFieldSchemaValue';

function item(overrides: Partial<CustomFieldSchemaItem> = {}): CustomFieldSchemaItem {
  return {
    definitionId: 'd1',
    name: 'campo',
    label: 'Campo',
    description: null,
    scopeType: 3,
    dataType: CustomFieldDataType.Text,
    isRequired: false,
    isActive: true,
    isSecret: false,
    options: [],
    inputMask: null,
    minLength: null,
    maxLength: null,
    minValue: null,
    maxValue: null,
    allowRuntimeRead: false,
    allowAgentWrite: false,
    runtimeAccessMode: 0,
    accessBindings: [],
    allowWebRead: true,
    allowWebEdit: true,
    isPinned: false,
    entityId: 'a1',
    valueJson: 'null',
    valueUpdatedAt: null,
    valueUpdatedBy: null,
    ...overrides,
  };
}

describe('schemaValueDraft', () => {
  it('reduz ISO de campo Date para YYYY-MM-DD (input type=date rejeitaria o ISO)', () => {
    const date = item({ dataType: CustomFieldDataType.Date });
    expect(schemaValueDraft(date, '2026-10-13T20:37:25Z')).toBe('2026-10-13');
    expect(schemaValueDraft(date, '2026-10-13')).toBe('2026-10-13');
  });

  it('converte DateTime para datetime-local sem segundos/timezone', () => {
    const dt = item({ dataType: CustomFieldDataType.DateTime });
    expect(schemaValueDraft(dt, '2026-10-13T20:37:25')).toBe('2026-10-13T20:37');

    const iso = schemaValueDraft(dt, '2026-10-13T20:37:25.000Z');
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const parsed = new Date('2026-10-13T20:37:25.000Z');
    const pad = (n: number) => String(n).padStart(2, '0');
    expect(iso).toBe(
      `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
    );
  });

  it('mantém os demais tipos como estavam', () => {
    expect(schemaValueDraft(item(), 'qualquer coisa')).toBe('qualquer coisa');
    expect(schemaValueDraft(item({ dataType: CustomFieldDataType.Boolean }), true)).toBe('true');
    expect(schemaValueDraft(item({ dataType: CustomFieldDataType.ListBox }), ['A', 'B'])).toBe('A, B');
  });

  it('nunca devolve o valor de um segredo', () => {
    const secret = item({ dataType: CustomFieldDataType.Date, isSecret: true });
    expect(schemaValueDraft(secret, '2026-10-13')).toBe('');
  });
});

describe('schemaValueDisplay', () => {
  it('mostra Date-only em pt-BR sem deslocar o dia (bug clássico de new Date em UTC-3)', () => {
    const date = item({ dataType: CustomFieldDataType.Date });
    expect(schemaValueDisplay(date, '2026-10-13')).toBe('13/10/2026');
    expect(schemaValueDisplay(date, '2026-01-01')).toBe('01/01/2026');
  });

  it('mostra DateTime convertido para pt-BR', () => {
    const dt = item({ dataType: CustomFieldDataType.DateTime });
    const iso = '2026-10-13T20:37:25.000Z';
    expect(schemaValueDisplay(dt, iso)).toBe(new Date(iso).toLocaleString('pt-BR'));
  });

  it('mantém textos e máscara de segredo', () => {
    expect(schemaValueDisplay(item(), 'CONTRATO-1')).toBe('CONTRATO-1');
    const secret = item({ isSecret: true });
    expect(schemaValueDisplay(secret, 'segredo')).toBe('••••••');
  });
});
