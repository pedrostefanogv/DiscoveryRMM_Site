import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
import type { ArticleStatus, KnowledgeArticle, KnowledgeSearchMode, PublishArticleRequest } from '@/api';
import { useClients, useDeleteKnowledgeArticle, useDepartments, useKnowledgeArticles, useKnowledgeSearch, usePublishKnowledgeArticle, useSites, useUnpublishKnowledgeArticle } from '@/hooks';
import { useAuthorization } from '@/auth/authorization';
import { BookOpen, ChevronDown, ChevronUp, Filter, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const SEARCH_MODE_OPTIONS: Array<{ value: KnowledgeSearchMode; label: string }> = [
  { value: 'hybrid', label: 'Híbrido' },
  { value: 'semantic', label: 'Semântico' },
  { value: 'keyword', label: 'Keyword' },
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'Published', label: 'Publicados' },
  { value: 'Internal', label: 'Internos' },
  { value: 'Draft', label: 'Rascunhos' },
];

type SortField = 'title' | 'updatedAt' | 'createdBy' | 'scope' | 'status';
type SortDirection = 'asc' | 'desc';

const SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'updatedAt', label: 'Última atualização' },
  { value: 'title', label: 'Título' },
  { value: 'createdBy', label: 'Autor' },
  { value: 'scope', label: 'Escopo' },
  { value: 'status', label: 'Status' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEFAULT_PAGE_SIZE = 10;

const KNOWLEDGE_CREATE_PERMISSIONS = [
  'KnowledgeBase.Create',
  'KnowledgeBase.*',
  'knowledgebase.create',
  'knowledgebase.*',
  'admin.*',
];

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

function normalizeCategory(category: string | null | undefined) {
  if (!category) return 'Sem categoria';
  return category;
}

function scopeLabel(article: KnowledgeArticle): string {
  if (article.scope) return article.scope === 'Global' ? 'Global' : article.scope === 'Client' ? 'Cliente' : 'Site';
  if (article.clientId && article.siteId) return 'Site';
  if (article.clientId) return 'Cliente';
  return 'Global';
}

function statusLabel(article: KnowledgeArticle): string {
  switch (article.status) {
    case 'Published': return 'Publicado';
    case 'Internal': return 'Interno';
    case 'Draft': return 'Rascunho';
    default: return article.status;
  }
}

function statusColor(status: ArticleStatus): 'success' | 'warning' | 'accent' {
  switch (status) {
    case 'Published': return 'success';
    case 'Internal': return 'accent';
    case 'Draft': return 'warning';
    default: return 'warning';
  }
}

export default function KnowledgeList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const clients = useClients();

  const [clientId, setClientId] = useState(searchParams.get('clientId') ?? '');
  const [siteId, setSiteId] = useState(searchParams.get('siteId') ?? '');
  const [category, setCategory] = useState(searchParams.get('category') ?? '');
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | ''>(searchParams.get('status') as ArticleStatus | '' ?? '');
  const [departmentId, setDepartmentId] = useState(searchParams.get('departmentId') ?? '');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<KnowledgeSearchMode>('hybrid');
  const [maxResults, setMaxResults] = useState(10);
  const [sortBy, setSortBy] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [advancedFiltersExpanded, setAdvancedFiltersExpanded] = useState(false);

  const sites = useSites(clientId);
  const departments = useDepartments({ clientId: clientId || undefined, activeOnly: true });

  const listQuery = useKnowledgeArticles({
    clientId: clientId || undefined,
    siteId: siteId || undefined,
    category: category || undefined,
    status: statusFilter || undefined,
    departmentId: departmentId || undefined,
  });

  const searchQuery = useKnowledgeSearch(
    {
      q: query.trim(),
      clientId: clientId || undefined,
      siteId: siteId || undefined,
      departmentId: departmentId || undefined,
      mode: searchMode,
      maxResults,
    },
    query.trim().length > 0,
  );

  const publishMutation = usePublishKnowledgeArticle();
  const unpublishMutation = useUnpublishKnowledgeArticle();
  const deleteMutation = useDeleteKnowledgeArticle();
  const { hasAnyPermission } = useAuthorization();

  const canCreateArticle = hasAnyPermission(KNOWLEDGE_CREATE_PERMISSIONS);
  const canEditArticle = hasAnyPermission(KNOWLEDGE_EDIT_PERMISSIONS);
  const canDeleteArticle = hasAnyPermission(KNOWLEDGE_DELETE_PERMISSIONS);
  const canPublishArticle = canEditArticle;

  useEffect(() => {
    const params = new URLSearchParams();
    if (clientId) params.set('clientId', clientId);
    if (siteId) params.set('siteId', siteId);
    if (category) params.set('category', category);
    if (statusFilter) params.set('status', statusFilter);
    if (departmentId) params.set('departmentId', departmentId);
    setSearchParams(params, { replace: true });
  }, [category, clientId, statusFilter, departmentId, setSearchParams, siteId]);

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

  const departmentOptions = [
    { value: '', label: 'Todos os departamentos' },
    ...(departments.data ?? []).map((d) => ({ value: d.id, label: d.name })),
  ];

  const sortLabel = SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? 'Última atualização';
  const selectedClientLabel = clientOptions.find((option) => option.value === clientId)?.label ?? 'Global (todos)';
  const selectedSiteLabel = siteOptions.find((option) => option.value === siteId)?.label ?? 'Todos os sites';

  const advancedFiltersActiveCount =
    Number(Boolean(clientId)) +
    Number(Boolean(siteId)) +
    Number(Boolean(category)) +
    Number(Boolean(statusFilter)) +
    Number(Boolean(departmentId)) +
    Number(sortBy !== 'updatedAt') +
    Number(sortDirection !== 'desc') +
    Number(pageSize !== DEFAULT_PAGE_SIZE);

  const hasSemanticSearch = query.trim().length > 0;

  const listingFiltersSummary = useMemo(() => {
    const parts: string[] = [];

    if (clientId) parts.push(`Cliente: ${selectedClientLabel}`);
    if (siteId) parts.push(`Site: ${selectedSiteLabel}`);
    if (category) parts.push(`Categoria: ${category}`);
    if (statusFilter) parts.push(`Status: ${statusFilter === 'Published' ? 'Publicados' : statusFilter === 'Internal' ? 'Internos' : 'Rascunhos'}`);
    if (departmentId) parts.push(`Departamento: ${departmentOptions.find(d => d.value === departmentId)?.label ?? departmentId}`);
    if (sortBy !== 'updatedAt') parts.push(`Ordenação: ${sortLabel}`);
    if (sortDirection !== 'desc') parts.push('Direção crescente');
    if (pageSize !== DEFAULT_PAGE_SIZE) parts.push(`${pageSize} itens por página`);

    return parts.length > 0 ? parts.join(' • ') : 'Sem filtros adicionais na listagem.';
  }, [
    category,
    clientId,
    statusFilter,
    departmentId,
    departmentOptions,
    pageSize,
    selectedClientLabel,
    selectedSiteLabel,
    siteId,
    sortBy,
    sortDirection,
    sortLabel,
  ]);

  useEffect(() => {
    if (advancedFiltersActiveCount > 0) {
      setAdvancedFiltersExpanded(true);
    }
  }, [advancedFiltersActiveCount]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = searchInput.trim();

    if (!trimmed) return;

    if (trimmed === query.trim()) {
      void searchQuery.refetch();
      return;
    }

    setQuery(trimmed);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setQuery('');
  };

  const handleClearAdvancedFilters = () => {
    setClientId('');
    setSiteId('');
    setCategory('');
    setStatusFilter('');
    setDepartmentId('');
    setSortBy('updatedAt');
    setSortDirection('desc');
    setPageSize(DEFAULT_PAGE_SIZE);
    setAdvancedFiltersExpanded(false);
  };

  const onTogglePublish = (article: KnowledgeArticle) => {
    if (article.status === 'Draft') {
      // Prompt para escolher Published ou Internal
      const choice = window.confirm(
        `Publicar "${article.title}"?\n\nOK = Publicado (visível para todos)\nCancelar = vamos abrir o editor para configurar.`
      );
      if (choice) {
        const data: PublishArticleRequest = { status: 'Published', lastEditedBy: null };
        publishMutation.mutate({ id: article.id, data }, {
          onSuccess: () => toast.success('Artigo publicado'),
          onError: () => toast.error('Falha ao publicar artigo'),
        });
      } else {
        navigate(`/knowledge/${article.id}/edit`);
      }
      return;
    }

    // Published/Internal → Unpublish
    unpublishMutation.mutate(
      { id: article.id },
      {
        onSuccess: () => toast.success('Artigo voltou para rascunho'),
        onError: () => toast.error('Falha ao despublicar artigo'),
      },
    );
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
        <Badge color={statusColor(article.status)}>
          {statusLabel(article)}
        </Badge>
      ),
    },
    {
      key: 'createdBy',
      header: 'Autor',
      render: (article) => (
        <div>
          <span className="text-slate-300">{article.createdBy || '—'}</span>
          {article.lastEditedBy && article.lastEditedBy !== article.createdBy && (
            <span className="text-xs text-slate-500 block">
              Editado por {article.lastEditedBy}
            </span>
          )}
        </div>
      ),
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
          {!canPublishArticle && !canEditArticle && !canDeleteArticle ? (
            <span className="text-xs text-slate-500">Sem ações</span>
          ) : (
            <>
              {canPublishArticle && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTogglePublish(article)}
                  loading={publishMutation.isPending || unpublishMutation.isPending}
                >
                  {article.status === 'Draft' ? 'Publicar' : 'Despublicar'}
                </Button>
              )}
              {canEditArticle && (
                <Button variant="ghost" size="sm" onClick={() => navigate(`/knowledge/${article.id}/edit`)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {canDeleteArticle && (
                <Button variant="ghost" size="sm" onClick={() => onDelete(article)}>
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              )}
            </>
          )}
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

      if (sortBy === 'createdBy') {
        return (a.createdBy ?? '').localeCompare(b.createdBy ?? '', 'pt-BR');
      }

      if (sortBy === 'scope') {
        return scopeLabel(a).localeCompare(scopeLabel(b), 'pt-BR');
      }

      return (a.status ?? '').localeCompare(b.status ?? '', 'pt-BR');
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
  }, [clientId, siteId, category, statusFilter, departmentId, sortBy, sortDirection, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Base de Conhecimento</h1>
          <p className="text-sm text-slate-400">Busque artigos rapidamente e abra filtros avançados só quando precisar.</p>
        </div>
        {canCreateArticle && (
          <Button onClick={() => navigate('/knowledge/new')}>
            <Plus className="h-4 w-4" /> Novo Artigo
          </Button>
        )}
      </div>

      <Card>
        <form className="space-y-4" onSubmit={handleSearchSubmit}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <Input
                label="Busca inteligente (semântica + keyword)"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Ex.: como resetar senha do AD"
                hint="Use linguagem natural para encontrar artigos mesmo sem palavras exatas."
              />
            </div>
            <div className="w-full lg:w-44">
              <Select
                label="Modo"
                options={SEARCH_MODE_OPTIONS}
                value={searchMode}
                onChange={(event) => setSearchMode(event.target.value as KnowledgeSearchMode)}
              />
            </div>
            <div className="w-full lg:w-32">
              <Input
                label="Máx resultados"
                type="number"
                value={maxResults}
                min={1}
                max={50}
                onChange={(event) => setMaxResults(Number(event.target.value) || 10)}
              />
            </div>
            <div className="flex gap-2 lg:pb-[2px]">
              <Button type="submit" variant="ghost" disabled={!searchInput.trim()}>
                <Search className="h-4 w-4" /> Buscar na base
              </Button>
              {hasSemanticSearch && (
                <Button type="button" variant="ghost" onClick={handleClearSearch}>
                  Limpar busca
                </Button>
              )}
            </div>
          </div>
        </form>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAdvancedFiltersExpanded((current) => !current)}
            aria-expanded={advancedFiltersExpanded}
          >
            <Filter className="h-4 w-4" />
            Filtros avançados da listagem
            {advancedFiltersActiveCount > 0 && <Badge color="accent">{advancedFiltersActiveCount}</Badge>}
            {advancedFiltersExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {advancedFiltersActiveCount > 0 && !advancedFiltersExpanded && (
            <span className="text-xs text-slate-500">Filtros ativos aplicados à tabela.</span>
          )}

          {advancedFiltersActiveCount > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={handleClearAdvancedFilters}>
              Limpar filtros
            </Button>
          )}
        </div>

        {!advancedFiltersExpanded && (
          <p className="mt-2 text-xs text-slate-500">{listingFiltersSummary}</p>
        )}

        {advancedFiltersExpanded && (
          <div className="mt-3 space-y-4 rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                label="Status"
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as ArticleStatus | '')}
              />

              <Select
                label="Departamento"
                options={departmentOptions}
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
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
                onChange={(event) => setPageSize(Number(event.target.value) || DEFAULT_PAGE_SIZE)}
              />
            </div>
          </div>
        )}

        {hasSemanticSearch && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">Resultados da busca inteligente</p>
                <p className="text-xs text-slate-400">Consulta: "{query}". Clique em um artigo para abrir em modo leitura.</p>
              </div>
              {!searchQuery.isLoading && !searchQuery.isError && (
                <Badge color="accent">{(searchQuery.data ?? []).length}</Badge>
              )}
            </div>

            <div className="space-y-2">
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
                      onClick={() => navigate(`/knowledge/${item.id}`)}
                      className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
                    >
                      <p className="font-medium text-white">{item.title}</p>
                      <p className="text-xs text-slate-400">
                        {normalizeCategory(item.category)} • {scopeLabel(item)} • {statusLabel(item)}
                      </p>
                    </button>
                  ))}
                  {(searchQuery.data ?? []).length === 0 && (
                    <p className="text-sm text-slate-400">Nenhum resultado para esta busca.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
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
              onRowClick={(item) => navigate(`/knowledge/${item.id}`)}
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
    </div>
  );
}
