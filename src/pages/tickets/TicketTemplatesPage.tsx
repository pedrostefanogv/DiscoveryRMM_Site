import { useState } from 'react';
import { Plus, Pencil, Trash2, LayoutTemplate } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorDisplay, Input, Loading, Modal, Select, TextArea } from '@/components/ui';
import {
  useTicketTemplates, useCreateTicketTemplate, useUpdateTicketTemplate, useDeleteTicketTemplate,
} from '@/hooks/useSupportProductivity';
import type { TicketTemplateDto, UpsertTicketTemplateRequest } from '@/api';
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
  const create = useCreateTicketTemplate();
  const update = useUpdateTicketTemplate();
  const remove = useDeleteTicketTemplate();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<UpsertTicketTemplateRequest>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<TicketTemplateDto | null>(null);

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

  const submit = () => {
    if (form.name.trim().length < 2 || form.title.trim().length < 3) {
      toast.error('Informe nome e título do template.');
      return;
    }
    const opts = { onSuccess: () => { toast.success(editId ? 'Template atualizado' : 'Template criado'); setOpen(false); }, onError: () => toast.error('Erro ao salvar template') };
    if (editId) update.mutate({ id: editId, data: form }, opts);
    else create.mutate(form, opts);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Templates de chamado</h1>
          <p className="text-sm text-muted">Pré-preenchem título, descrição, prioridade e categoria na abertura.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> Novo template</Button>
      </div>

      <Card>
        <CardHeader title="Templates" subtitle={`${templates.data?.length ?? 0} template(s)`} />
        {templates.isLoading && <Loading />}
        {templates.isError && <ErrorDisplay onRetry={() => templates.refetch()} />}
        <div className="divide-y divide-white/5">
          {(templates.data ?? []).map((t) => (
            <div key={t.id} className="flex items-start gap-3 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-light">
                <LayoutTemplate className="h-4 w-4 text-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{t.name}</p>
                <p className="truncate text-xs text-muted">{t.title}</p>
              </div>
              <div className="flex items-center gap-2">
                {t.priority && <Badge color="accent">{t.priority}</Badge>}
                {!t.isActive && <Badge color="warning">Inativo</Badge>}
                <button onClick={() => openEdit(t)} aria-label="Editar" className="p-1 text-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setDeleteTarget(t)} aria-label="Excluir" className="p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          {(templates.data?.length ?? 0) === 0 && !templates.isLoading && (
            <p className="py-6 text-center text-sm text-muted">Nenhum template cadastrado.</p>
          )}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar template' : 'Novo template'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <Input label="Nome *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Título *" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <TextArea label="Descrição" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Prioridade padrão" options={PRIORITY_OPTIONS} value={form.priority ?? ''} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value || null }))} />
            <Input label="Categoria" value={form.category ?? ''} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value || null }))} />
          </div>
          <TextArea label="Campos personalizados (JSON)" placeholder='{"definitionId":"valor"}' value={form.customFieldDefaultsJson} onChange={(e) => setForm((f) => ({ ...f, customFieldDefaultsJson: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded bg-surface-light border-border" />
            Ativo
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} loading={create.isPending || update.isPending}>Salvar</Button>
          </div>
        </div>
      </Modal>

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
