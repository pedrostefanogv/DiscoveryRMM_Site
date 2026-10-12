import { describe, expect, it } from 'vitest';
import { AutomationScriptType } from '@/api';
import {
  SCRIPT_LANGUAGES,
  formatScriptContent,
  hasMultiLineString,
  indentForNextLine,
  languageForScriptType,
  normalizeEol,
  tokenizeLine,
} from './scriptLanguages';

describe('languageForScriptType', () => {
  it('mapeia cada tipo do enum para a sua linguagem', () => {
    expect(languageForScriptType(AutomationScriptType.PowerShell).id).toBe('powershell');
    expect(languageForScriptType(AutomationScriptType.Shell).id).toBe('shell');
    expect(languageForScriptType(AutomationScriptType.Python).id).toBe('python');
    expect(languageForScriptType(AutomationScriptType.Batch).id).toBe('batch');
    expect(languageForScriptType(AutomationScriptType.Custom).id).toBe('custom');
  });

  it('aceita o tipo como string (valor do select)', () => {
    expect(languageForScriptType('2').id).toBe('python');
    expect(languageForScriptType('Python').id).toBe('python');
  });

  it('cai em Custom quando o tipo é desconhecido', () => {
    expect(languageForScriptType(undefined).id).toBe('custom');
    expect(languageForScriptType('???').id).toBe('custom');
  });
});

describe('tokenizeLine', () => {
  it('realça PowerShell (cmdlet, parâmetro, variável, string e comentário)', () => {
    const tokens = tokenizeLine(
      "Get-ChildItem -Path $env:TEMP | Where-Object { $_.Name -eq 'log' } # nota",
      SCRIPT_LANGUAGES.powershell,
    );
    const kindOf = (text: string) => tokens.find((token) => token.text === text)?.kind;
    expect(kindOf('Get-ChildItem')).toBe('builtin');
    expect(kindOf('Where-Object')).toBe('builtin');
    expect(kindOf('-Path')).toBe('parameter');
    expect(kindOf('$env:TEMP')).toBe('variable');
    expect(kindOf("'log'")).toBe('string');
    expect(tokens[tokens.length - 1]).toEqual({ text: '# nota', kind: 'comment' });
  });

  it('realça palavra-chave e comentário no PowerShell', () => {
    const tokens = tokenizeLine('function Test { # inicio', SCRIPT_LANGUAGES.powershell);
    expect(tokens.find((token) => token.text === 'function')?.kind).toBe('keyword');
    expect(tokens[tokens.length - 1].kind).toBe('comment');
  });

  it('realça Python (palavra-chave, builtin e string)', () => {
    const tokens = tokenizeLine("def main(): print('ola')  # inicio", SCRIPT_LANGUAGES.python);
    expect(tokens.find((token) => token.text === 'def')?.kind).toBe('keyword');
    expect(tokens.find((token) => token.text === 'print')?.kind).toBe('builtin');
    expect(tokens.find((token) => token.text === "'ola'")?.kind).toBe('string');
    expect(tokens[tokens.length - 1].kind).toBe('comment');
  });

  it('realça Shell e Batch com comentários e variáveis', () => {
    const shell = tokenizeLine('if [ -f $HOME/x ]; then # ok', SCRIPT_LANGUAGES.shell);
    expect(shell.find((token) => token.text === 'if')?.kind).toBe('keyword');
    expect(shell.find((token) => token.text === '$HOME')?.kind).toBe('variable');
    expect(shell[shell.length - 1].kind).toBe('comment');

    const batch = tokenizeLine('echo %TEMP%', SCRIPT_LANGUAGES.batch);
    expect(batch.find((token) => token.text === '%TEMP%')?.kind).toBe('variable');
    expect(tokenizeLine('REM limpa', SCRIPT_LANGUAGES.batch)[0]).toEqual({ text: 'REM limpa', kind: 'comment' });
  });
});

describe('formatScriptContent', () => {
  it('normaliza CRLF, espaços à direita e linhas em branco', () => {
    const out = formatScriptContent('a  \r\n\r\n\r\nb   \r\n', SCRIPT_LANGUAGES.shell);
    expect(out).toBe('a\n\nb\n');
  });

  it('reindenta blocos de chaves no PowerShell', () => {
    const input = ['function Test {', 'Write-Output "a"', 'if ($true) {', 'Write-Output "b"', '}', '}'].join('\n');
    const expected = [
      'function Test {',
      '    Write-Output "a"',
      '    if ($true) {',
      '        Write-Output "b"',
      '    }',
      '}',
    ].join('\n');
    expect(formatScriptContent(input, SCRIPT_LANGUAGES.powershell)).toBe(expected + '\n');
  });

  it('reindenta blocos por dois-pontos no Python (inclusive elif/else)', () => {
    const input = ['def main():', 'print("a")', 'if True:', 'print("b")', 'else:', 'print("c")'].join('\n');
    const expected = [
      'def main():',
      '    print("a")',
      '    if True:',
      '        print("b")',
      '    else:',
      '        print("c")',
    ].join('\n');
    expect(formatScriptContent(input, SCRIPT_LANGUAGES.python)).toBe(expected + '\n');
  });

  it('preserva a indentação quando há string multilinha (reindent é inseguro)', () => {
    const input = 'texto = """\n   linha   \n"""\n';
    expect(hasMultiLineString(input, SCRIPT_LANGUAGES.python)).toBe(true);
    expect(formatScriptContent(input, SCRIPT_LANGUAGES.python)).toBe('texto = """\n   linha\n"""\n');
  });

  it('detecta here-string do PowerShell e heredoc do Shell', () => {
    expect(hasMultiLineString('$x = @"\nconteudo\n"@', SCRIPT_LANGUAGES.powershell)).toBe(true);
    expect(hasMultiLineString('cat <<EOF\nok\nEOF', SCRIPT_LANGUAGES.shell)).toBe(true);
    expect(hasMultiLineString('echo oi', SCRIPT_LANGUAGES.shell)).toBe(false);
  });
});

describe('indentForNextLine', () => {
  it('indenta após bloco aberto', () => {
    expect(indentForNextLine('if ($true) {', SCRIPT_LANGUAGES.powershell)).toBe('    ');
    expect(indentForNextLine('def main():', SCRIPT_LANGUAGES.python)).toBe('    ');
  });

  it('mantém a indentação corrente em linha comum', () => {
    expect(indentForNextLine('    Write-Output "a"', SCRIPT_LANGUAGES.powershell)).toBe('    ');
    expect(indentForNextLine('x = 1', SCRIPT_LANGUAGES.python)).toBe('');
  });
});

describe('normalizeEol', () => {
  it('remove BOM e converte CRLF/CR para LF', () => {
    expect(normalizeEol(String.fromCharCode(0xfeff) + 'a\r\nb\rc')).toBe('a\nb\nc');
  });
});
