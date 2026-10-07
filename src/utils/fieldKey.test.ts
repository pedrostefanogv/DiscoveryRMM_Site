import { describe, expect, it } from 'vitest';
import { fieldKeyError, isValidFieldKey, slugifyFieldKey } from './fieldKey';

describe('slugifyFieldKey', () => {
  it('gera chave a partir do título', () => {
    expect(slugifyFieldKey('Tipo de Solicitação')).toBe('tipo_de_solicitacao');
    expect(slugifyFieldKey('  Ramal — Corporativo! ')).toBe('ramal_corporativo');
    expect(slugifyFieldKey('CPF')).toBe('cpf');
  });

  it('devolve vazio quando não há conteúdo aproveitável', () => {
    expect(slugifyFieldKey('!!!')).toBe('');
    expect(slugifyFieldKey('')).toBe('');
  });
});

describe('fieldKeyError / isValidFieldKey', () => {
  it('aceita chaves válidas', () => {
    expect(fieldKeyError('tipo_solicitacao')).toBeNull();
    expect(isValidFieldKey('ramal_2')).toBe(true);
  });

  it('recusa vazia, curta e com caracteres inválidos', () => {
    expect(fieldKeyError('')).toContain('Informe a chave');
    expect(fieldKeyError('a')).toContain('ao menos');
    expect(fieldKeyError('Tipo Solicitacao')).toContain('letras minúsculas');
    expect(fieldKeyError('tipo-solicitacao')).toContain('letras minúsculas');
  });

  it('recusa chaves sem nenhum caractere alfanumérico', () => {
    expect(fieldKeyError('--')).toContain('ao menos uma letra ou número');
    expect(fieldKeyError('__')).toContain('ao menos uma letra ou número');
    expect(fieldKeyError('_-')).toContain('ao menos uma letra ou número');
    expect(fieldKeyError('--', { allowHyphen: true })).toContain('ao menos uma letra ou número');
    expect(isValidFieldKey('__')).toBe(false);
    expect(isValidFieldKey('--', { allowHyphen: true })).toBe(false);
    expect(isValidFieldKey('_a', { allowHyphen: true })).toBe(true);
  });

  it('aceita hífen apenas quando permitido (campos de departamento)', () => {
    expect(fieldKeyError('tipo-solicitacao', { allowHyphen: true })).toBeNull();
    expect(isValidFieldKey('tipo-solicitacao')).toBe(false);
    expect(isValidFieldKey('tipo-solicitacao', { allowHyphen: true })).toBe(true);
  });
});
