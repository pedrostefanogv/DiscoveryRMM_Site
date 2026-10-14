import { useId, useState, type ComponentType } from 'react';
import {
  Bold, Code, Heading, Italic, Link2, List, ListOrdered, SquareCode,
} from 'lucide-react';
import { TextArea } from '@/components/ui';
import { LazyMarkdown } from '@/components/ui/LazyMarkdown';

/**
 * Classes do preview — espelham o `MarkdownDescription` para que a
 * pré-visualização aqui seja fiel ao que a loja exibe no card/detalhe.
 */
const PREVIEW_CLASS =
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic '
  + '[&_code]:rounded [&_code]:bg-surface-hover [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/30 [&_pre]:p-2 '
  + '[&_p]:m-0 [&_p+_p]:mt-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 '
  + '[&_h1]:m-0 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:m-0 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground '
  + '[&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-foreground [&_hr]:my-2 [&_hr]:border-border [&_img]:hidden '
  + 'min-w-0 max-w-full overflow-x-auto break-words';

interface MarkdownFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}

interface Edit {
  value: string;
  start: number;
  end: number;
}

/**
 * Envolve a seleção com `before`/`after` (negrito, itálico, código, link).
 * Sem seleção, insere `placeholder` e o deixa **selecionado** para o usuário
 * digitar por cima — antes o cursor ficava apenas ao lado do placeholder e o
 * texto de exemplo permanecia no resultado (ex.: `**textoNegrito**`).
 */
function wrapInline(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): Edit {
  const selected = text.slice(start, end);
  const hasSelection = selected.length > 0;
  const body = hasSelection ? selected : placeholder;
  const nextValue = text.slice(0, start) + before + body + after + text.slice(end);
  const bodyStart = start + before.length;
  const bodyEnd = bodyStart + body.length;
  return { value: nextValue, start: bodyStart, end: bodyEnd };
}

/** Aplica um prefixo em cada linha da seleção (listas com marcadores/numeradas). */
function prefixLines(text: string, start: number, end: number, prefix: string): Edit {
  const hasSelection = end > start;
  // Sem seleção o prefixo vai para a LINHA do cursor: inserir no ponto do cursor
  // gerava markdown quebrado no meio da linha (ex.: "a- bc" em vez de "- abc").
  const lineStart = hasSelection ? start : text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  let lineEnd = end;
  if (!hasSelection) {
    const nextBreak = text.indexOf('\n', start);
    lineEnd = nextBreak === -1 ? text.length : nextBreak;
  }
  const body = text.slice(lineStart, lineEnd);
  const withPrefix = body
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : prefix.trimEnd()))
    .join('\n');
  const nextValue = text.slice(0, lineStart) + withPrefix + text.slice(lineEnd);
  const caret = lineStart + withPrefix.length;
  return { value: nextValue, start: caret, end: caret };
}

/**
 * Substitui a linha da seleção por um bloco (ex.: `# título`, cerca de código).
 * `replacePattern` remove prefixos antigos equivalentes ao alternar o nível.
 */
function blockLines(
  text: string,
  start: number,
  end: number,
  prefix: string,
  placeholder: string,
  replacePattern?: RegExp,
): Edit {
  const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndIndex = text.indexOf('\n', end);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const body = text.slice(lineStart, lineEnd);
  const cleaned = replacePattern ? body.replace(replacePattern, '') : body;
  const newBody = `${prefix}${cleaned.length > 0 ? cleaned : placeholder}`;
  const nextValue = text.slice(0, lineStart) + newBody + text.slice(lineEnd);
  const bodyStart = lineStart + prefix.length;
  return { value: nextValue, start: bodyStart, end: bodyStart + (cleaned.length > 0 ? cleaned.length : placeholder.length) };
}

/** Cerca de código em bloco: cerca simples, ou ``` quando já estiver cercado. */
function codeBlock(text: string, start: number, end: number): Edit {
  const selected = text.slice(start, end);
  const fence = selected.includes('```') ? '````' : '```';
  const hasSelection = selected.length > 0;
  const inner = hasSelection ? `\n${selected}\n` : '\ncódigo\n';
  const block = `${fence}${inner}${fence}`;
  const needsLeadingNewline = start > 0 && text[start - 1] !== '\n';
  const prefix = needsLeadingNewline ? '\n' : '';
  const nextValue = text.slice(0, start) + prefix + block + text.slice(end);
  const contentStart = start + prefix.length + fence.length;
  if (hasSelection) {
    return { value: nextValue, start: contentStart, end: contentStart + inner.length };
  }
  // Sem seleção: seleciona o placeholder "código". Antes o cursor caía sobre a
  // quebra de linha e digitar colava o texto nas cercas ("```meu código```").
  const placeholderStart = contentStart + 1;
  return { value: nextValue, start: placeholderStart, end: placeholderStart + 'código'.length };
}

/** Título: alterna `#` → `##` → `###` → sem título conforme o prefixo atual. */
function toggleHeading(text: string, start: number, end: number): Edit {
  const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const existing = /^(#{1,3})\s+/.exec(text.slice(lineStart, lineStart + 4));
  const nextPrefix = existing
    ? existing[1].length >= 3
      ? ''
      : `${'#'.repeat(existing[1].length + 1)} `
    : '# ';
  return blockLines(text, start, end, nextPrefix, 'Título', /^#{1,3}\s+/);
}

const TOOLBAR: {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  run: (text: string, start: number, end: number) => Edit;
}[] = [
  { key: 'bold', label: 'Negrito', icon: Bold, run: (t, s, e) => wrapInline(t, s, e, '**', '**', 'texto') },
  { key: 'italic', label: 'Itálico', icon: Italic, run: (t, s, e) => wrapInline(t, s, e, '_', '_', 'texto') },
  { key: 'heading', label: 'Título', icon: Heading, run: toggleHeading },
  { key: 'bullet-list', label: 'Lista com marcadores', icon: List, run: (t, s, e) => prefixLines(t, s, e, '- ') },
  { key: 'ordered-list', label: 'Lista numerada', icon: ListOrdered, run: (t, s, e) => prefixLines(t, s, e, '1. ') },
  { key: 'link', label: 'Link', icon: Link2, run: (t, s, e) => wrapInline(t, s, e, '[', '](https://)', 'texto do link') },
  { key: 'inline-code', label: 'Código inline', icon: Code, run: (t, s, e) => wrapInline(t, s, e, '`', '`', 'código') },
  { key: 'code-block', label: 'Bloco de código', icon: SquareCode, run: codeBlock },
];

/**
 * Campo de descrição com Markdown básico: barra de ferramentas que envolve a
 * seleção e alternância Editar / Pré-visualizar (mesmo `LazyMarkdown` usado na
 * exibição da loja, garantindo que o preview seja fiel ao resultado final).
 */
export function MarkdownField({
  label,
  value,
  onChange,
  rows = 6,
  maxLength,
  placeholder,
  hint,
  disabled,
}: MarkdownFieldProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const baseId = useId();
  const editTabId = `${baseId}-tab-edit`;
  const previewTabId = `${baseId}-tab-preview`;
  const panelId = `${baseId}-panel`;
  // O TextArea da UI não encaminha ref; o acesso ao elemento é pelo id.
  const textareaId = `${baseId}-textarea`;

  /** Textarea atual (null quando o modo é Pré-visualizar). */
  function textareaElement(): HTMLTextAreaElement | null {
    if (typeof document === 'undefined') return null;
    return document.getElementById(textareaId) as HTMLTextAreaElement | null;
  }

  function applyEdit(edit: Edit) {
    onChange(edit.value);
    // O value volta controlado no próximo render: repõe o cursor depois disso.
    requestAnimationFrame(() => {
      const textarea = textareaElement();
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(edit.start, edit.end);
    });
  }

  function runTool(item: (typeof TOOLBAR)[number]) {
    const textarea = textareaElement();
    if (!textarea || disabled) return;
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? start;
    applyEdit(item.run(value, start, end));
  }

  return (
    <div className="space-y-1">
      {label && (
        <span className="block text-sm font-medium text-muted-foreground">{label}</span>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Modo do editor de descrição" className="flex overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            role="tab"
            id={editTabId}
            aria-selected={mode === 'edit'}
            aria-controls={panelId}
            onClick={() => setMode('edit')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'edit' ? 'bg-primary/20 text-primary' : 'text-muted hover:bg-surface-light hover:text-foreground'}`}
          >
            Editar
          </button>
          <button
            type="button"
            role="tab"
            id={previewTabId}
            aria-selected={mode === 'preview'}
            aria-controls={panelId}
            onClick={() => setMode('preview')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === 'preview' ? 'bg-primary/20 text-primary' : 'text-muted hover:bg-surface-light hover:text-foreground'}`}
          >
            Pré-visualizar
          </button>
        </div>

        {mode === 'edit' && (
          <div role="toolbar" aria-label="Formatação Markdown" className="flex flex-wrap items-center gap-0.5">
            {TOOLBAR.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => runTool(item)}
                  disabled={disabled}
                  title={item.label}
                  aria-label={item.label}
                  className="rounded-lg border border-transparent p-1.5 text-muted transition-colors hover:border-border hover:bg-surface-light hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={mode === 'edit' ? editTabId : previewTabId}>
        {mode === 'edit' ? (
          <TextArea
            id={textareaId}
            className="font-mono text-xs"
            value={value}
            rows={rows}
            maxLength={maxLength}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={label ?? 'Descrição em Markdown'}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <div className="min-h-[8rem] rounded-xl border border-border bg-surface-light px-3 py-2">
            {value.trim() ? (
              <article className={`text-sm leading-relaxed text-muted-foreground ${PREVIEW_CLASS}`}>
                <LazyMarkdown source={value} skipHtml />
              </article>
            ) : (
              <p className="text-sm text-muted">Nada para pré-visualizar ainda.</p>
            )}
          </div>
        )}
      </div>

      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
