import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { ArchiveRestore, Save } from 'lucide-react';
import {
  Button, Card, CardHeader, ConfirmDialog, ErrorDisplay, Input, Loading, PageHeader, Select, TextArea,
} from '@/components/ui';
import {
  useCreateTicketTemplate, useRestoreTicketTemplate, useTicketTemplates, useUpdateTicketTemplate,
} from '@/hooks/useSupportProductivity';
import { useClients } from '@/hooks/useClients';
import { useDepartments } from '@/hooks/useDepartments';
import { useDepartmentTicketSchema } from '@/hooks/useDepartmentCustomFields';
import type { UpsertTicketTemplateRequest } from '@/api';
import { TicketSchemaFieldInput } from '@/components/tickets/TicketSchemaFieldInput';
import { TemplateQuestionsEditor } from '@/components/tickets/TemplateQuestionsEditor';
import { templateDefaultsToDrafts } from '@/utils/ticketTemplateDefaults';
import {
  parseTemplateQuestions,
  serializeTemplateQuestions,
  validateTemplateQuestions,
  type TemplateQuestion,
} from '@/utils/templateQuestions';
import { buildTicketCustomFieldValues } from '@/utils/ticketCustomFields';
import toast from 'react-hot-toast';

const EMPTY: UpsertTicketTemplateRequest = {
  clientId: null, departmentId: null, name: '', title: '', description: '',
  priority: null, category: null, customFieldDefaultsJson: '{}', questionsJson: '[]', isActive: true,
};

const PRIORITY_OPTIONS = [
  { value: '', label: 'Nenhuma' },
  { value: 'Low', label: 'Baixa' },
  { value: 'Medium', label: 'Média' },
  { value: 'High', label: 'Alta' },
  { value: 'Critical', label: 'Crítica' },
];

/**
 * Página dedicada de criação/edição de template de chamado.
 *
 * Antes era um modal cujo conteúdo (questionário ilimitado + campos padrão do
 * departamento) estourava a viewport e ficava inacessível. Aqui a própria
 * página rola no <main> do layout e a barra de ações fica sempre visível.
 */
export default function TicketTemplateFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  // Escopo administrativo (inclui inativos e templates por cliente) e sempre
  // revalidado na montagem: o formulário nunca parte de cache potencialmente
  // desatualizado.
  const templates = useTicketTemplates(
    { includeGlobal: true, includeInactive: true, includeDeleted: true, allClients: true },
    { refetchOnMount: 'always' },
  );
  const restore = useRestoreTicketTemplate();

  // O DTO vem da lista já cacheada (mesma queryKey usada pela listagem), então
  // a navegação a partir da lista é instantânea. Em acesso direto/refresh a
  // query é carregada e só então o formulário aparece.
  const template = useMemo(
    () => (id ? (templates.data ?? []).find((item) => item.id === id) ?? null : null),
    [id, templates.data],
  );

  // Enquanto o refetch de montagem não conclui, o form não é montado: evita
  // inicializar do cache e sobrescrever uma edição feita por outro usuário.
  // Refetches posteriores (foco/reconexão) não bloqueiam, para não perder o
  // que está sendo digitado.
  const mountedAtRef = useRef(Date.now());
  const awaitingFreshTemplate =
    isEdit && templates.isFetching && templates.dataUpdatedAt < mountedAtRef.current;

  const backToList = () => navigate('/tickets/templates');

  if (isEdit && templates.isError) {
    return <ErrorDisplay onRetry={() => templates.refetch()} />;
  }

  if (isEdit && (templates.isLoading || awaitingFreshTemplate)) {
    return <Loading message="Carregando template..." />;
  }

  if (isEdit && template && template.deletedAt) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Template excluído"
          description="Este template está na lixeira. Restaure para voltar a editá-lo."
          onBack={backToList}
        />
        <Card>
          <p className="text-sm text-muted">
            O template "{template.name}" foi movido para a lixeira
            {template.deletedBy ? ` por ${template.deletedBy}` : ''}. Os chamados já abertos não são afetados.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={restore.isPending}
              onClick={() =>
                restore.mutate(
                  { id: template.id },
                  {
                    onSuccess: () => {
                      toast.success('Template restaurado');
                      void templates.refetch();
                    },
                    onError: (error: unknown) =>
                      toast.error(error instanceof Error ? error.message : 'Erro ao restaurar template'),
                  },
                )
              }
            >
              <ArchiveRestore className="h-4 w-4" /> Restaurar template
            </Button>
            <Button variant="ghost" onClick={backToList}>Voltar para templates</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (isEdit && !template) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Template não encontrado"
          description="O template pode ter sido excluído ou desativado."
          onBack={backToList}
        />
        <Card>
          <p className="text-sm text-muted">
            Não encontramos este template no catálogo. Verifique se ele ainda existe (ou restaure-o na lixeira de templates).
          </p>
          <Button className="mt-4" variant="secondary" onClick={backToList}>Voltar para templates</Button>
        </Card>
      </div>
    );
  }

  const initial: UpsertTicketTemplateRequest = template
    ? {
        clientId: template.clientId,
        departmentId: template.departmentId,
        name: template.name,
        title: template.title,
        description: template.description,
        priority: template.priority,
        category: template.category,
        customFieldDefaultsJson: template.customFieldDefaultsJson,
        questionsJson: template.questionsJson,
        isActive: template.isActive,
      }
    : EMPTY;

  return <TicketTemplateForm key={id ?? 'new'} editId={id ?? null} initial={initial} />;
}

function TicketTemplateForm({
  editId,
  initial,
}: {
  editId: string | null;
  initial: UpsertTicketTemplateRequest;
}) {
  const navigate = useNavigate();
  const create = useCreateTicketTemplate();
  const update = useUpdateTicketTemplate();
  const isSaving = create.isPending || update.isPending;
  const [form, setForm] = useState<UpsertTicketTemplateRequest>(initial);
  const [questions, setQuestions] = useState<TemplateQuestion[]>(() => parseTemplateQuestions(initial.questionsJson));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const initialQuestionsRef = useRef(questions);

  // Snapshot do que está persistido: base para o aviso de alterações não
  // salvas. Atualizado quando o save conclui.
  const savedSnapshotRef = useRef(
    JSON.stringify({ form: initial, questions: initialQuestionsRef.current, drafts: {} }),
  );

  const clients = useClients();
  const departments = useDepartments({ clientId: form.clientId ?? undefined, includeGlobal: true });
  const schemaQuery = useDepartmentTicketSchema(form.departmentId, !!form.departmentId);
  const schemaFields = useMemo(
    () => (schemaQuery.data ?? []).filter((field) => field.isActive),
    [schemaQuery.data],
  );

  // Aplica os defaults salvos quando o schema do departamento carrega.
  const pendingDefaultsRef = useRef<string | null>(initial.customFieldDefaultsJson);
  useEffect(() => {
    const pending = pendingDefaultsRef.current;
    if (!pending || schemaFields.length === 0) return;
    pendingDefaultsRef.current = null;
    const applied = templateDefaultsToDrafts(pending, schemaFields);
    setDrafts((prev) => ({ ...applied, ...prev }));
    // Os defaults do template não são "alteração do usuário": entram no baseline.
    savedSnapshotRef.current = JSON.stringify({ form: initial, questions: initialQuestionsRef.current, drafts: applied });
  }, [initial, schemaFields]);

  const validation = useMemo(
    () => buildTicketCustomFieldValues(schemaFields, drafts),
    [schemaFields, drafts],
  );

  const clientOptions = useMemo(
    () => [
      { value: '', label: 'Global (todos os clientes)' },
      ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
    ],
    [clients.data],
  );

  const departmentOptions = useMemo(
    () => [
      { value: '', label: 'Nenhum (todos os departamentos)' },
      ...(departments.data ?? []).map((department) => ({ value: department.id, label: department.name })),
    ],
    [departments.data],
  );

  const set = <K extends keyof UpsertTicketTemplateRequest>(key: K, value: UpsertTicketTemplateRequest[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // ── Alterações não salvas ────────────────────────────────────────────────
  // isDirty compara o estado atual com o último snapshot persistido e é
  // consultado por um ref (o blocker roda fora do ciclo de render).
  const isDirty = JSON.stringify({ form, questions, drafts }) !== savedSnapshotRef.current;
  const dirtyRef = useRef(false);
  dirtyRef.current = isDirty;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const backToList = () => navigate('/tickets/templates');
  // Após salvar, substitui a entrada do formulário no histórico para que o
  // botão "voltar" do navegador não reabra o formulário com estado antigo.
  const backToSavedList = () => navigate('/tickets/templates', { replace: true });

  const handleSubmit = () => {
    if (form.name.trim().length < 2 || form.title.trim().length < 3) {
      toast.error('Informe nome e título do template.');
      return;
    }
    const questionError = validateTemplateQuestions(questions);
    if (questionError) {
      toast.error(questionError);
      return;
    }
    if (validation.errors.length > 0) {
      toast.error(validation.errors[0]);
      return;
    }

    const payload: UpsertTicketTemplateRequest = {
      ...form,
      customFieldDefaultsJson: JSON.stringify(validation.values),
      questionsJson: serializeTemplateQuestions(questions),
    };

    // Marca o snapshot como persistido ANTES de navegar: senão o aviso de
    // alterações não salvas bloquearia a própria navegação pós-save.
    const savedSnapshot = JSON.stringify({ form, questions, drafts });

    const opts = {
      onSuccess: () => {
        savedSnapshotRef.current = savedSnapshot;
        dirtyRef.current = false;
        toast.success(editId ? 'Template atualizado' : 'Template criado');
        backToSavedList();
      },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar template'),
    };
    if (editId) update.mutate({ id: editId, data: payload }, opts);
    else create.mutate(payload, opts);
  };

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => { event.preventDefault(); handleSubmit(); }}
    >
      <PageHeader
        title={editId ? 'Editar template' : 'Novo template'}
        description="Pré-preenche título, descrição, prioridade, categoria e os campos personalizados do departamento na abertura do chamado."
        onBack={backToList}
      />

      <Card>
        <CardHeader title="Identificação" subtitle="Como o template aparece no catálogo e o texto sugerido ao abrir o chamado." />
        <div className="space-y-4">
          <Input label="Nome *" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <Input label="Título *" value={form.title} onChange={(e) => set('title', e.target.value)} />
          <TextArea label="Descrição" value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Escopo e padrões" subtitle="Onde o template se aplica e o que ele já preenche no chamado." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Cliente"
            options={clientOptions}
            value={form.clientId ?? ''}
            onChange={(e) => setForm((current) => ({ ...current, clientId: e.target.value || null, departmentId: null }))}
          />
          <Select
            label="Departamento"
            options={departmentOptions}
            value={form.departmentId ?? ''}
            disabled={departments.isLoading}
            onChange={(e) => {
              pendingDefaultsRef.current = null;
              setDrafts({});
              setForm((current) => ({ ...current, departmentId: e.target.value || null }));
            }}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Select label="Prioridade padrão" options={PRIORITY_OPTIONS} value={form.priority ?? ''} onChange={(e) => set('priority', e.target.value || null)} />
          <Input label="Categoria" value={form.category ?? ''} onChange={(e) => set('category', e.target.value || null)} />
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="rounded bg-surface-light border-border" />
          Ativo
        </label>
      </Card>

      <TemplateQuestionsEditor
        questions={questions}
        onChange={setQuestions}
        clientId={form.clientId}
        departmentId={form.departmentId}
      />

      {form.departmentId && (
        <Card>
          <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">
              Opcional: pré-preencher campos do departamento
            </p>
            <Link
              to={`/tickets/departments/${form.departmentId}`}
              className="shrink-0 text-xs font-medium text-primary hover:underline"
            >
              Gerenciar campos do departamento
            </Link>
          </div>
          <p className="mb-3 text-xs text-muted">
            Estes são os campos fixos do departamento (existem em todo chamado, obrigatórios ou não conforme a
            configuração de cada campo). Aqui você só define valores iniciais — opcional.
          </p>
          {schemaQuery.isLoading && <Loading message="Carregando campos..." />}
          {!schemaQuery.isLoading && schemaFields.length === 0 && (
            <p className="text-sm text-muted">
              Este departamento não possui campos personalizados.{' '}
              <Link to={`/tickets/departments/${form.departmentId}`} className="font-medium text-primary hover:underline">
                Criar campos
              </Link>
              .
            </p>
          )}
          <div className="space-y-3">
            {schemaFields.map((field) => (
              <TicketSchemaFieldInput
                key={field.definitionId}
                field={field}
                value={drafts[field.definitionId] ?? ''}
                onChange={(value) => setDrafts((prev) => ({ ...prev, [field.definitionId]: value }))}
              />
            ))}
          </div>
        </Card>
      )}

      {/* O JSON avançado foi removido: os valores são gerados pelos inputs de
          campos padrão acima (e ficam visíveis no detalhe em modo leitura). */}

      <div className="sticky bottom-0 z-10 -mx-4 -mb-8 flex justify-end gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button type="button" variant="ghost" onClick={backToList}>Cancelar</Button>
        <Button type="submit" loading={isSaving}><Save className="h-4 w-4" /> Salvar</Button>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Descartar alterações?"
        message="Há alterações não salvas neste template. Se sair agora, elas serão perdidas."
        confirmLabel="Descartar e sair"
        cancelLabel="Continuar editando"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      />
    </form>
  );
}
