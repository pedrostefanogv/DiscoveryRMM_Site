import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, FolderOpen, Folder } from 'lucide-react';
import type { ArticlePageTreeNode } from '@/api';

interface ArticlePagesTreeProps {
  nodes: ArticlePageTreeNode[];
  activePageId?: string | null;
  onSelect: (pageId: string) => void;
  maxDepth?: number;
}

/**
 * Árvore de sub-páginas internas de um artigo (estilo Notion).
 * Exibe as "partes/páginas" DENTRO de um único artigo, com expandir/recolher
 * e indentação. Suporta até `maxDepth` níveis (padrão 3).
 */
export default function ArticlePagesTree({
  nodes,
  activePageId,
  onSelect,
  maxDepth = 3,
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
          onClick={() => onSelect(node.id)}
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

          {isFolder ? (
            isCollapsed ? (
              <Folder className="h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
            )
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-muted" />
          )}

          <span className="min-w-0 flex-1 truncate">{node.title}</span>

          {node.childCount > 0 && (
            <span className="shrink-0 text-xs text-muted">{node.childCount}</span>
          )}
        </div>

        {hasChildren && !isCollapsed && depth < maxDepth && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  if (!nodes.length) {
    return (
      <p className="px-2 py-3 text-sm text-muted">
        Este artigo ainda não possui sub-páginas.
      </p>
    );
  }

  return <div className="space-y-0.5">{nodes.map((node) => renderNode(node, 0))}</div>;
}
