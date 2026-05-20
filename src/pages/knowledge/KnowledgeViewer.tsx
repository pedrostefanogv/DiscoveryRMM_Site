import { useMemo } from 'react';
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
  UserRound,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge, Button, Card, ErrorDisplay, Loading } from '@/components/ui';
import type { ArticleStatus, KnowledgeArticle } from '@/api';
import { useAuthorization } from '@/auth/authorization';
import {
  useClients,
  useDepartments,
  useKnowledgeArticle,
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

function estimateReadingMinutes(content: string): number {
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

  const tags = article.tags.length > 0 ? article.tags : ['sem tags'];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative z-10 space-y-4">
          <button
            type="button"
            onClick={() => navigate('/knowledge')}
            className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para a base
          </button>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={statusColor(article.status)}>
                  {statusLabel(article.status)}
                </Badge>
                <Badge color="accent">{scopeLabel(article)}</Badge>
                <Badge color="slate">v{article.currentVersionNumber}</Badge>
              </div>

              <h1 className="text-2xl font-bold text-white sm:text-3xl">
                {article.title}
              </h1>

              <p className="max-w-3xl text-sm text-slate-300">
                {article.category
                  ? `Categoria: ${article.category}`
                  : 'Sem categoria definida para este artigo.'}
              </p>
            </div>

            {canEditArticle && (
              <Button
                variant="ghost"
                onClick={() => navigate(`/knowledge/${article.id}/edit`)}
              >
                <FilePenLine className="h-4 w-4" /> Editar artigo
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card padding={false} className="overflow-hidden">
          <article className="prose prose-invert max-w-none px-5 py-6 prose-headings:text-white prose-p:text-slate-200 prose-li:text-slate-200 prose-strong:text-white prose-code:text-emerald-300 prose-pre:bg-slate-950/70 sm:px-7">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {article.content || '_Conteudo vazio._'}
            </ReactMarkdown>
          </article>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">
              Detalhes
            </h2>

            <div className="space-y-3 text-sm text-slate-300">
              <div className="flex items-start gap-2">
                <UserRound className="mt-0.5 h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Autor</p>
                  <p className="text-slate-200">{article.createdBy ?? 'Nao informado'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <FilePenLine className="mt-0.5 h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Ultima edicao</p>
                  <p className="text-slate-200">{article.lastEditedBy ?? article.createdBy ?? 'Nao informado'}</p>
                  <p className="text-xs text-slate-500">{formatDate(article.lastEditedAt ?? article.updatedAt)}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Clock3 className="mt-0.5 h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Leitura estimada</p>
                  <p className="text-slate-200">{metadata.readingMinutes} min</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Criado em</p>
                  <p className="text-slate-200">{formatDate(article.createdAt)}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Globe2 className="mt-0.5 h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Cliente</p>
                  <p className="text-slate-200">{metadata.clientName}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPinned className="mt-0.5 h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Site</p>
                  <p className="text-slate-200">{metadata.siteName}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Building2 className="mt-0.5 h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Departamento</p>
                  <p className="text-slate-200">{metadata.departmentName}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
              Tags e indexacao
            </h2>
            <div className="mb-4 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} color="slate">#{tag}</Badge>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-slate-500">Chunks</p>
                <p className="text-sm font-semibold text-white">{article.chunkCount}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-slate-500">Embeddings</p>
                <p className="text-sm font-semibold text-white">
                  {article.embeddingsReady ? 'Pronto' : 'Pendente'}
                </p>
              </div>
              <div className="col-span-2 rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="inline-flex items-center gap-1 text-slate-500">
                  <Layers className="h-3.5 w-3.5" /> Publicacao
                </p>
                <p className="mt-1 text-sm text-white">
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
