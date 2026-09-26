import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, LayoutTemplate, Globe, Building2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorDisplay, Input, Loading, Modal, Select, TextArea } from '@/components/ui';
import {
  useTicketTemplates, useCreateTicketTemplate, useUpdateTicketTemplate, useDeleteTicketTemplate,
} from '@/hooks/useSupportProductivity';
import { useClients } from '@/hooks/useClients';
import { useDepartments } from '@/hooks/useDepartments';
import { useDepartmentTicketSchema } from '@/hooks/useDepartmentCustomFields';
import type { TicketTemplateDto, UpsertTicketTemplateRequest } from '@/api';
import { TicketSchemaFieldInput } from '@/components/tickets/TicketSchemaFieldInput';
import { templateDefaultsToDrafts } from '@/utils/ticketTemplateDefaults';
import { buildTicketCustomFieldValues } from '@/utils/ticketCustomFields';
import toast from 'react-hot-toast';

const EMPTY: UpsertTicketTemplateRequest = {
  clientId: null, departmentId: null, name: '', title: '', description: '',
  priority: null, category: null, customFieldDefaultsJson: '{}', isActive: true,
};

const PRIORITY_OPTIONS = [
  { value: '', label: 'Nenhuma' },
  { value: 'Low', label: 'Baixa' },
  { value: 'Medium', label: 'Média' },
  { value: 'High', label: 'Alta' },
  { value: 'Critical', label: 'Crítica' },
];

export default function TicketTemplatesPage() {
  const templates = useTicketTemplates({ includeGlobal: true });
  const remove = useDeleteTicketTemplate();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<UpsertTicketTemplateRequest>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<TicketTemplateDto | null>(null);

  const clients = useClients();

  const openCreate = () => { setEditId(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (t: TicketTemplateDto) => {
    setEditId(t.id);
    setForm({
      clientId: t.clientId, departmentId: t.departmentId, name: t.name, title: t.title,
      description: t.description, priority: t.priority, category: t.category,
      customFieldDefaultsJson: t.customFieldDefaultsJson, isActive: t.isActive,
    });
    setOpen(true);
  };

  const clientOptions = useMemo(
    () => [
      { value: '', label: 'Global (todos os clientes)' },
      ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
    ],
    [clients.data],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Templates de chamado</h1>
          <p className="text-sm text-muted">Pré-preenchem título, descrição, prioridade, categoria e os campos personalizados do departamento na abertura.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> Novo template</Button>
      </div>

      <Card>
        <CardHeader title="Templates" subtitle={`${templates.data?.length ?? 0} template(s)`} />
        {templates.isLoading && <Loading />}
        {templates.isError && <ErrorDisplay onRetry={() => templates.refetch()} />}
        <div className="divide-y divide-white/5">
          {(templates.data ?? []).map((t) => {
            const client = (clients.data ?? []).find((c) => c.id === t.clientId);
            const fieldCount = countDefaultFields(t.customFieldDefaultsJson);
            return (
              <div key={t.id} className="flex items-start gap-3 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-light">
                  <LayoutTemplate className="h-4 w-4 text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{t.name}</p>
                  <p className="truncate text-xs text-muted">{t.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {t.clientId ? (
                      <Badge color="slate"><Building2 className="mr-0.5 inline h-3 w-3" />{client?.name ?? 'Cliente'}</Badge>
                    ) : (
                      <Badge color="slate"><Globe className="mr-0.5 inline h-3 w-3" />Global</Badge>
                    )}
                    {t.departmentId && <Badge color="accent">Departamento</Badge>}
                    {fieldCount > 0 && <Badge color="success">{fieldCount} campo(s) padrão</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {t.priority && <Badge color="accent">{t.priority}</Badge>}
                  {!t.isActive && <Badge color="warning">Inativo</Badge>}
                  <button onClick={() => openEdit(t)} aria-label="Editar" className="p-1 text-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => setDeleteTarget(t)} aria-label="Excluir" className="p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
          {(templates.data?.length ?? 0) === 0 && !templates.isLoading && (
            <p className="py-6 text-center text-sm text-muted">Nenhum template cadastrado.</p>
          )}
        </div>
      </Card>

      {open && (
        <TemplateFormModal
          editId={editId}
          initial={form}
          clientOptions={clientOptions}
          onClose={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir template"
        message={`Excluir o template "${deleteTarget?.name ?? ''}"?`}
        confirmLabel="Excluir"
        isLoading={remove.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          remove.mutate(deleteTarget.id, {
            onSuccess: () => { toast.success('Template excluído'); setDeleteTarget(null); },
            onError: () => toast.error('Erro ao excluir template'),
          });
        }}
      />
    </div>
  );
}

function countDefaultFields(json: string): number {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 0;
    return Object.values(parsed as Record<string, unknown>).filter((v) => v !== null && v !== undefined).length;
  } catch {
    return 0;
  }
}

function TemplateFormModal({
  editId,
  initial,
  clientOptions,
  onClose,
  onSaved,
}: {
  editId: string | null;
  initial: UpsertTicketTemplateRequest;
  clientOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const create = useCreateTicketTemplate();
  const update = useUpdateTicketTemplate();
  const isSaving = create.isPending || update.isPending;
  const [form, setForm] = useState<UpsertTicketTemplateRequest>(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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
    setDrafts((prev) => ({ ...templateDefaultsToDrafts(pending, schemaFields), ...prev }));
  }, [schemaFields]);

  const validation = useMemo(
    () => buildTicketCustomFieldValues(schemaFields, drafts),
    [schemaFields, drafts],
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

  const handleSubmit = () => {
    if (form.name.trim().length < 2 || form.title.trim().length < 3) {
      toast.error('Informe nome e título do template.');
      return;
    }
    if (validation.errors.length > 0) {
      toast.error(validation.errors[0]);
      return;
    }

    const payload: UpsertTicketTemplateRequest = {
      ...form,
      customFieldDefaultsJson: JSON.stringify(validation.values),
    };

    const opts = {
      onSuccess: () => { toast.success(editId ? 'Template atualizado' : 'Template criado'); onSaved(); },
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar template'),
    };
    if (editId) update.mutate({ id: editId, data: payload }, opts);
    else create.mutate(payload, opts);
  };

  return (
    <Modal open onClose={onClose} title={editId ? 'Editar template' : 'Novo template'} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <Input label="Nome *" value={form.name} onChange={(e) => set('name', e.target.value)} />
        <Input label="Título *" value={form.title} onChange={(e) => set('title', e.target.value)} />
        <TextArea label="Descrição" value={form.description} onChange={(e) => set('description', e.target.value)} />

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

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Prioridade padrão" options={PRIORITY_OPTIONS} value={form.priority ?? ''} onChange={(e) => set('priority', e.target.value || null)} />
          <Input label="Categoria" value={form.category ?? ''} onChange={(e) => set('category', e.target.value || null)} />
        </div>

        {form.departmentId && (
          <div className="rounded-lg border border-border bg-surface-light p-4">
            <p className="mb-1 text-xs font-medium text-muted">Valores padrão dos campos personalizados</p>
            <p className="mb-3 text-xs text-muted">
              Preencha o que deve vir pré-selecionado no chamado. Campos vazios ficam como estão no formulário.
            </p>
            {schemaQuery.isLoading && <Loading message="Carregando campos..." />}
            {!schemaQuery.isLoading && schemaFields.length === 0 && (
              <p className="text-sm text-muted">Este departamento não possui campos personalizados.</p>
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
          </div>
        )}

        <TextArea
          label="Campos personalizados (JSON avançado)"
          rows={2}
          value={JSON.stringify(validation.values)}
          readOnly
          hint="Gerado automaticamente a partir dos valores padrão acima."
          onChange={() => {}}
        />

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="rounded bg-surface-light border-border" />
          Ativo
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={isSaving}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}
