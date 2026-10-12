import { codeOnly, matchLineComment, normalizeEol, type ScriptLanguage } from './scriptLanguages';

/** Problema estrutural encontrado no conteúdo do script. */
export interface ScriptIssue {
  /** Linha (1-based) onde o problema foi detectado. */
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

const CLOSERS: Record<string, string> = { '}': '{', ')': '(', ']': '[' };

/** Índice do fechamento da string que começa em start, ou -1 se não fechar. */
function closingQuoteIndex(line: string, start: number, quote: string, language: ScriptLanguage): number {
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
      return i;
    }
    i++;
  }
  return -1;
}

interface MultilineStart {
  terminator: string;
  label: string;
}

function detectMultilineStart(line: string, language: ScriptLanguage): MultilineStart | null {
  if (language.lint.multiline === 'here-string') {
    // Exige início de linha ou separador antes do @, para não confundir
    // uma string comum terminando em "@" (ex.: "contato@") com here-string.
    const match = /(^|[=(,:\s])@(["'])[ \t]*$/.exec(line);
    if (match) {
      return { terminator: match[2] === '"' ? '"@' : "'@", label: 'Here-string' };
    }
  }
  if (language.lint.multiline === 'triple-quote') {
    for (const delimiter of ['"""', "'''"]) {
      const occurrences = line.split(delimiter).length - 1;
      if (occurrences % 2 === 1) return { terminator: delimiter, label: 'String multilinha' };
    }
  }
  if (language.lint.multiline === 'heredoc') {
    const match = /<<-?[ \t]*["']?([A-Za-z_][A-Za-z0-9_]*)["']?/.exec(line);
    if (match) return { terminator: match[1], label: 'Heredoc' };
  }
  return null;
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

/**
 * Valida a estrutura do conteúdo de acordo com a linguagem escolhida:
 * aspas, chaves/parênteses, here-string/triple quotes/heredoc, blocos com ':'
 * (Python) e balanceamento de if/fi, do/done, case/esac (Shell).
 *
 * Erros impedem o salvamento; avisos apenas alertam.
 */
export function validateScriptSyntax(content: string, language: ScriptLanguage): ScriptIssue[] {
  if (!content.trim()) {
    return [{ line: 1, message: 'Conteúdo vazio.', severity: 'error' }];
  }

  const issues: ScriptIssue[] = [];
  const lines = normalizeEol(content).split('\n');
  const stack: Array<{ char: string; line: number; severity: 'error' | 'warning' }> = [];
  let pending: { terminator: string; label: string; line: number } | null = null;

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const rawLine = lines[index];

    if (pending) {
      const terminate = pending.label === 'Heredoc'
        ? rawLine.replace(/^\t+/, '').trim() === pending.terminator
        : rawLine.includes(pending.terminator);
      if (terminate) pending = null;
      continue;
    }

    const multiline = detectMultilineStart(rawLine, language);
    if (multiline) {
      pending = { ...multiline, line: lineNumber };
      continue;
    }

    let i = 0;
    while (i < rawLine.length) {
      if (matchLineComment(rawLine, i, language) !== null) break;
      const ch = rawLine[i];

      if (ch === '"' || ch === "'") {
        const end = closingQuoteIndex(rawLine, i, ch, language);
        if (end === -1) {
          if (language.lint.quotes !== 'off') {
            issues.push({
              line: lineNumber,
              message: `Aspas ${ch === '"' ? 'duplas' : 'simples'} não fechadas nesta linha.`,
              severity: language.lint.quotes,
            });
          }
          break;
        }
        i = end + 1;
        continue;
      }

      if (ch === '{' || ch === '(' || ch === '[') {
        const severity = ch === '{' ? language.lint.braces : language.lint.parens;
        if (severity !== 'off') stack.push({ char: ch, line: lineNumber, severity });
      } else if (ch === '}' || ch === ')' || ch === ']') {
        const opener = CLOSERS[ch];
        const severity = opener === '{' ? language.lint.braces : language.lint.parens;
        if (severity !== 'off') {
          const top = stack[stack.length - 1];
          if (top && top.char === opener) stack.pop();
          else issues.push({ line: lineNumber, message: `Fecha '${ch}' sem abertura correspondente.`, severity });
        }
      }
      i++;
    }

    if (language.id === 'python') {
      const code = codeOnly(rawLine, language).trim();
      const block = /^(if|elif|else|for|while|def|class|try|except|finally|with|match|case)\b/.exec(code);
      if (block && !code.includes(':')) {
        issues.push({ line: lineNumber, message: `Bloco '${block[1]}' sem ':' no fim da linha.`, severity: 'warning' });
      }
      const leading = /^[ \t]*/.exec(rawLine)?.[0] ?? '';
      if (leading.includes(' ') && leading.includes('\t')) {
        issues.push({ line: lineNumber, message: 'Mistura de tab e espaço na indentação.', severity: 'warning' });
      }
    }
  }

  if (pending) {
    issues.push({ line: pending.line, message: `${pending.label} aberto e não fechado.`, severity: 'error' });
  }
  for (const item of stack) {
    issues.push({ line: item.line, message: `'${item.char}' aberto e não fechado.`, severity: item.severity });
  }

  if (language.id === 'shell') {
    const text = lines.map((line) => codeOnly(line, language)).join('\n');
    const conditionals = countMatches(text, /\bif\b/g) + countMatches(text, /\belif\b/g);
    const endings = countMatches(text, /\bfi\b/g);
    if (conditionals !== endings) {
      issues.push({ line: 1, message: `Blocos if/elif (${conditionals}) e fi (${endings}) não batem.`, severity: 'warning' });
    }
    const dos = countMatches(text, /\bdo\b/g);
    const dones = countMatches(text, /\bdone\b/g);
    if (dos !== dones) {
      issues.push({ line: 1, message: `Blocos do (${dos}) e done (${dones}) não batem.`, severity: 'warning' });
    }
    const cases = countMatches(text, /\bcase\b/g);
    const esacs = countMatches(text, /\besac\b/g);
    if (cases !== esacs) {
      issues.push({ line: 1, message: `Blocos case (${cases}) e esac (${esacs}) não batem.`, severity: 'warning' });
    }
  }

  return issues.sort((a, b) => a.line - b.line || (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}

/** Valida um campo JSON opcional (parametersSchemaJson/metadataJson). */
export function validateJsonField(label: string, text: string): ScriptIssue | null {
  const value = text.trim();
  if (!value) return null;
  try {
    JSON.parse(value);
    return null;
  } catch (error) {
    return { line: 1, message: `${label}: JSON inválido (${(error as Error).message}).`, severity: 'error' };
  }
}
