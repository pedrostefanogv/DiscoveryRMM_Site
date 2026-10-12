import {
  Fragment,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { Badge, Button } from '@/components/ui';
import {
  dedentLine,
  formatScriptContent,
  hasMultiLineString,
  indentForNextLine,
  languageForScriptType,
  normalizeEol,
  tokenizeLine,
  type TokenKind,
} from './scriptLanguages';
import { validateScriptSyntax } from './scriptValidation';

const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: 'text-foreground',
  comment: 'italic text-slate-400 dark:text-slate-500',
  string: 'text-emerald-600 dark:text-emerald-400',
  keyword: 'text-fuchsia-600 dark:text-fuchsia-400',
  builtin: 'text-violet-600 dark:text-violet-400',
  number: 'text-amber-600 dark:text-amber-400',
  variable: 'text-sky-600 dark:text-sky-400',
  parameter: 'text-cyan-600 dark:text-cyan-400',
  operator: 'text-muted',
};

/** Métricas compartilhadas entre o textarea e a camada realçada (alinhamento exato). */
const EDITOR_METRICS = 'font-mono text-[12.5px] leading-5';

export interface ScriptContentEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** AutomationScriptType (número ou nome) — define realce, indentação e modelo. */
  scriptType: unknown;
  label?: string;
  hint?: string;
  error?: string;
  heightPx?: number;
}

/**
 * Editor de conteúdo de script que se apresenta conforme o tipo selecionado:
 * realce de sintaxe, numeração de linhas, indentação (Tab/Shift+Tab/Enter) e
 * botão "Formatar" com reindentação por bloco quando é seguro.
 */
export function ScriptContentEditor({
  value,
  onChange,
  scriptType,
  label = 'Conteudo do script',
  hint,
  error,
  heightPx = 300,
}: ScriptContentEditorProps) {
  const editorId = useId();
  const language = languageForScriptType(scriptType);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lines = useMemo(() => value.split('\n'), [value]);
  const highlighted = useMemo(() => lines.map((line) => tokenizeLine(line, language)), [lines, language]);
  const syntaxIssues = useMemo(() => validateScriptSyntax(value, language), [value, language]);
  const hasContent = value.trim().length > 0;
  const issues = hasContent ? syntaxIssues : [];
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  const syntaxLabel = !hasContent ? 'Sem conteúdo' : errorCount > 0 ? `${errorCount} erro(s)` : warningCount > 0 ? `${warningCount} aviso(s)` : 'Sintaxe OK';
  const syntaxClass = !hasContent ? 'text-muted' : errorCount > 0 ? 'text-danger' : warningCount > 0 ? 'text-warning' : 'text-success';

  // Restaura a seleção depois que o React aplica o novo valor controlado.
  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    const textarea = textareaRef.current;
    if (!pending || !textarea) return;
    pendingSelection.current = null;
    textarea.setSelectionRange(pending.start, pending.end);
  }, [value]);

  const applyChange = (next: string, selection?: { start: number; end: number }) => {
    if (selection) pendingSelection.current = selection;
    setNotice(null);
    onChange(next);
  };

  const syncScroll = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = textarea.scrollTop;
      highlightRef.current.scrollLeft = textarea.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = textarea.scrollTop;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const { selectionStart, selectionEnd } = textarea;
    const unit = ' '.repeat(language.indentUnit);

    if (event.key === 'Tab') {
      event.preventDefault();
      const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
      const nextBreak = value.indexOf('\n', selectionEnd);
      const blockEnd = nextBreak === -1 ? value.length : nextBreak;

      if (selectionStart === selectionEnd) {
        const line = value.slice(lineStart, blockEnd);
        if (event.shiftKey) {
          const dedented = dedentLine(line, language.indentUnit);
          const removed = line.length - dedented.length;
          const next = value.slice(0, lineStart) + dedented + value.slice(blockEnd);
          applyChange(next, {
            start: Math.max(lineStart, selectionStart - removed),
            end: Math.max(lineStart, selectionEnd - removed),
          });
        } else {
          const next = value.slice(0, selectionStart) + unit + value.slice(selectionEnd);
          applyChange(next, { start: selectionStart + unit.length, end: selectionStart + unit.length });
        }
        return;
      }

      const block = value.slice(lineStart, blockEnd);
      const shifted = block
        .split('\n')
        .map((line) => (event.shiftKey ? dedentLine(line, language.indentUnit) : unit + line))
        .join('\n');
      const next = value.slice(0, lineStart) + shifted + value.slice(blockEnd);
      applyChange(next, { start: lineStart, end: lineStart + shifted.length });
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
      const indent = indentForNextLine(value.slice(lineStart, selectionStart), language);
      event.preventDefault();
      const next = value.slice(0, selectionStart) + '\n' + indent + value.slice(selectionEnd);
      const caret = selectionStart + 1 + indent.length;
      applyChange(next, { start: caret, end: caret });
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData?.getData('text') ?? '';
    if (!pasted.includes('\r')) return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const { selectionStart, selectionEnd } = textarea;
    const clean = normalizeEol(pasted);
    const next = value.slice(0, selectionStart) + clean + value.slice(selectionEnd);
    const caret = selectionStart + clean.length;
    applyChange(next, { start: caret, end: caret });
  };

  const applyFormat = () => {
    const skippedReindent = language.blockStyle !== 'none' && hasMultiLineString(value, language);
    const formatted = formatScriptContent(value, language);
    if (formatted === value) {
      setNotice('O documento já está normalizado.');
      return;
    }
    setNotice(
      skippedReindent
        ? 'Fim de linha e espaços normalizados; indentação preservada (o script usa string multilinha/heredoc).'
        : null,
    );
    onChange(formatted);
  };

  const insertTemplate = () => {
    if (value.trim().length > 0) return;
    applyChange(language.template);
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={editorId} className="block text-sm font-medium text-muted-foreground">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <Badge color="primary">{language.label}</Badge>
          <span className="font-mono text-xs text-muted">{language.filename}</span>
        </div>
      </div>

      <div
        className={`overflow-hidden rounded-xl border ${error ? 'border-danger/50' : 'border-border'} bg-surface-light`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{lines.length} linha(s)</span>
            <span aria-hidden>·</span>
            <span>{value.length} caractere(s)</span>
            <span aria-hidden>·</span>
            <span>indentação: {language.indentUnit} espaços</span>
            <span aria-hidden>·</span>
            <span className={syntaxClass}>{syntaxLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={insertTemplate}
              disabled={value.trim().length > 0}
              title={value.trim().length > 0 ? 'Limpe o conteúdo para inserir o modelo' : 'Inserir o modelo do tipo selecionado'}
            >
              Inserir modelo
            </Button>
            <Button size="sm" variant="secondary" onClick={applyFormat} disabled={value.length === 0}>
              Formatar
            </Button>
          </div>
        </div>

        <div className="relative flex" style={{ height: heightPx }}>
          <div
            ref={gutterRef}
            aria-hidden
            className={`${EDITOR_METRICS} select-none overflow-hidden border-r border-border bg-surface px-2 py-2 text-right text-muted`}
          >
            {lines.map((_, index) => (
              <div key={index} className="tabular-nums">
                {index + 1}
              </div>
            ))}
          </div>
          <div className="relative flex-1">
            <pre
              ref={highlightRef}
              aria-hidden
              className={`${EDITOR_METRICS} pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre px-3 py-2`}
            >
              {highlighted.map((tokens, index) => (
                <Fragment key={index}>
                  {tokens.map((token, tokenIndex) => (
                    <span key={tokenIndex} className={TOKEN_CLASS[token.kind]}>
                      {token.text}
                    </span>
                  ))}
                  {index < lines.length - 1 ? '\n' : ''}
                </Fragment>
              ))}
            </pre>
            <textarea
              id={editorId}
              ref={textareaRef}
              aria-label={label}
              value={value}
              onChange={(event) => applyChange(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onScroll={syncScroll}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              placeholder={language.placeholder}
              className={`${EDITOR_METRICS} relative block h-full w-full resize-none overflow-auto whitespace-pre bg-transparent px-3 py-2 text-transparent caret-primary outline-none placeholder:text-muted`}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-3 py-1.5 text-[11px] text-muted">
          <span>{language.hint}</span>
          <span>Tab indenta · Shift+Tab remove · Enter mantém a indentação</span>
        </div>

        {issues.length > 0 && (
          <ul className="max-h-28 overflow-auto border-t border-border bg-surface px-3 py-2 text-xs">
            {issues.map((issue, index) => (
              <li
                key={`${issue.line}-${index}`}
                className={issue.severity === 'error' ? 'text-danger' : 'text-warning'}
              >
                {issue.severity === 'error' ? 'Erro' : 'Aviso'} · linha {issue.line}: {issue.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      {notice && <p className="text-xs text-warning">{notice}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
      {!error && hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
