import { describe, expect, it } from 'vitest';
import { CustomFieldDataType } from '@/api/custom-fields';
import {
  parseTemplateQuestions,
  questionToSchemaField,
  serializeTemplateQuestions,
  slugifyQuestionKey,
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
