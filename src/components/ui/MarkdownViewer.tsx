import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from '@/theme/ThemeContext';

interface MarkdownViewerProps {
  source: string;
  className?: string;
}

/**
 * Renderizador de Markdown leve (apenas visualização).
 * Substitui `MDEditor.Markdown`/`@uiw/react-markdown-preview` — o pacote
 * @uiw/react-md-editor (1.2 MB) só é carregado sob demanda no editor.
 * Segue o tema claro/escuro do projeto (como o editor).
 */
export const MarkdownViewer = memo(function MarkdownViewer({ source, className }: MarkdownViewerProps) {
  const { mode } = useTheme();

  return (
    <div
      data-color-mode={mode}
      className={
        'wmde-markdown wmde-markdown-color prose max-w-none text-sm leading-relaxed '
        + '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 '
        + '[&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic '
        + '[&_code]:rounded [&_code]:bg-surface-hover [&_code]:px-1 [&_code]:py-0.5 '
        + '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/30 [&_pre]:p-2 '
        + '[&_p]:m-0 [&_p+_p]:mt-2 '
        + '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 '
        + '[&_h1]:m-0 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-foreground '
        + '[&_h2]:m-0 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground '
        + '[&_h3]:m-0 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground '
        + '[&_hr]:my-3 [&_hr]:border-border '
        + '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted '
        + '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse '
        + '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold '
        + '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 '
        + '[&_img]:rounded-lg [&_img]:max-w-full '
        + (className ?? '')
      }
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
});
