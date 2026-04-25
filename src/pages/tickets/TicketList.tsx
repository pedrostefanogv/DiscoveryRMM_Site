import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bookmark,
  Filter,
  Pencil,
  Plus,
  Save,
  Ticket as TicketIcon,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { getUserIdFromJwt } from '@/auth/jwt';
import { useTickets, useCreateTicket } from '@/hooks/useTickets';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useAgentsBySite } from '@/hooks/useAgents';
import { useWorkflowStates } from '@/hooks/useWorkflow';
import { useDepartments } from '@/hooks/useDepartments';
import { useWorkflowProfilesByDepartment } from '@/hooks/useWorkflowProfiles';
import { useTicketKpi } from '@/hooks/useTicketKpi';
import {
  useCreateTicketSavedView,
  useDeleteTicketSavedView,
  useTicketSavedViews,
  useUpdateTicketSavedView,
} from '@/hooks/useTicketSavedViews';
import { Button, Card, DataTable, Badge, Loading, Modal, Input, Select } from '@/components/ui';
import type {
  CreateTicketRequest,
  Ticket,
  TicketPriority,
  TicketSavedView,
  TicketSavedViewFilter,
} from '@/api';
import type { Column } from '@/components/ui';
import toast from 'react-hot-toast';

const PRIORITY_META: Record<TicketPriority, { label: string; color: 'slate' | 'success' | 'warning' | 'danger' }> = {
  Low: { label: 'Baixa', color: 'slate' },
  Medium: { label: 'Media', color: 'success' },
  High: { label: 'Alta', color: 'warning' },
  Critical: { label: 'Critica', color: 'danger' },
};

const PRIORITY_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'Low', label: 'Baixa' },
  { value: 'Medium', label: 'Media' },
  { value: 'High', label: 'Alta' },
  { value: 'Critical', label: 'Critica' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'false', label: 'Abertos' },
  { value: 'true', label: 'Encerrados' },
];

type SavedViewFormState = {
  name: string;
  isShared: boolean;
};

function isTicketPriority(value: unknown): value is TicketPriority {
  return value === 'Low' || value === 'Medium' || value === 'High' || value === 'Critical';
}

function readFilterField(source: Record<string, unknown>, camelCase: string, pascalCase: string) {
  return source[camelCase] ?? source[pascalCase];
}

function parseSavedViewFilter(raw: string): TicketSavedViewFilter {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const priority = readFilterField(parsed, 'priority', 'Priority');
    const isClosed = readFilterField(parsed, 'isClosed', 'IsClosed');

    return {
      clientId:
        typeof readFilterField(parsed, 'clientId', 'ClientId') === 'string'
          ? String(readFilterField(parsed, 'clientId', 'ClientId'))
          : undefined,
      workflowStateId:
        typeof readFilterField(parsed, 'workflowStateId', 'WorkflowStateId') === 'string'
          ? String(readFilterField(parsed, 'workflowStateId', 'WorkflowStateId'))
          : undefined,
      priority: isTicketPriority(priority) ? priority : undefined,
      text:
        typeof readFilterField(parsed, 'text', 'Text') === 'string'
          ? String(readFilterField(parsed, 'text', 'Text'))
          : undefined,
      isClosed: typeof isClosed === 'boolean' ? isClosed : undefined,
    };
  } catch {
    return {};
  }
}

function formatSavedViewSummary(
  view: TicketSavedView,
  clientsById: Map<string, string>,
  statesById: Map<string, string>,
) {
  const filter = parseSavedViewFilter(view.filterJson);
  const parts: string[] = [];

  if (filter.clientId) {
    parts.push(clientsById.get(filter.clientId) ?? 'Cliente filtrado');
  }

  if (filter.workflowStateId) {
    parts.push(statesById.get(filter.workflowStateId) ?? 'Estado filtrado');
  }

  if (filter.priority) {
    parts.push(`Prioridade ${PRIORITY_META[filter.priority].label}`);
  }

  if (typeof filter.isClosed === 'boolean') {
    parts.push(filter.isClosed ? 'Encerrados' : 'Abertos');
  }

  if (filter.text) {
    parts.push(`Busca: ${filter.text}`);
  }

  return parts.length > 0 ? parts.join(' • ') : 'Sem filtros adicionais';
}

function suggestSavedViewName(
  clientName?: string,
  stateName?: string,
  priority?: TicketPriority | '',
) {
  const parts = [clientName, stateName, priority ? PRIORITY_META[priority].label : undefined].filter(Boolean);

  if (parts.length === 0) {
    return 'Minha visao';
  }

  return parts.join(' • ');
}

function KpiTile({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'success' | 'warning' | 'danger' | 'primary';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-green-300'
      : tone === 'warning'
        ? 'text-amber-300'
        : tone === 'danger'
          ? 'text-rose-300'
          : tone === 'primary'
            ? 'text-sky-300'
            : 'text-white';

  return (
    <Card>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
      </div>
    </Card>
  );
}

export default function TicketList() {
  const PAGE_SIZE = 50;
  const navigate = useNavigate();
  const { session } = useAuth();

  const [modalOpen, setModalOpen] = useState(false);
  const [savedViewModalOpen, setSavedViewModalOpen] = useState(false);
  const [editingSavedView, setEditingSavedView] = useState<TicketSavedView | null>(null);
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterPriority, setFilterPriority] = useState<TicketPriority | ''>('');
  const [filterStatus, setFilterStatus] = useState<'' | 'true' | 'false'>('');
  const [filterText, setFilterText] = useState('');
  const [page, setPage] = useState(1);
  const [savedViewForm, setSavedViewForm] = useState<SavedViewFormState>({
    name: 'Minha visao',
    isShared: false,
  });

  const currentUserId = useMemo(
    () => getUserIdFromJwt(session.accessToken),
    [session.accessToken],
  );

  const tickets = useTickets({
    clientId: filterClient || undefined,
    workflowStateId: filterState || undefined,
    priority: filterPriority || undefined,
    isClosed: filterStatus === '' ? undefined : filterStatus === 'true',
    text: filterText.trim() || undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const kpiQuery = useTicketKpi({ clientId: filterClient || undefined });
  const savedViewsQuery = useTicketSavedViews(currentUserId ?? undefined);
  const createSavedView = useCreateTicketSavedView();
  const updateSavedView = useUpdateTicketSavedView();
  const deleteSavedView = useDeleteTicketSavedView();
  const states = useWorkflowStates();
  const clients = useClients();

  const stateMap = useMemo(
    () => new Map((states.data ?? []).map((state) => [state.id, state])),
    [states.data],
  );
  const clientMap = useMemo(
    () => new Map((clients.data ?? []).map((client) => [client.id, client])),
    [clients.data],
  );
  const clientNameMap = useMemo(
    () => new Map((clients.data ?? []).map((client) => [client.id, client.name])),
    [clients.data],
  );
  const stateNameMap = useMemo(
    () => new Map((states.data ?? []).map((state) => [state.id, state.name])),
    [states.data],
  );

  const visibleTickets = tickets.data ?? [];
  const savedViews = useMemo(
    () =>
      [...(savedViewsQuery.data ?? [])].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [savedViewsQuery.data],
  );
  const kpi = kpiQuery.data;

  useEffect(() => {
    setPage(1);
  }, [filterClient, filterPriority, filterState, filterStatus, filterText]);

  const hasNextPage = visibleTickets.length === PAGE_SIZE;
  const hasPrevPage = page > 1;

  const clientOpts = [
    { value: '', label: 'Todos os clientes' },
    ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
  ];
  const stateOpts = [
    { value: '', label: 'Todos os estados' },
    ...(states.data ?? []).map((state) => ({ value: state.id, label: state.name })),
  ];

  const columns: Column<Ticket>[] = [
    {
      key: 'title',
      header: 'Titulo',
      render: (ticket) => (
        <div className="flex items-center gap-3">
          <TicketIcon className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{ticket.title}</p>
            <p className="truncate text-xs text-slate-500">{ticket.category ?? 'Sem categoria'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Prioridade',
      render: (ticket) => {
        const priority = PRIORITY_META[ticket.priority] ?? { label: ticket.priority, color: 'slate' as const };
        return <Badge color={priority.color}>{priority.label}</Badge>;
      },
    },
    {
      key: 'state',
      header: 'Estado',
      render: (ticket) => {
        const state = ticket.workflowStateId ? stateMap.get(ticket.workflowStateId) : null;
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
        ) : (
          <span className="text-slate-600">-</span>
        );
      },
    },
    {
      key: 'client',
      header: 'Cliente',
      render: (ticket) => (
        <span className="text-sm text-slate-300">
          {clientMap.get(ticket.clientId)?.name ?? '-'}
        </span>
      ),
    },
    {
      key: 'closedAt',
      header: 'Status',
      render: (ticket) =>
        ticket.closedAt ? <Badge color="slate">Encerrado</Badge> : <Badge color="success">Aberto</Badge>,
    },
    {
      key: 'createdAt',
      header: 'Criado em',
      render: (ticket) => (
        <span className="text-xs text-slate-400">
          {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
        </span>
      ),
    },
  ];

  const handleClearFilters = () => {
    setActiveSavedViewId(null);
    setFilterClient('');
    setFilterState('');
    setFilterPriority('');
    setFilterStatus('');
    setFilterText('');
  };

  const buildCurrentFilter = (): TicketSavedViewFilter => ({
    clientId: filterClient || undefined,
    workflowStateId: filterState || undefined,
    priority: filterPriority || undefined,
    isClosed: filterStatus === '' ? undefined : filterStatus === 'true',
    text: filterText.trim() || undefined,
  });

  const applySavedView = (view: TicketSavedView) => {
    const filter = parseSavedViewFilter(view.filterJson);
    setFilterClient(filter.clientId ?? '');
    setFilterState(filter.workflowStateId ?? '');
    setFilterPriority(filter.priority ?? '');
    setFilterStatus(
      typeof filter.isClosed === 'boolean'
        ? filter.isClosed
          ? 'true'
          : 'false'
        : '',
    );
    setFilterText(filter.text ?? '');
    setActiveSavedViewId(view.id);
    setPage(1);
    toast.success(`Visao aplicada: ${view.name}`);
  };

  const openCreateSavedViewModal = () => {
    if (!currentUserId) {
      toast.error('Nao foi possivel identificar o usuario autenticado.');
      return;
    }

    setEditingSavedView(null);
    setSavedViewForm({
      name: suggestSavedViewName(
        filterClient ? clientNameMap.get(filterClient) : undefined,
        filterState ? stateNameMap.get(filterState) : undefined,
        filterPriority,
      ),
      isShared: false,
    });
    setSavedViewModalOpen(true);
  };

  const openEditSavedViewModal = (view: TicketSavedView) => {
    applySavedView(view);
    setEditingSavedView(view);
    setSavedViewForm({ name: view.name, isShared: view.isShared });
    setSavedViewModalOpen(true);
  };

  const handleSaveSavedView = async () => {
    if (!savedViewForm.name.trim()) {
      toast.error('Informe um nome para a visao.');
      return;
    }

    try {
      if (editingSavedView) {
        await updateSavedView.mutateAsync({
          id: editingSavedView.id,
          data: {
            name: savedViewForm.name.trim(),
            isShared: savedViewForm.isShared,
            filter: buildCurrentFilter(),
          },
        });
        setActiveSavedViewId(editingSavedView.id);
        toast.success('Visao atualizada com sucesso.');
      } else {
        const created = await createSavedView.mutateAsync({
          name: savedViewForm.name.trim(),
          userId: currentUserId,
          isShared: savedViewForm.isShared,
          filter: buildCurrentFilter(),
        });
        setActiveSavedViewId(created.id);
        toast.success('Visao salva com sucesso.');
      }

      setSavedViewModalOpen(false);
      setEditingSavedView(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao foi possivel salvar a visao.');
    }
  };

  const handleDeleteSavedView = async (view: TicketSavedView) => {
    if (!window.confirm(`Excluir a visao "${view.name}"?`)) {
      return;
    }

    try {
      await deleteSavedView.mutateAsync(view.id);
      if (activeSavedViewId === view.id) {
        setActiveSavedViewId(null);
      }
      if (editingSavedView?.id === view.id) {
        setEditingSavedView(null);
        setSavedViewModalOpen(false);
      }
      toast.success('Visao removida com sucesso.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao foi possivel excluir a visao.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Chamados</h1>
          <p className="text-sm text-slate-400">
            {visibleTickets.length} chamados na pagina {page}
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Novo Chamado
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <KpiTile label="Abertos" value={String(kpi?.totalOpen ?? '--')} tone="primary" />
        <KpiTile label="Encerrados" value={String(kpi?.totalClosed ?? '--')} />
        <KpiTile label="SLA violado" value={String(kpi?.slaBreached ?? '--')} tone="danger" />
        <KpiTile label="SLA em alerta" value={String(kpi?.slaWarning ?? '--')} tone="warning" />
        <KpiTile label="Em espera" value={String(kpi?.onHold ?? '--')} tone="warning" />
        <KpiTile
          label="FRT"
          value={typeof kpi?.frtAchievementRate === 'number' ? `${kpi.frtAchievementRate.toFixed(1)}%` : '--'}
          tone="success"
        />
      </div>

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-slate-400" />
              <h2 className="text-lg font-semibold text-white">Visoes salvas</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Salve combinacoes de filtros da fila para reaplicar em um clique.
            </p>
          </div>
          <Button variant="secondary" onClick={openCreateSavedViewModal} disabled={!currentUserId}>
            <Save className="h-4 w-4" /> Salvar visao atual
          </Button>
        </div>

        {savedViewsQuery.isLoading ? (
          <div className="mt-4"><Loading /></div>
        ) : savedViewsQuery.isError ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <p className="text-sm text-slate-400">Nao foi possivel carregar as visoes salvas.</p>
            <Button size="sm" variant="ghost" onClick={() => savedViewsQuery.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : savedViews.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Nenhuma visao salva disponivel.</p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {savedViews.map((view) => {
              const canManage = !!currentUserId && view.userId === currentUserId;
              const isActive = activeSavedViewId === view.id;

              return (
                <div
                  key={view.id}
                  className={`rounded-xl border px-4 py-3 ${isActive ? 'border-primary/40 bg-primary/10' : 'border-white/10 bg-white/5'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-white">{view.name}</p>
                        <Badge color={view.isShared ? 'accent' : 'slate'}>
                          {view.isShared ? 'Compartilhada' : 'Privada'}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {formatSavedViewSummary(view, clientNameMap, stateNameMap)}
                      </p>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Atualizada em {new Date(view.updatedAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => applySavedView(view)}>
                        Aplicar
                      </Button>
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => openEditSavedViewModal(view)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => void handleDeleteSavedView(view)}
                            loading={deleteSavedView.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">Filtros</h2>
            <p className="text-sm text-slate-400">Os filtros abaixo tambem alimentam as visoes salvas.</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <Input
              label="Buscar"
              value={filterText}
              onChange={(event) => {
                setActiveSavedViewId(null);
                setFilterText(event.target.value);
              }}
              placeholder="Titulo, descricao ou termo livre"
            />
          </div>
          <Select
            label="Cliente"
            options={clientOpts}
            value={filterClient}
            onChange={(event) => {
              setActiveSavedViewId(null);
              setFilterClient(event.target.value);
            }}
          />
          <Select
            label="Estado"
            options={stateOpts}
            value={filterState}
            onChange={(event) => {
              setActiveSavedViewId(null);
              setFilterState(event.target.value);
            }}
          />
          <Select
            label="Prioridade"
            options={PRIORITY_OPTIONS}
            value={filterPriority}
            onChange={(event) => {
              setActiveSavedViewId(null);
              setFilterPriority(event.target.value as TicketPriority | '');
            }}
          />
          <Select
            label="Situacao"
            options={STATUS_OPTIONS}
            value={filterStatus}
            onChange={(event) => {
              setActiveSavedViewId(null);
              setFilterStatus(event.target.value as '' | 'true' | 'false');
            }}
          />
        </div>

        {(filterClient || filterState || filterPriority || filterStatus || filterText) && (
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Limpar filtros
            </Button>
          </div>
        )}
      </Card>

      <Card padding={false}>
        {tickets.isLoading ? (
          <Loading />
        ) : tickets.isError ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <AlertTriangle className="h-8 w-8 text-danger" />
            <p className="text-sm text-slate-400">Erro ao carregar chamados</p>
            <Button size="sm" variant="ghost" onClick={() => tickets.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : visibleTickets.length === 0 ? (
          <div className="py-12 text-center">
            <TicketIcon className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-slate-400">Nenhum chamado encontrado</p>
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              data={visibleTickets}
              keyExtractor={(ticket) => ticket.id}
              onRowClick={(ticket) => navigate(`/tickets/${ticket.id}`)}
            />
            <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-xs text-slate-400">
              <span>Mostrando ate {PAGE_SIZE} registros por pagina</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!hasPrevPage || tickets.isFetching}
                >
                  Anterior
                </Button>
                <span className="min-w-16 text-center">Pagina {page}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!hasNextPage || tickets.isFetching}
                >
                  Proxima
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <CreateTicketModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <Modal
        open={savedViewModalOpen}
        onClose={() => {
          setSavedViewModalOpen(false);
          setEditingSavedView(null);
        }}
        title={editingSavedView ? 'Editar visao salva' : 'Salvar visao atual'}
      >
        <div className="space-y-4">
          <Input
            label="Nome"
            value={savedViewForm.name}
            onChange={(event) =>
              setSavedViewForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder="Fila do suporte"
          />
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={savedViewForm.isShared}
              onChange={(event) =>
                setSavedViewForm((current) => ({
                  ...current,
                  isShared: event.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-white/20 bg-transparent"
            />
            <span>Compartilhar com outros usuarios</span>
          </label>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400">
            <div className="mb-2 flex items-center gap-2 text-slate-300">
              <BarChart3 className="h-4 w-4" />
              <span className="font-medium">Resumo dos filtros atuais</span>
            </div>
            <p>
              {formatSavedViewSummary(
                {
                  id: 'preview',
                  userId: currentUserId,
                  name: savedViewForm.name,
                  filterJson: JSON.stringify(buildCurrentFilter()),
                  isShared: savedViewForm.isShared,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                clientNameMap,
                stateNameMap,
              )}
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setSavedViewModalOpen(false);
                setEditingSavedView(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSaveSavedView()}
              loading={createSavedView.isPending || updateSavedView.isPending}
            >
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CreateTicketModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateTicket();
  const clients = useClients();

  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedDept, setSelectedDept] = useState('');

  const sites = useSites(selectedClient);
  const agents = useAgentsBySite(selectedSite);
  const departments = useDepartments({ clientId: selectedClient || undefined, includeGlobal: true });
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

  const set = <K extends keyof CreateTicketRequest>(key: K, value: CreateTicketRequest[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleClientChange = (id: string) => {
    setSelectedClient(id);
    setSelectedSite('');
    setSelectedDept('');
    setForm((current) => ({
      ...current,
      clientId: id,
      siteId: null,
      agentId: null,
      departmentId: null,
      workflowProfileId: null,
    }));
  };

  const handleSiteChange = (id: string) => {
    setSelectedSite(id);
    setForm((current) => ({ ...current, siteId: id || null, agentId: null }));
  };

  const handleDeptChange = (id: string) => {
    setSelectedDept(id);
    setForm((current) => ({ ...current, departmentId: id || null, workflowProfileId: null }));
  };

  const clientOpts = [{ value: '', label: 'Selecione...' }, ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name }))];
  const siteOpts = [{ value: '', label: 'Nenhum' }, ...(sites.data ?? []).map((site) => ({ value: site.id, label: site.name }))];
  const agentOpts = [{ value: '', label: 'Nenhum' }, ...(agents.data ?? []).map((agent) => ({ value: agent.id, label: agent.displayName ?? agent.hostname }))];
  const deptOpts = [{ value: '', label: 'Nenhum' }, ...(departments.data ?? []).map((department) => ({ value: department.id, label: department.name }))];
  const profileOpts = [{ value: '', label: 'Padrao do departamento' }, ...(profiles.data ?? []).map((profile) => ({ value: profile.id, label: profile.name }))];
  const priorityOpts = [
    { value: 'Low', label: 'Baixa' },
    { value: 'Medium', label: 'Media' },
    { value: 'High', label: 'Alta' },
    { value: 'Critical', label: 'Critica' },
  ];

  const valid = form.clientId && form.title.trim().length >= 3 && form.description.trim().length >= 3;

  const resetAndClose = () => {
    onClose();
    setSelectedClient('');
    setSelectedSite('');
    setSelectedDept('');
    setForm({
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
  };

  const handleSubmit = () => {
    if (!valid) return;

    create.mutate(form, {
      onSuccess: () => {
        toast.success('Chamado criado');
        resetAndClose();
      },
      onError: () => toast.error('Erro ao criar chamado'),
    });
  };

  return (
    <Modal open={open} onClose={resetAndClose} title="Novo Chamado" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <Select label="Cliente *" options={clientOpts} value={form.clientId} onChange={(event) => handleClientChange(event.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Site" options={siteOpts} value={form.siteId ?? ''} onChange={(event) => handleSiteChange(event.target.value)} disabled={!selectedClient} />
          <Select label="Agente" options={agentOpts} value={form.agentId ?? ''} onChange={(event) => set('agentId', event.target.value || null)} disabled={!selectedSite} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Departamento" options={deptOpts} value={selectedDept} onChange={(event) => handleDeptChange(event.target.value)} disabled={!selectedClient} />
          <Select label="Perfil de Workflow" options={profileOpts} value={form.workflowProfileId ?? ''} onChange={(event) => set('workflowProfileId', event.target.value || null)} disabled={!selectedDept} />
        </div>
        <Input label="Titulo *" value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="Min. 3 caracteres" />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Descricao *</label>
          <textarea
            className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            rows={4}
            placeholder="Descreva o chamado (min. 3 caracteres)"
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Prioridade" options={priorityOpts} value={form.priority} onChange={(event) => set('priority', event.target.value as TicketPriority)} />
          <Input label="Categoria" value={form.category ?? ''} onChange={(event) => set('category', event.target.value || null)} placeholder="Opcional, ate 100 chars" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={resetAndClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={create.isPending} disabled={!valid}>Criar Chamado</Button>
        </div>
      </div>
    </Modal>
  );
}
