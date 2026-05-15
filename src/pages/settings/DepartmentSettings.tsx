import { useState } from 'react';
import { Plus, Trash2, Pencil, Globe, Settings, ListTodo } from 'lucide-react';
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from '@/hooks/useDepartments';
import { useClients } from '@/hooks/useClients';
import { Card, CardHeader, Button, Modal, Input, Select, Badge, Loading, ErrorDisplay } from '@/components/ui';
import { DepartmentCustomFieldsSection } from '@/components/configuration/DepartmentCustomFieldsSection';
import type { Department, CreateDepartmentRequest, UpdateDepartmentRequest } from '@/api';
import toast from 'react-hot-toast';

export default function DepartmentSettings() {
  const [clientId, setClientId]       = useState('');
  const [createOpen, setCreateOpen]   = useState(false);
  const [editTarget, setEditTarget]   = useState<Department | null>(null);

  const depts   = useDepartments({ clientId: clientId || undefined, includeGlobal: true, activeOnly: false });
  const clients = useClients();

  const clientOpts = [
    { value: '', label: 'Global + todos os clientes' },
    ...(clients.data ?? []).map(c => ({ value: c.id, label: c.name })),
  ];

  if (depts.isLoading) return <Loading />;
  if (depts.isError)   return <ErrorDisplay onRetry={() => depts.refetch()} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Departamentos</h1>
        <p className="text-sm text-slate-400">Gerencie departamentos globais e por cliente</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Select label="Filtrar por cliente" options={clientOpts} value={clientId} onChange={e => setClientId(e.target.value)} />
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Novo Departamento
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Departamentos" subtitle={`${depts.data?.length ?? 0} registros`} />
        <div className="divide-y divide-white/5">
          {(depts.data ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map(d => (
            <DepartmentRow
              key={d.id}
              dept={d}
              clientName={clients.data?.find(c => c.id === d.clientId)?.name ?? null}
              onEdit={() => setEditTarget(d)}
            />
          ))}
          {(depts.data?.length ?? 0) === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">Nenhum departamento encontrado</p>
          )}
        </div>
      </Card>

      <CreateDepartmentModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {editTarget && (
        <EditDepartmentModal dept={editTarget} onClose={() => setEditTarget(null)} />
      )}
    </div>
  );
}

function DepartmentRow({ dept, clientName, onEdit }: { dept: Department; clientName: string | null; onEdit: () => void }) {
  const del = useDeleteDepartment();

  const handleDelete = () => {
    if (!confirm(`Excluir departamento "${dept.name}"?`)) return;
    del.mutate(dept.id, {
      onSuccess: () => toast.success('Departamento excluído'),
      onError:   () => toast.error('Erro ao excluir'),
    });
  };

  return (
    <div className="flex items-center gap-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
        <Globe className="h-4 w-4 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white">{dept.name}</p>
        <p className="text-xs text-slate-500">{dept.description ?? 'Sem descrição'}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {clientName ? (
          <Badge color="accent">{clientName}</Badge>
        ) : (
          <Badge color="slate">Global</Badge>
        )}
        {!dept.isActive && <Badge color="warning">Inativo</Badge>}
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

function CreateDepartmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create  = useCreateDepartment();
  const clients = useClients();
  const [form, setForm] = useState<CreateDepartmentRequest>({
    clientId: null, name: '', description: null, inheritFromGlobalId: null, sortOrder: 0,
  });

  const clientOpts = [
    { value: '', label: 'Global (sem cliente)' },
    ...(clients.data ?? []).map(c => ({ value: c.id, label: c.name })),
  ];

  const valid = form.name.trim().length >= 2;

  const handleSubmit = () => {
    if (!valid) return;
    create.mutate(form, {
      onSuccess: () => { toast.success('Departamento criado'); onClose(); setForm({ clientId: null, name: '', description: null, inheritFromGlobalId: null, sortOrder: 0 }); },
      onError:   () => toast.error('Erro ao criar (nome duplicado?)'),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo Departamento">
      <div className="space-y-4">
        <Select label="Cliente (null = global)" options={clientOpts} value={form.clientId ?? ''} onChange={e => setForm(f => ({ ...f, clientId: e.target.value || null }))} />
        <Input label="Nome *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mín. 2 caracteres" />
        <Input label="Descrição" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))} />
        <Input label="Ordem" type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Math.max(0, Number(e.target.value)) }))} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={create.isPending} disabled={!valid}>Criar</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditDepartmentModal({ dept, onClose }: { dept: Department; onClose: () => void }) {
  const update = useUpdateDepartment();
  const [tab, setTab] = useState<'general' | 'fields'>('general');
  const [form, setForm] = useState<UpdateDepartmentRequest>({
    name: dept.name,
    description: dept.description,
    inheritFromGlobalId: dept.inheritFromGlobalId,
    sortOrder: dept.sortOrder,
    isActive: dept.isActive,
  });

  const valid = form.name.trim().length >= 2;

  const handleSubmit = () => {
    if (!valid) return;
    update.mutate({ id: dept.id, data: form }, {
      onSuccess: () => { toast.success('Departamento atualizado'); },
      onError:   () => toast.error('Erro ao atualizar'),
    });
  };

  return (
    <Modal open={true} onClose={onClose} title={`Editar: ${dept.name}`} maxWidth="max-w-2xl">
      {/* Tabs */}
      <div className="flex border-b border-white/5 mb-4">
        <button
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'general' ? 'border-b-2 border-primary text-white' : 'text-slate-400 hover:text-white'
          }`}
          onClick={() => setTab('general')}
        >
          <Settings className="inline h-4 w-4 mr-1.5" />
          Geral
        </button>
        <button
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'fields' ? 'border-b-2 border-primary text-white' : 'text-slate-400 hover:text-white'
          }`}
          onClick={() => setTab('fields')}
        >
          <ListTodo className="inline h-4 w-4 mr-1.5" />
          Campos Customizados
        </button>
      </div>

      {tab === 'general' ? (
        <div className="space-y-4">
          <Input label="Nome *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Descrição" value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))} />
          <Input label="Ordem" type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Math.max(0, Number(e.target.value)) }))} />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="rounded bg-white/5 border-white/10" />
            Ativo
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSubmit} loading={update.isPending} disabled={!valid}>Salvar</Button>
          </div>
        </div>
      ) : (
        <div className="pb-2">
          <DepartmentCustomFieldsSection departmentId={dept.id} />
        </div>
      )}
    </Modal>
  );
}
