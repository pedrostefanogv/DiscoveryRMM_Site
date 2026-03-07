import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Ticket as TicketIcon, Filter, AlertTriangle } from 'lucide-react';
import { useTickets, useCreateTicket } from '@/hooks/useTickets';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useAgentsBySite } from '@/hooks/useAgents';
import { useWorkflowStates } from '@/hooks/useWorkflow';
import { useDepartments } from '@/hooks/useDepartments';
import { useWorkflowProfilesByDepartment } from '@/hooks/useWorkflowProfiles';
import { Button, Card, DataTable, Badge, Loading, Modal, Input, Select } from '@/components/ui';
import type { Ticket, CreateTicketRequest, TicketPriority } from '@/api';
import type { Column } from '@/components/ui';
import toast from 'react-hot-toast';

const PRIORITY_META: Record<TicketPriority, { label: string; color: 'slate' | 'success' | 'warning' | 'danger' }> = {
  Low:      { label: 'Baixa',    color: 'slate'   },
  Medium:   { label: 'Média',    color: 'success' },
  High:     { label: 'Alta',     color: 'warning' },
  Critical: { label: 'Crítica',  color: 'danger'  },
};

const PRIORITY_OPTIONS = [
  { value: '',         label: 'Todas' },
  { value: 'Low',      label: 'Baixa' },
  { value: 'Medium',   label: 'Média' },
  { value: 'High',     label: 'Alta' },
  { value: 'Critical', label: 'Crítica' },
];

export default function TicketList() {
  const [modalOpen, setModalOpen]       = useState(false);
  const [filterClient, setFilterClient] = useState('');
  const [filterState, setFilterState]   = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const tickets = useTickets({ workflowStateId: filterState || undefined, limit: 200 });
  const states  = useWorkflowStates();
  const clients = useClients();
  const navigate = useNavigate();

  const stateMap  = new Map((states.data  ?? []).map(s => [s.id, s]));
  const clientMap = new Map((clients.data ?? []).map(c => [c.id, c]));

  const filtered = useMemo(() => {
    let data = tickets.data ?? [];
    if (filterClient)   data = data.filter(t => t.clientId === filterClient);
    if (filterPriority) data = data.filter(t => t.priority === filterPriority);
    return data;
  }, [tickets.data, filterClient, filterPriority]);

  const clientOpts = [
    { value: '', label: 'Todos os clientes' },
    ...(clients.data ?? []).map(c => ({ value: c.id, label: c.name })),
  ];
  const stateOpts = [
    { value: '', label: 'Todos os estados' },
    ...(states.data ?? []).map(s => ({ value: s.id, label: s.name })),
  ];

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
        const p = PRIORITY_META[t.priority] ?? { label: t.priority, color: 'slate' as const };
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
      key: 'client',
      header: 'Cliente',
      render: t => (
        <span className="text-slate-300 text-sm">
          {clientMap.get(t.clientId)?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'closedAt',
      header: 'Status',
      render: t => t.closedAt
        ? <Badge color="slate">Encerrado</Badge>
        : <Badge color="success">Aberto</Badge>,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Chamados</h1>
          <p className="text-sm text-slate-400">{filtered.length} chamados</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Novo Chamado
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Filter className="h-4 w-4 text-slate-400 mb-2 shrink-0" />
          <div className="flex-1 min-w-[180px]">
            <Select label="Cliente" options={clientOpts} value={filterClient} onChange={e => setFilterClient(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <Select label="Estado" options={stateOpts} value={filterState} onChange={e => setFilterState(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[140px]">
            <Select label="Prioridade" options={PRIORITY_OPTIONS} value={filterPriority} onChange={e => setFilterPriority(e.target.value)} />
          </div>
          {(filterClient || filterState || filterPriority) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterClient(''); setFilterState(''); setFilterPriority(''); }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </Card>

      <Card padding={false}>
        {tickets.isLoading ? (
          <Loading />
        ) : tickets.isError ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <AlertTriangle className="h-8 w-8 text-danger" />
            <p className="text-sm text-slate-400">Erro ao carregar chamados</p>
            <Button size="sm" variant="ghost" onClick={() => tickets.refetch()}>Tentar novamente</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <TicketIcon className="mx-auto h-10 w-10 text-slate-600 mb-3" />
            <p className="text-slate-400">Nenhum chamado encontrado</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            keyExtractor={t => t.id}
            onRowClick={t => navigate(`/tickets/${t.id}`)}
          />
        )}
      </Card>

      <CreateTicketModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function CreateTicketModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create  = useCreateTicket();
  const clients = useClients();

  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSite, setSelectedSite]     = useState('');
  const [selectedDept, setSelectedDept]     = useState('');

  const sites   = useSites(selectedClient);
  const agents  = useAgentsBySite(selectedSite);
  const depts   = useDepartments({ clientId: selectedClient || undefined, includeGlobal: true });
  const profiles = useWorkflowProfilesByDepartment(selectedDept);

  const [form, setForm] = useState<CreateTicketRequest>({
    clientId: '',
    siteId: null,
    agentId: null,
    departmentId: null,
    workflowProfileId: null,
    title: '',
    description: '',
    priority: 'Medium',
    category: null,
    assignedToUserId: null,
  });

  const set = <K extends keyof CreateTicketRequest>(k: K, v: CreateTicketRequest[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleClientChange = (id: string) => {
    setSelectedClient(id);
    setSelectedSite('');
    setSelectedDept('');
    setForm(f => ({ ...f, clientId: id, siteId: null, agentId: null, departmentId: null, workflowProfileId: null }));
  };

  const handleSiteChange = (id: string) => {
    setSelectedSite(id);
    setForm(f => ({ ...f, siteId: id || null, agentId: null }));
  };

  const handleDeptChange = (id: string) => {
    setSelectedDept(id);
    setForm(f => ({ ...f, departmentId: id || null, workflowProfileId: null }));
  };

  const clientOpts  = [{ value: '', label: 'Selecione...' }, ...(clients.data ?? []).map(c => ({ value: c.id, label: c.name }))];
  const siteOpts    = [{ value: '', label: 'Nenhum' }, ...(sites.data ?? []).map(s => ({ value: s.id, label: s.name }))];
  const agentOpts   = [{ value: '', label: 'Nenhum' }, ...(agents.data ?? []).map(a => ({ value: a.id, label: a.displayName ?? a.hostname }))];
  const deptOpts    = [{ value: '', label: 'Nenhum' }, ...(depts.data ?? []).map(d => ({ value: d.id, label: d.name }))];
  const profileOpts = [{ value: '', label: 'Padrão do departamento' }, ...(profiles.data ?? []).map(p => ({ value: p.id, label: p.name }))];
  const priorityOpts = [
    { value: 'Low',      label: 'Baixa' },
    { value: 'Medium',   label: 'Média' },
    { value: 'High',     label: 'Alta' },
    { value: 'Critical', label: 'Crítica' },
  ];

  const valid = form.clientId && form.title.trim().length >= 3 && form.description.trim().length >= 3;

  const resetAndClose = () => {
    onClose();
    setSelectedClient(''); setSelectedSite(''); setSelectedDept('');
    setForm({ clientId: '', siteId: null, agentId: null, departmentId: null, workflowProfileId: null, title: '', description: '', priority: 'Medium', category: null, assignedToUserId: null });
  };

  const handleSubmit = () => {
    if (!valid) return;
    create.mutate(form, {
      onSuccess: () => { toast.success('Chamado criado'); resetAndClose(); },
      onError:   () => toast.error('Erro ao criar chamado'),
    });
  };

  return (
    <Modal open={open} onClose={resetAndClose} title="Novo Chamado" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <Select label="Cliente *" options={clientOpts} value={form.clientId} onChange={e => handleClientChange(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Site" options={siteOpts} value={form.siteId ?? ''} onChange={e => handleSiteChange(e.target.value)} disabled={!selectedClient} />
          <Select label="Agente" options={agentOpts} value={form.agentId ?? ''} onChange={e => set('agentId', e.target.value || null)} disabled={!selectedSite} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Departamento" options={deptOpts} value={selectedDept} onChange={e => handleDeptChange(e.target.value)} disabled={!selectedClient} />
          <Select label="Perfil de Workflow" options={profileOpts} value={form.workflowProfileId ?? ''} onChange={e => set('workflowProfileId', e.target.value || null)} disabled={!selectedDept} />
        </div>
        <Input label="Título *" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Mín. 3 caracteres" />
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Descrição *</label>
          <textarea
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            rows={4}
            placeholder="Descreva o chamado (mín. 3 caracteres)"
            value={form.description}
            onChange={e => set('description', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Prioridade" options={priorityOpts} value={form.priority} onChange={e => set('priority', e.target.value as TicketPriority)} />
          <Input label="Categoria" value={form.category ?? ''} onChange={e => set('category', e.target.value || null)} placeholder="Opcional, até 100 chars" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={resetAndClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={create.isPending} disabled={!valid}>Criar Chamado</Button>
        </div>
      </div>
    </Modal>
  );
}
