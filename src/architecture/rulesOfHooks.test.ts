import { parse } from '@babel/parser';
import { describe, expect, it } from 'vitest';

/**
 * Guarda contra violações de "Rules of Hooks" (o projeto não tem ESLint).
 *
 * Por que existe: em 2026-10-08 a página de detalhe do agent passou a chamar um
 * `useCallback` DEPOIS dos early returns de loading/erro. O primeiro render
 * (carregando) parava antes do hook e o render seguinte (com dados) o chamava,
 * mudando a contagem de hooks → "Rendered more hooks than during the previous
 * render" (React error #310), que derrubava a tela ao abrir um agent pela
 * listagem. O F5 funcionava porque nesse caso o primeiro render já vinha com
 * dados e a contagem ficava estável.
 *
 * O teste replica a regra react-hooks/rules-of-hooks: acusa hooks chamados
 * dentro de if/laço/ternário/&&/try e hooks chamados depois de um `return` no
 * mesmo corpo de função.
 *
 * Fontes lidas via import.meta.glob (Vite) — o tsconfig do app não expõe as
 * APIs de Node para os testes. O parser (`@babel/parser`) vem como dependência
 * transitiva de `@vitejs/plugin-react`.
 */

type Finding = { file: string; line: number; kind: string; hook: string };

const FUNCTION_LIKE = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ObjectMethod',
  'ClassMethod',
  'ClassPrivateMethod',
]);

const CONDITIONAL = new Set([
  'IfStatement',
  'ConditionalExpression',
  'LogicalExpression',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchStatement',
  'TryStatement',
]);

const SOURCES = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function hookNameOf(node: any): string | null {
  if (!node || node.type !== 'CallExpression') return null;
  const callee = node.callee;
  if (callee?.type === 'Identifier' && /^use[A-Z0-9]/.test(callee.name)) return callee.name;
  if (
    callee?.type === 'MemberExpression' &&
    callee.property?.type === 'Identifier' &&
    /^use[A-Z0-9]/.test(callee.property.name)
  ) {
    return callee.property.name;
  }
  return null;
}

function analyzeFile(file: string, code: string): Finding[] {
  const findings: Finding[] = [];
  let ast: any;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true });
  } catch {
    return findings;
  }

  const visitNodes = (node: any, visit: (n: any) => void) => {
    visit(node);
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) visitNodes(child, visit);
      } else if (value?.type) {
        visitNodes(value, visit);
      }
    }
  };

  visitNodes(ast, (fn: any) => {
    if (!FUNCTION_LIKE.has(fn.type)) return;
    const body = fn.body;
    if (!body || body.type !== 'BlockStatement') return;

    const hooks: { name: string; line: number; conditional: boolean }[] = [];
    const returns: number[] = [];

    const scan = (node: any, conditional: boolean) => {
      // Não entra em funções aninhadas: cada uma é analisada por conta própria.
      if (node !== body && FUNCTION_LIKE.has(node.type)) return;
      const cond = conditional || CONDITIONAL.has(node.type);
      const hook = hookNameOf(node);
      if (hook) hooks.push({ name: hook, line: node.loc?.start.line ?? 0, conditional: cond });
      if (node.type === 'ReturnStatement') returns.push(node.loc?.start.line ?? 0);
      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        const value = node[key];
        if (Array.isArray(value)) {
          for (const child of value) if (child?.type) scan(child, cond);
        } else if (value?.type) {
          scan(value, cond);
        }
      }
    };
    scan(body, false);

    for (const hook of hooks) {
      if (hook.conditional) {
        findings.push({ file, line: hook.line, kind: 'chamado condicionalmente', hook: hook.name });
      }
      const early = returns.find((line) => line < hook.line);
      if (early) {
        findings.push({
          file,
          line: hook.line,
          kind: `chamado depois de um return (linha ${early})`,
          hook: hook.name,
        });
      }
    }
  });

  return findings;
}

describe('rules of hooks', () => {
  it('nenhum hook é chamado condicionalmente ou depois de um return', () => {
    const findings = Object.entries(SOURCES)
      .filter(([file]) => !/\.test\.(ts|tsx)$/.test(file))
      .flatMap(([file, code]) => analyzeFile(file.replace(/^\.\.\//, ''), code));

    const report = findings
      .map((f) => `${f.file}:${f.line} [${f.kind}] ${f.hook}`)
      .join('\n');
    expect(report).toBe('');
  });
});
