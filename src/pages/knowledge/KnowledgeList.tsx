import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
import type { ArticleStatus, ArticleListPage, KnowledgeArticle, KnowledgeSearchMode, PublishArticleRequest } from '@/api';
import { useClients, useDeleteKnowledgeArticle, useDepartments, useKnowledgeAllArticles, useKnowledgeArticles, useKnowledgeSearch, usePublishKnowledgeArticle, useSites, useUnpublishKnowledgeArticle } from '@/hooks';
import { useAuthorization } from '@/auth/authorization';
import { BookOpen, ChevronDown, ChevronUp, Eye, Filter, Pencil, Plus, Search, Send, Trash2 } from 'lucide-react';
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
type ContextMenuState = { x: number; y: number; article: KnowledgeArticle } | null;

const SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'updatedAt', label: 'Última atualização' },
  { value: 'title', label: 'Título' },
  { value: 'createdBy', label: 'Autor' },
  { value: 'scope', label: 'Escopo' },
  { value: 'status', label: 'Status' },
];

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_SEARCH_MAX_RESULTS = 10;

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
  if (article.scopeOrigin) {
    if (article.scopeOrigin === 'global') return 'Global';
    if (article.scopeOrigin === 'client') return 'Cliente';
    return 'Site';
  }
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
  const [sortBy, setSortBy] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [advancedFiltersExpanded, setAdvancedFiltersExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined]);

  const isAllVisible = !clientId;

  const sites = useSites(clientId);
  const departments = useDepartments({ clientId: clientId || undefined, activeOnly: true });

  const currentCursor =
    cursorStack.length > 0 ? cursorStack[cursorStack.length - 1] : undefined;

  const allVisibleParams = useMemo(() => ({
    cursor: currentCursor,
    limit: pageSize,
    status: statusFilter || undefined,
    category: category || undefined,
  }), [currentCursor, pageSize, statusFilter, category]);

  const listQueryLegacy = useKnowledgeArticles({
    clientId: clientId || undefined,
    siteId: siteId || undefined,
    category: category || undefined,
    status: statusFilter || undefined,
    departmentId: departmentId || undefined,
  });

  const listQueryAllVisible = useKnowledgeAllArticles(allVisibleParams);

  const listQuery = isAllVisible ? listQueryAllVisible : listQueryLegacy;
  const listPage: ArticleListPage | undefined =
    isAllVisible
      ? (listQueryAllVisible.data as ArticleListPage | undefined)
      : undefined;
  const listItems: KnowledgeArticle[] = isAllVisible
    ? (listPage?.items ?? [])
    : ((listQueryLegacy.data as KnowledgeArticle[]) ?? []);

  const searchQuery = useKnowledgeSearch(
    {
      q: query.trim(),
      clientId: clientId || undefined,
      siteId: siteId || undefined,
      departmentId: departmentId || undefined,
      mode: searchMode,
      maxResults: DEFAULT_SEARCH_MAX_RESULTS,
      scopeMode: isAllVisible ? 'all-visible' : undefined,
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

  useEffect(() => {
    if (clientId) return;
    if (!siteId && !departmentId) return;

    setSiteId('');
    setDepartmentId('');
  }, [clientId, departmentId, siteId]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('contextmenu', closeMenu);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('contextmenu', closeMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setContextMenu(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;

    const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - 240));
    const top = Math.max(8, Math.min(contextMenu.y, window.innerHeight - 220));

    contextMenuRef.current.style.left = `${left}px`;
    contextMenuRef.current.style.top = `${top}px`;
  }, [contextMenu]);

  const categoryOptions = useMemo(() => {
    const source = listItems;
    const unique = Array.from(new Set(source.map((item) => normalizeCategory(item.category))));
    unique.sort((a, b) => a.localeCompare(b));

    return [{ value: '', label: 'Todas categorias' }, ...unique.map((name) => ({ value: name, label: name }))];
  }, [listItems]);

  const clientOptions = [
    { value: '', label: 'Todos os artigos que posso acessar (multi-escopo)' },
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
  const searchModeLabel = SEARCH_MODE_OPTIONS.find((option) => option.value === searchMode)?.label ?? 'Híbrido';
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
    setContextMenu(null);

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
    setContextMenu(null);

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
  ];

  const sortedArticles = useMemo(() => {
    const items = [...listItems];

    if (isAllVisible) return items; // Server-side ordering

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
  }, [listItems, sortBy, sortDirection, isAllVisible]);

  const totalItems = isAllVisible ? (listPage?.count ?? listItems.length) : sortedArticles.length;
  const totalPages = isAllVisible
    ? (listPage?.hasMore ? cursorStack.length + 1 : cursorStack.length || 1)
    : Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = isAllVisible ? cursorStack.length : Math.min(page, totalPages);
  const pagedArticles = isAllVisible
    ? listItems
    : useMemo(() => {
        const start = (Math.min(page, totalPages) - 1) * pageSize;
        return sortedArticles.slice(start, start + pageSize);
      }, [page, pageSize, sortedArticles, totalPages]);

  useEffect(() => {
    setPage(1);
    setCursorStack([undefined]);
  }, [clientId, siteId, category, statusFilter, departmentId, pageSize]);

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
        <form className="space-y-3" onSubmit={handleSearchSubmit}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_auto] lg:items-end">
            <Input
              label="Busca inteligente (semântica + keyword)"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Ex.: como resetar senha do AD"
            />

            <Select
              label="Modo"
              options={SEARCH_MODE_OPTIONS}
              value={searchMode}
              onChange={(event) => setSearchMode(event.target.value as KnowledgeSearchMode)}
            />

            <div className="flex items-end gap-2">
              <Button
                type="submit"
                disabled={!searchInput.trim()}
                className="h-[38px] shrink-0 px-3"
                title="Buscar na base"
                aria-label="Buscar na base"
              >
                <Search className="h-4 w-4" />
                Buscar
              </Button>
              {hasSemanticSearch && (
                <Button type="button" variant="ghost" onClick={handleClearSearch}>
                  Limpar busca
                </Button>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Use linguagem natural para encontrar artigos mesmo sem palavras exatas.
          </p>
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
                  const nextClientId = event.target.value;
                  setClientId(nextClientId);
                  setSiteId('');
                  setDepartmentId('');
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
                disabled={!clientId}
              />
            </div>

            {!clientId && (
              <p className="text-xs text-slate-400">
                Modo multi-escopo ativo: exibe todos os artigos globais e de clientes/sites que seu perfil pode acessar.
              </p>
            )}

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

      </Card>

      <Card padding={false}>
        {hasSemanticSearch ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">Resultados da busca inteligente</p>
                <p className="text-xs text-slate-400">
                  Consulta: "{query}" • modo {searchModeLabel}. Clique em um artigo para abrir em modo leitura.
                </p>
              </div>
              {!searchQuery.isLoading && !searchQuery.isError && (
                <Badge color="accent">{(searchQuery.data ?? []).length}</Badge>
              )}
            </div>

            <div className="p-4">
              {searchQuery.isLoading && <Loading message="Buscando artigos relevantes..." />}
              {searchQuery.isError && (
                <ErrorDisplay
                  message="Falha na busca de conhecimento."
                  onRetry={() => searchQuery.refetch()}
                />
              )}
              {!searchQuery.isLoading && !searchQuery.isError && (
                <div className="space-y-3">
                  <DataTable
                    columns={columns}
                    data={searchQuery.data ?? []}
                    keyExtractor={(item) => item.id}
                    onRowClick={(item) => navigate(`/knowledge/${item.id}`)}
                    onRowContextMenu={(event, item) => {
                      event.preventDefault();
                      setContextMenu({ x: event.clientX, y: event.clientY, article: item });
                    }}
                    emptyMessage="Nenhum resultado para esta busca."
                    showPagination={false}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                    <p className="text-xs text-slate-400">
                      {(searchQuery.data ?? []).length} artigo(s) relevantes para "{query}".
                    </p>
                    <Button type="button" variant="ghost" size="sm" onClick={handleClearSearch}>
                      Voltar para listagem completa
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (listQueryLegacy.isLoading || listQueryAllVisible.isLoading) ? (
          <Loading message="Carregando artigos..." />
        ) : (listQueryLegacy.isError || listQueryAllVisible.isError) ? (
          <ErrorDisplay message="Falha ao carregar artigos." onRetry={() => listQuery.refetch()} />
        ) : (
          <div>
            <DataTable
              columns={columns}
              data={pagedArticles}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => navigate(`/knowledge/${item.id}`)}
              onRowContextMenu={(event, item) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY, article: item });
              }}
              emptyMessage="Nenhum artigo encontrado para os filtros selecionados."
              showPagination={false}
            />
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
              <p className="text-xs text-slate-400">
                {totalItems} artigo(s) • {pageSize} por página • página {currentPage}
                {isAllVisible && listPage?.hasMore
                  ? ` • mais itens disponíveis`
                  : !isAllVisible
                    ? ` de ${totalPages}`
                    : ''}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (isAllVisible) {
                      setCursorStack((prev) => {
                        if (prev.length <= 1) return prev;
                        return prev.slice(0, -1);
                      });
                    } else {
                      setPage((prev) => Math.max(1, prev - 1));
                    }
                  }}
                  disabled={
                    isAllVisible
                      ? cursorStack.length <= 1
                      : currentPage === 1
                  }
                >
                  Anterior
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (isAllVisible && listPage?.nextCursor) {
                      setCursorStack((prev) => [...prev, listPage.nextCursor!]);
                    } else if (!isAllVisible) {
                      setPage((prev) => Math.min(totalPages, prev + 1));
                    }
                  }}
                  disabled={
                    isAllVisible
                      ? (!listPage?.hasMore || !listPage?.nextCursor || listQueryAllVisible.isFetching)
                      : (currentPage === totalPages || listQueryLegacy.isFetching)
                  }
                  loading={listQueryAllVisible.isFetching}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            ref={contextMenuRef}
            className="fixed z-50 min-w-[220px] overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-xl"
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
              onClick={() => {
                navigate(`/knowledge/${contextMenu.article.id}`);
                setContextMenu(null);
              }}
            >
              <Eye className="h-4 w-4" />
              Visualizar artigo
            </button>

            {canEditArticle && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
                onClick={() => {
                  navigate(`/knowledge/${contextMenu.article.id}/edit`);
                  setContextMenu(null);
                }}
              >
                <Pencil className="h-4 w-4" />
                Editar artigo
              </button>
            )}

            {canPublishArticle && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => onTogglePublish(contextMenu.article)}
                disabled={publishMutation.isPending || unpublishMutation.isPending}
              >
                <Send className="h-4 w-4" />
                {contextMenu.article.status === 'Draft' ? 'Publicar artigo' : 'Despublicar artigo'}
              </button>
            )}

            {canDeleteArticle && (
              <button
                className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => onDelete(contextMenu.article)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Excluir artigo
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
