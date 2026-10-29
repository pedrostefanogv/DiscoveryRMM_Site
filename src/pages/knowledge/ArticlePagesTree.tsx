import { useState } from 'react';
import { Icon } from "@/components/ui";

import type { ArticlePageTreeNode } from '@/api';

interface ArticlePagesTreeProps {
  nodes: ArticlePageTreeNode[];
  activePageId?: string | null;
  onSelect: (pageId: string) => void;
  maxDepth?: number;
  /** Rótulo do item "Home" (artigo principal). Quando definido, exibe a home no topo da árvore. */
  homeLabel?: string;
  /** Se a home está ativa (artigo principal selecionado). */
  homeActive?: boolean;
  /** Callback ao selecionar a home. */
  onSelectHome?: () => void;
  /**
   * Quando informado, exibe o botão de excluir em cada página (modo edição).
   * A confirmação e a chamada da API ficam com quem usa o componente.
   */
  onDelete?: (pageId: string, title: string) => void;
}

/**
 * Árvore de sub-páginas internas de um artigo (estilo Notion).
 * Exibe as "partes/páginas" DENTRO de um único artigo, com expandir/recolher
 * e indentação. Suporta até `maxDepth` níveis (padrão 3).
 * Quando `homeLabel` é informado, a "home" (artigo principal) aparece no topo
 * e as sub-páginas ficam aninhadas dentro dela.
 */
export default function ArticlePagesTree({
  nodes,
  activePageId,
  onSelect,
  maxDepth = 3,
  homeLabel,
  homeActive = false,
  onSelectHome,
  onDelete,
}: ArticlePagesTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: ArticlePageTreeNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const isActive = node.id === activePageId;
    const isFolder = hasChildren;

    return (
      <div key={node.id}>
        <div
          className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
            isActive
              ? 'bg-primary/15 text-primary'
              : 'text-foreground hover:bg-surface-hover'
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          role="treeitem"
          aria-selected={isActive}
          aria-expanded={hasChildren ? !isCollapsed : undefined}
          tabIndex={isActive ? 0 : -1}
          onClick={() => onSelect(node.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(node.id);
            }
          }}
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
                <Icon name="chevron_right" className="h-3.5 w-3.5" />
              ) : (
                <Icon name="expand_more" className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {isFolder ? (
            <Icon name="layers" className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Icon name="description" className="h-4 w-4 shrink-0 text-muted" />
          )}

          <span className="min-w-0 flex-1 truncate">{node.title}</span>

          {onDelete ? (
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                className="rounded p-1 text-muted hover:text-danger"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(node.id, node.title);
                }}
                aria-label="Excluir página"
              >
                <Icon name="delete" className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            node.childCount > 0 && (
              <span className="shrink-0 text-xs text-muted">{node.childCount}</span>
            )
          )}
        </div>

        {hasChildren && !isCollapsed && depth < maxDepth && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0.5" role="tree" aria-label="Páginas do artigo">
      {homeLabel && (
        <div
          className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
            homeActive
              ? 'bg-primary/15 text-primary'
              : 'text-foreground hover:bg-surface-hover'
          }`}
          style={{ paddingLeft: '8px' }}
          role="treeitem"
          aria-selected={homeActive}
          tabIndex={homeActive ? 0 : -1}
          onClick={onSelectHome}
          onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectHome?.();
            }
          }}
        >
          <span className="w-4 shrink-0" />
          <Icon name="home" className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate font-medium">{homeLabel}</span>
        </div>
      )}

      {nodes.length > 0 && (
        <div className={homeLabel ? 'ml-3 border-l border-border pl-1' : ''}>
          {nodes.map((node) => renderNode(node, 0))}
        </div>
      )}

      {!homeLabel && nodes.length === 0 && (
        <p className="px-2 py-3 text-sm text-muted">
          Este artigo ainda não possui sub-páginas.
        </p>
      )}
    </div>
  );
}
