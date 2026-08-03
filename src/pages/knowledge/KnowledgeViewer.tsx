import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Clock3,
  FilePenLine,
  Globe2,
  Layers,
  MapPinned,
  Plus,
  UserRound,
} from 'lucide-react';
import { MarkdownViewer } from '@/components/ui/MarkdownViewer';
import { Badge, Button, Card, ErrorDisplay, Loading } from '@/components/ui';
import type { ArticleStatus, KnowledgeArticle } from '@/api';
import { useAuthorization } from '@/auth/authorization';
import {
  useArticlePages,
  useClients,
  useDepartments,
  useKnowledgeArticle,
  useSites,
} from '@/hooks';
import ArticlePagesTree from './ArticlePagesTree';

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

  // Sub-páginas internas do artigo (estilo Notion)
  const pagesQuery = useArticlePages(id ?? '');
  const [activePageId, setActivePageId] = useState<string | null>(null);

  const canEditArticle = hasAnyPermission(KNOWLEDGE_EDIT_PERMISSIONS);

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
  const pageCount = pagesQuery.data?.length ?? 0;

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

          {/* Menu de sub-páginas internas do artigo (estilo Notion) */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Páginas do artigo ({pageCount})
              </h2>
              {canEditArticle && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/knowledge/${article.id}/edit?newPage=1`)}
                >
                  <Plus className="h-4 w-4" /> Nova página
                </Button>
              )}
            </div>
            {pagesQuery.isLoading ? (
              <Loading message="Carregando páginas..." />
            ) : pagesQuery.isError ? (
              <p className="text-sm text-muted">Falha ao carregar as páginas do artigo.</p>
            ) : (
              <ArticlePagesTree
                nodes={pagesQuery.data ?? []}
                activePageId={activePageId}
                onSelect={setActivePageId}
              />
            )}
          </Card>
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
