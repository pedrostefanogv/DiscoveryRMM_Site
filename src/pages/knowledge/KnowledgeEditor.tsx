import { formatDateTime, formatDate } from '@/utils/format';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { MarkdownViewer } from '@/components/ui/MarkdownViewer';
import {
  Icon,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorDisplay,
  Input,
  Loading,
  MarkdownEditor,
  Modal,
  Select,
  PageHeader,
} from '@/components/ui';
import {
  useArticleImages,
  useArticlePages,
  useClients,
  useCreateKnowledgeArticle,
  useCreateArticlePage,
  useDeleteArticleImage,
  useDepartments,
  useKnowledgeArticle,
  useKnowledgeArticleVersions,
  usePublishKnowledgeArticle,
  useReindexKnowledgeArticle,
  useSites,
  useUnpublishKnowledgeArticle,
  useUpdateArticlePage,
  useUpdateKnowledgeArticle,
  useUploadArticleImage,
} from '@/hooks';
import {
  countKbImageOccurrences,
  removeKbImageFromMarkdown,
  updateKbImageSizeInMarkdown,
} from '@/utils/kbImage';
import type { ArticlePageTreeNode, ArticleStatus, ArticleVersion, CreateKnowledgeArticleRequest, PublishArticleRequest, UpdateKnowledgeArticleRequest } from '@/api';
import { useAuthorization } from '@/auth/authorization';
import toast from 'react-hot-toast';
import ArticleImagesPanel from './ArticleImagesPanel';
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
  aiIndexingEnabled: boolean;
};

type KnowledgePrefillState = {
  prefill?: {
    title?: string;
    content?: string;
    category?: string;
    tags?: string[];
    clientId?: string | null;
    siteId?: string | null;
    departmentId?: string | null;
    fromTicketId?: string;
  };
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
    case 'AiOnly': return 'Somente IA';
    case 'Draft': return 'Rascunho';
    default: return status;
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

export default function KnowledgeEditor() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const prefill = !isEdit ? (location.state as KnowledgePrefillState | null)?.prefill : undefined;

  const [form, setForm] = useState<FormState>({
    title: prefill?.title ?? '',
    content: prefill?.content ?? '## Novo Artigo\n\nDescreva aqui o procedimento em Markdown.',
    category: prefill?.category ?? '',
    tags: prefill?.tags?.join(', ') ?? '',
    clientId: prefill?.clientId ?? '',
    siteId: prefill?.siteId ?? '',
    departmentId: prefill?.departmentId ?? '',
    targetStatus: 'Draft',
    aiIndexingEnabled: true,
  });

  const [showVersions, setShowVersions] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<ArticleVersion | null>(null);
  const [confirmQuickStatus, setConfirmQuickStatus] = useState<'Published' | 'Internal' | 'AiOnly' | null>(null);
  const [pendingNavAction, setPendingNavAction] = useState<(() => void) | null>(null);

  // ── Editor único de sub-páginas (estilo Notion) ──────────────
  // activePageId === null → editando a "home" (artigo principal)
  // activePageId === '__new__' → criando uma nova sub-página
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState('');
  const [pageContent, setPageContent] = useState('');
  const [pageParentId, setPageParentId] = useState('');
  const pageEditorRef = useRef<HTMLDivElement>(null);
  const pagesQuery = useArticlePages(id ?? '');
  // Painel de imagens: lista, tamanho e exclusão (o Markdown não tem largura).
  const imagesQuery = useArticleImages(id ?? '');
  const deleteImageMutation = useDeleteArticleImage(id ?? '');
  // Exclusão definitiva (hard delete) exige permissão de exclusão na KB; o soft
  // delete continua disponível para quem tem permissão de edição.
  const { hasAnyPermission } = useAuthorization();
  const canDeletePermanently = hasAnyPermission([
    'KnowledgeBase.Delete',
    'KnowledgeBase.*',
    'knowledgebase.delete',
    'knowledgebase.*',
    'admin.*',
  ]);
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
  const unpublishMutation = useUnpublishKnowledgeArticle();
  const reindexMutation = useReindexKnowledgeArticle();
  const uploadImageMutation = useUploadArticleImage(id ?? '');
  // mutateAsync é estável no react-query v5: evita recriar o handler (e o
  // despacho interno de commandos do MDEditor) a cada render.


  // Delega o envio em 2 passos ao hook. Validação de tipo/tamanho e mensagem de
  // erro ficam no MarkdownEditor (ponto único, usado por toolbar/colar/soltar) —
  // repetir aqui gerava toast duplicado.
  const { mutateAsync: uploadImage } = uploadImageMutation;
  const handleImageUpload = useCallback(
    async (file: File, size: string | null): Promise<string | null> => {
      // Sem id o comando já fica desabilitado; retorno defensivo apenas.
      if (!id) return null;
      return await uploadImage({ file, size });
    },
    [id, uploadImage],
  );

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
      aiIndexingEnabled: article.aiIndexingEnabled ?? true,
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

  const isPageDirty = useMemo(() => {
    if (activePageId === null) return false;
    if (activePageId === '__new__') {
      return pageTitle.trim().length > 0 || pageContent.trim().length > 0 || pageParentId !== '';
    }
    const node = findPage(pagesQuery.data ?? [], activePageId);
    if (!node) return false;
    return (
      pageTitle !== node.title ||
      pageContent !== (node.content ?? '') ||
      pageParentId !== (node.parentPageId ?? '')
    );
  }, [activePageId, pageTitle, pageContent, pageParentId, pagesQuery.data]);

  const isHomeDirty = useMemo(() => {
    if (!isEdit) {
      return form.title.trim().length > 0;
    }
    const article = detailQuery.data;
    if (!article) return false;
    return (
      form.title !== article.title ||
      form.content !== article.content ||
      form.category !== (article.category ?? '') ||
      form.tags !== (Array.isArray(article.tags) ? article.tags.join(', ') : '') ||
      form.clientId !== (article.clientId ?? '') ||
      form.siteId !== (article.siteId ?? '') ||
      form.departmentId !== (article.departmentId ?? '') ||
      form.targetStatus !== article.status ||
      form.aiIndexingEnabled !== (article.aiIndexingEnabled ?? true)
    );
  }, [detailQuery.data, form, isEdit]);

  const guardUnsavedPage = (action: () => void) => {
    if (isPageDirty) {
      setPendingNavAction(() => action);
      return;
    }
    action();
  };

  const guardUnsavedExit = (action: () => void) => {
    if (isPageDirty || isHomeDirty) {
      setPendingNavAction(() => action);
      return;
    }
    action();
  };

  // Seleciona uma sub-página para edição no editor único.
  const applySelectPage = (pageId: string) => {
    const node = findPage(pagesQuery.data ?? [], pageId);
    if (!node) return;
    setActivePageId(pageId);
    setPageTitle(node.title);
    setPageContent(node.content ?? '');
    setPageParentId(node.parentPageId ?? '');
    requestAnimationFrame(() => {
      pageEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleSelectPage = (pageId: string) => {
    if (pageId === activePageId) return;
    guardUnsavedPage(() => applySelectPage(pageId));
  };

  // Volta para a "home" (artigo principal).
  const applySelectHome = () => {
    setActivePageId(null);
    setPageTitle('');
    setPageContent('');
    setPageParentId('');
  };

  const handleSelectHome = () => {
    if (activePageId === null) return;
    guardUnsavedPage(applySelectHome);
  };

  // Abre o editor único em modo de criação de nova sub-página.
  const handleCreatePage = () => {
    guardUnsavedPage(() => {
      setActivePageId('__new__');
      setPageTitle('');
      setPageContent('');
      setPageParentId('');
      requestAnimationFrame(() => {
        pageEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
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
            applySelectHome();
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
            applySelectHome();
          },
          onError: () => toast.error('Falha ao atualizar página.'),
        },
      );
    }
  };

  // Quando uma página é excluída, limpa a seleção se for a ativa ou um ancestral dela.
  const handleDeletePage = (pageId: string) => {
    if (!activePageId || activePageId === '__new__') return;
    if (activePageId === pageId) {
      applySelectHome();
      return;
    }
    // Se a página excluída é ancestral da ativa, a ativa também foi removida.
    const contains = (nodes: ArticlePageTreeNode[], target: string): boolean => {
      for (const node of nodes) {
        if (node.id === target) return true;
        if (contains(node.children, target)) return true;
      }
      return false;
    };
    const deletedNode = findPage(pagesQuery.data ?? [], pageId);
    if (deletedNode && contains([deletedNode], activePageId)) {
      applySelectHome();
    }
  };

  // ── Imagens do artigo (tamanho e exclusão) ───────────────────
  // O tamanho vive no título do token (![alt](kbimage:<id> "w=50%")) e é
  // aplicado ao texto ABERTO no editor; a gravação ocorre no "Salvar" normal.
  const handleChangeImageSize = (attachmentId: string, size: string | null) => {
    if (isEditingPage) {
      setPageContent((content) =>
        updateKbImageSizeInMarkdown(content, attachmentId, size),
      );
      toast.success('Tamanho atualizado — salve a página para aplicar.');
      return;
    }

    setForm((prev) => ({
      ...prev,
      content: updateKbImageSizeInMarkdown(prev.content, attachmentId, size),
    }));
    toast.success('Tamanho atualizado — salve o artigo para aplicar.');
  };

  const imageLocationsOf = (attachmentId: string) => {
    const places: Array<{ id: string | null; label: string }> = [];
    if (countKbImageOccurrences(form.content, attachmentId) > 0) {
      places.push({ id: null, label: 'Home' });
    }

    const walk = (nodes: ArticlePageTreeNode[]) => {
      for (const node of nodes) {
        // Página ATIVA usa o conteúdo em memória: sem isso o painel dizia "não
        // usada em nenhum texto" logo após "Inserir no texto" numa sub-página.
        const content = node.id === activePageId ? pageContent : (node.content ?? '');
        if (countKbImageOccurrences(content, attachmentId) > 0) {
          places.push({ id: node.id, label: node.title || 'Página' });
        }
        walk(node.children ?? []);
      }
    };
    walk(pagesQuery.data ?? []);

    return places;
  };

  const stripImageReferences = (attachmentId: string) => {
    // O backend remove a referência do artigo E das sub-páginas; espelha no
    // estado local para o editor não manter token órfão.
    setForm((prev) => ({
      ...prev,
      content: removeKbImageFromMarkdown(prev.content, attachmentId),
    }));
    setPageContent((content) =>
      removeKbImageFromMarkdown(content, attachmentId),
    );
  };

  const handleDeleteImage = (attachmentId: string) => {
    deleteImageMutation.mutate(
      { attachmentId },
      {
        onSuccess: () => {
          stripImageReferences(attachmentId);
          toast.success('Imagem excluída (recuperável por 30 dias).');
        },
        onError: () => toast.error('Não foi possível excluir a imagem.'),
      },
    );
  };

  const handlePermanentDeleteImage = (attachmentId: string) => {
    deleteImageMutation.mutate(
      { attachmentId, permanent: true },
      {
        onSuccess: () => {
          stripImageReferences(attachmentId);
          toast.success('Imagem excluída definitivamente.');
        },
        onError: () =>
          toast.error('Não foi possível excluir definitivamente a imagem.'),
      },
    );
  };

  // Insere/reinsere o token no FIM do conteúdo aberto: é o único ponto previsível
  // sem acesso ao cursor do editor (o painel é irmão do MarkdownEditor).
  const handleInsertImageToken = (token: string) => {
    const append = (content: string) =>
      `${content.trimEnd() ? `${content.trimEnd()}\n\n` : ''}${token}\n`;

    if (isEditingPage) {
      setPageContent(append);
      toast.success('Imagem inserida no fim desta página — salve para aplicar.');
      return;
    }

    setForm((prev) => ({ ...prev, content: append(prev.content) }));
    toast.success('Imagem inserida no fim do artigo — salve para aplicar.');
  };

  const handleOpenImageLocation = (pageId: string | null) => {
    if (pageId) {
      handleSelectPage(pageId);
      return;
    }
    handleSelectHome();
  };

  // Opções de "página pai" para criar/mover sub-página (limite de 3 níveis, sem ciclos).
  const pageParentOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; disabled?: boolean }> = [
      { value: '', label: 'Nenhuma (nível 1)' },
    ];
    const flatten = (list: ArticlePageTreeNode[], depth: number) => {
      for (const node of list) {
        // Exclui a própria página e toda a sua subárvore para evitar ciclo
        if (node.id === activePageId) continue;
        const disabled = depth + 1 >= 3;
        options.push({
          value: node.id,
          label: `${'  '.repeat(depth)}${node.title}${disabled ? ' (limite de níveis)' : ''}`,
          disabled,
        });
        flatten(node.children, depth + 1);
      }
    };
    flatten(pagesQuery.data ?? [], 0);
    return options;
  }, [pagesQuery.data, activePageId]);

  const isEditingPage = activePageId !== null;
  const isCreatingPage = activePageId === '__new__';

  // Conteúdo aberto no editor (home ou sub-página) — base do painel de imagens.
  const activeImageContent = isEditingPage ? pageContent : form.content;
  const activeImageLabel = isEditingPage ? pageTitle.trim() || 'Página' : 'Home';

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

  const submit = async (
    targetStatus: ArticleStatus = 'Draft',
    stayInEditor = false,
  ) => {
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

    const effectiveAiEnabled = targetStatus === 'AiOnly' ? true : form.aiIndexingEnabled;

    if (isEdit && id) {
      const payload: UpdateKnowledgeArticleRequest = {
        title: form.title.trim(),
        content: form.content,
        category: form.category.trim() || null,
        tags: toTagArray(form.tags),
        clientId: form.clientId || null,
        siteId: form.siteId || null,
        departmentId: form.departmentId || null,
        aiIndexingEnabled: effectiveAiEnabled,
        updateScope: true,
      };

      const wasDraft = detailQuery.data?.status === 'Draft';

      updateMutation.mutate({ id, data: payload }, {
        onSuccess: () => {
          // Se o status alvo for Draft e o artigo estava publicado, despublica de fato
          if (targetStatus === 'Draft') {
            if (!wasDraft) {
              unpublishMutation.mutate(
                { id },
                {
                  onSuccess: () => {
                    toast.success('Artigo atualizado e movido para rascunho.');
                    navigate(`/knowledge/${id}`);
                  },
                  onError: () => {
                    toast.error('Artigo salvo, mas falhou ao mover para rascunho.');
                    navigate(`/knowledge/${id}`);
                  },
                },
              );
              return;
            }
            toast.success('Artigo atualizado (rascunho).');
            navigate(`/knowledge/${id}`);
            return;
          }

          // Caso contrário publica/interniza/somente-IA
          const publishPayload: PublishArticleRequest = {
            status: targetStatus,
          };
          publishMutation.mutate({ id, data: publishPayload }, {
            onSuccess: () => {
              toast.success(
                targetStatus === 'Published'
                  ? 'Artigo atualizado e publicado!'
                  : targetStatus === 'Internal'
                  ? 'Artigo atualizado e marcado como Interno!'
                  : 'Artigo atualizado e marcado como Somente IA!',
              );
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
      aiIndexingEnabled: effectiveAiEnabled,
    };

    createMutation.mutate(payload, {
      onSuccess: (created) => {
        if (targetStatus === 'Draft') {
          toast.success(stayInEditor ? 'Rascunho criado! Agora você pode adicionar imagens e sub-páginas.' : 'Artigo criado como rascunho.');
          navigate(stayInEditor ? `/knowledge/${created.id}/edit` : `/knowledge/${created.id}`);
          return;
        }

        const publishPayload: PublishArticleRequest = {
          status: targetStatus,
        };

        publishMutation.mutate({ id: created.id, data: publishPayload }, {
          onSuccess: () => {
            toast.success(
              targetStatus === 'Published'
                ? 'Artigo criado e publicado!'
                : targetStatus === 'Internal'
                ? 'Artigo criado e marcado como Interno!'
                : 'Artigo criado e marcado como Somente IA!',
            );
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
      <PageHeader
        title={isEdit ? 'Editar artigo' : 'Novo artigo'}
        description="Conteúdo em Markdown com preview em tempo real, sub-páginas e controle de IA."
        onBack={() => guardUnsavedExit(() => navigate('/knowledge'))}
      >
        {isEdit && detailQuery.data && (
          <>
            <Badge color={statusColor(detailQuery.data.status)}>
              {statusLabel(detailQuery.data.status)}
            </Badge>
            {detailQuery.data.aiIndexingEnabled === false && (
              <Badge color="warning">Sem IA</Badge>
            )}
            {detailQuery.data.status !== 'Draft' && (
              <span className="text-xs text-muted">
                v{detailQuery.data.currentVersionNumber}
              </span>
            )}
          </>
        )}
      </PageHeader>

      <div className={isEdit ? 'grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)] items-start' : 'grid gap-6'}>
        {isEdit && id && (
          <div className="space-y-4">
            <Card>
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
            </Card>

            <ArticleImagesPanel
              images={imagesQuery.data ?? []}
              isLoading={imagesQuery.isLoading}
              isError={imagesQuery.isError}
              activeContent={activeImageContent}
              activeLabel={activeImageLabel}
              canDeletePermanently={canDeletePermanently}
              locationsOf={imageLocationsOf}
              onChangeSize={handleChangeImageSize}
              onOpenLocation={handleOpenImageLocation}
              onInsert={handleInsertImageToken}
              onDelete={handleDeleteImage}
              onPermanentDelete={handlePermanentDeleteImage}
              deletingId={
                deleteImageMutation.isPending &&
                !deleteImageMutation.variables?.permanent
                  ? (deleteImageMutation.variables?.attachmentId ?? null)
                  : null
              }
              permanentDeletingId={
                deleteImageMutation.isPending &&
                deleteImageMutation.variables?.permanent
                  ? (deleteImageMutation.variables?.attachmentId ?? null)
                  : null
              }
              onRetry={() => void imagesQuery.refetch()}
            />

            {detailQuery.data && (
              <Card>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Indexação IA</h3>
                  {detailQuery.data.status !== 'Draft' && detailQuery.data.aiIndexingEnabled !== false && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={reindexMutation.isPending}
                      onClick={() =>
                        reindexMutation.mutate(id, {
                          onSuccess: () => toast.success('Artigo enfileirado para reindexação.'),
                          onError: () => toast.error('Falha ao solicitar reindexação.'),
                        })
                      }
                    >
                      <Icon name="refresh" className="h-3.5 w-3.5" /> Reindexar
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted">
                  {detailQuery.data.aiIndexingEnabled === false
                    ? 'Análise por IA desativada neste artigo.'
                    : detailQuery.data.status === 'Draft'
                    ? 'Rascunhos não são indexados até serem publicados.'
                    : detailQuery.data.embeddingsReady
                    ? `Pronto (${detailQuery.data.embeddedChunkCount ?? detailQuery.data.chunkCount}/${detailQuery.data.chunkCount} chunks com embedding).`
                    : detailQuery.data.chunkCount > 0
                    ? `Em processamento (${detailQuery.data.embeddedChunkCount ?? 0}/${detailQuery.data.chunkCount} chunks).`
                    : 'Aguardando geração de chunks/embeddings.'}
                </p>
              </Card>
            )}

            <Card>
              <button
                type="button"
                onClick={() => {
                  setShowVersions(!showVersions);
                  if (!showVersions) versionsQuery.refetch();
                }}
                className="flex w-full items-center justify-between text-sm font-medium text-foreground transition-colors hover:text-primary"
              >
                <span className="inline-flex items-center gap-2">
                  <Icon name="history" className="h-4 w-4 text-muted" />
                  Histórico de versões ({detailQuery.data?.currentVersionNumber ?? 0})
                </span>
                <Icon name={showVersions ? 'expand_less' : 'expand_more'} className="h-4 w-4 text-muted" />
              </button>
              {showVersions && (
                <div className="mt-3 space-y-2">
                  {versionsQuery.isLoading && <Loading message="Carregando versões..." />}
                  {versionsQuery.data?.map((v: ArticleVersion) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setPreviewVersion(v)}
                      className="w-full rounded-lg border border-border bg-surface-light p-2.5 text-left text-xs transition-colors hover:border-primary/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">v{v.versionNumber}</span>
                        <Badge color="slate">{statusLabel(v.status as ArticleStatus)}</Badge>
                      </div>
                      {v.changeSummary && <p className="mt-1 truncate text-muted">{v.changeSummary}</p>}
                      <p className="mt-1 text-[11px] text-muted">
                        {formatDateTime(v.createdAt)}
                        {v.editedBy && ` • ${v.editedBy}`}
                      </p>
                    </button>
                  ))}
                  {versionsQuery.data?.length === 0 && (
                    <p className="text-xs text-muted">Nenhuma versão publicada ainda.</p>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        <Card>
          <div className="space-y-4">
            <Input
              label="Título"
              value={form.title}
              onChange={(event) => setField('title', event.target.value)}
              placeholder="Ex.: Como resetar senha do AD"
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Categoria"
                value={form.category}
                onChange={(event) => setField('category', event.target.value)}
                placeholder="Ex.: Active Directory"
              />
              <Input
                label="Tags (separadas por vírgula)"
                value={form.tags}
                onChange={(event) => setField('tags', event.target.value)}
                placeholder="ad, senha, reset"
              />
            </div>

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
                  { value: 'AiOnly', label: 'Somente IA — orienta o chat sem expor o documento' },
                ]}
                value={form.targetStatus}
                onChange={(event) => {
                  const nextStatus = event.target.value as ArticleStatus;
                  setForm((prev) => ({
                    ...prev,
                    targetStatus: nextStatus,
                    aiIndexingEnabled: nextStatus === 'AiOnly' ? true : prev.aiIndexingEnabled,
                  }));
                }}
                hint={
                  form.targetStatus === 'Published'
                    ? 'Visível para todos os usuários. Respeita a herança: Global → Clientes → Sites → Agentes.'
                    : form.targetStatus === 'Internal'
                    ? 'Visível apenas para usuários do departamento vinculado. Ainda respeita a herança de escopo.'
                    : form.targetStatus === 'AiOnly'
                    ? 'Usado exclusivamente pela IA para orientar usuários no chat, sem exibir o título nem link do artigo.'
                    : 'Ainda não publicado. Apenas você pode ver este artigo.'
                }
              />
            </div>

            <div className="rounded-lg border border-border bg-surface-light p-3.5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-border accent-primary"
                  checked={form.targetStatus === 'AiOnly' ? true : form.aiIndexingEnabled}
                  disabled={form.targetStatus === 'AiOnly'}
                  onChange={(event) => setField('aiIndexingEnabled', event.target.checked)}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Permitir uso pela IA (RAG e Embeddings)
                  </p>
                  <p className="text-xs text-muted">
                    {form.targetStatus === 'AiOnly'
                      ? 'Artigos "Somente IA" exigem indexação ativa para que a IA possa consultá-los.'
                      : 'Quando desmarcado, este artigo não será chunkado, não gerará embeddings e não será lido pelo chat de IA.'}
                  </p>
                </div>
              </label>
            </div>

            {isEdit && detailQuery.data && detailQuery.data.status !== 'Draft' && (
              <div className="rounded-lg border border-border bg-surface-light p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Publicado como <Badge color={statusColor(detailQuery.data.status)}>{statusLabel(detailQuery.data.status)}</Badge>
                      {' '}v{detailQuery.data.currentVersionNumber}
                    </p>
                    {detailQuery.data.publishedAt && (
                      <p className="text-xs text-muted">
                        Publicado em {formatDate(detailQuery.data.publishedAt)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detailQuery.data.status !== 'Published' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmQuickStatus('Published')}
                      >
                        Mudar para Público
                      </Button>
                    )}
                    {detailQuery.data.status !== 'Internal' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!detailQuery.data?.departmentId) {
                            toast.error('Salve o artigo com um departamento selecionado antes de mudar para Interno.');
                            return;
                          }
                          setConfirmQuickStatus('Internal');
                        }}
                      >
                        Mudar para Interno
                      </Button>
                    )}
                    {detailQuery.data.status !== 'AiOnly' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmQuickStatus('AiOnly')}
                      >
                        Mudar para Somente IA
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isEdit && detailQuery.data && detailQuery.data.status === 'Draft' && form.targetStatus === 'Draft' && (
              <p className="text-xs text-muted">
                Selecione <strong>Publicado</strong>, <strong>Interno</strong> ou <strong>Somente IA</strong> no campo "Status ao salvar" para publicar o artigo.
              </p>
            )}

            {/* Editor único: home do artigo ou sub-página selecionada */}
            <div
              ref={pageEditorRef}
              className="rounded-xl border border-border bg-surface-light p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isEditingPage ? (
                    <Icon name="description" className="h-4 w-4 text-muted" />
                  ) : (
                    <Icon name="home" className="h-4 w-4 text-primary" />
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
                    articleId={id}
                    onImageUpload={id ? handleImageUpload : undefined}
                    imageDisabledReason={
                      id ? undefined : 'Salve o artigo como rascunho para anexar imagens.'
                    }
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
                  articleId={id}
                  onImageUpload={id ? handleImageUpload : undefined}
                  imageDisabledReason={
                    id ? undefined : 'Salve o artigo como rascunho para anexar imagens.'
                  }
                  hint="Editor avançado com atalhos e toolbar para títulos, listas, links, tabelas e blocos de código."
                />
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="ghost" onClick={() => guardUnsavedExit(() => navigate('/knowledge'))}>
                Cancelar
              </Button>
              {!isEdit && (
                <Button
                  variant="secondary"
                  onClick={() => void submit('Draft', true)}
                  loading={createMutation.isPending}
                  disabled={!valid}
                >
                  <Icon name="edit_note" className="h-4 w-4" />
                  Salvar rascunho e continuar editando
                </Button>
              )}
              <Button
                onClick={() => void submit(form.targetStatus)}
                loading={createMutation.isPending || updateMutation.isPending || publishMutation.isPending || unpublishMutation.isPending}
                disabled={!valid}
              >
                {form.targetStatus === 'Published' && <Icon name="send" className="h-4 w-4" />}
                {form.targetStatus === 'AiOnly' && <Icon name="smart_toy" className="h-4 w-4" />}
                {(form.targetStatus === 'Draft' || form.targetStatus === 'Internal') && <Icon name="save" className="h-4 w-4" />}
                {form.targetStatus === 'Draft' && 'Salvar rascunho'}
                {form.targetStatus === 'Published' && 'Salvar e publicar'}
                {form.targetStatus === 'Internal' && 'Salvar como Interno'}
                {form.targetStatus === 'AiOnly' && 'Salvar como Somente IA'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmQuickStatus !== null}
        title="Alterar visibilidade do artigo"
        tone="primary"
        message={
          confirmQuickStatus === 'Published'
            ? 'Republicar como Público (visível para todos os usuários do escopo)?'
            : confirmQuickStatus === 'Internal'
            ? 'Republicar como Interno (visível apenas para o departamento vinculado)?'
            : 'Republicar como Somente IA (usado exclusivamente pelo chat de IA)?'
        }
        confirmLabel="Confirmar"
        isLoading={publishMutation.isPending}
        onConfirm={() => {
          if (!confirmQuickStatus || !id) return;
          const data: PublishArticleRequest = { status: confirmQuickStatus };
          publishMutation.mutate(
            { id, data },
            {
              onSuccess: () => {
                toast.success(`Artigo republicado como ${statusLabel(confirmQuickStatus)}.`);
                setConfirmQuickStatus(null);
              },
              onError: () => toast.error('Falha ao republicar artigo.'),
            },
          );
        }}
        onClose={() => setConfirmQuickStatus(null)}
      />

      <ConfirmDialog
        open={pendingNavAction !== null}
        title="Descartar alterações não salvas?"
        message="Há alterações ainda não salvas. Deseja sair e descartar essas mudanças?"
        confirmLabel="Descartar"
        onConfirm={() => {
          const action = pendingNavAction;
          setPendingNavAction(null);
          action?.();
        }}
        onClose={() => setPendingNavAction(null)}
      />

      <Modal
        open={previewVersion !== null}
        onClose={() => setPreviewVersion(null)}
        title={previewVersion ? `Versão v${previewVersion.versionNumber} — ${previewVersion.title}` : 'Versão'}
        maxWidth="max-w-3xl"
      >
        {previewVersion && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge color="slate">{statusLabel(previewVersion.status as ArticleStatus)}</Badge>
              <span>{formatDateTime(previewVersion.createdAt)}</span>
              {previewVersion.editedBy && <span>por {previewVersion.editedBy}</span>}
              {previewVersion.changeSummary && <span>— {previewVersion.changeSummary}</span>}
            </div>
            <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border bg-surface-light p-4">
              <MarkdownViewer source={previewVersion.content || '_Conteúdo vazio._'} articleId={id} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreviewVersion(null)}>
                Fechar
              </Button>
              <Button
                onClick={() => {
                  applySelectHome();
                  setForm((prev) => ({
                    ...prev,
                    title: previewVersion.title,
                    content: previewVersion.content,
                    category: previewVersion.category ?? '',
                    tags: Array.isArray(previewVersion.tags) ? previewVersion.tags.join(', ') : '',
                  }));
                  setPreviewVersion(null);
                  toast.success(`Conteúdo da v${previewVersion.versionNumber} restaurado no editor — salve para aplicar.`);
                }}
              >
                <Icon name="history" className="h-4 w-4" />
                Restaurar no editor
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
