import { useState } from 'react';
import { ChevronDown, ChevronRight, FileStack, FileText, Home, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import type { ArticlePageTreeNode } from '@/api';
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

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const renderNode = (node: ArticlePageTreeNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const isActive = node.id === activePageId;

    return (
      <div key={node.id}>
        <div
          className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
            isActive
              ? 'bg-primary/15 text-primary'
              : 'text-foreground hover:bg-surface-hover'
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => onSelectPage(node.id)}
        >
          {hasChildren ? (
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-muted hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                toggle(node.id);
              }}
              aria-label={isCollapsed ? 'Expandir' : 'Recolher'}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {hasChildren ? (
            <FileStack className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-muted" />
          )}

          <span className="min-w-0 flex-1 truncate">{node.title}</span>

          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              className="rounded p-1 text-muted hover:text-red-400"
              onClick={(event) => {
                event.stopPropagation();
                handleDelete(node.id, node.title);
              }}
              aria-label="Excluir página"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {hasChildren && !isCollapsed && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Páginas do artigo</p>
        <Button size="sm" variant="ghost" onClick={onCreatePage}>
          <Plus className="h-4 w-4" /> Nova página
        </Button>
      </div>

      {pagesQuery.isLoading ? (
        <p className="text-sm text-muted">Carregando páginas...</p>
      ) : pagesQuery.isError ? (
        <p className="text-sm text-muted">Falha ao carregar páginas.</p>
      ) : (
        <div className="space-y-0.5">
          {/* Home (artigo principal) */}
          <div
            className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
              homeActive
                ? 'bg-primary/15 text-primary'
                : 'text-foreground hover:bg-surface-hover'
            }`}
            style={{ paddingLeft: '8px' }}
            onClick={onSelectHome}
          >
            <span className="w-4 shrink-0" />
            <Home className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate font-medium">{homeLabel}</span>
          </div>

          {(pagesQuery.data ?? []).length > 0 && (
            <div className="ml-3 border-l border-border pl-1">
              {(pagesQuery.data ?? []).map((node) => renderNode(node, 0))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
