import { lazy, Suspense, type ReactNode } from 'react';

interface LazyMarkdownProps {
  source: string;
  /** Repassa skipHtml do react-markdown (usado no preview de descrições). */
  skipHtml?: boolean;
  fallback?: ReactNode;
}

interface MarkdownRendererProps {
  source: string;
  skipHtml?: boolean;
}

/**
 * Renderizador Markdown carregado sob demanda.
 *
 * react-markdown + remark-gfm + o ecossistema micromark/mdast ~1,1 MB só é
 * baixado quando algum markdown é realmente renderizado (tickets com triagem
 * de IA, base de conhecimento, descrições da loja, preview de relatórios).
 * Antes o chunk era baixado junto das rotas que apenas importavam o componente.
 */
const MarkdownRenderer = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([
    import('react-markdown'),
    import('remark-gfm'),
  ]);

  function Renderer({ source, skipHtml }: MarkdownRendererProps) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml={skipHtml}>
        {source}
      </ReactMarkdown>
    );
  }

  return { default: Renderer };
});

export function LazyMarkdown({ source, skipHtml, fallback = null }: LazyMarkdownProps) {
  return (
    <Suspense fallback={fallback}>
      <MarkdownRenderer source={source} skipHtml={skipHtml} />
    </Suspense>
  );
}
