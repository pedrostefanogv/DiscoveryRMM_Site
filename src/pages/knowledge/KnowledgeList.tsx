import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  DataTable,
  ErrorDisplay,
  Input,
  Loading,
  Select,
} from '@/components/ui';
import type { Column } from '@/components/ui';
import type { KnowledgeArticle, KnowledgeSearchMode } from '@/api';
import { useClients, useDeleteKnowledgeArticle, useKnowledgeArticles, useKnowledgeSearch, usePublishKnowledgeArticle, useSites, useUnpublishKnowledgeArticle } from '@/hooks';
import { BookOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const SEARCH_MODE_OPTIONS: Array<{ value: KnowledgeSearchMode; label: string }> = [
  { value: 'hybrid', label: 'Híbrido' },
  { value: 'semantic', label: 'Semântico' },
  { value: 'keyword', label: 'Keyword' },
];

type SortField = 'title' | 'updatedAt' | 'author' | 'scope' | 'status';
type SortDirection = 'asc' | 'desc';

const SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'updatedAt', label: 'Última atualização' },
  { value: 'title', label: 'Título' },
  { value: 'author', label: 'Autor' },
  { value: 'scope', label: 'Escopo' },
  { value: 'status', label: 'Status' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function normalizeCategory(category: string | null | undefined) {
  if (!category) return 'Sem categoria';
  return category;
}

function scopeLabel(article: KnowledgeArticle): string {
  if (article.clientId && article.siteId) return 'Site';
  if (article.clientId) return 'Cliente';
  return 'Global';
}

export default function KnowledgeList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const clients = useClients();

  const [clientId, setClientId] = useState(searchParams.get('clientId') ?? '');
  const [siteId, setSiteId] = useState(searchParams.get('siteId') ?? '');
  const [category, setCategory] = useState(searchParams.get('category') ?? '');
  const [publishedOnly, setPublishedOnly] = useState(searchParams.get('publishedOnly') !== 'false');
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<KnowledgeSearchMode>('hybrid');
  const [maxResults, setMaxResults] = useState(10);
  const [sortBy, setSortBy] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const sites = useSites(clientId);

  const listQuery = useKnowledgeArticles({
    clientId: clientId || undefined,
    siteId: siteId || undefined,
    category: category || undefined,
    publishedOnly,
  });

  const searchQuery = useKnowledgeSearch(
    {
      q: query.trim(),
      clientId: clientId || undefined,
      siteId: siteId || undefined,
      mode: searchMode,
      maxResults,
    },
    query.trim().length > 0,
  );

  const publishMutation = usePublishKnowledgeArticle();
  const unpublishMutation = useUnpublishKnowledgeArticle();
  const deleteMutation = useDeleteKnowledgeArticle();

  useEffect(() => {
    const params = new URLSearchParams();
    if (clientId) params.set('clientId', clientId);
    if (siteId) params.set('siteId', siteId);
    if (category) params.set('category', category);
    if (!publishedOnly) params.set('publishedOnly', 'false');
    setSearchParams(params, { replace: true });
  }, [category, clientId, publishedOnly, setSearchParams, siteId]);

  const categoryOptions = useMemo(() => {
    const source = listQuery.data ?? [];
    const unique = Array.from(new Set(source.map((item) => normalizeCategory(item.category))));
    unique.sort((a, b) => a.localeCompare(b));

    return [{ value: '', label: 'Todas categorias' }, ...unique.map((name) => ({ value: name, label: name }))];
  }, [listQuery.data]);

  const clientOptions = [
    { value: '', label: 'Global (todos)' },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const siteOptions = [
    { value: '', label: 'Todos os sites' },
    ...(sites.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];

  const onTogglePublish = (article: KnowledgeArticle) => {
    const action = article.isPublished ? unpublishMutation : publishMutation;
    action.mutate(article.id, {
      onSuccess: () => {
        toast.success(article.isPublished ? 'Artigo despublicado' : 'Artigo publicado');
      },
      onError: () => {
        toast.error('Falha ao alterar status do artigo');
      },
    });
  };

  const onDelete = (article: KnowledgeArticle) => {
    const confirmed = window.confirm(`Excluir o artigo "${article.title}"?`);
    if (!confirmed) return;

    deleteMutation.mutate(article.id, {
      onSuccess: () => toast.success('Artigo excluído'),
      onError: () => toast.error('Falha ao excluir artigo'),
    });
  };

  const columns: Column<KnowledgeArticle>[] = [
    {
      key: 'title',
      header: 'Artigo',
      render: (article) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
            <BookOpen className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-white">{article.title}</p>
            <p className="text-xs text-slate-400">
              {normalizeCategory(article.category)} • {article.tags.join(', ') || 'sem tags'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Escopo',
      render: (article) => <Badge color="accent">{scopeLabel(article)}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (article) => (
        <Badge color={article.isPublished ? 'success' : 'warning'}>
          {article.isPublished ? 'Publicado' : 'Rascunho'}
        </Badge>
      ),
    },
    {
      key: 'author',
      header: 'Autor',
      render: (article) => <span className="text-slate-300">{article.author || '—'}</span>,
    },
    {
      key: 'updatedAt',
      header: 'Atualizado',
      render: (article) => (
        <span className="text-xs text-slate-400">
          {new Date(article.updatedAt).toLocaleDateString('pt-BR')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (article) => (
        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTogglePublish(article)}
            loading={publishMutation.isPending || unpublishMutation.isPending}
          >
            {article.isPublished ? 'Despublicar' : 'Publicar'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(`/knowledge/${article.id}/edit`)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(article)}>
            <Trash2 className="h-4 w-4 text-red-400" />
          </Button>
        </div>
      ),
    },
  ];

  const sortedArticles = useMemo(() => {
    const items = [...(listQuery.data ?? [])];

    const compare = (a: KnowledgeArticle, b: KnowledgeArticle) => {
      if (sortBy === 'updatedAt') {
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }

      if (sortBy === 'title') {
        return a.title.localeCompare(b.title, 'pt-BR');
      }

      if (sortBy === 'author') {
        return (a.author ?? '').localeCompare(b.author ?? '', 'pt-BR');
      }

      if (sortBy === 'scope') {
        return scopeLabel(a).localeCompare(scopeLabel(b), 'pt-BR');
      }

      return Number(a.isPublished) - Number(b.isPublished);
    };

    items.sort((a, b) => {
      const value = compare(a, b);
      return sortDirection === 'asc' ? value : -value;
    });

    return items;
  }, [listQuery.data, sortBy, sortDirection]);

  const totalItems = sortedArticles.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedArticles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedArticles.slice(start, start + pageSize);
  }, [currentPage, pageSize, sortedArticles]);

  useEffect(() => {
    setPage(1);
  }, [clientId, siteId, category, publishedOnly, sortBy, sortDirection, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Base de Conhecimento</h1>
          <p className="text-sm text-slate-400">Crie, publique e mantenha artigos em Markdown.</p>
        </div>
        <Button onClick={() => navigate('/knowledge/new')}>
          <Plus className="h-4 w-4" /> Novo Artigo
        </Button>
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Cliente"
            options={clientOptions}
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
              setSiteId('');
            }}
          />

          <Select
            label="Site"
            options={siteOptions}
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
            disabled={!clientId}
          />

          <Select
            label="Categoria"
            options={categoryOptions}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />

          <Select
            label="Publicação"
            options={[
              { value: 'published', label: 'Somente publicados' },
              { value: 'all', label: 'Publicados + rascunhos' },
            ]}
            value={publishedOnly ? 'published' : 'all'}
            onChange={(event) => setPublishedOnly(event.target.value === 'published')}
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Select
            label="Ordenar por"
            options={SORT_OPTIONS}
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortField)}
          />
          <Select
            label="Direção"
            options={[
              { value: 'desc', label: 'Decrescente' },
              { value: 'asc', label: 'Crescente' },
            ]}
            value={sortDirection}
            onChange={(event) => setSortDirection(event.target.value as SortDirection)}
          />
          <Select
            label="Itens por página"
            options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) }))}
            value={String(pageSize)}
            onChange={(event) => setPageSize(Number(event.target.value) || 10)}
          />
        </div>
      </Card>

      <Card padding={false}>
        {listQuery.isLoading ? (
          <Loading message="Carregando artigos..." />
        ) : listQuery.isError ? (
          <ErrorDisplay message="Falha ao carregar artigos." onRetry={() => listQuery.refetch()} />
        ) : (
          <div>
            <DataTable
              columns={columns}
              data={pagedArticles}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => navigate(`/knowledge/${item.id}/edit`)}
              emptyMessage="Nenhum artigo encontrado para os filtros selecionados."
              showPagination={false}
            />
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
              <p className="text-xs text-slate-400">
                {totalItems} artigo(s) • página {currentPage} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              label="Busca semântica/keyword"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex.: resetar senha AD"
            />
          </div>
          <div className="w-44">
            <Select
              label="Modo"
              options={SEARCH_MODE_OPTIONS}
              value={searchMode}
              onChange={(event) => setSearchMode(event.target.value as KnowledgeSearchMode)}
            />
          </div>
          <div className="w-32">
            <Input
              label="Máx resultados"
              type="number"
              value={maxResults}
              min={1}
              max={50}
              onChange={(event) => setMaxResults(Number(event.target.value) || 10)}
            />
          </div>
          <Button variant="ghost" onClick={() => searchQuery.refetch()}>
            <Search className="h-4 w-4" /> Buscar
          </Button>
        </div>

        {query.trim() && (
          <div className="mt-4 space-y-2">
            {searchQuery.isLoading && <Loading message="Buscando artigos relevantes..." />}
            {searchQuery.isError && (
              <ErrorDisplay
                message="Falha na busca de conhecimento."
                onRetry={() => searchQuery.refetch()}
              />
            )}
            {!searchQuery.isLoading && !searchQuery.isError && (
              <div className="space-y-2">
                {(searchQuery.data ?? []).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => navigate(`/knowledge/${item.id}/edit`)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
                  >
                    <p className="font-medium text-white">{item.title}</p>
                    <p className="text-xs text-slate-400">
                      {normalizeCategory(item.category)} • {scopeLabel(item)} • {item.isPublished ? 'Publicado' : 'Rascunho'}
                    </p>
                  </button>
                ))}
                {(searchQuery.data ?? []).length === 0 && (
                  <p className="text-sm text-slate-400">Nenhum resultado para esta busca.</p>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
