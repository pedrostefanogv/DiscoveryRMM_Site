import { AutomationScriptType } from '@/api';

/**
 * Metadados, tokenizer e formatação por linguagem de script.
 *
 * O modal de cadastro apresenta o conteúdo de acordo com o tipo escolhido
 * (PowerShell, Shell, Python, Batch ou Custom): realce de sintaxe, numeração de
 * linhas, indentação e modelo inicial. Sem dependências novas: o editor é um
 * textarea transparente sobre uma camada realçada.
 */

export type ScriptLanguageId = 'powershell' | 'shell' | 'python' | 'batch' | 'custom';

/** Como o botão "Formatar" reorganiza a indentação. */
export type BlockStyle = 'brace' | 'colon' | 'none';

/** Severidade de uma checagem estrutural. */
export type LintSeverity = 'error' | 'warning' | 'off';

/** Regras de validação estrutural usadas pelo validador do modal. */
export interface ScriptLintConfig {
  braces: LintSeverity;
  parens: LintSeverity;
  quotes: LintSeverity;
  multiline: 'here-string' | 'triple-quote' | 'heredoc' | 'none';
}

export interface ScriptLanguage {
  id: ScriptLanguageId;
  label: string;
  /** Nome de arquivo sugerido, exibido no cabeçalho do editor. */
  filename: string;
  /** Texto curto de ajuda exibido no rodapé. */
  hint: string;
  /** Placeholder quando o editor está vazio. */
  placeholder: string;
  /** Unidade de indentação em espaços. */
  indentUnit: number;
  blockStyle: BlockStyle;
  lint: ScriptLintConfig;
  /** Prefixos de comentário de linha. */
  lineComments: string[];
  /** Sigilo de variável ($ no PowerShell/Shell, % no Batch). */
  variableSigil?: string;
  /** Destaque de parâmetros iniciados por "-" (PowerShell). */
  parameterPrefix?: boolean;
  /** Destaque de cmdlets no padrão Verbo-Substantivo. */
  cmdletPattern?: boolean;
  caseInsensitiveKeywords?: boolean;
  keywords: string[];
  builtins: string[];
  /** Modelo inicial oferecido quando o editor está vazio. */
  template: string;
}

export const SCRIPT_LANGUAGES: Record<ScriptLanguageId, ScriptLanguage> = {
  powershell: {
    id: 'powershell',
    lint: { braces: 'error', parens: 'error', quotes: 'error', multiline: 'here-string' },
    label: 'PowerShell',
    filename: 'script.ps1',
    hint: 'Executado com powershell -NoProfile -NonInteractive -Command.',
    placeholder: "# Ex.: Write-Output 'ola do Discovery'",
    indentUnit: 4,
    blockStyle: 'brace',
    lineComments: ['#'],
    variableSigil: '$',
    parameterPrefix: true,
    cmdletPattern: true,
    caseInsensitiveKeywords: true,
    keywords: [
      'function', 'param', 'if', 'elseif', 'else', 'foreach', 'for', 'while', 'do', 'until',
      'switch', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'in',
      'class', 'enum', 'using', 'begin', 'process', 'end', 'filter', 'workflow', 'trap', 'exit',
    ],
    builtins: [
      'Write-Output', 'Write-Host', 'Write-Error', 'Write-Warning', 'Get-Item', 'Get-ChildItem',
      'Test-Path', 'Join-Path', 'Select-Object', 'Where-Object', 'ForEach-Object', 'ConvertTo-Json',
      'echo', 'ls', 'dir', 'cd', 'cat', 'rm',
    ],
    template: "# Script PowerShell - DiscoveryRMM\n$ErrorActionPreference = 'Stop'\n\nWrite-Output 'ola do Discovery'\n",
  },
  shell: {
    id: 'shell',
    lint: { braces: 'warning', parens: 'warning', quotes: 'off', multiline: 'heredoc' },
    label: 'Shell',
    filename: 'script.sh',
    hint: 'Executado com cmd /C no agente (mantenha compatível com o shell alvo).',
    placeholder: "# Ex.: echo 'ola do Discovery'",
    indentUnit: 2,
    blockStyle: 'none',
    lineComments: ['#'],
    variableSigil: '$',
    keywords: [
      'if', 'then', 'elif', 'else', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac',
      'in', 'function', 'return', 'exit', 'local', 'export', 'source', 'set', 'unset', 'shift',
      'break', 'continue',
    ],
    builtins: [
      'echo', 'cd', 'pwd', 'printf', 'read', 'test', 'sleep', 'grep', 'sed', 'awk', 'curl',
      'systemctl', 'mkdir', 'rm', 'cp', 'mv', 'cat',
    ],
    template: "#!/bin/bash\nset -euo pipefail\n\necho 'ola do Discovery'\n",
  },
  python: {
    id: 'python',
    lint: { braces: 'error', parens: 'error', quotes: 'error', multiline: 'triple-quote' },
    label: 'Python',
    filename: 'script.py',
    hint: 'Executado com python -c no agente.',
    placeholder: "# Ex.: print('ola do Discovery')",
    indentUnit: 4,
    blockStyle: 'colon',
    lineComments: ['#'],
    keywords: [
      'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or',
      'is', 'None', 'True', 'False', 'try', 'except', 'finally', 'raise', 'import', 'from', 'as',
      'with', 'lambda', 'yield', 'async', 'await', 'pass', 'break', 'continue', 'global',
      'nonlocal', 'del', 'assert', 'match', 'case',
    ],
    builtins: [
      'print', 'len', 'range', 'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple',
      'open', 'isinstance', 'enumerate', 'zip', 'map', 'filter', 'sum', 'min', 'max', 'sorted',
      'abs', 'round', 'type', 'super', 'self', 'Exception', 'ValueError', 'TypeError', 'RuntimeError',
    ],
    template: "# Script Python - DiscoveryRMM\n\ndef main():\n    print('ola do Discovery')\n\n\nif __name__ == '__main__':\n    main()\n",
  },
  batch: {
    id: 'batch',
    lint: { braces: 'off', parens: 'warning', quotes: 'warning', multiline: 'none' },
    label: 'Batch',
    filename: 'script.bat',
    hint: 'Executado com cmd /C no agente.',
    placeholder: '@echo off',
    indentUnit: 2,
    blockStyle: 'none',
    lineComments: ['REM', '::'],
    variableSigil: '%',
    caseInsensitiveKeywords: true,
    keywords: [
      'if', 'else', 'for', 'in', 'do', 'goto', 'call', 'set', 'setlocal', 'endlocal', 'exit',
      'not', 'exist', 'errorlevel', 'defined',
    ],
    builtins: [
      'echo', 'cd', 'copy', 'del', 'dir', 'mkdir', 'move', 'ren', 'start', 'taskkill', 'sc',
      'net', 'ping', 'ipconfig', 'reg', 'wmic', 'powershell',
    ],
    template: "@echo off\r\nREM Script Batch - DiscoveryRMM\r\necho ola do Discovery\r\n",
  },
  custom: {
    id: 'custom',
    lint: { braces: 'warning', parens: 'warning', quotes: 'warning', multiline: 'none' },
    label: 'Custom',
    filename: 'script.txt',
    hint: 'Tipo genérico: o agente executa via cmd /C.',
    placeholder: '# Script personalizado',
    indentUnit: 4,
    blockStyle: 'brace',
    lineComments: ['#', '//'],
    keywords: [],
    builtins: [],
    template: '# Script personalizado\n',
  },
};

const SCRIPT_TYPE_BY_NAME: Record<string, AutomationScriptType> = {
  powershell: AutomationScriptType.PowerShell,
  shell: AutomationScriptType.Shell,
  python: AutomationScriptType.Python,
  batch: AutomationScriptType.Batch,
  custom: AutomationScriptType.Custom,
};

/** Resolve a linguagem a partir do enum numérico ou do nome vindo da API. */
export function languageForScriptType(scriptType: unknown): ScriptLanguage {
  let numeric = NaN;
  if (typeof scriptType === 'number') numeric = scriptType;
  else if (typeof scriptType === 'string') {
    const value = scriptType.trim();
    if (/^[0-9]+$/.test(value)) numeric = Number(value);
    else numeric = SCRIPT_TYPE_BY_NAME[value.toLowerCase()] ?? NaN;
  }
  switch (numeric) {
    case AutomationScriptType.PowerShell:
      return SCRIPT_LANGUAGES.powershell;
    case AutomationScriptType.Shell:
      return SCRIPT_LANGUAGES.shell;
    case AutomationScriptType.Python:
      return SCRIPT_LANGUAGES.python;
    case AutomationScriptType.Batch:
      return SCRIPT_LANGUAGES.batch;
    default:
      return SCRIPT_LANGUAGES.custom;
  }
}

export type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'keyword'
  | 'builtin'
  | 'number'
  | 'variable'
  | 'parameter'
  | 'operator';

export interface Token {
  text: string;
  kind: TokenKind;
}

interface LanguageIndex {
  keywords: Set<string>;
  builtins: Set<string>;
}

const indexCache = new Map<ScriptLanguageId, LanguageIndex>();

function indexOf(language: ScriptLanguage): LanguageIndex {
  let index = indexCache.get(language.id);
  if (!index) {
    const normalize = (value: string) => (language.caseInsensitiveKeywords ? value.toLowerCase() : value);
    index = {
      keywords: new Set(language.keywords.map(normalize)),
      builtins: new Set(language.builtins.map(normalize)),
    };
    indexCache.set(language.id, index);
  }
  return index;
}

const WORD_START = /[A-Za-z_]/;
const WORD_CHAR = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;
const NUMBER_CHAR = /[0-9A-Fa-fxX._]/;
const OPERATOR = '=<>!&|+-*/%^~?:';

function isWordStart(ch: string | undefined): boolean {
  return ch !== undefined && WORD_START.test(ch);
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch);
}

/** Início de um comentário de linha na posição i, ou null. */
export function matchLineComment(line: string, i: number, language: ScriptLanguage): number | null {
  const rest = line.slice(i);
  for (const prefix of language.lineComments) {
    const textual = WORD_START.test(prefix);
    if (textual && language.caseInsensitiveKeywords) {
      if (rest.toUpperCase().startsWith(prefix.toUpperCase()) && !isWordChar(rest[prefix.length])) return i;
    } else if (textual) {
      if (rest.startsWith(prefix) && !isWordChar(rest[prefix.length])) return i;
    } else if (rest.startsWith(prefix)) {
      return i;
    }
  }
  return null;
}

/** Consome uma string simples (mesma linha). Devolve o índice após o fechamento. */
function scanString(line: string, start: number, quote: string, language: ScriptLanguage): number {
  let i = start + 1;
  while (i < line.length) {
    const ch = line[i];
    if (ch === String.fromCharCode(92) && language.id !== 'powershell') {
      i += 2;
      continue;
    }
    if (ch === quote) {
      if (line[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return line.length;
}

/** Remove comentários e strings — usado para analisar estrutura/indentação. */
export function codeOnly(line: string, language: ScriptLanguage): string {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (matchLineComment(line, i, language) !== null) break;
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      const end = scanString(line, i, ch, language);
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Realce de uma linha, sem depender de nenhuma biblioteca externa. */
export function tokenizeLine(line: string, language: ScriptLanguage): Token[] {
  const tokens: Token[] = [];
  const { keywords, builtins } = indexOf(language);
  let i = 0;
  let plainStart = 0;

  const flushPlain = (end: number) => {
    if (end > plainStart) tokens.push({ text: line.slice(plainStart, end), kind: 'plain' });
  };
  const pushToken = (end: number, kind: TokenKind) => {
    flushPlain(i);
    tokens.push({ text: line.slice(i, end), kind });
    i = end;
    plainStart = i;
  };

  while (i < line.length) {
    const ch = line[i];

    if (matchLineComment(line, i, language) !== null) {
      flushPlain(i);
      tokens.push({ text: line.slice(i), kind: 'comment' });
      return tokens;
    }

    if (ch === '"' || ch === "'") {
      pushToken(scanString(line, i, ch, language), 'string');
      continue;
    }

    if (language.variableSigil && ch === language.variableSigil) {
      let j = i + 1;
      if (line[j] === '{') {
        j++;
        while (j < line.length && line[j] !== '}') j++;
        if (j < line.length) j++;
      } else {
        while (j < line.length && (isWordChar(line[j]) || (language.id === 'powershell' && line[j] === ':'))) j++;
        if (language.id === 'batch' && line[j] === '%') j++;
      }
      pushToken(j, 'variable');
      continue;
    }

    if (DIGIT.test(ch) && !isWordChar(line[i - 1])) {
      let j = i;
      while (j < line.length && NUMBER_CHAR.test(line[j])) j++;
      pushToken(j, 'number');
      continue;
    }

    if (isWordStart(ch)) {
      let j = i;
      while (j < line.length && isWordChar(line[j])) j++;
      // Cmdlets Verbo-Substantivo (Get-ChildItem, Where-Object) formam um token só.
      if (language.cmdletPattern) {
        while (line[j] === '-' && isWordStart(line[j + 1])) {
          j++;
          while (j < line.length && isWordChar(line[j])) j++;
        }
      }
      const word = line.slice(i, j);
      const key = language.caseInsensitiveKeywords ? word.toLowerCase() : word;
      let kind: TokenKind = 'plain';
      if (keywords.has(key)) kind = 'keyword';
      else if (builtins.has(key)) kind = 'builtin';
      else if (language.cmdletPattern && /^[A-Za-z]+-[A-Za-z]+$/.test(word)) kind = 'builtin';
      pushToken(j, kind);
      continue;
    }

    if (language.parameterPrefix && ch === '-' && isWordStart(line[i + 1]) && !isWordChar(line[i - 1])) {
      let j = i + 1;
      while (j < line.length && isWordChar(line[j])) j++;
      pushToken(j, 'parameter');
      continue;
    }

    if (OPERATOR.includes(ch)) {
      pushToken(i + 1, 'operator');
      continue;
    }

    i++;
  }

  flushPlain(i);
  return tokens;
}

/** Normaliza fim de linha para LF e remove BOM. */
export function normalizeEol(text: string): string {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, '\n');
}

/**
 * Conteúdo com strings multilinha (here-string do PowerShell, triple quotes do
 * Python, heredoc do Shell): reindentar automaticamente é inseguro.
 */
export function hasMultiLineString(content: string, language: ScriptLanguage): boolean {
  switch (language.id) {
    case 'powershell':
      return /(^|[=(,: \t])@["'][ \t]*(\n|$)/.test(content);
    case 'python':
      return /"""|'''/.test(content);
    case 'shell':
      return /<<-?[ \t]*["']?[A-Za-z_]+/.test(content);
    default:
      return false;
  }
}

function capBlankLines(lines: string[]): string[] {
  const out: string[] = [];
  let blanks = 0;
  for (const line of lines) {
    if (line.trim() === '') {
      blanks++;
      if (blanks > 1) continue;
      out.push('');
    } else {
      blanks = 0;
      out.push(line);
    }
  }
  return out;
}

function reindentLines(lines: string[], language: ScriptLanguage): string[] {
  const unit = ' '.repeat(language.indentUnit);
  const out: string[] = [];
  let depth = 0;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }
    const code = codeOnly(trimmed, language);

    if (language.blockStyle === 'colon') {
      const lower = code.trim().toLowerCase();
      const dedent = /^(elif|else|except|finally)\b/.test(lower) ? 1 : 0;
      const opens = code.match(/[([{]/g)?.length ?? 0;
      const closes = code.match(/[)\]}]/g)?.length ?? 0;
      const effective = Math.max(0, depth + Math.max(0, opens - closes) - dedent);
      out.push(unit.repeat(effective) + trimmed);
      if (/:\s*$/.test(code.trim())) depth = effective + 1;
      else if (dedent > 0) depth = effective;
    } else {
      const leading = /^[}\])]+/.exec(code.trim())?.[0].length ?? 0;
      const effective = Math.max(0, depth - leading);
      out.push(unit.repeat(effective) + trimmed);
      const opens = code.match(/[{[]/g)?.length ?? 0;
      const closes = code.match(/[}\]]/g)?.length ?? 0;
      depth = Math.max(0, depth + opens - closes);
    }
  }

  return out;
}

/**
 * Formata o documento de acordo com a linguagem: normaliza fim de linha,
 * remove espaços à direita, limita linhas em branco e (quando seguro)
 * reindenta por profundidade de bloco.
 */
export function formatScriptContent(content: string, language: ScriptLanguage): string {
  const normalized = normalizeEol(content);
  const trimmedLines = normalized.split('\n').map((line) => line.replace(/[ \t]+$/, ''));
  let lines = capBlankLines(trimmedLines);
  if (language.blockStyle !== 'none' && !hasMultiLineString(normalized, language)) {
    lines = reindentLines(lines, language);
  }
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.length ? lines.join('\n') + '\n' : '';
}

/** Indentação sugerida para a linha criada ao pressionar Enter. */
export function indentForNextLine(currentLine: string, language: ScriptLanguage): string {
  const base = (/^[ \t]*/.exec(currentLine)?.[0] ?? '').replace(/\t/g, ' '.repeat(language.indentUnit));
  const code = codeOnly(currentLine, language).trimEnd();
  let extra = 0;
  if (language.blockStyle === 'brace' && /[{[]\s*$/.test(code)) extra = language.indentUnit;
  else if (language.blockStyle === 'colon' && /:\s*$/.test(code)) extra = language.indentUnit;
  else if (language.id === 'shell' && /\b(then|do|else)\s*$/.test(code)) extra = language.indentUnit;
  else if (language.id === 'batch' && /\(\s*$/.test(code)) extra = language.indentUnit;
  return base + ' '.repeat(extra);
}

/** Remove até unit espaços do começo da linha (Shift+Tab). */
export function dedentLine(line: string, unit: number): string {
  const match = /^[ \t]*/.exec(line)?.[0] ?? '';
  const removable = Math.min(match.length, unit);
  return line.slice(removable);
}
