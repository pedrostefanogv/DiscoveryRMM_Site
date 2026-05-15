import { useState } from 'react';
import { Plus, Trash2, Pencil, Clock } from 'lucide-react';
import {
  useWorkflowProfiles,
  useCreateWorkflowProfile,
  useUpdateWorkflowProfile,
  useDeleteWorkflowProfile,
} from '@/hooks/useWorkflowProfiles';
import { useDepartments } from '@/hooks/useDepartments';
import { useClients } from '@/hooks/useClients';
import { Card, CardHeader, Button, Modal, Input, Select, Badge, Loading, ErrorDisplay } from '@/components/ui';
import type { WorkflowProfile, CreateWorkflowProfileRequest, UpdateWorkflowProfileRequest, TicketPriority } from '@/api';
import toast from 'react-hot-toast';

const PRIORITY_OPTIONS = [
  { value: '',         label: 'Nenhuma' },
  { value: 'Low',      label: 'Baixa' },
  { value: 'Medium',   label: 'Média' },
  { value: 'High',     label: 'Alta' },
  { value: 'Critical', label: 'Crítica' },
];

export default function WorkflowProfileSettings() {
  const [clientId, setClientId]     = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WorkflowProfile | null>(null);

  const profiles = useWorkflowProfiles({ clientId: clientId || undefined, includeGlobal: true });
  const clients  = useClients();
  const depts    = useDepartments({ includeGlobal: true, activeOnly: true });

  const deptMap   = new Map((depts.data   ?? []).map(d => [d.id, d]));
  const clientMap = new Map((clients.data ?? []).map(c => [c.id, c]));

  const clientOpts = [
    { value: '', label: 'Todos' },
    ...(clients.data ?? []).map(c => ({ value: c.id, label: c.name })),
  ];

  if (profiles.isLoading) return <Loading />;
  if (profiles.isError)   return <ErrorDisplay onRetry={() => profiles.refetch()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Perfis de Workflow</h1>
        <p className="text-sm text-slate-400">Configure SLA e prioridade padrão por departamento</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Select label="Filtrar por cliente" options={clientOpts} value={clientId} onChange={e => setClientId(e.target.value)} />
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Novo Perfil
          </Button>
        </div>
      </Card>

      <div className="rounded-xl border border-primary/10 bg-primary/5 p-4 text-sm">
        <p className="font-medium text-white">Entendendo o SLA</p>
        <p className="mt-1 text-slate-400">
          O SLA define o prazo para atendimento de um chamado. Esse prazo pode ser calculado de duas formas:
        </p>
        <ul className="mt-2 space-y-1 text-xs text-slate-400 list-disc pl-4">
          <li>
            <strong className="text-slate-300">Em horas úteis:</strong> se o perfil estiver vinculado a um calendário de SLA (cadastrado em <strong className="text-slate-300">SLA, Calendários e Perfis</strong>), o prazo conta apenas em dias úteis, dentro do horário comercial, desconsiderando feriados. Por exemplo, um SLA de 8 horas pode levar mais de um dia para vencer se o horário comercial for das 8h às 18h.
          </li>
          <li>
            <strong className="text-slate-300">24 horas por dia, 7 dias por semana:</strong> se o perfil não estiver vinculado a um calendário, o prazo corre ininterruptamente — finais de semana e madrugadas contam normalmente.
          </li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          Se um chamado for criado em um departamento sem perfil de workflow, nenhum SLA será calculado.
        </p>
      </div>

      <Card>
        <CardHeader title="Perfis" subtitle={`${profiles.data?.length ?? 0} perfis`} />
        <div className="divide-y divide-white/5">
          {(profiles.data ?? []).map(p => (
            <ProfileRow
              key={p.id}
              profile={p}
              deptName={deptMap.get(p.departmentId)?.name ?? '—'}
              clientName={p.clientId ? (clientMap.get(p.clientId)?.name ?? '—') : null}
              onEdit={() => setEditTarget(p)}
            />
          ))}
          {(profiles.data?.length ?? 0) === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">Nenhum perfil encontrado</p>
          )}
        </div>
      </Card>

      <CreateProfileModal open={createOpen} onClose={() => setCreateOpen(false)} depts={depts.data ?? []} clients={clients.data ?? []} />
      {editTarget && (
        <EditProfileModal profile={editTarget} onClose={() => setEditTarget(null)} depts={depts.data ?? []} />
      )}
    </div>
  );
}

function ProfileRow({ profile, deptName, clientName, onEdit }: { profile: WorkflowProfile; deptName: string; clientName: string | null; onEdit: () => void }) {
  const del = useDeleteWorkflowProfile();

  const handleDelete = () => {
    if (!confirm(`Excluir perfil "${profile.name}"?`)) return;
    del.mutate(profile.id, {
      onSuccess: () => toast.success('Perfil excluído'),
      onError:   () => toast.error('Erro ao excluir'),
    });
  };

  return (
    <div className="flex items-center gap-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
        <Clock className="h-4 w-4 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white">{profile.name}</p>
        <p className="text-xs text-slate-500">
          {deptName} • SLA: {profile.slaHours}h
          {profile.defaultPriority && ` • Prioridade padrão: ${profile.defaultPriority}`}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {clientName ? <Badge color="accent">{clientName}</Badge> : <Badge color="slate">Global</Badge>}
        {!profile.isActive && <Badge color="warning">Inativo</Badge>}
        <button onClick={onEdit} aria-label="Editar" className="p-1 text-slate-500 hover:text-white transition-colors">
          <Pencil className="h-4 w-4" />
        </button>
        <button onClick={handleDelete} aria-label="Excluir" className="p-1 text-slate-500 hover:text-danger transition-colors">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CreateProfileModal({
  open, onClose, depts, clients,
}: {
  open: boolean;
  onClose: () => void;
  depts: { id: string; name: string }[];
  clients: { id: string; name: string }[];
}) {
  const create = useCreateWorkflowProfile();
  const [form, setForm] = useState<CreateWorkflowProfileRequest>({
    clientId: null,
    departmentId: '',
    name: '',
    description: null,
    slaHours: 24,
    defaultPriority: null,
  });

  const clientOpts = [
    { value: '', label: 'Global (sem cliente)' },
    ...(clients.map(c => ({ value: c.id, label: c.name }))),
  ];
  const deptOpts = [
    { value: '', label: 'Selecione...' },
    ...(depts.map(d => ({ value: d.id, label: d.name }))),
  ];

  const valid = form.name.trim().length >= 2 && !!form.departmentId && form.slaHours > 0;

  const handleSubmit = () => {
    if (!valid) return;
    create.mutate(form, {
      onSuccess: () => {
        toast.success('Perfil criado');
        onClose();
        setForm({ clientId: null, departmentId: '', name: '', description: null, slaHours: 24, defaultPriority: null });
      },
      onError: () => toast.error('Erro ao criar (departamento não existe?)'),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo Perfil de Workflow">
      <div className="space-y-4">
        <Select label="Cliente (null = global)" options={clientOpts} value={form.clientId ?? ''} onChange={e => setForm(f => ({ ...f, clientId: e.target.value || null }))} />
        <Select label="Departamento *" options={deptOpts} value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} />
        <Input label="Nome *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mín. 2 caracteres" />
        <Input label="Descrição" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="SLA (horas) *" type="number" value={form.slaHours} onChange={e => setForm(f => ({ ...f, slaHours: Math.max(1, Number(e.target.value)) }))} />
          <Select
            label="Prioridade padrão"
            options={PRIORITY_OPTIONS}
            value={form.defaultPriority ?? ''}
            onChange={e => setForm(f => ({ ...f, defaultPriority: (e.target.value as TicketPriority) || null }))}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={create.isPending} disabled={!valid}>Criar</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditProfileModal({ profile, onClose, depts }: { profile: WorkflowProfile; onClose: () => void; depts: { id: string; name: string }[] }) {
  const update = useUpdateWorkflowProfile();
  const [form, setForm] = useState<UpdateWorkflowProfileRequest>({
    name:            profile.name,
    description:     profile.description,
    departmentId:    profile.departmentId,
    slaHours:        profile.slaHours,
    defaultPriority: profile.defaultPriority,
    isActive:        profile.isActive,
  });

  const deptOpts = depts.map(d => ({ value: d.id, label: d.name }));
  const valid = form.name.trim().length >= 2 && !!form.departmentId && form.slaHours > 0;

  const handleSubmit = () => {
    if (!valid) return;
    update.mutate({ id: profile.id, data: form }, {
      onSuccess: () => { toast.success('Perfil atualizado'); onClose(); },
      onError:   () => toast.error('Erro ao atualizar'),
    });
  };

  return (
    <Modal open={true} onClose={onClose} title={`Editar: ${profile.name}`}>
      <div className="space-y-4">
        <Select label="Departamento *" options={deptOpts} value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} />
        <Input label="Nome *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <Input label="Descrição" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="SLA (horas) *" type="number" value={form.slaHours} onChange={e => setForm(f => ({ ...f, slaHours: Math.max(1, Number(e.target.value)) }))} />
          <Select
            label="Prioridade padrão"
            options={PRIORITY_OPTIONS}
            value={form.defaultPriority ?? ''}
            onChange={e => setForm(f => ({ ...f, defaultPriority: (e.target.value as TicketPriority) || null }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded bg-white/5 border-white/10" />
          Ativo
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={update.isPending} disabled={!valid}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}
