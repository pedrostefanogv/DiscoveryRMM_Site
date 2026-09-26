import { describe, expect, it } from 'vitest';
import { describeFieldFormat, describeFieldFormatError } from './fieldFormatHints';

describe('describeFieldFormat', () => {
  it('nunca devolve a regex crua e usa o exemplo de e-mail', () => {
    const hint = describeFieldFormat({
      validationRegex: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
      helpText: 'Endereço de e-mail.',
    });

    expect(hint).toBe('Endereço de e-mail. · ex.: nome@empresa.com');
    expect(hint).not.toContain('^');
    expect(hint).not.toContain('\\s');
  });

  it('usa o exemplo da máscara quando existe', () => {
    expect(describeFieldFormat({ inputMask: '999.999.999-99' })).toBe('ex.: 000.000.000-00');
    expect(describeFieldFormat({ inputMask: '**.***.***/****-99' })).toBe('ex.: XX.XXX.XXX/XXXX-00');
  });

  it('reconhece CNPJ, CPF, CEP, telefone e URL', () => {
    expect(describeFieldFormat({ validationRegex: '^[A-Za-z0-9]{12}[0-9]{2}$' })).toContain('XX.XXX.XXX/XXXX-00');
    expect(describeFieldFormat({ validationRegex: '^\\d{11}$' })).toContain('000.000.000-00');
    expect(describeFieldFormat({ validationRegex: '^\\d{5}-?\\d{3}$' })).toContain('00000-000');
    expect(describeFieldFormat({ validationRegex: '^\\(?\\d{2}\\)?\\s?\\d{4,5}-?\\d{4}$' })).toContain('(00) 00000-0000');
    expect(describeFieldFormat({ validationRegex: '^https?://[^\\s]+$' })).toContain('https://exemplo.com');
  });

  it('sem regra e sem ajuda não mostra nada', () => {
    expect(describeFieldFormat({})).toBeUndefined();
    expect(describeFieldFormat({ validationRegex: '^[a-z]+$' })).toBeUndefined();
  });

  it('prefere helpText a description', () => {
    expect(describeFieldFormat({ helpText: 'Ajuda', description: 'Descrição' })).toBe('Ajuda');
    expect(describeFieldFormat({ description: 'Descrição' })).toBe('Descrição');
  });
});

describe('describeFieldFormatError', () => {
  it('inclui o exemplo na mensagem', () => {
    expect(describeFieldFormatError('E-mail', { validationRegex: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }))
      .toBe('E-mail: informe um valor como nome@empresa.com.');
    expect(describeFieldFormatError('CPF', { inputMask: '999.999.999-99' }))
      .toBe('CPF: informe um valor como 000.000.000-00.');
  });

  it('volta para a mensagem genérica sem exemplo conhecido', () => {
    expect(describeFieldFormatError('Código', { validationRegex: '^[a-z]+$' }))
      .toBe('Código não corresponde ao formato exigido.');
  });
});
