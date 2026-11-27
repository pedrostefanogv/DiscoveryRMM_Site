import { formatDate } from '@/utils/format';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Icon,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ContextMenu,
  DataTable,
  ErrorDisplay,
  Input,
  Loading,
  Modal,
  Pagination,
  Select,
  PageHeader,
} from '@/components/ui';
import type { Column, ContextMenuItem } from '@/components/ui';
import type { ArticleStatus, ArticleListPage, KnowledgeArticle, KnowledgeSearchMode, PublishArticleRequest } from '@/api';
import { useCursorPagination } from '@/hooks/useCursorPagination';
import {
  useClients,
  useDeleteKnowledgeArticle,
  useDepartments,
  useKnowledgeAllArticles,
  useKnowledgeCategories,
  useKnowledgeSearch,
  usePublishKnowledgeArticle,
  useSites,
  useUnpublishKnowledgeArticle,
} from '@/hooks';
import { useAuthorization } from '@/auth/authorization';
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
  { value: 'AiOnly', label: 'Somente IA' },
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
    case 'AiOnly': return 'Somente IA';
    case 'Draft': return 'Rascunho';
    default: return article.status;
  }
}

function statusColor(status: ArticleStatus): 'success' | 'warning' | 'accent' | 'slate' {
  switch (status) {
    case 'Published': return 'success';
    case 'Internal': return 'accent';
    case 'AiOnly': return 'slate';
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
  const [publishModalArticle, setPublishModalArticle] = useState<KnowledgeArticle | null>(null);
  const [publishStatusChoice, setPublishStatusChoice] = useState<'Published' | 'Internal' | 'AiOnly'>('Published');
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeArticle | null>(null);
  const knowledgePag = useCursorPagination({ initialLimit: DEFAULT_PAGE_SIZE });

  const sites = useSites(clientId);
  const departments = useDepartments({ clientId: clientId || undefined, activeOnly: true });
  const categoriesQuery = useKnowledgeCategories();

  const allVisibleParams = useMemo(() => ({
    cursor: knowledgePag.cursor,
    limit: pageSize,
    status: statusFilter || undefined,
    category: category || undefined,
    clientId: clientId || undefined,
    siteId: siteId || undefined,
    departmentId: departmentId || undefined,
    sortBy,
    sortDirection,
  }), [knowledgePag.cursor, pageSize, statusFilter, category, clientId, siteId, departmentId, sortBy, sortDirection]);

  // Listagem unificada via ACL do usuário — funciona com ou sem filtro de cliente
  const listQuery = useKnowledgeAllArticles(allVisibleParams);

  // Resposta sempre em formato ArticleListPage do backend unificado
  const listPage = listQuery.data as ArticleListPage | undefined;
  const listItems: KnowledgeArticle[] = listPage?.items ?? [];

  const searchQuery = useKnowledgeSearch(
    {
      q: query.trim(),
      clientId: clientId || undefined,
      siteId: siteId || undefined,
      departmentId: departmentId || undefined,
      mode: searchMode,
      maxResults: DEFAULT_SEARCH_MAX_RESULTS,
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
    if (!siteId) return;

    setSiteId('');
  }, [clientId, siteId]);

  const categoryOptions = useMemo(() => {
    const serverCats = categoriesQuery.data ?? [];
    const fromItems = listItems.map((item) => item.category?.trim()).filter((c): c is string => Boolean(c));
    const unique = Array.from(new Set([...serverCats, ...fromItems]));
    unique.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (category && !unique.includes(category)) unique.push(category);

    return [{ value: '', label: 'Todas categorias' }, ...unique.map((name) => ({ value: name, label: name }))];
  }, [categoriesQuery.data, listItems, category]);

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
    if (statusFilter) {
      const statusText =
        statusFilter === 'Published'
          ? 'Publicados'
          : statusFilter === 'Internal'
          ? 'Internos'
          : statusFilter === 'AiOnly'
          ? 'Somente IA'
          : 'Rascunhos';
      parts.push(`Status: ${statusText}`);
    }
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
      setPublishStatusChoice(article.departmentId ? 'Internal' : 'Published');
      setPublishModalArticle(article);
      return;
    }

    // Published/Internal/AiOnly → Unpublish
    unpublishMutation.mutate(
      { id: article.id },
      {
        onSuccess: () => toast.success('Artigo voltou para rascunho'),
        onError: () => toast.error('Falha ao despublicar artigo'),
      },
    );
  };

  const confirmPublishModal = () => {
    if (!publishModalArticle) return;
    if (publishStatusChoice === 'Internal' && !publishModalArticle.departmentId) {
      toast.error('Este artigo não possui departamento. Edite-o para selecionar um departamento antes de publicar como Interno.');
      return;
    }
    const data: PublishArticleRequest = { status: publishStatusChoice, lastEditedBy: null };
    publishMutation.mutate(
      { id: publishModalArticle.id, data },
      {
        onSuccess: () => {
          toast.success('Artigo publicado');
          setPublishModalArticle(null);
        },
        onError: () => toast.error('Falha ao publicar artigo'),
      },
    );
  };

  const onDelete = (article: KnowledgeArticle) => {
    setContextMenu(null);
    setDeleteTarget(article);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success('Artigo excluído');
        setDeleteTarget(null);
      },
      onError: () => toast.error('Falha ao excluir artigo'),
    });
  };

  const departmentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departments.data ?? []) {
      map.set(d.id, d.name);
    }
    return map;
  }, [departments.data]);

  const filteredSearchResults = useMemo(() => {
    const items = searchQuery.data ?? [];
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (category && (item.category ?? '').toLowerCase() !== category.toLowerCase()) return false;
      return true;
    });
  }, [searchQuery.data, statusFilter, category]);

  const columns: Column<KnowledgeArticle>[] = [
    {
      key: 'title',
      header: 'Artigo',
      render: (article) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/20">
            <Icon
              name={article.status === 'AiOnly' ? 'smart_toy' : 'menu_book'}
              className="h-4 w-4 text-primary"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{article.title}</p>
            <p className="truncate text-xs text-muted">
              {normalizeCategory(article.category)} • {Array.isArray(article.tags) && article.tags.length > 0 ? article.tags.join(', ') : 'sem tags'}
              {article.currentVersionNumber > 0 ? ` • v${article.currentVersionNumber}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Escopo / Depto',
      render: (article) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge color="accent">{scopeLabel(article)}</Badge>
          {article.departmentId && (
            <Badge color="slate">
              {departmentNameById.get(article.departmentId) ?? 'Departamento'}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status / IA',
      render: (article) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge color={statusColor(article.status)}>
            {statusLabel(article)}
          </Badge>
          {article.aiIndexingEnabled === false && (
            <Badge color="warning">Sem IA</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'createdBy',
      header: 'Autor',
      render: (article) => (
        <div>
          <span className="text-muted-foreground">{article.createdBy || '\u2014'}</span>
          {article.lastEditedBy && article.lastEditedBy !== article.createdBy && (
            <span className="text-xs text-muted block">
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
        <span className="text-xs text-muted">
          {formatDate(article.updatedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Ações',
      render: (article) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/knowledge/${article.id}`)}
            title="Visualizar artigo"
            aria-label={`Visualizar ${article.title}`}
          >
            <Icon name="visibility" className="h-4 w-4" />
          </Button>
          {canEditArticle && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/knowledge/${article.id}/edit`)}
              title="Editar artigo"
              aria-label={`Editar ${article.title}`}
            >
              <Icon name="edit" className="h-4 w-4" />
            </Button>
          )}
          {canPublishArticle && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onTogglePublish(article)}
              disabled={publishMutation.isPending || unpublishMutation.isPending}
              title={article.status === 'Draft' ? 'Publicar artigo' : 'Mover para rascunho'}
              aria-label={article.status === 'Draft' ? `Publicar ${article.title}` : `Despublicar ${article.title}`}
            >
              <Icon name={article.status === 'Draft' ? 'send' : 'edit_note'} className="h-4 w-4" />
            </Button>
          )}
          {canDeleteArticle && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDelete(article)}
              disabled={deleteMutation.isPending}
              title="Excluir artigo"
              aria-label={`Excluir ${article.title}`}
              className="text-danger hover:bg-danger/10"
            >
              <Icon name="delete" className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Quando o endpoint retorna ArticleListPage, usamos cursor-based;
  // sem ArticleListPage (ou vazio), fazemos client-side.
  const hasArticleListPage = listPage !== undefined && listPage.items.length > 0;

  const sortedArticles = useMemo(() => {
    const items = [...listItems];

    // Sempre usa servidor quando ArticleListPage — cursor-based pagination.
    if (hasArticleListPage) return items;

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
  }, [listItems, sortBy, sortDirection, hasArticleListPage]);

  const totalItems = listPage
    ? (listPage.returnedItems ?? listItems.length)
    : sortedArticles.length;
  const totalPages = listPage
    ? (listPage.hasMore ? knowledgePag.page + 1 : knowledgePag.page || 1)
    : Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = listPage ? knowledgePag.page : Math.min(page, totalPages);
  const pagedArticles = useMemo(() => {
    if (listPage) return listItems;
    const start = (Math.min(page, totalPages) - 1) * pageSize;
    return sortedArticles.slice(start, start + pageSize);
  }, [listPage, listItems, page, pageSize, sortedArticles, totalPages]);

  useEffect(() => {
    setPage(1);
    knowledgePag.reset();
  }, [clientId, siteId, category, statusFilter, departmentId, pageSize, sortBy, sortDirection]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Base de Conhecimento"
        description="Busque artigos rapidamente, organize por departamento e controle o uso pela IA."
      >
        {canCreateArticle && (
          <Button onClick={() => navigate('/knowledge/new')}>
            <Icon name="add" className="h-4 w-4" /> Novo Artigo
          </Button>
        )}
      </PageHeader>

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
                <Icon name="search" className="h-4 w-4" />
                Buscar
              </Button>
              {hasSemanticSearch && (
                <Button type="button" variant="ghost" onClick={handleClearSearch}>
                  Limpar busca
                </Button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted">
            Use linguagem natural para encontrar artigos mesmo sem palavras exatas.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {STATUS_OPTIONS.map((opt) => {
              const active = statusFilter === opt.value;
              return (
                <button
                  key={opt.value || 'all'}
                  type="button"
                  onClick={() => setStatusFilter(opt.value as ArticleStatus | '')}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-surface-light text-muted hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
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
            <Icon name="filter_alt" className="h-4 w-4" />
            Filtros avançados da listagem
            {advancedFiltersActiveCount > 0 && <Badge color="accent">{advancedFiltersActiveCount}</Badge>}
            {advancedFiltersExpanded ? <Icon name="expand_less" className="h-4 w-4" /> : <Icon name="expand_more" className="h-4 w-4" />}
          </Button>

          {advancedFiltersActiveCount > 0 && !advancedFiltersExpanded && (
            <span className="text-xs text-muted">Filtros ativos aplicados à tabela.</span>
          )}

          {advancedFiltersActiveCount > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={handleClearAdvancedFilters}>
              Limpar filtros
            </Button>
          )}
        </div>

        {!advancedFiltersExpanded && (
          <p className="mt-2 text-xs text-muted">{listingFiltersSummary}</p>
        )}

        {advancedFiltersExpanded && (
          <div className="mt-3 space-y-4 rounded-xl border border-border bg-surface-light p-3 sm:p-4">
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
              />
            </div>

            {!clientId && (
              <p className="text-xs text-muted">
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Resultados da busca inteligente</p>
                <p className="text-xs text-muted">
                  Consulta: "{query}" • modo {searchModeLabel}. Clique em um artigo para abrir em modo leitura.
                </p>
              </div>
              {!searchQuery.isLoading && !searchQuery.isError && (
                <Badge color="accent">{filteredSearchResults.length}</Badge>
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
                    data={filteredSearchResults}
                    keyExtractor={(item) => item.id}
                    onRowClick={(item) => navigate(`/knowledge/${item.id}`)}
                    onRowContextMenu={(event, item) => {
                      event.preventDefault();
                      setContextMenu({ x: event.clientX, y: event.clientY, article: item });
                    }}
                    emptyMessage="Nenhum resultado para esta busca."
                    showPagination={false}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <p className="text-xs text-muted">
                      {filteredSearchResults.length} artigo(s) relevantes para "{query}".
                    </p>
                    <Button type="button" variant="ghost" size="sm" onClick={handleClearSearch}>
                      Voltar para listagem completa
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : listQuery.isLoading ? (
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
              onRowContextMenu={(event, item) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY, article: item });
              }}
              emptyMessage="Nenhum artigo encontrado para os filtros selecionados."
              showPagination={false}
            />
            {hasArticleListPage ? (
              <Pagination
                className="border-t border-border px-4 py-3"
                page={knowledgePag.page}
                totalPages={1}
                onPageChange={() => {}}
                itemLabel={`${totalItems} artigo(s)${listPage?.hasMore ? ' • mais itens disponíveis' : ''}`}
                cursor={{
                  hasPrev: knowledgePag.page > 1,
                  hasNext: Boolean(listPage?.hasMore && listPage?.nextCursor),
                  onPrev: knowledgePag.goToPrev,
                  onNext: () => {
                    if (listPage?.nextCursor) knowledgePag.goToNext(listPage.nextCursor);
                  },
                  loading: listQuery.isFetching,
                }}
              />
            ) : (
              <Pagination
                className="border-t border-border px-4 py-3"
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={totalItems}
                pageSize={pageSize}
              />
            )}
          </div>
        )}
      </Card>

      {contextMenu && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          items={([
            {
              key: 'view',
              label: 'Visualizar artigo',
              icon: <Icon name="visibility" className="h-4 w-4" />,
              onClick: () => navigate(`/knowledge/${contextMenu.article.id}`),
            },
            canEditArticle
              ? {
                  key: 'edit',
                  label: 'Editar artigo',
                  icon: <Icon name="edit" className="h-4 w-4" />,
                  onClick: () => navigate(`/knowledge/${contextMenu.article.id}/edit`),
                }
              : null,
            canPublishArticle
              ? {
                  key: 'publish',
                  label: contextMenu.article.status === 'Draft' ? 'Publicar artigo' : 'Despublicar artigo',
                  icon: <Icon name={contextMenu.article.status === 'Draft' ? 'send' : 'edit_note'} className="h-4 w-4" />,
                  disabled: publishMutation.isPending || unpublishMutation.isPending,
                  onClick: () => onTogglePublish(contextMenu.article),
                }
              : null,
            canDeleteArticle
              ? {
                  key: 'delete',
                  label: 'Excluir artigo',
                  icon: <Icon name="delete" className="h-4 w-4" />,
                  danger: true,
                  separatorBefore: true,
                  disabled: deleteMutation.isPending,
                  onClick: () => onDelete(contextMenu.article),
                }
              : null,
          ].filter(Boolean) as ContextMenuItem[])}
        />
      )}

      <Modal
        open={publishModalArticle !== null}
        onClose={() => setPublishModalArticle(null)}
        title="Publicar artigo"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Escolha a visibilidade de <strong className="text-foreground">"{publishModalArticle?.title}"</strong>:
          </p>
          <Select
            label="Visibilidade"
            value={publishStatusChoice}
            onChange={(e) => setPublishStatusChoice(e.target.value as 'Published' | 'Internal' | 'AiOnly')}
            options={[
              { value: 'Published', label: 'Publicado — visível para todos os usuários' },
              { value: 'Internal', label: 'Interno — restrito ao departamento' },
              { value: 'AiOnly', label: 'Somente IA — orienta o chat sem expor o documento' },
            ]}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPublishModalArticle(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmPublishModal} loading={publishMutation.isPending}>
              Publicar
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir artigo"
        message={
          <>
            Tem certeza que deseja excluir o artigo <strong>"{deleteTarget?.title}"</strong>?
          </>
        }
        confirmLabel="Excluir"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
