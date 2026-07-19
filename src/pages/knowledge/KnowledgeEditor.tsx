import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, History, Save, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import {
  Badge,
  Button,
  Card,
  ErrorDisplay,
  Input,
  Loading,
  Select,
} from '@/components/ui';
import { useClients, useCreateKnowledgeArticle, useDepartments, useKnowledgeArticle, useKnowledgeArticleVersions, usePublishKnowledgeArticle, useSites, useUpdateKnowledgeArticle } from '@/hooks';
import type { ArticleStatus, ArticleVersion, CreateKnowledgeArticleRequest, PublishArticleRequest, UpdateKnowledgeArticleRequest } from '@/api';
import { useTheme } from '@/theme/ThemeContext';
import toast from 'react-hot-toast';

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
  const { mode } = useTheme();

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

      <div className="grid gap-6 xl:grid-cols-2">
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
                  { value: 'Draft', label: '💾 Rascunho (não visível para agentes)' },
                  { value: 'Published', label: '🌐 Publicado (visível para todos)' },
                  { value: 'Internal', label: '🔒 Interno (restrito ao departamento)' },
                ]}
                value={form.targetStatus}
                onChange={(event) => setField('targetStatus', event.target.value as ArticleStatus)}
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

            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Markdown</label>
              <div
                data-color-mode={mode}
                className="overflow-hidden rounded-xl border border-border bg-background"
              >
                <MDEditor
                  value={form.content}
                  preview="edit"
                  visibleDragbar={false}
                  height={460}
                  textareaProps={{
                    placeholder: 'Escreva o artigo usando Markdown...',
                  }}
                  onChange={(value) => setField('content', value ?? '')}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                Editor avançado com atalhos e toolbar para títulos, listas, links, tabelas e blocos de código.
              </p>
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

        <Card>
          <div className="mb-3 flex items-center gap-2 text-muted-foreground">
            <Eye className="h-4 w-4" />
            <h2 className="text-sm font-medium uppercase tracking-wide">Preview</h2>
          </div>
          <article className="prose prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-code:text-emerald-300 prose-pre:bg-background/70">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {form.content || '_Sem conteúdo_'}
            </ReactMarkdown>
          </article>
        </Card>
      </div>
    </div>
  );
}
