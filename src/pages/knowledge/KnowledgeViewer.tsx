import { formatDateTime } from '@/utils/format';
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { MarkdownViewer } from '@/components/ui/MarkdownViewer';
import {
  Icon,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorDisplay,
  Loading,
  PageHeader,
} from '@/components/ui';
import type { ArticlePageTreeNode, ArticleStatus, KnowledgeArticle } from '@/api';
import { useAuthorization } from '@/auth/authorization';
import {
  useArticlePages,
  useClients,
  useDeleteKnowledgeArticle,
  useDepartments,
  useKnowledgeArticle,
  useReindexKnowledgeArticle,
  useSites,
  useUnpublishKnowledgeArticle,
} from '@/hooks';
import toast from 'react-hot-toast';
import ArticlePagesTree from './ArticlePagesTree';

const KNOWLEDGE_EDIT_PERMISSIONS = [
  'KnowledgeBase.Edit',
  'KnowledgeBase.*',
  'knowledgebase.edit',
  'knowledgebase.*',
  'admin.*',
];

const KNOWLEDGE_DELETE_PERMISSIONS = [
  'KnowledgeBase.Delete',
  'KnowledgeBase.*',
  'knowledgebase.delete',
  'knowledgebase.*',
  'admin.*',
];

function statusLabel(status: ArticleStatus): string {
  switch (status) {
    case 'Published':
      return 'Publicado';
    case 'Internal':
      return 'Interno';
    case 'AiOnly':
      return 'Somente IA';
    case 'Draft':
      return 'Rascunho';
    default:
      return status;
  }
}

function statusColor(status: ArticleStatus): 'success' | 'warning' | 'accent' | 'slate' {
  switch (status) {
    case 'Published':
      return 'success';
    case 'Internal':
      return 'accent';
    case 'AiOnly':
      return 'slate';
    case 'Draft':
      return 'warning';
    default:
      return 'warning';
  }
}

function scopeLabel(article: KnowledgeArticle): string {
  if (article.scope) {
    if (article.scope === 'Global') return 'Global';
    if (article.scope === 'Client') return 'Cliente';
    return 'Site';
  }

  if (article.clientId && article.siteId) return 'Site';
  if (article.clientId) return 'Cliente';
  return 'Global';
}

const formatDate = (value: string | null) => formatDateTime(value, 'Não informado');

function estimateReadingMinutes(content: string | null | undefined): number {
  if (!content) return 1;
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/[\[\]#*_>~|-]/g, ' ')
    .trim();
  const words = plain.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function resolveEntityName<T extends { id: string; name: string }>(
  items: T[] | undefined,
  id: string | null,
  emptyLabel: string,
): string {
  if (!id) return emptyLabel;
  return items?.find((item) => item.id === id)?.name ?? id;
}

export default function KnowledgeViewer() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const articleQuery = useKnowledgeArticle(id ?? '');
  const { hasAnyPermission } = useAuthorization();

  const article = articleQuery.data;
  const clients = useClients();
  const sites = useSites(article?.clientId ?? '');
  const departments = useDepartments({
    clientId: article?.clientId ?? undefined,
    activeOnly: true,
  });

  // Sub-páginas internas do artigo (estilo Notion) sincronizadas com ?pageId=
  const pagesQuery = useArticlePages(id ?? '');
  const activePageId = searchParams.get('pageId');
  const showHome = !activePageId;

  const setActivePage = (pageId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (pageId) next.set('pageId', pageId);
    else next.delete('pageId');
    setSearchParams(next, { replace: true });
  };

  const canEditArticle = hasAnyPermission(KNOWLEDGE_EDIT_PERMISSIONS);
  const canDeleteArticle = hasAnyPermission(KNOWLEDGE_DELETE_PERMISSIONS);
  const unpublishMutation = useUnpublishKnowledgeArticle();
  const deleteMutation = useDeleteKnowledgeArticle();
  const reindexMutation = useReindexKnowledgeArticle();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Lista linear das páginas (Home + sub-páginas em pré-ordem) para navegação Anterior/Próxima
  const orderedPages = useMemo(() => {
    const list: Array<{ id: string | null; title: string }> = [
      { id: null, title: article?.title ?? 'Home' },
    ];
    const walk = (nodes: ArticlePageTreeNode[]) => {
      for (const node of nodes) {
        list.push({ id: node.id, title: node.title });
        if (node.children?.length) walk(node.children);
      }
    };
    walk(pagesQuery.data ?? []);
    return list;
  }, [article?.title, pagesQuery.data]);

  // Resolve a sub-página ativa (para exibir seu conteúdo)
  const activePage = useMemo(() => {
    if (!activePageId || !pagesQuery.data) return null;
    const find = (nodes: ArticlePageTreeNode[]): ArticlePageTreeNode | null => {
      for (const node of nodes) {
        if (node.id === activePageId) return node;
        const found = find(node.children);
        if (found) return found;
      }
      return null;
    };
    return find(pagesQuery.data);
  }, [activePageId, pagesQuery.data]);

  const activeOrderIndex = orderedPages.findIndex((p) => p.id === (activePage ? activePage.id : null));
  const prevPage = activeOrderIndex > 0 ? orderedPages[activeOrderIndex - 1] : null;
  const nextPage =
    activeOrderIndex >= 0 && activeOrderIndex < orderedPages.length - 1
      ? orderedPages[activeOrderIndex + 1]
      : null;

  const metadata = useMemo(() => {
    if (!article) return null;

    const displayedContent = activePage ? activePage.content : article.content;

    return {
      readingMinutes: estimateReadingMinutes(displayedContent),
      clientName: resolveEntityName(
        clients.data,
        article.clientId,
        'Escopo global',
      ),
      siteName: resolveEntityName(sites.data, article.siteId, 'Sem site'),
      departmentName: resolveEntityName(
        departments.data,
        article.departmentId,
        'Sem departamento',
      ),
    };
  }, [activePage, article, clients.data, departments.data, sites.data]);

  if (!id) {
    return (
      <ErrorDisplay
        message="Artigo inválido."
        onRetry={() => navigate('/knowledge')}
      />
    );
  }

  if (articleQuery.isLoading) {
    return <Loading message="Carregando artigo..." />;
  }

  if (articleQuery.isError || !article || !metadata) {
    return (
      <ErrorDisplay
        message="Falha ao carregar o artigo."
        onRetry={() => articleQuery.refetch()}
      />
    );
  }

  const tags = (article.tags?.length ?? 0) > 0 ? article.tags : ['sem tags'];

  return (
    <div className="space-y-6">
      <PageHeader
        title={article.title}
        description={article.category ? `Categoria: ${article.category}` : 'Sem categoria definida'}
        onBack={() => navigate('/knowledge')}
      >
        <Badge color={statusColor(article.status)}>
          {statusLabel(article.status)}
        </Badge>
        <Badge color="accent">{scopeLabel(article)}</Badge>
        {article.departmentId && (
          <Badge color="slate">{metadata.departmentName}</Badge>
        )}
        {article.aiIndexingEnabled === false && (
          <Badge color="warning">IA bloqueada</Badge>
        )}
        <Badge color="slate">v{article.currentVersionNumber}</Badge>
        {canEditArticle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/knowledge/${article.id}/edit`)}
          >
            <Icon name="edit_note" className="h-4 w-4" /> Editar artigo
          </Button>
        )}
        {canEditArticle && article.status !== 'Draft' && (
          <Button
            variant="ghost"
            size="sm"
            loading={unpublishMutation.isPending}
            onClick={() =>
              unpublishMutation.mutate(
                { id: article.id },
                {
                  onSuccess: () => toast.success('Artigo movido para rascunho.'),
                  onError: () => toast.error('Falha ao despublicar artigo.'),
                },
              )
            }
          >
            <Icon name="edit_note" className="h-4 w-4" /> Despublicar
          </Button>
        )}
        {canDeleteArticle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDeleteOpen(true)}
            className="text-danger hover:bg-danger/10"
          >
            <Icon name="delete" className="h-4 w-4" /> Excluir
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* Conteúdo ativo: home do artigo ou sub-página selecionada */}
          <Card padding={false} className="overflow-hidden">
            <div className="px-5 py-6 sm:px-7">
              {showHome || !activePage ? (
                <MarkdownViewer
                  source={article.content || '_Conteúdo vazio._'}
                  articleId={article.id}
                />
              ) : (
                <>
                  <h3 className="mb-3 text-lg font-bold text-foreground">
                    {activePage.title}
                  </h3>
                  <MarkdownViewer
                    source={activePage.content || '_Conteúdo vazio._'}
                    articleId={article.id}
                  />
                </>
              )}

              {orderedPages.length > 1 && (
                <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <div>
                    {prevPage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActivePage(prevPage.id)}
                      >
                        <Icon name="arrow_back" className="h-4 w-4" />
                        <span className="truncate max-w-[200px]">{prevPage.title}</span>
                      </Button>
                    )}
                  </div>
                  <div>
                    {nextPage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActivePage(nextPage.id)}
                      >
                        <span className="truncate max-w-[200px]">{nextPage.title}</span>
                        <Icon name="arrow_forward" className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Páginas do artigo
              </h2>
            </div>
            {pagesQuery.isLoading ? (
              <Loading message="Carregando páginas..." />
            ) : pagesQuery.isError ? (
              <p className="text-sm text-muted">Falha ao carregar as páginas do artigo.</p>
            ) : (
              <ArticlePagesTree
                nodes={pagesQuery.data ?? []}
                activePageId={activePageId}
                onSelect={(pageId) => setActivePage(pageId)}
                homeLabel={article.title}
                homeActive={showHome}
                onSelectHome={() => setActivePage(null)}
              />
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Detalhes
            </h2>

            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <Icon name="person" className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Autor</p>
                  <p className="text-foreground">{article.createdBy ?? 'Não informado'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Icon name="edit_note" className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Última edição</p>
                  <p className="text-foreground">{article.lastEditedBy ?? article.createdBy ?? 'Não informado'}</p>
                  <p className="text-xs text-muted">{formatDate(article.lastEditedAt ?? article.updatedAt)}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Icon name="schedule" className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Leitura estimada</p>
                  <p className="text-foreground">{metadata.readingMinutes} min</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Icon name="event" className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Criado em</p>
                  <p className="text-foreground">{formatDate(article.createdAt)}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Icon name="public" className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Cliente</p>
                  <p className="text-foreground">{metadata.clientName}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Icon name="location_on" className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Site</p>
                  <p className="text-foreground">{metadata.siteName}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Icon name="apartment" className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Departamento</p>
                  <p className="text-foreground">{metadata.departmentName}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Tags e indexação IA
              </h2>
              {canEditArticle && article.status !== 'Draft' && article.aiIndexingEnabled !== false && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={reindexMutation.isPending}
                  onClick={() =>
                    reindexMutation.mutate(article.id, {
                      onSuccess: () => toast.success('Artigo enfileirado para reindexação.'),
                      onError: () => toast.error('Falha ao solicitar reindexação.'),
                    })
                  }
                  title="Regerar chunks e embeddings deste artigo"
                >
                  <Icon name="refresh" className="h-3.5 w-3.5" /> Reindexar
                </Button>
              )}
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} color="slate">#{tag}</Badge>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="rounded-lg border border-border bg-surface-light p-2">
                <p className="text-muted">Chunks</p>
                <p className="text-sm font-semibold text-foreground">{article.chunkCount}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-light p-2">
                <p className="text-muted">Embeddings IA</p>
                <p className="text-sm font-semibold text-foreground">
                  {article.aiIndexingEnabled === false
                    ? 'Bloqueado'
                    : article.embeddingsReady
                    ? `Pronto (${article.embeddedChunkCount ?? article.chunkCount}/${article.chunkCount})`
                    : article.chunkCount > 0
                    ? `Parcial (${article.embeddedChunkCount ?? 0}/${article.chunkCount})`
                    : 'Pendente'}
                </p>
              </div>
              <div className="col-span-2 rounded-lg border border-border bg-surface-light p-2">
                <p className="inline-flex items-center gap-1 text-muted">
                  <Icon name="layers" className="h-3.5 w-3.5" /> Publicação
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {article.publishedAt ? `Última publicação em ${formatDate(article.publishedAt)}` : 'Ainda não publicado'}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Excluir artigo"
        message={
          <>
            Tem certeza que deseja excluir o artigo <strong>"{article.title}"</strong>?
          </>
        }
        confirmLabel="Excluir"
        isLoading={deleteMutation.isPending}
        onConfirm={() =>
          deleteMutation.mutate(article.id, {
            onSuccess: () => {
              toast.success('Artigo excluído.');
              navigate('/knowledge');
            },
            onError: () => toast.error('Falha ao excluir artigo.'),
          })
        }
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
