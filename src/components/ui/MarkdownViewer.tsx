import { memo, useMemo, type ComponentProps } from 'react';
import type { Components } from 'react-markdown';
import { useTheme } from '@/theme/ThemeContext';
import { kbUrlTransform } from '@/utils/kbImage';
import { KbMarkdownImage } from './KbMarkdownImage';
import { LazyMarkdown } from './LazyMarkdown';

interface MarkdownViewerProps {
  source: string;
  className?: string;
  /**
   * Quando presente, resolve imagens privadas `kbimage:` do artigo através da
   * API. Sem articleId o comportamento é idêntico ao anterior (tickets, loja,
   * relatórios continuam usando apenas URLs normais).
   */
  articleId?: string;
}

/**
 * Renderizador de Markdown leve (apenas visualização).
 * Substitui `MDEditor.Markdown`/`@uiw/react-markdown-preview` — o pacote
 * @uiw/react-md-editor (1.2 MB) só é carregado sob demanda no editor.
 * Segue o tema claro/escuro do projeto (como o editor).
 */
export const MarkdownViewer = memo(function MarkdownViewer({
  source,
  className,
  articleId,
}: MarkdownViewerProps) {
  const { mode } = useTheme();

  // O defaultUrlTransform do react-markdown APAGA o src de kbimage:; sem este
  // transform as imagens privadas não seriam renderizadas.
  const imageComponents = useMemo<Components | undefined>(() => {
    if (!articleId) return undefined;

    return {
      // O TÍTULO carrega o tamanho da imagem ("w=50%"): sem repassá-lo o viewer
      // mostrava a imagem em tamanho natural mesmo com tamanho definido no editor.
      img: ({ src, alt, title }: ComponentProps<'img'>) => (
        <KbMarkdownImage
          articleId={articleId}
          src={src}
          alt={alt}
          title={title}
        />
      ),
    };
  }, [articleId]);

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
      <LazyMarkdown
        source={source}
        components={imageComponents}
        urlTransform={articleId ? kbUrlTransform : undefined}
        fallback={<span className="text-xs text-muted">Carregando…</span>}
      />
    </div>
  );
});
