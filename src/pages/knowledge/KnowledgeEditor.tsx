import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, History, Home, Save, Send } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ErrorDisplay,
  Input,
  Loading,
  MarkdownEditor,
  Select,
} from '@/components/ui';
import { useArticlePages, useClients, useCreateKnowledgeArticle, useCreateArticlePage, useDepartments, useKnowledgeArticle, useKnowledgeArticleVersions, usePublishKnowledgeArticle, useSites, useUpdateArticlePage, useUpdateKnowledgeArticle } from '@/hooks';
import type { ArticlePageTreeNode, ArticleStatus, ArticleVersion, CreateKnowledgeArticleRequest, PublishArticleRequest, UpdateKnowledgeArticleRequest } from '@/api';
import toast from 'react-hot-toast';
import ArticlePagesManager from './ArticlePagesManager';

type FormState = {
  title: string;
  content: string;
  category: string;
  tags: string;
  clientId: string;
  siteId: string;
  departmentId: string;
  targetStatus: ArticleStatus;
};

function toTagArray(tags: string): string[] {
  return tags
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusLabel(status: ArticleStatus): string {
  switch (status) {
    case 'Published': return 'Publicado';
    case 'Internal': return 'Interno';
    case 'Draft': return 'Rascunho';
    default: return status;
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

export default function KnowledgeEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [form, setForm] = useState<FormState>({
    title: '',
    content: '## Novo Artigo\n\nDescreva aqui o procedimento em Markdown.',
    category: '',
    tags: '',
    clientId: '',
    siteId: '',
    departmentId: '',
    targetStatus: 'Draft',
  });

  const [showVersions, setShowVersions] = useState(false);

  // ── Editor único de sub-páginas (estilo Notion) ──────────────
  // activePageId === null → editando a "home" (artigo principal)
  // activePageId === '__new__' → criando uma nova sub-página
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState('');
  const [pageContent, setPageContent] = useState('');
  const [pageParentId, setPageParentId] = useState('');
  const pagesQuery = useArticlePages(id ?? '');
  const createPageMutation = useCreateArticlePage(id ?? '');
  const updatePageMutation = useUpdateArticlePage(id ?? '');

  const clients = useClients();
  const sites = useSites(form.clientId);
  const departments = useDepartments({ clientId: form.clientId || undefined, activeOnly: true });
  const detailQuery = useKnowledgeArticle(id ?? '');
  const versionsQuery = useKnowledgeArticleVersions(id ?? '');
  const createMutation = useCreateKnowledgeArticle();
  const updateMutation = useUpdateKnowledgeArticle();
  const publishMutation = usePublishKnowledgeArticle();

  useEffect(() => {
    if (!isEdit || !detailQuery.data) return;

    const article = detailQuery.data;
    setForm({
      title: article.title,
      content: article.content,
      category: article.category ?? '',
      tags: Array.isArray(article.tags) ? article.tags.join(', ') : '',
      clientId: article.clientId ?? '',
      siteId: article.siteId ?? '',
      departmentId: article.departmentId ?? '',
      targetStatus: article.status,
    });
  }, [detailQuery.data, isEdit]);

  // Ao trocar de artigo, volta para a "home" e limpa o editor de página.
  useEffect(() => {
    setActivePageId(null);
    setPageTitle('');
    setPageContent('');
    setPageParentId('');
  }, [id]);

  // Busca recursiva de um nó na árvore de sub-páginas.
  const findPage = (
    nodes: ArticlePageTreeNode[],
    pageId: string,
  ): ArticlePageTreeNode | null => {
    for (const node of nodes) {
      if (node.id === pageId) return node;
      const found = findPage(node.children, pageId);
      if (found) return found;
    }
    return null;
  };

  // Seleciona uma sub-página para edição no editor único.
  const handleSelectPage = (pageId: string) => {
    const node = findPage(pagesQuery.data ?? [], pageId);
    if (!node) return;
    setActivePageId(pageId);
    setPageTitle(node.title);
    setPageContent(node.content ?? '');
    setPageParentId(node.parentPageId ?? '');
  };

  // Volta para a "home" (artigo principal).
  const handleSelectHome = () => {
    setActivePageId(null);
    setPageTitle('');
    setPageContent('');
    setPageParentId('');
  };

  // Abre o editor único em modo de criação de nova sub-página.
  const handleCreatePage = () => {
    setActivePageId('__new__');
    setPageTitle('');
    setPageContent('');
    setPageParentId('');
  };

  // Salva a sub-página ativa (cria ou atualiza).
  const handleSavePage = () => {
    if (!id) return;
    if (!pageTitle.trim()) {
      toast.error('Informe o título da página.');
      return;
    }

    if (activePageId === '__new__') {
      createPageMutation.mutate(
        {
          title: pageTitle.trim(),
          content: pageContent,
          parentPageId: pageParentId || null,
        },
        {
          onSuccess: () => {
            toast.success('Página criada.');
            handleSelectHome();
          },
          onError: () => toast.error('Falha ao criar página.'),
        },
      );
      return;
    }

    if (activePageId) {
      updatePageMutation.mutate(
        {
          pageId: activePageId,
          data: {
            title: pageTitle.trim(),
            content: pageContent,
            parentPageId: pageParentId || null,
          },
        },
        {
          onSuccess: () => {
            toast.success('Página atualizada.');
            handleSelectHome();
          },
          onError: () => toast.error('Falha ao atualizar página.'),
        },
      );
    }
  };

  // Quando uma página é excluída, limpa a seleção se for a ativa.
  const handleDeletePage = (pageId: string) => {
    if (activePageId === pageId) {
      handleSelectHome();
    }
  };

  // Opções de "página pai" para criar/mover sub-página (limite de 3 níveis).
  const pageParentOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; disabled?: boolean }> = [
      { value: '', label: 'Nenhuma (nível 1)' },
    ];
    const flatten = (list: ArticlePageTreeNode[], depth: number) => {
      for (const node of list) {
        if (node.id !== activePageId) {
          const disabled = depth + 1 >= 3;
          options.push({
            value: node.id,
            label: `${'  '.repeat(depth)}${node.title}${disabled ? ' (limite de níveis)' : ''}`,
            disabled,
          });
        }
        flatten(node.children, depth + 1);
      }
    };
    flatten(pagesQuery.data ?? [], 0);
    return options;
  }, [pagesQuery.data, activePageId]);

  const isEditingPage = activePageId !== null;
  const isCreatingPage = activePageId === '__new__';

  const clientOptions = useMemo(
    () => [
      { value: '', label: 'Global (todos os clientes)' },
      ...(clients.data ?? []).map((item) => ({ value: item.id, label: item.name })),
    ],
    [clients.data],
  );

  const siteOptions = useMemo(
    () => [
      { value: '', label: 'Sem site (escopo cliente)' },
      ...(sites.data ?? []).map((item) => ({ value: item.id, label: item.name })),
    ],
    [sites.data],
  );

  const departmentOptions = useMemo(
    () => [
      { value: '', label: 'Nenhum (artigo sem departamento)' },
      ...(departments.data ?? []).map((item) => ({ value: item.id, label: item.name })),
    ],
    [departments.data],
  );

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const valid = form.title.trim().length >= 3 && form.content.trim().length >= 10;

  const submit = async (targetStatus: ArticleStatus = 'Draft') => {
    if (!valid) {
      toast.error('Preencha título e conteúdo do artigo.');
      return;
    }

    // Se há uma sub-página em edição não salva, avisa antes de salvar o artigo.
    if (isEditingPage) {
      toast.error('Salve ou cancele a sub-página em edição antes de salvar o artigo.');
      return;
    }

    if (!form.clientId && form.siteId) {
      toast.error('Site exige seleção de cliente.');
      return;
    }

    if (targetStatus === 'Internal' && !form.departmentId) {
      toast.error('Selecione um departamento para artigo Interno.');
      return;
    }

    if (isEdit && id) {
      const payload: UpdateKnowledgeArticleRequest = {
        title: form.title.trim(),
        content: form.content,
        category: form.category.trim() || null,
        tags: toTagArray(form.tags),
      };

      updateMutation.mutate({ id, data: payload }, {
        onSuccess: () => {
          // Se o status alvo for Draft, só salva
          if (form.targetStatus === 'Draft') {
            toast.success('Artigo atualizado (rascunho).');
            navigate(`/knowledge/${id}`);
            return;
          }

          // Caso contrário publica/interniza
          const publishPayload: PublishArticleRequest = {
            status: form.targetStatus,
          };
          publishMutation.mutate({ id, data: publishPayload }, {
            onSuccess: () => {
              toast.success(form.targetStatus === 'Published'
                ? 'Artigo atualizado e publicado!'
                : 'Artigo atualizado e marcado como Interno!');
              navigate(`/knowledge/${id}`);
            },
            onError: () => {
              toast.error('Artigo salvo, mas falhou ao publicar.');
              navigate(`/knowledge/${id}`);
            },
          });
        },
        onError: () => toast.error('Não foi possível atualizar o artigo.'),
      });

      return;
    }

    const payload: CreateKnowledgeArticleRequest = {
      title: form.title.trim(),
      content: form.content,
      category: form.category.trim() || null,
      tags: toTagArray(form.tags),
      clientId: form.clientId || null,
      siteId: form.siteId || null,
      departmentId: form.departmentId || null,
    };

    createMutation.mutate(payload, {
      onSuccess: (created) => {
        if (targetStatus === 'Draft') {
          toast.success('Artigo criado como rascunho.');
          navigate(`/knowledge/${created.id}`);
          return;
        }

        const publishPayload: PublishArticleRequest = {
          status: targetStatus,
        };

        publishMutation.mutate({ id: created.id, data: publishPayload }, {
          onSuccess: () => {
            toast.success(targetStatus === 'Published'
              ? 'Artigo criado e publicado!'
              : 'Artigo criado e marcado como Interno!');
            navigate(`/knowledge/${created.id}`);
          },
          onError: () => {
            toast.error('Artigo criado, mas falhou ao publicar.');
            navigate(`/knowledge/${created.id}`);
          },
        });
      },
      onError: () => toast.error('Não foi possível criar o artigo.'),
    });
  };

  if (isEdit && detailQuery.isLoading) {
    return <Loading message="Carregando artigo..." />;
  }

  if (isEdit && detailQuery.isError) {
    return <ErrorDisplay message="Falha ao carregar artigo." onRetry={() => detailQuery.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate('/knowledge')}
            className="mb-2 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <h1 className="text-2xl font-bold text-foreground">
            {isEdit ? 'Editar artigo' : 'Novo artigo'}
          </h1>
          <p className="text-sm text-muted">Conteúdo em Markdown com preview em tempo real.</p>
        </div>
        {isEdit && detailQuery.data && (
          <div className="flex items-center gap-3">
            <Badge color={statusColor(detailQuery.data.status)}>
              {statusLabel(detailQuery.data.status)}
            </Badge>
            {detailQuery.data.status !== 'Draft' && (
              <span className="text-xs text-muted">
                v{detailQuery.data.currentVersionNumber}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6">
        <Card>
          <div className="space-y-4">
            <Input
              label="Título"
              value={form.title}
              onChange={(event) => setField('title', event.target.value)}
              placeholder="Ex.: Como resetar senha do AD"
            />

            <div className="grid gap-4 md:grid-cols-1">
              <Input
                label="Categoria"
                value={form.category}
                onChange={(event) => setField('category', event.target.value)}
                placeholder="Ex.: Active Directory"
              />
            </div>

            <Input
              label="Tags (separadas por vírgula)"
              value={form.tags}
              onChange={(event) => setField('tags', event.target.value)}
              placeholder="ad, senha, reset"
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Cliente"
                options={clientOptions}
                value={form.clientId}
                onChange={(event) => {
                  setField('clientId', event.target.value);
                  setField('siteId', '');
                  setField('departmentId', '');
                }}
              />
              <Select
                label="Site"
                options={siteOptions}
                value={form.siteId}
                onChange={(event) => setField('siteId', event.target.value)}
                disabled={!form.clientId}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Departamento (obrigatório para artigos Internos)"
                options={departmentOptions}
                value={form.departmentId}
                onChange={(event) => setField('departmentId', event.target.value)}
              />
              <Select
                label="Status ao salvar"
                options={[
                  { value: 'Draft', label: 'Rascunho — ainda não publicado' },
                  { value: 'Published', label: 'Publicado — visível para todos os usuários' },
                  { value: 'Internal', label: 'Interno — restrito ao departamento' },
                ]}
                value={form.targetStatus}
                onChange={(event) => setField('targetStatus', event.target.value as ArticleStatus)}
                hint={
                  form.targetStatus === 'Published'
                    ? 'Visível para todos os usuários. Respeita a herança: Global → Clientes → Sites → Agentes.'
                    : form.targetStatus === 'Internal'
                    ? 'Visível apenas para usuários do departamento vinculado. Ainda respeita a herança de escopo.'
                    : 'Ainda não publicado. Apenas você pode ver este artigo.'
                }
              />
            </div>

            {isEdit && detailQuery.data && detailQuery.data.status !== 'Draft' && (
              <div className="rounded-lg border border-border bg-surface-light p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Publicado como <Badge color={statusColor(detailQuery.data.status)}>{statusLabel(detailQuery.data.status)}</Badge>
                      {' '}v{detailQuery.data.currentVersionNumber}
                    </p>
                    {detailQuery.data.publishedAt && (
                      <p className="text-xs text-muted">
                        Publicado em {new Date(detailQuery.data.publishedAt).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const confirmMsg = detailQuery.data.status === 'Published'
                          ? 'Republicar como Interno? (visível apenas para o departamento)'
                          : 'Republicar como Público? (visível para todos)';
                        if (!window.confirm(confirmMsg)) return;
                        const newStatus = detailQuery.data.status === 'Published' ? 'Internal' : 'Published';
                        const data: PublishArticleRequest = {
                          status: newStatus as 'Published' | 'Internal',
                        };
                        publishMutation.mutate({ id: id!, data }, {
                          onSuccess: () => toast.success(`Artigo republicado como ${newStatus === 'Published' ? 'Público' : 'Interno'}`),
                          onError: () => toast.error('Falha ao republicar'),
                        });
                      }}
                    >
                      Mudar para {detailQuery.data.status === 'Published' ? 'Interno' : 'Público'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {isEdit && detailQuery.data && detailQuery.data.status === 'Draft' && form.targetStatus === 'Draft' && (
              <p className="text-xs text-muted">
                Selecione <strong>Publicado</strong> ou <strong>Interno</strong> no campo "Status ao salvar" para publicar o artigo.
              </p>
            )}

            {isEdit && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setShowVersions(!showVersions);
                    if (!showVersions) versionsQuery.refetch();
                  }}
                  className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
                >
                  <History className="h-4 w-4" />
                  Histórico de versões ({detailQuery.data?.currentVersionNumber ?? 0})
                </button>
                {showVersions && (
                  <div className="mt-2 space-y-2">
                    {versionsQuery.isLoading && <Loading message="Carregando versões..." />}
                    {versionsQuery.data?.map((v: ArticleVersion) => (
                      <div key={v.id} className="rounded border border-border bg-surface-light p-2 text-xs">
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">v{v.versionNumber}</span>
                          {' '}{v.status === 'Published' ? 'Publicado' : 'Interno'}
                          {v.changeSummary && <span className="text-muted"> — {v.changeSummary}</span>}
                        </p>
                        <p className="text-muted">
                          {new Date(v.createdAt).toLocaleString('pt-BR')}
                          {v.editedBy && ` por ${v.editedBy}`}
                        </p>
                      </div>
                    ))}
                    {versionsQuery.data?.length === 0 && (
                      <p className="text-xs text-muted">Nenhuma versão publicada ainda.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {isEdit && id && (
              <div className="rounded-xl border border-border bg-surface-light p-4">
                <ArticlePagesManager
                  articleId={id}
                  homeLabel={detailQuery.data?.title ?? 'Home'}
                  activePageId={isCreatingPage ? null : activePageId}
                  homeActive={!isEditingPage}
                  onSelectHome={handleSelectHome}
                  onSelectPage={handleSelectPage}
                  onCreatePage={handleCreatePage}
                  onDeletePage={handleDeletePage}
                />
              </div>
            )}

            {/* Editor único: home do artigo ou sub-página selecionada */}
            <div className="rounded-xl border border-border bg-surface-light p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isEditingPage ? (
                    <FileText className="h-4 w-4 text-muted" />
                  ) : (
                    <Home className="h-4 w-4 text-primary" />
                  )}
                  <h3 className="text-sm font-semibold text-foreground">
                    {isCreatingPage
                      ? 'Nova página'
                      : isEditingPage
                      ? 'Editar página'
                      : 'Página principal (Home)'}
                  </h3>
                </div>
                {isEditingPage && (
                  <Button size="sm" variant="ghost" onClick={handleSelectHome}>
                    Voltar para Home
                  </Button>
                )}
              </div>

              {isEditingPage ? (
                <div className="space-y-3">
                  <Input
                    label="Título da página"
                    value={pageTitle}
                    onChange={(e) => setPageTitle(e.target.value)}
                    placeholder="Ex.: Hardware"
                  />
                  <Select
                    label="Página pai (opcional)"
                    options={pageParentOptions}
                    value={pageParentId}
                    onChange={(e) => setPageParentId(e.target.value)}
                  />
                  <MarkdownEditor
                    label="Conteúdo (Markdown)"
                    value={pageContent}
                    onChange={setPageContent}
                    height={360}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleSelectHome}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSavePage}
                      loading={createPageMutation.isPending || updatePageMutation.isPending}
                    >
                      {isCreatingPage ? 'Criar página' : 'Salvar página'}
                    </Button>
                  </div>
                </div>
              ) : (
                <MarkdownEditor
                  label="Markdown"
                  value={form.content}
                  onChange={(value) => setField('content', value)}
                  height={460}
                  hint="Editor avançado com atalhos e toolbar para títulos, listas, links, tabelas e blocos de código."
                />
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => navigate('/knowledge')}>
                Cancelar
              </Button>
              <Button
                onClick={() => void submit(form.targetStatus)}
                loading={createMutation.isPending || updateMutation.isPending || publishMutation.isPending}
                disabled={!valid}
              >
                {form.targetStatus === 'Published' && <Send className="h-4 w-4" />}
                {form.targetStatus === 'Draft' && <Save className="h-4 w-4" />}
                {form.targetStatus === 'Internal' && <Save className="h-4 w-4" />}
                {form.targetStatus === 'Draft' && 'Salvar rascunho'}
                {form.targetStatus === 'Published' && 'Salvar e publicar'}
                {form.targetStatus === 'Internal' && 'Salvar como Interno'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
