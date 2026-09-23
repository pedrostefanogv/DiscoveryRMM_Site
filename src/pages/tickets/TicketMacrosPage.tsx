import { useState } from 'react';
import { Plus, Pencil, Trash2, Zap } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorDisplay, Input, Loading, Modal, TextArea } from '@/components/ui';
import {
  useTicketMacros, useCreateTicketMacro, useUpdateTicketMacro, useDeleteTicketMacro,
} from '@/hooks/useSupportProductivity';
import type { TicketMacroDto, UpsertTicketMacroRequest } from '@/api';
import toast from 'react-hot-toast';

const EMPTY: UpsertTicketMacroRequest = { clientId: null, departmentId: null, name: '', description: null, content: '', isActive: true };

export default function TicketMacrosPage() {
  const macros = useTicketMacros({ includeGlobal: true });
  const create = useCreateTicketMacro();
  const update = useUpdateTicketMacro();
  const remove = useDeleteTicketMacro();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<UpsertTicketMacroRequest>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<TicketMacroDto | null>(null);

  const openCreate = () => { setEditId(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (m: TicketMacroDto) => {
    setEditId(m.id);
    setForm({ clientId: m.clientId, departmentId: m.departmentId, name: m.name, description: m.description, content: m.content, isActive: m.isActive });
    setOpen(true);
  };

  const submit = () => {
    if (form.name.trim().length < 2 || form.content.trim().length < 2) {
      toast.error('Informe nome e conteúdo da macro.');
      return;
    }
    const opts = { onSuccess: () => { toast.success(editId ? 'Macro atualizada' : 'Macro criada'); setOpen(false); }, onError: () => toast.error('Erro ao salvar macro') };
    if (editId) update.mutate({ id: editId, data: form }, opts);
    else create.mutate(form, opts);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Macros de resposta</h1>
          <p className="text-sm text-muted">Respostas rápidas reutilizáveis em comentários. Variáveis: {'{cliente}'}, {'{ticket_id}'}, {'{tecnico}'}.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> Nova macro</Button>
      </div>

      <Card>
        <CardHeader title="Macros" subtitle={`${macros.data?.length ?? 0} macro(s)`} />
        {macros.isLoading && <Loading />}
        {macros.isError && <ErrorDisplay onRetry={() => macros.refetch()} />}
        <div className="divide-y divide-white/5">
          {(macros.data ?? []).map((m) => (
            <div key={m.id} className="flex items-start gap-3 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-light">
                <Zap className="h-4 w-4 text-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{m.name}</p>
                <p className="line-clamp-2 text-xs text-muted">{m.content}</p>
              </div>
              <div className="flex items-center gap-2">
                {!m.isActive && <Badge color="warning">Inativa</Badge>}
                <button onClick={() => openEdit(m)} aria-label="Editar" className="p-1 text-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setDeleteTarget(m)} aria-label="Excluir" className="p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          {(macros.data?.length ?? 0) === 0 && !macros.isLoading && (
            <p className="py-6 text-center text-sm text-muted">Nenhuma macro cadastrada.</p>
          )}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar macro' : 'Nova macro'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <Input label="Nome *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Descrição" value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))} />
          <TextArea label="Conteúdo *" placeholder="Texto da resposta. Use {cliente}, {ticket_id}, {tecnico}." value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded bg-surface-light border-border" />
            Ativa
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} loading={create.isPending || update.isPending}>Salvar</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Excluir macro"
        message={`Excluir a macro "${deleteTarget?.name ?? ''}"?`}
        confirmLabel="Excluir"
        isLoading={remove.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          remove.mutate(deleteTarget.id, {
            onSuccess: () => { toast.success('Macro excluída'); setDeleteTarget(null); },
            onError: () => toast.error('Erro ao excluir macro'),
          });
        }}
      />
    </div>
  );
}
