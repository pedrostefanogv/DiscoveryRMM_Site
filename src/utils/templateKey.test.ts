import { describe, expect, it } from 'vitest';
import { isValidTemplateKey, slugifyTemplateKey, templateKeyError } from './templateKey';

describe('slugifyTemplateKey', () => {
  it('gera chave a partir do título', () => {
    expect(slugifyTemplateKey('Criação de Login')).toBe('criacao_de_login');
    expect(slugifyTemplateKey('  VPN — Acesso! ')).toBe('vpn_acesso');
    expect(slugifyTemplateKey('Preciso de Ajuda')).toBe('preciso_de_ajuda');
  });

  it('devolve vazio quando não há conteúdo aproveitável', () => {
    expect(slugifyTemplateKey('!!!')).toBe('');
    expect(slugifyTemplateKey('')).toBe('');
  });
});

describe('templateKeyError / isValidTemplateKey', () => {
  it('aceita chaves válidas', () => {
    expect(templateKeyError('criacao_de_login')).toBeNull();
    expect(isValidTemplateKey('acesso_vpn_2')).toBe(true);
  });

  it('recusa vazia, curta e com caracteres inválidos', () => {
    expect(templateKeyError('')).toContain('Informe a chave');
    expect(templateKeyError('a')).toContain('ao menos');
    expect(templateKeyError('Criacao Login')).toContain('letras minúsculas');
    expect(templateKeyError('criacao-de-login')).toContain('letras minúsculas');
  });
});
