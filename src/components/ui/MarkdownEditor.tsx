import { lazy, Suspense } from 'react';
import { useTheme } from '@/theme/ThemeContext';

// Editor Markdown (pacote @uiw/react-md-editor ~1.2 MB) carregado sob demanda.
// Compartilhado entre o editor do artigo e o gerenciador de sub-páginas.
const MarkdownEditorLazy = lazy(() =>
  import('@uiw/react-md-editor').then((m) => ({ default: m.default })),
);

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Altura do editor em px (padrão 200). */
  height?: number;
  /** Rótulo exibido acima do editor. */
  label?: string;
  /** Texto de ajuda exibido abaixo do editor. */
  hint?: string;
}

/**
 * Editor Markdown reutilizável (estilo Notion), carregado sob demanda.
 * Usa o mesmo `@uiw/react-md-editor` em toda a base de conhecimento,
 * respeitando o tema claro/escuro.
 */
export function MarkdownEditor({
  value,
  onChange,
  height = 200,
  label,
  hint,
}: MarkdownEditorProps) {
  const { mode } = useTheme();

  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <div
        data-color-mode={mode}
        className="overflow-hidden rounded-xl border border-border bg-background"
      >
        <Suspense fallback={<MarkdownEditorSkeleton height={height} />}>
          <MarkdownEditorLazy
            value={value}
            height={height}
            onChange={(next) => onChange(next ?? '')}
          />
        </Suspense>
      </div>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// Fallback enquanto o editor Markdown pesado é carregado (evita flash).
function MarkdownEditorSkeleton({ height }: { height: number }) {
  return (
    <div className="flex flex-col" style={{ height }}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-light px-1 py-1">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="h-6 w-6 animate-pulse rounded bg-surface-hover" />
        ))}
      </div>
      <div className="flex flex-1 gap-px bg-border">
        <div className="flex-1 animate-pulse bg-background p-3">
          <div className="h-4 w-2/3 rounded bg-surface-hover" />
          <div className="mt-2 h-4 w-1/2 rounded bg-surface-hover" />
          <div className="mt-2 h-4 w-3/4 rounded bg-surface-hover" />
        </div>
      </div>
    </div>
  );
}
