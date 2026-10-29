import { Icon, Button } from '@/components/ui';
import ArticlePagesTree from './ArticlePagesTree';
import { useArticlePages, useDeleteArticlePage } from '@/hooks';
import toast from 'react-hot-toast';

interface ArticlePagesManagerProps {
  articleId: string;
  /** Título do artigo (usado como rótulo da "home"). */
  homeLabel: string;
  /** Id da página atualmente selecionada (null = home). */
  activePageId: string | null;
  /** Se a home está selecionada. */
  homeActive: boolean;
  /** Callback ao selecionar a home. */
  onSelectHome: () => void;
  /** Callback ao selecionar uma sub-página. */
  onSelectPage: (pageId: string) => void;
  /** Callback para criar uma nova página (abre o editor único). */
  onCreatePage: () => void;
  /** Callback quando uma página é excluída (para limpar seleção no editor). */
  onDeletePage?: (pageId: string) => void;
}

/**
 * Árvore de sub-páginas internas de um artigo (estilo Notion) usada na EDIÇÃO.
 * Exibe a "home" (artigo principal) no topo e as sub-páginas aninhadas.
 * A seleção de uma página aciona o editor único no KnowledgeEditor.
 */
export default function ArticlePagesManager({
  articleId,
  homeLabel,
  activePageId,
  homeActive,
  onSelectHome,
  onSelectPage,
  onCreatePage,
  onDeletePage,
}: ArticlePagesManagerProps) {
  const pagesQuery = useArticlePages(articleId);
  const deleteMutation = useDeleteArticlePage(articleId);

  const handleDelete = (pageId: string, title: string) => {
    if (!window.confirm(`Excluir a página "${title}" e todas as suas sub-páginas?`)) return;
    deleteMutation.mutate(pageId, {
      onSuccess: () => {
        toast.success('Página excluída.');
        onDeletePage?.(pageId);
      },
      onError: () => toast.error('Falha ao excluir página.'),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Páginas do artigo</p>
        <Button size="sm" variant="ghost" onClick={onCreatePage}>
          <Icon name="add" className="h-4 w-4" /> Nova página
        </Button>
      </div>

      {pagesQuery.isLoading ? (
        <p className="text-sm text-muted">Carregando páginas...</p>
      ) : pagesQuery.isError ? (
        <p className="text-sm text-muted">Falha ao carregar páginas.</p>
      ) : (
        <ArticlePagesTree
          nodes={pagesQuery.data ?? []}
          activePageId={activePageId}
          onSelect={onSelectPage}
          homeLabel={homeLabel}
          homeActive={homeActive}
          onSelectHome={onSelectHome}
          maxDepth={Number.MAX_SAFE_INTEGER}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
