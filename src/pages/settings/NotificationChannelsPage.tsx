import { useState } from 'react';
import { Plus, Pencil, Trash2, Bell } from 'lucide-react';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorDisplay, Input, Loading, Modal, Select, TextArea } from '@/components/ui';
import {
  useNotificationChannels, useCreateNotificationChannel, useUpdateNotificationChannel, useDeleteNotificationChannel,
} from '@/hooks/useSupportProductivity';
import type { NotificationChannelDto, UpsertNotificationChannelRequest } from '@/api';
import toast from 'react-hot-toast';

const EMPTY: UpsertNotificationChannelRequest = {
  name: '', type: 'Webhook', isActive: true, eventsJson: '["*"]', configJson: '{"url":"https://"}',
};

const TYPE_OPTIONS = [
  { value: 'Webhook', label: 'Webhook (HTTP POST)' },
  { value: 'Email', label: 'E-mail (SMTP)' },
];

const WEBHOOK_EXAMPLE = '{"url":"https://hooks.example.com/tickets","secret":"opcional"}';
const EMAIL_EXAMPLE = '{"host":"smtp.exemplo.com","port":587,"useSsl":true,"username":"","password":"","from":"suporte@exemplo.com","to":["ti@exemplo.com"]}';

export default function NotificationChannelsPage() {
  const channels = useNotificationChannels();
  const create = useCreateNotificationChannel();
  const update = useUpdateNotificationChannel();
  const remove = useDeleteNotificationChannel();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<UpsertNotificationChannelRequest>(EMPTY);
  const [deleteTarget, setDeleteTarget] = useState<NotificationChannelDto | null>(null);

  const openCreate = () => { setEditId(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (c: NotificationChannelDto) => {
    setEditId(c.id);
    setForm({ name: c.name, type: c.type, isActive: c.isActive, eventsJson: c.eventsJson, configJson: c.configJson });
    setOpen(true);
  };

  const submit = () => {
    if (form.name.trim().length < 2) { toast.error('Informe o nome do canal.'); return; }
    try { JSON.parse(form.eventsJson); JSON.parse(form.configJson); }
    catch { toast.error('Events/Config precisam ser JSON válido.'); return; }
    const opts = { onSuccess: () => { toast.success(editId ? 'Canal atualizado' : 'Canal criado'); setOpen(false); }, onError: () => toast.error('Erro ao salvar canal') };
    if (editId) update.mutate({ id: editId, data: form }, opts);
    else create.mutate(form, opts);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notificações multicanal</h1>
          <p className="text-sm text-muted">Envie eventos de chamados para webhooks e e-mail, além do in-app.</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> Novo canal</Button>
      </div>

      <Card>
        <CardHeader title="Canais" subtitle={`${channels.data?.length ?? 0} canal(is)`} />
        {channels.isLoading && <Loading />}
        {channels.isError && <ErrorDisplay onRetry={() => channels.refetch()} />}
        <div className="divide-y divide-white/5">
          {(channels.data ?? []).map((c) => (
            <div key={c.id} className="flex items-start gap-3 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-light">
                <Bell className="h-4 w-4 text-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{c.name}</p>
                <p className="truncate text-xs text-muted">{c.type} · eventos: {c.eventsJson}</p>
              </div>
              <div className="flex items-center gap-2">
                {!c.isActive && <Badge color="warning">Inativo</Badge>}
                <button onClick={() => openEdit(c)} aria-label="Editar" className="p-1 text-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setDeleteTarget(c)} aria-label="Excluir" className="p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          {(channels.data?.length ?? 0) === 0 && !channels.isLoading && (
            <p className="py-6 text-center text-sm text-muted">Nenhum canal cadastrado. Notificações ficam apenas in-app.</p>
          )}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Editar canal' : 'Novo canal'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <Input label="Nome *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Select label="Tipo" options={TYPE_OPTIONS} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} />
          <TextArea label="Eventos (JSON array; * = todos)" placeholder='["ticket.created","ticket.sla_breached"]' value={form.eventsJson} onChange={(e) => setForm((f) => ({ ...f, eventsJson: e.target.value }))} />
          <TextArea label="Configuração (JSON)" placeholder={form.type === 'Email' ? EMAIL_EXAMPLE : WEBHOOK_EXAMPLE} value={form.configJson} onChange={(e) => setForm((f) => ({ ...f, configJson: e.target.value }))} />
          <p className="text-xs text-muted">Webhook: {WEBHOOK_EXAMPLE}<br />E-mail: {EMAIL_EXAMPLE}</p>
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
        title="Excluir canal"
        message={`Excluir o canal "${deleteTarget?.name ?? ''}"?`}
        confirmLabel="Excluir"
        isLoading={remove.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          remove.mutate(deleteTarget.id, {
            onSuccess: () => { toast.success('Canal excluído'); setDeleteTarget(null); },
            onError: () => toast.error('Erro ao excluir canal'),
          });
        }}
      />
    </div>
  );
}
