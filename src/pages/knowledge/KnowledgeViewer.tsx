import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  ChevronRight,
  Clock3,
  FilePenLine,
  FileText,
  Globe2,
  Layers,
  MapPinned,
  UserRound,
} from 'lucide-react';
import { MarkdownViewer } from '@/components/ui/MarkdownViewer';
import { Badge, Button, Card, ErrorDisplay, Loading } from '@/components/ui';
import type { ArticleStatus, KnowledgeArticle, KnowledgeTreeNode } from '@/api';
import { useAuthorization } from '@/auth/authorization';
import {
  useClients,
  useDepartments,
  useKnowledgeArticle,
  useKnowledgeTree,
  useSites,
} from '@/hooks';

const KNOWLEDGE_EDIT_PERMISSIONS = [
  'KnowledgeBase.Edit',
  'KnowledgeBase.*',
  'knowledgebase.edit',
  'knowledgebase.*',
  'admin.*',
];

function statusLabel(status: ArticleStatus): string {
  switch (status) {
    case 'Published':
      return 'Publicado';
    case 'Internal':
      return 'Interno';
    case 'Draft':
      return 'Rascunho';
    default:
      return status;
  }
}

function statusColor(status: ArticleStatus): 'success' | 'warning' | 'accent' {
  switch (status) {
    case 'Published':
      return 'success';
    case 'Internal':
      return 'accent';
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

function formatDate(value: string | null): string {
  if (!value) return 'Nao informado';
  return new Date(value).toLocaleString('pt-BR');
}

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

  // Árvore de páginas para breadcrumb e subpáginas
  const treeQuery = useKnowledgeTree({
    status: article?.status === 'Draft' ? undefined : article?.status,
    clientId: article?.clientId ?? undefined,
    siteId: article?.siteId ?? undefined,
    departmentId: article?.departmentId ?? undefined,
  });

  const canEditArticle = hasAnyPermission(KNOWLEDGE_EDIT_PERMISSIONS);

  // Resolve o caminho (breadcrumb) e as subpáginas a partir da árvore
  const { breadcrumb, subpages } = useMemo(() => {
    if (!article || !treeQuery.data) {
      return { breadcrumb: [] as KnowledgeTreeNode[], subpages: [] as KnowledgeTreeNode[] };
    }

    const findPath = (
      nodes: KnowledgeTreeNode[],
      targetId: string,
      path: KnowledgeTreeNode[] = [],
    ): KnowledgeTreeNode[] | null => {
      for (const node of nodes) {
        const next = [...path, node];
        if (node.id === targetId) return next;
        const found = findPath(node.children, targetId, next);
        if (found) return found;
      }
      return null;
    };

    const path = findPath(treeQuery.data, article.id) ?? [];
    const current = path[path.length - 1];
    return {
      breadcrumb: path,
      subpages: current?.children ?? [],
    };
  }, [article, treeQuery.data]);

  const metadata = useMemo(() => {
    if (!article) return null;

    return {
      readingMinutes: estimateReadingMinutes(article.content),
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
  }, [article, clients.data, departments.data, sites.data]);

  if (!id) {
    return (
      <ErrorDisplay
        message="Artigo invalido."
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
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/knowledge')}
          aria-label="Voltar"
          className="mt-1 rounded-lg p-2 text-muted hover:bg-surface-light hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          {breadcrumb.length > 1 && (
            <nav className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted">
              {breadcrumb.map((node, index) => (
                <span key={node.id} className="inline-flex items-center gap-1">
                  {index > 0 && <ChevronRight className="h-3 w-3" />}
                  {index === breadcrumb.length - 1 ? (
                    <span className="font-medium text-foreground">{node.title}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate(`/knowledge/${node.id}`)}
                      className="transition-colors hover:text-foreground"
                    >
                      {node.title}
                    </button>
                  )}
                </span>
              ))}
            </nav>
          )}
          <h1 className="text-2xl font-bold text-foreground truncate">
            {article.title}
          </h1>
          <p className="text-sm text-muted">
            {article.category
              ? `Categoria: ${article.category}`
              : 'Sem categoria definida'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge color={statusColor(article.status)}>
            {statusLabel(article.status)}
          </Badge>
          <Badge color="accent">{scopeLabel(article)}</Badge>
          <Badge color="slate">v{article.currentVersionNumber}</Badge>
          {canEditArticle && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/knowledge/${article.id}/edit`)}
            >
              <FilePenLine className="h-4 w-4" /> Editar artigo
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card padding={false} className="overflow-hidden">
            <div className="px-5 py-6 sm:px-7">
              <MarkdownViewer source={article.content || '_Conteudo vazio._'} />
            </div>
          </Card>

          {subpages.length > 0 && (
            <Card>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Subpáginas ({subpages.length})
              </h2>
              <div className="space-y-1">
                {subpages.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => navigate(`/knowledge/${sub.id}`)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{sub.title}</span>
                    {sub.childCount > 0 && (
                      <span className="shrink-0 text-xs text-muted">{sub.childCount}</span>
                    )}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Detalhes
            </h2>

            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <UserRound className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Autor</p>
                  <p className="text-foreground">{article.createdBy ?? 'Nao informado'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <FilePenLine className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Ultima edicao</p>
                  <p className="text-foreground">{article.lastEditedBy ?? article.createdBy ?? 'Nao informado'}</p>
                  <p className="text-xs text-muted">{formatDate(article.lastEditedAt ?? article.updatedAt)}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Clock3 className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Leitura estimada</p>
                  <p className="text-foreground">{metadata.readingMinutes} min</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Criado em</p>
                  <p className="text-foreground">{formatDate(article.createdAt)}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Globe2 className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Cliente</p>
                  <p className="text-foreground">{metadata.clientName}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPinned className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Site</p>
                  <p className="text-foreground">{metadata.siteName}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Building2 className="mt-0.5 h-4 w-4 text-muted" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Departamento</p>
                  <p className="text-foreground">{metadata.departmentName}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Tags e indexacao
            </h2>
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
                <p className="text-muted">Embeddings</p>
                <p className="text-sm font-semibold text-foreground">
                  {article.embeddingsReady ? 'Pronto' : 'Pendente'}
                </p>
              </div>
              <div className="col-span-2 rounded-lg border border-border bg-surface-light p-2">
                <p className="inline-flex items-center gap-1 text-muted">
                  <Layers className="h-3.5 w-3.5" /> Publicacao
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {article.publishedAt ? `Ultima publicacao em ${formatDate(article.publishedAt)}` : 'Ainda nao publicado'}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
