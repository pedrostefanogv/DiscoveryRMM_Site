import { describe, expect, it } from 'vitest';
import { CustomFieldDataType } from '@/api/custom-fields';
import {
  parseTemplateQuestions,
  questionToSchemaField,
  serializeTemplateQuestions,
  slugifyQuestionKey,
  validateTemplateQuestions,
  type TemplateQuestion,
} from './templateQuestions';

const question = (overrides: Partial<TemplateQuestion> = {}): TemplateQuestion => ({
  key: 'nome',
  label: 'Nome',
  dataType: CustomFieldDataType.Text,
  isRequired: false,
  options: [],
  validationRegex: null,
  inputMask: null,
  minLength: null,
  maxLength: null,
  minValue: null,
  maxValue: null,
  helpText: null,
  isSensitive: false,
  ...overrides,
});

describe('parseTemplateQuestions', () => {
  it('faz parse tolerante a camel/Pascal e campos ausentes', () => {
    const json = JSON.stringify([
      { Key: 'nome', Label: 'Nome', DataType: 'Text', IsRequired: true },
      { key: 'sistema', label: 'Sistema', dataType: 6, options: ['Interno', 'Terceiros'] },
    ]);
    const parsed = parseTemplateQuestions(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].isRequired).toBe(true);
    expect(parsed[1].dataType).toBe(CustomFieldDataType.Dropdown);
    expect(parsed[1].options).toEqual(['Interno', 'Terceiros']);
  });

  it('lê a marca de sensibilidade (não indexar na busca semântica)', () => {
    const json = JSON.stringify([
      { key: 'cpf', label: 'CPF', dataType: 0, isSensitive: true },
      { key: 'obs', label: 'Observação', dataType: 0 },
    ]);
    const parsed = parseTemplateQuestions(json);
    expect(parsed[0].isSensitive).toBe(true);
    expect(parsed[1].isSensitive).toBe(false);
  });

  it('ignora JSON inválido e perguntas incompletas', () => {
    expect(parseTemplateQuestions('{invalido')).toEqual([]);
    expect(parseTemplateQuestions(null)).toEqual([]);
    expect(parseTemplateQuestions(JSON.stringify([{ key: '', label: 'X' }]))).toEqual([]);
  });
});

describe('serializeTemplateQuestions', () => {
  it('remove perguntas incompletas e normaliza campos', () => {
    const json = serializeTemplateQuestions([
      question({ key: ' nome ', label: ' Nome ', inputMask: ' AA ' }),
      question({ key: '', label: 'Sem chave' }),
    ]);
    const parsed = parseTemplateQuestions(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].key).toBe('nome');
    expect(parsed[0].inputMask).toBe('AA');
  });
});

describe('slugifyQuestionKey', () => {
  it('gera chave estável a partir do rótulo', () => {
    expect(slugifyQuestionKey('Nome completo', 0)).toBe('nome_completo');
    expect(slugifyQuestionKey('E-mail de contato', 1)).toBe('e_mail_de_contato');
    expect(slugifyQuestionKey('???', 2)).toBe('pergunta_3');
  });
});

describe('validateTemplateQuestions', () => {
  it('aceita um questionário válido', () => {
    expect(validateTemplateQuestions([])).toBeNull();
    expect(
      validateTemplateQuestions([
        question({ key: 'email', label: 'E-mail', validationRegex: '^\\S+@\\S+\\.\\S+$' }),
        question({ key: 'sistema', label: 'Sistema' }),
      ]),
    ).toBeNull();
  });

  it('exige rótulo e chave em toda pergunta', () => {
    expect(validateTemplateQuestions([question({ label: 'Sem chave', key: '' })]))
      .toBe('Toda pergunta do modelo precisa de rótulo e chave.');
    expect(validateTemplateQuestions([question({ label: '  ', key: 'x' })]))
      .toBe('Toda pergunta do modelo precisa de rótulo e chave.');
  });

  it('bloqueia chave duplicada ignorando maiúsculas', () => {
    expect(
      validateTemplateQuestions([
        question({ key: 'email', label: 'E-mail' }),
        question({ key: 'Email', label: 'E-mail 2' }),
      ]),
    ).toBe('Chave de pergunta duplicada: "Email".');
  });

  it('exige opções para dropdown e listbox', () => {
    expect(
      validateTemplateQuestions([question({ dataType: CustomFieldDataType.Dropdown, options: [] })]),
    ).toBe('Pergunta "Nome": informe ao menos uma opção.');
    expect(
      validateTemplateQuestions([question({ dataType: CustomFieldDataType.ListBox, options: ['A'] })]),
    ).toBeNull();
  });

  it('rejeita regex inválida', () => {
    expect(
      validateTemplateQuestions([question({ validationRegex: '([a-z' })]),
    ).toBe('Pergunta "Nome": regex de validação inválida.');
  });

  it('exige mínimo menor ou igual ao máximo', () => {
    expect(validateTemplateQuestions([question({ minLength: 10, maxLength: 4 })]))
      .toBe('Pergunta "Nome": tamanho mínimo maior que o máximo.');
    expect(validateTemplateQuestions([question({ minValue: 10, maxValue: 4 })]))
      .toBe('Pergunta "Nome": valor mínimo maior que o máximo.');
  });
});

describe('questionToSchemaField', () => {
  it('converte a pergunta para o renderer/validador de campos', () => {
    const field = questionToSchemaField(question({ key: 'cpf', isRequired: true, inputMask: '999' }));
    expect(field.definitionId).toBe('cpf');
    expect(field.name).toBe('cpf');
    expect(field.isRequired).toBe(true);
    expect(field.inputMask).toBe('999');
    expect(field.isActive).toBe(true);
  });
});
