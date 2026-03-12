import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Save } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Badge,
  Button,
  Card,
  ErrorDisplay,
  Input,
  Loading,
  Select,
  TextArea,
} from '@/components/ui';
import { useClients, useCreateKnowledgeArticle, useKnowledgeArticle, useSites, useUpdateKnowledgeArticle } from '@/hooks';
import type { CreateKnowledgeArticleRequest, UpdateKnowledgeArticleRequest } from '@/api';
import toast from 'react-hot-toast';

type FormState = {
  title: string;
  content: string;
  category: string;
  tags: string;
  author: string;
  clientId: string;
  siteId: string;
};

function toTagArray(tags: string): string[] {
  return tags
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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
    author: '',
    clientId: '',
    siteId: '',
  });

  const clients = useClients();
  const sites = useSites(form.clientId);
  const detailQuery = useKnowledgeArticle(id ?? '');
  const createMutation = useCreateKnowledgeArticle();
  const updateMutation = useUpdateKnowledgeArticle();

  useEffect(() => {
    if (!isEdit || !detailQuery.data) return;

    const article = detailQuery.data;
    setForm({
      title: article.title,
      content: article.content,
      category: article.category ?? '',
      tags: article.tags.join(', '),
      author: article.author ?? '',
      clientId: article.clientId ?? '',
      siteId: article.siteId ?? '',
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

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const valid = form.title.trim().length >= 3 && form.content.trim().length >= 10;

  const submit = async () => {
    if (!valid) {
      toast.error('Preencha título e conteúdo do artigo.');
      return;
    }

    if (!form.clientId && form.siteId) {
      toast.error('Site exige seleção de cliente.');
      return;
    }

    if (isEdit && id) {
      const payload: UpdateKnowledgeArticleRequest = {
        title: form.title.trim(),
        content: form.content,
        category: form.category.trim() || null,
        tags: toTagArray(form.tags),
        author: form.author.trim() || null,
      };

      updateMutation.mutate(
        { id, data: payload },
        {
          onSuccess: () => {
            toast.success('Artigo atualizado.');
            navigate('/knowledge');
          },
          onError: () => toast.error('Não foi possível atualizar o artigo.'),
        },
      );

      return;
    }

    const payload: CreateKnowledgeArticleRequest = {
      title: form.title.trim(),
      content: form.content,
      category: form.category.trim() || null,
      tags: toTagArray(form.tags),
      author: form.author.trim() || null,
      clientId: form.clientId || null,
      siteId: form.siteId || null,
    };

    createMutation.mutate(payload, {
      onSuccess: () => {
        toast.success('Artigo criado como rascunho.');
        navigate('/knowledge');
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
            className="mb-2 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <h1 className="text-2xl font-bold text-white">
            {isEdit ? 'Editar artigo' : 'Novo artigo'}
          </h1>
          <p className="text-sm text-slate-400">Conteúdo em Markdown com preview em tempo real.</p>
        </div>
        {isEdit && detailQuery.data && (
          <Badge color={detailQuery.data.isPublished ? 'success' : 'warning'}>
            {detailQuery.data.isPublished ? 'Publicado' : 'Rascunho'}
          </Badge>
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

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Categoria"
                value={form.category}
                onChange={(event) => setField('category', event.target.value)}
                placeholder="Ex.: Active Directory"
              />
              <Input
                label="Autor"
                value={form.author}
                onChange={(event) => setField('author', event.target.value)}
                placeholder="Nome do autor"
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

            <TextArea
              label="Markdown"
              value={form.content}
              rows={18}
              onChange={(event) => setField('content', event.target.value)}
            />

            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => navigate('/knowledge')}>
                Cancelar
              </Button>
              <Button
                onClick={submit}
                loading={createMutation.isPending || updateMutation.isPending}
                disabled={!valid}
              >
                <Save className="h-4 w-4" /> Salvar
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2 text-slate-300">
            <Eye className="h-4 w-4" />
            <h2 className="text-sm font-medium uppercase tracking-wide">Preview</h2>
          </div>
          <article className="prose prose-invert max-w-none prose-headings:text-white prose-p:text-slate-200 prose-li:text-slate-200 prose-strong:text-white prose-code:text-emerald-300 prose-pre:bg-slate-950/70">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {form.content || '_Sem conteúdo_'}
            </ReactMarkdown>
          </article>
        </Card>
      </div>
    </div>
  );
}
