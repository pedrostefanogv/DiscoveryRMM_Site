import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Ticket as TicketIcon } from 'lucide-react';
import { useTickets, useCreateTicket } from '@/hooks/useTickets';
import { useClients } from '@/hooks/useClients';
import { useWorkflowStates } from '@/hooks/useWorkflow';
import { Button, Card, DataTable, Badge, Loading, ErrorDisplay, Modal, Input, TextArea, Select } from '@/components/ui';
import type { Ticket, CreateTicketRequest, TicketPriority } from '@/api';
import type { Column } from '@/components/ui';
import toast from 'react-hot-toast';

const priorityLabels: Record<number, { label: string; color: 'slate' | 'success' | 'warning' | 'danger' }> = {
  0: { label: 'Baixa', color: 'slate' },
  1: { label: 'Média', color: 'success' },
  2: { label: 'Alta', color: 'warning' },
  3: { label: 'Crítica', color: 'danger' },
};

export default function TicketList() {
  const [modalOpen, setModalOpen] = useState(false);
  const tickets = useTickets({ limit: 100 });
  const states = useWorkflowStates();
  const navigate = useNavigate();

  const stateMap = new Map((states.data ?? []).map(s => [s.id, s]));

  const columns: Column<Ticket>[] = [
    {
      key: 'title',
      header: 'Título',
      render: t => (
        <div className="flex items-center gap-3">
          <TicketIcon className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{t.title}</p>
            <p className="truncate text-xs text-slate-500">{t.category ?? 'Sem categoria'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Prioridade',
      render: t => {
        const p = priorityLabels[t.priority] ?? { label: '?', color: 'slate' as const };
        return <Badge color={p.color}>{p.label}</Badge>;
      },
    },
    {
      key: 'state',
      header: 'Estado',
      render: t => {
        const state = t.workflowStateId ? stateMap.get(t.workflowStateId) : null;
        return state ? (
          <Badge color="accent">
            <span className="flex items-center gap-1.5">
              {state.color && (
                <svg className="h-2 w-2" viewBox="0 0 8 8" aria-hidden="true">
                  <circle cx="4" cy="4" r="4" fill={state.color} />
                </svg>
              )}
              {state.name}
            </span>
          </Badge>
        ) : <span className="text-slate-600">—</span>;
      },
    },
    {
      key: 'assignedTo',
      header: 'Responsável',
      render: t => <span className="text-slate-400">{t.assignedTo ?? '—'}</span>,
    },
    {
      key: 'createdAt',
      header: 'Criado em',
      render: t => (
        <span className="text-xs text-slate-400">
          {new Date(t.createdAt).toLocaleDateString('pt-BR')}
        </span>
      ),
    },
  ];

  if (tickets.isLoading) return <Loading />;
  if (tickets.isError) return <ErrorDisplay onRetry={() => tickets.refetch()} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Chamados</h1>
          <p className="text-sm text-slate-400">{tickets.data?.length ?? 0} chamados</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Novo Chamado
        </Button>
      </div>

      <Card padding={false}>
        <DataTable
          columns={columns}
          data={tickets.data ?? []}
          keyExtractor={t => t.id}
          onRowClick={t => navigate(`/tickets/${t.id}`)}
        />
      </Card>

      <CreateTicketModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function CreateTicketModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateTicket();
  const clients = useClients();
  const [form, setForm] = useState<CreateTicketRequest>({
    clientId: '',
    siteId: null,
    agentId: null,
    title: '',
    description: '',
    priority: 1 as TicketPriority,
    category: null,
  });

  const clientOptions = [
    { value: '', label: 'Selecione...' },
    ...(clients.data ?? []).map(c => ({ value: c.id, label: c.name })),
  ];

  const priorityOptions = [
    { value: '0', label: 'Baixa' },
    { value: '1', label: 'Média' },
    { value: '2', label: 'Alta' },
    { value: '3', label: 'Crítica' },
  ];

  const handleSubmit = () => {
    if (!form.clientId || !form.title.trim()) return;
    create.mutate(form, {
      onSuccess: () => {
        toast.success('Chamado criado');
        onClose();
      },
      onError: () => toast.error('Erro ao criar chamado'),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo Chamado" maxWidth="max-w-xl">
      <div className="space-y-4">
        <Select label="Cliente" options={clientOptions} value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} />
        <Input label="Título" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        <TextArea label="Descrição" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Prioridade"
            options={priorityOptions}
            value={String(form.priority)}
            onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) as TicketPriority }))}
          />
          <Input label="Categoria" value={form.category ?? ''} onChange={e => setForm(f => ({ ...f, category: e.target.value || null }))} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={create.isPending}>Criar Chamado</Button>
        </div>
      </div>
    </Modal>
  );
}
