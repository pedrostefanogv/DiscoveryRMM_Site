import { describe, expect, it } from 'vitest';
import { CustomFieldDataType, type TicketSchemaField } from '@/api';
import { buildTicketCustomFieldValidation, validateTicketSchemaField } from './ticketCustomFields';

const field = (over: Partial<TicketSchemaField> = {}): TicketSchemaField => ({
  definitionId: 'email',
  name: 'email',
  label: 'E-mail',
  description: 'Endereço de e-mail.',
  dataType: CustomFieldDataType.Text,
  isRequired: true,
  isInternal: false,
  isActive: true,
  options: [],
  validationRegex: null,
  inputMask: null,
  minLength: null,
  maxLength: null,
  minValue: null,
  maxValue: null,
  currentValueJson: null,
  ...over,
});

describe('validateTicketSchemaField', () => {
  it('explica o formato com exemplo em vez da regex crua', () => {
    const result = validateTicketSchemaField(
      field({ validationRegex: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }),
      'nao-e-email',
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe('E-mail: informe um valor como nome@empresa.com.');
    expect(result.error).not.toContain('^');
  });

  it('aceita valor válido e converte números mascarados', () => {
    expect(validateTicketSchemaField(field({ validationRegex: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }), 'ana@empresa.com').ok).toBe(true);

    const currency = validateTicketSchemaField(
      field({ definitionId: 'valor', label: 'Valor', dataType: CustomFieldDataType.Decimal, isRequired: false, inputMask: 'R$ 9.999.999,99' }),
      'R$ 1.234,56',
    );
    expect(currency.ok).toBe(true);
    expect(currency.value).toBe(1234.56);
  });

  it('cobra campo obrigatório vazio', () => {
    const result = validateTicketSchemaField(field(), '');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E-mail é obrigatório.');
  });
});

describe('buildTicketCustomFieldValidation', () => {
  it('aponta o erro para o definitionId correto', () => {
    const fields = [
      field({ definitionId: 'nome', label: 'Nome', isRequired: true }),
      field({ definitionId: 'email', label: 'E-mail', validationRegex: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }),
      field({ definitionId: 'obs', label: 'Observação', isRequired: false }),
    ];

    const result = buildTicketCustomFieldValidation(fields, { nome: 'Ana', email: 'invalido', obs: '' });

    expect(result.errors).toHaveLength(1);
    expect(Object.keys(result.errorsByField)).toEqual(['email']);
    expect(result.errorsByField.email).toContain('nome@empresa.com');
    expect(result.values).toEqual({ nome: 'Ana' });
  });

  it('sem erros devolve o mapa vazio', () => {
    const result = buildTicketCustomFieldValidation(
      [field({ definitionId: 'nome', label: 'Nome', isRequired: false })],
      { nome: 'Ana' },
    );
    expect(result.errors).toEqual([]);
    expect(result.errorsByField).toEqual({});
    expect(result.values).toEqual({ nome: 'Ana' });
  });
});
