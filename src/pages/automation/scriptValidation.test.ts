import { describe, expect, it } from 'vitest';
import { SCRIPT_LANGUAGES } from './scriptLanguages';
import { validateScriptSyntax } from './scriptValidation';

const ps = SCRIPT_LANGUAGES.powershell;
const py = SCRIPT_LANGUAGES.python;
const sh = SCRIPT_LANGUAGES.shell;

function errorsOf(content: string, language = ps) {
  return validateScriptSyntax(content, language).filter((issue) => issue.severity === 'error');
}

function warningsOf(content: string, language = ps) {
  return validateScriptSyntax(content, language).filter((issue) => issue.severity === 'warning');
}

describe('validateScriptSyntax - conteúdo vazio', () => {
  it('reporta erro quando não há conteúdo', () => {
    expect(errorsOf('   ')[0].message).toBe('Conteúdo vazio.');
  });
});

describe('validateScriptSyntax - PowerShell', () => {
  it('aceita um script equilibrado', () => {
    const script = ['param($Name)', 'if ($Name) {', '    Write-Output "ola $Name"', '}'].join('\n');
    expect(validateScriptSyntax(script, ps)).toEqual([]);
  });

  it('acusa bloco de chaves não fechado com a linha', () => {
    const script = ['function Test {', '    Write-Output "a"'].join('\n');
    const errors = errorsOf(script);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(1);
    expect(errors[0].message).toContain('aberto e não fechado');
  });

  it('acusa aspas não fechadas', () => {
    const errors = errorsOf('Write-Output "sem fim');
    expect(errors[0].message).toContain('Aspas duplas');
  });

  it('não confunde string terminando em @ com here-string', () => {
    expect(validateScriptSyntax('$email = "contato@"', ps)).toEqual([]);
  });

  it('reconhece here-string fechada e acusa a não fechada', () => {
    const closed = ['$x = @"', 'conteudo', '"@'].join('\n');
    expect(validateScriptSyntax(closed, ps)).toEqual([]);

    const open = ['$x = @"', 'conteudo'].join('\n');
    const errors = errorsOf(open);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(1);
    expect(errors[0].message).toContain('Here-string');
  });
});

describe('validateScriptSyntax - Python', () => {
  it('avisa bloco sem dois-pontos', () => {
    const warnings = warningsOf('if True', py);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("Bloco 'if' sem ':'");
  });

  it('não reclama quando o bloco está correto', () => {
    expect(validateScriptSyntax('if True:', py)).toEqual([]);
  });

  it('acusa string multilinha não fechada', () => {
    const script = ['texto = """', 'linha'].join('\n');
    const errors = errorsOf(script, py);
    expect(errors[0].line).toBe(1);
    expect(errors[0].message).toContain('String multilinha');
  });

  it('avisa mistura de tab e espaço na indentação', () => {
    const warnings = warningsOf('\t    print("a")', py);
    expect(warnings.some((issue) => issue.message.includes('Mistura de tab'))).toBe(true);
  });
});

describe('validateScriptSyntax - Shell', () => {
  it('reconhece heredoc fechado e acusa o não fechado', () => {
    const closed = ['cat <<EOF', 'ok', 'EOF'].join('\n');
    expect(validateScriptSyntax(closed, sh)).toEqual([]);

    const open = ['cat <<EOF', 'ok'].join('\n');
    expect(errorsOf(open, sh)[0].message).toContain('Heredoc');
  });

  it('não trata o ) do case como erro bloqueante', () => {
    const script = ['case $x in', '  a) echo um ;;', 'esac'].join('\n');
    expect(errorsOf(script, sh)).toEqual([]);
  });
});

