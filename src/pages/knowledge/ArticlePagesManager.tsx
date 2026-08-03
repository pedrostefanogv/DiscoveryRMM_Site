import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import type { ArticlePageTreeNode } from '@/api';
import {
  useArticlePages,
  useCreateArticlePage,
  useDeleteArticlePage,
  useUpdateArticlePage,
} from '@/hooks';
import toast from 'react-hot-toast';

interface ArticlePagesManagerProps {
  articleId: string;
}

/**
 * Gerenciador de sub-páginas internas de um artigo (estilo Notion).
 * Permite criar, editar e excluir as "partes/páginas" DENTRO de um único artigo,
 * com aninhamento de até 3 níveis.
 */
export default function ArticlePagesManager({ articleId }: ArticlePagesManagerProps) {
  const pagesQuery = useArticlePages(articleId);
  const createMutation = useCreateArticlePage(articleId);
  const updateMutation = useUpdateArticlePage(articleId);
  const deleteMutation = useDeleteArticlePage(articleId);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Achata a árvore em opções de "página pai" (para criar sub-página)
  const parentOptions = useFlattenOptions(pagesQuery.data ?? [], null);

  const handleCreate = () => {
    if (!newTitle.trim()) {
      toast.error('Informe o título da página.');
      return;
    }
    createMutation.mutate(
      {
        title: newTitle.trim(),
        content: newContent,
        parentPageId: newParentId || null,
      },
      {
        onSuccess: () => {
          toast.success('Página criada.');
          setNewTitle('');
          setNewContent('');
          setNewParentId('');
          setShowCreate(false);
        },
        onError: () => toast.error('Falha ao criar página.'),
      },
    );
  };

  const handleSaveEdit = (pageId: string) => {
    if (!editTitle.trim()) {
      toast.error('Informe o título da página.');
      return;
    }
    updateMutation.mutate(
      { pageId, data: { title: editTitle.trim(), content: editContent } },
      {
        onSuccess: () => {
          toast.success('Página atualizada.');
          setEditingId(null);
        },
        onError: () => toast.error('Falha ao atualizar página.'),
      },
    );
  };

  const handleDelete = (pageId: string, title: string) => {
    if (!window.confirm(`Excluir a página "${title}" e todas as suas sub-páginas?`)) return;
    deleteMutation.mutate(pageId, {
      onSuccess: () => toast.success('Página excluída.'),
      onError: () => toast.error('Falha ao excluir página.'),
    });
  };

  const renderNode = (node: ArticlePageTreeNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const isEditing = editingId === node.id;

    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-muted hover:text-foreground"
              onClick={() => toggle(node.id)}
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
            <Folder className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-muted" />
          )}

          {isEditing ? (
            <div className="flex-1 space-y-1">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Título da página"
              />
              <Input
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Conteúdo (Markdown)"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleSaveEdit(node.id)}>Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate">{node.title}</span>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  className="rounded p-1 text-muted hover:text-foreground"
                  onClick={() => {
                    setEditingId(node.id);
                    setEditTitle(node.title);
                    setEditContent('');
                  }}
                  aria-label="Editar página"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted hover:text-red-400"
                  onClick={() => handleDelete(node.id, node.title)}
                  aria-label="Excluir página"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
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
        <p className="text-sm font-medium text-foreground">
          Sub-páginas do artigo ({pagesQuery.data?.length ?? 0})
        </p>
        <Button size="sm" variant="ghost" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="h-4 w-4" /> Nova página
        </Button>
      </div>

      {showCreate && (
        <div className="space-y-2 rounded-lg border border-border bg-surface-light p-3">
          <Input
            label="Título"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Ex.: Hardware"
          />
          <Input
            label="Conteúdo (Markdown)"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Conteúdo da página..."
          />
          <Select
            label="Página pai (opcional)"
            options={parentOptions}
            value={newParentId}
            onChange={(e) => setNewParentId(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate}>Criar</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {pagesQuery.isLoading ? (
        <p className="text-sm text-muted">Carregando páginas...</p>
      ) : pagesQuery.isError ? (
        <p className="text-sm text-muted">Falha ao carregar páginas.</p>
      ) : (pagesQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-muted">Este artigo ainda não possui sub-páginas.</p>
      ) : (
        <div className="space-y-0.5">
          {(pagesQuery.data ?? []).map((node) => renderNode(node, 0))}
        </div>
      )}
    </div>
  );
}

// Helper: achata a árvore em opções de "página pai"
function useFlattenOptions(
  nodes: ArticlePageTreeNode[],
  excludeId: string | null,
): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [
    { value: '', label: 'Nenhuma (nível 1)' },
  ];

  const flatten = (list: ArticlePageTreeNode[], depth: number) => {
    for (const node of list) {
      if (node.id !== excludeId) {
        options.push({
          value: node.id,
          label: `${'  '.repeat(depth)}${node.title}`,
        });
      }
      flatten(node.children, depth + 1);
    }
  };

  flatten(nodes, 0);
  return options;
}
