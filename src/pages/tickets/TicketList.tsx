import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Filter,
  Pencil,
  Plus,
  Save,
  Ticket as TicketIcon,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { getUserIdFromJwt } from '@/auth/jwt';
import {
  useAddTicketWatcher,
  useCreateTicket,
  useTicket,
  useTicketWatchers,
  useTicketsPage,
  useUpdateTicket,
} from '@/hooks/useTickets';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useAgent, useAgentsBySite } from '@/hooks/useAgents';
import { useWorkflowStates } from '@/hooks/useWorkflow';
import { useDepartments } from '@/hooks/useDepartments';
import { useWorkflowProfilesByDepartment } from '@/hooks/useWorkflowProfiles';
import { useTicketKpi } from '@/hooks/useTicketKpi';
import { useDepartmentTicketSchema } from '@/hooks/useDepartmentCustomFields';
import { useIamUsers } from '@/hooks/useIdentity';
import {
  useCreateTicketSavedView,
  useDeleteTicketSavedView,
  useTicketSavedViews,
  useUpdateTicketSavedView,
} from '@/hooks/useTicketSavedViews';
import { Button, Card, DataTable, Badge, Loading, Modal, Input, Select, TextArea, Tooltip } from '@/components/ui';
import type {
  CreateTicketRequest,
  Ticket,
  TicketPriority,
  TicketSavedView,
  TicketSavedViewFilter,
  UserDto,
} from '@/api';
import { CustomFieldDataType, parseCustomFieldValue } from '@/api';
import type { TicketSchemaField } from '@/api';
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
  { value: 'true', label: 'Encerrados' },
  { value: 'false', label: 'Abertos' },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_STATUS_FILTER: '' | 'true' | 'false' = 'false';

type SavedViewFormState = {
  name: string;
  isShared: boolean;
};

type TicketContextMenuState = {
  ticket: Ticket;
  x: number;
  y: number;
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

function formatTicketPreviewDescription(value: string, maxLength = 180) {
  const normalized = value.trim();
  if (!normalized) return 'Sem descrição.';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function resolveUserDisplayName(usersById: Map<string, UserDto>, userId: string | null | undefined) {
  if (!userId) return 'Não atribuído';
  const user = usersById.get(userId);
  if (!user) return userId;
  return user.fullName || user.login || user.email || user.id;
}

function KpiTile({
  label,
  value,
  tone = 'slate',
  description,
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'success' | 'warning' | 'danger' | 'primary';
  description: string;
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
    <Tooltip
      className="block w-full"
      content={description}
      delay={1200}
      position="bottom"
      variant="hover-card"
    >
      <Card>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
        </div>
      </Card>
    </Tooltip>
  );
}

export default function TicketList() {
  const DEFAULT_PAGE_SIZE = 50;
  const navigate = useNavigate();
  const { session } = useAuth();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [savedViewModalOpen, setSavedViewModalOpen] = useState(false);
  const [editingSavedView, setEditingSavedView] = useState<TicketSavedView | null>(null);
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterPriority, setFilterPriority] = useState<TicketPriority | ''>('');
  const [filterStatus, setFilterStatus] = useState<'' | 'true' | 'false'>(DEFAULT_STATUS_FILTER);
  const [filterText, setFilterText] = useState('');
  const [advancedFiltersExpanded, setAdvancedFiltersExpanded] = useState(false);
  const [savedViewsExpanded, setSavedViewsExpanded] = useState(false);
  const [hoverPreviewTicketId, setHoverPreviewTicketId] = useState<string | null>(null);
  const [ticketContextMenu, setTicketContextMenu] = useState<TicketContextMenuState | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTargetTicket, setAssignTargetTicket] = useState<Ticket | null>(null);
  const [assignTargetUserId, setAssignTargetUserId] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined]);
  const [savedViewForm, setSavedViewForm] = useState<SavedViewFormState>({
    name: 'Minha visao',
    isShared: false,
  });

  const currentUserId = useMemo(
    () => getUserIdFromJwt(session.accessToken),
    [session.accessToken],
  );

  const cursor = pageCursors[page - 1];
  const tickets = useTicketsPage({
    clientId: filterClient || undefined,
    workflowStateId: filterState || undefined,
    priority: filterPriority || undefined,
    isClosed: filterStatus === '' ? undefined : filterStatus === 'true',
    text: filterText.trim() || undefined,
    cursor,
    limit: pageSize,
  });
  const hoverPreviewTicketQuery = useTicket(hoverPreviewTicketId ?? '');
  const hoverPreviewWatchersQuery = useTicketWatchers(hoverPreviewTicketId ?? '');
  const kpiQuery = useTicketKpi({ clientId: filterClient || undefined });
  const savedViewsQuery = useTicketSavedViews(currentUserId ?? undefined);
  const createSavedView = useCreateTicketSavedView();
  const updateSavedView = useUpdateTicketSavedView();
  const deleteSavedView = useDeleteTicketSavedView();
  const addTicketWatcher = useAddTicketWatcher();
  const updateTicket = useUpdateTicket();
  const states = useWorkflowStates();
  const clients = useClients();
  const iamUsersQuery = useIamUsers();

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

  const visibleTickets = tickets.data?.items ?? [];
  const hoverPreviewTicket = useMemo(() => {
    if (!hoverPreviewTicketId) return null;
    if (hoverPreviewTicketQuery.data) return hoverPreviewTicketQuery.data;
    return visibleTickets.find((ticket) => ticket.id === hoverPreviewTicketId) ?? null;
  }, [hoverPreviewTicketId, hoverPreviewTicketQuery.data, visibleTickets]);
  const hoverPreviewAgentQuery = useAgent(hoverPreviewTicket?.agentId ?? '');
  const savedViews = useMemo(
    () =>
      [...(savedViewsQuery.data ?? [])].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [savedViewsQuery.data],
  );
  const iamUsersById = useMemo(
    () => new Map<string, UserDto>((iamUsersQuery.data ?? []).map((user) => [user.id, user])),
    [iamUsersQuery.data],
  );
  const kpi = kpiQuery.data;

  useEffect(() => {
    resetPagination();
  }, [filterClient, filterPriority, filterState, filterStatus, filterText, pageSize]);

  useEffect(() => {
    if (activeSavedViewId) {
      setSavedViewsExpanded(true);
    }
  }, [activeSavedViewId]);

  useEffect(() => {
    if (filterClient || filterState) {
      setAdvancedFiltersExpanded(true);
    }
  }, [filterClient, filterState]);

  useEffect(() => {
    if (!hoverPreviewTicketId) return;
    const existsInCurrentPage = visibleTickets.some((ticket) => ticket.id === hoverPreviewTicketId);
    if (!existsInCurrentPage) {
      setHoverPreviewTicketId(null);
    }
  }, [hoverPreviewTicketId, visibleTickets]);

  useEffect(() => {
    if (!ticketContextMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && event.target instanceof Node && !contextMenuRef.current.contains(event.target)) {
        setTicketContextMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTicketContextMenu(null);
      }
    };

    const handleViewportChange = () => {
      setTicketContextMenu(null);
    };

    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [ticketContextMenu]);

  const hasNextPage = tickets.data?.hasMore ?? false;
  const hasPrevPage = page > 1;

  const goToNextPage = () => {
    if (!tickets.data?.nextCursor) return;
    setPageCursors((prev) => {
      const next = [...prev];
      next[page] = tickets.data!.nextCursor!;
      return next;
    });
    setPage((p) => p + 1);
  };

  const goToPrevPage = () => {
    setPage((p) => Math.max(1, p - 1));
  };

  const resetPagination = () => {
    setPage(1);
    setPageCursors([undefined]);
  };

  const advancedFiltersActiveCount = Number(Boolean(filterClient)) + Number(Boolean(filterState));
  const hasActiveFilters =
    Boolean(filterClient) ||
    Boolean(filterState) ||
    Boolean(filterPriority) ||
    Boolean(filterText) ||
    filterStatus !== DEFAULT_STATUS_FILTER;

  const clientOpts = [
    { value: '', label: 'Todos os clientes' },
    ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
  ];
  const stateOpts = [
    { value: '', label: 'Todos os estados' },
    ...(states.data ?? []).map((state) => ({ value: state.id, label: state.name })),
  ];
  const assignUserOptions = [
    {
      value: '',
      label: iamUsersQuery.isLoading ? 'Carregando usuarios...' : 'Selecione um usuario',
    },
    ...(iamUsersQuery.data ?? []).map((user) => ({
      value: user.id,
      label: user.fullName || user.login || user.email || user.id,
    })),
  ];

  const columns: Column<Ticket>[] = [
    {
      key: 'title',
      header: 'Título',
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

  const renderTicketHoverCard = (ticket: Ticket) => {
    const isPreviewTarget = hoverPreviewTicketId === ticket.id;
    const previewTicket = isPreviewTarget && hoverPreviewTicket ? hoverPreviewTicket : ticket;
    const assigneeLabel = resolveUserDisplayName(iamUsersById, previewTicket.assignedToUserId);
    const watcherItems = isPreviewTarget ? (hoverPreviewWatchersQuery.data ?? []) : [];
    const watcherNames = watcherItems.map((watcher) => resolveUserDisplayName(iamUsersById, watcher.userId));
    const watcherSummary = !isPreviewTarget || hoverPreviewWatchersQuery.isLoading
      ? 'Carregando watchers...'
      : hoverPreviewWatchersQuery.isError
        ? 'Erro ao carregar watchers.'
        : watcherNames.length === 0
          ? 'Nenhum watcher.'
          : `${watcherNames.slice(0, 3).join(', ')}${watcherNames.length > 3 ? ` +${watcherNames.length - 3}` : ''}`;
    const linkedMachineLabel = !previewTicket.agentId
      ? 'Sem máquina vinculada'
      : isPreviewTarget
        ? hoverPreviewAgentQuery.isLoading
          ? 'Carregando máquina...'
          : hoverPreviewAgentQuery.data?.displayName || hoverPreviewAgentQuery.data?.hostname || previewTicket.agentId
        : previewTicket.agentId;
    const stateLabel = previewTicket.workflowStateId
      ? stateMap.get(previewTicket.workflowStateId)?.name ?? 'Estado não mapeado'
      : 'Sem estado';
    const clientLabel = clientMap.get(previewTicket.clientId)?.name ?? '-';
    const detailsAreLoading = isPreviewTarget && (hoverPreviewTicketQuery.isLoading || iamUsersQuery.isLoading);

    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{previewTicket.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {formatTicketPreviewDescription(previewTicket.description)}
            </p>
          </div>
          {detailsAreLoading && <span className="text-[11px] text-slate-500">Carregando detalhes...</span>}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Responsável</p>
            <p className="mt-1 truncate text-sm text-slate-200">{assigneeLabel}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Watchers</p>
            <p className="mt-1 text-sm text-slate-200">{watcherSummary}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 sm:col-span-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Máquina vinculada</p>
            <p className="mt-1 truncate text-sm text-slate-200">{linkedMachineLabel}</p>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Estado: {stateLabel} • Cliente: {clientLabel} • Criado em {new Date(previewTicket.createdAt).toLocaleString('pt-BR')}
        </div>
      </div>
    );
  };

  const closeAssignModal = () => {
    setAssignModalOpen(false);
    setAssignTargetTicket(null);
    setAssignTargetUserId('');
  };

  const assignTicketToUser = async (ticket: Ticket, assignedToUserId: string | null, successMessage: string) => {
    await updateTicket.mutateAsync({
      id: ticket.id,
      data: {
        title: ticket.title,
        description: ticket.description,
        priority: ticket.priority,
        assignedToUserId,
        category: ticket.category,
      },
    });

    toast.success(successMessage);
  };

  const openTicketContextMenu = (event: React.MouseEvent<HTMLTableRowElement>, ticket: Ticket) => {
    event.preventDefault();
    event.stopPropagation();

    if (!pageRef.current) return;

    const rect = pageRef.current.getBoundingClientRect();
    const menuWidth = 248;
    const menuHeight = 164;
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;

    const x = Math.max(8, Math.min(rawX, rect.width - menuWidth - 8));
    const y = Math.max(8, Math.min(rawY, rect.height - menuHeight - 8));

    setTicketContextMenu({ ticket, x, y });
  };

  const handleContextMenuFollow = async () => {
    if (!ticketContextMenu) return;

    if (!currentUserId) {
      toast.error('Não foi possível identificar o usuário autenticado.');
      return;
    }

    try {
      await addTicketWatcher.mutateAsync({
        ticketId: ticketContextMenu.ticket.id,
        data: { userId: currentUserId },
      });
      toast.success('Você agora acompanha este chamado.');
      setTicketContextMenu(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível acompanhar o chamado.';
      const normalized = message.toLowerCase();

      if (normalized.includes('already') || normalized.includes('exists') || normalized.includes('já')) {
        toast('Você já acompanha este chamado.');
      } else {
        toast.error(message);
      }
    }
  };

  const handleContextMenuTakeOwnership = async () => {
    if (!ticketContextMenu) return;

    if (!currentUserId) {
      toast.error('Não foi possível identificar o usuário autenticado.');
      return;
    }

    if (ticketContextMenu.ticket.assignedToUserId === currentUserId) {
      toast('Você já é o responsável deste chamado.');
      setTicketContextMenu(null);
      return;
    }

    try {
      await assignTicketToUser(ticketContextMenu.ticket, currentUserId, 'Chamado assumido com sucesso.');
      setTicketContextMenu(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível assumir o chamado.');
    }
  };

  const handleContextMenuOpenAssign = () => {
    if (!ticketContextMenu) return;

    setAssignTargetTicket(ticketContextMenu.ticket);
    setAssignTargetUserId(ticketContextMenu.ticket.assignedToUserId ?? '');
    setAssignModalOpen(true);
    setTicketContextMenu(null);
  };

  const handleConfirmAssign = async () => {
    if (!assignTargetTicket) return;

    if (!assignTargetUserId) {
      toast.error('Selecione um usuário para atribuir o chamado.');
      return;
    }

    if (assignTargetTicket.assignedToUserId === assignTargetUserId) {
      toast('Este usuário já é o responsável deste chamado.');
      closeAssignModal();
      return;
    }

    try {
      await assignTicketToUser(assignTargetTicket, assignTargetUserId, 'Responsável atualizado com sucesso.');
      closeAssignModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível transferir a responsabilidade.');
    }
  };

  const handleClearFilters = () => {
    setActiveSavedViewId(null);
    setFilterClient('');
    setFilterState('');
    setFilterPriority('');
    setFilterStatus(DEFAULT_STATUS_FILTER);
    setFilterText('');
    setAdvancedFiltersExpanded(false);
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
        : DEFAULT_STATUS_FILTER,
    );
    setFilterText(filter.text ?? '');
    setActiveSavedViewId(view.id);
    setAdvancedFiltersExpanded(Boolean(filter.clientId || filter.workflowStateId));
    setPage(1);
    toast.success(`Visao aplicada: ${view.name}`);
  };

  const renderPaginationBar = (position: 'top' | 'bottom') => (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-slate-400 ${
        position === 'top' ? 'border-b border-white/5' : 'border-t border-white/5'
      }`}
    >
      <div className="flex items-center gap-3">
        <span>Mostrando ate {pageSize} chamados por pagina</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-slate-500">{pageSize} chamados/pagina</span>
        <label className="flex items-center gap-2">
          <span className="text-slate-500">Por pagina</span>
          <select
            value={String(pageSize)}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setHoverPreviewTicketId(null);
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="Quantidade de chamados por pagina"
          >
            {PAGE_SIZE_OPTIONS.map((value) => (
              <option
                key={value}
                value={value}
                className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
              >
                {value}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={goToPrevPage}
          disabled={!hasPrevPage || tickets.isFetching}
        >
          Anterior
        </Button>
        <span className="min-w-16 text-center">Pagina {page}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={goToNextPage}
          disabled={!hasNextPage || tickets.isFetching}
        >
          Proxima
        </Button>
      </div>
    </div>
  );

  const openCreateSavedViewModal = () => {
    if (!currentUserId) {
      toast.error('Não foi possível identificar o usuário autenticado.');
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
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a visão.');
     }
   };

   const handleDeleteSavedView = async (view: TicketSavedView) => {
     if (!window.confirm(`Excluir a visão "${view.name}"?`)) {
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
       toast.success('Visão removida com sucesso.');
     } catch (error) {
       toast.error(error instanceof Error ? error.message : 'Não foi possível excluir a visão.');
    }
  };

  return (
    <div ref={pageRef} className="relative space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Chamados</h1>
          <p className="text-sm text-slate-400">
            {visibleTickets.length} chamados na página {page}
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Novo Chamado
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <KpiTile
          label="Abertos"
          value={String(kpi?.totalOpen ?? '--')}
          tone="primary"
          description="Quantidade de chamados abertos no momento, considerando os filtros aplicados."
        />
        <KpiTile
          label="Encerrados"
          value={String(kpi?.totalClosed ?? '--')}
          description="Quantidade de chamados encerrados no recorte atual de filtros."
        />
        <KpiTile
          label="SLA violado"
          value={String(kpi?.slaBreached ?? '--')}
          tone="danger"
          description="Chamados que ultrapassaram o prazo definido em SLA."
        />
        <KpiTile
          label="SLA em alerta"
          value={String(kpi?.slaWarning ?? '--')}
          tone="warning"
          description="Chamados proximos de violar o SLA, exigindo atencao rapida."
        />
        <KpiTile
          label="Em espera"
          value={String(kpi?.onHold ?? '--')}
          tone="warning"
          description="Chamados em espera de retorno, aprovacao ou alguma dependencia externa."
        />
        <KpiTile
          label="FRT"
          value={typeof kpi?.frtAchievementRate === 'number' ? `${kpi.frtAchievementRate.toFixed(1)}%` : '--'}
          tone="success"
          description="First Response Time: percentual de chamados com primeira resposta dentro do SLA."
        />
      </div>

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <h2 className="text-lg font-semibold text-white">Filtros e visões salvas</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Ajuste a fila com os filtros abaixo e salve combinações para reaplicar em um clique.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={openCreateSavedViewModal} disabled={!currentUserId}>
              <Save className="h-4 w-4" /> Salvar visao atual
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSavedViewsExpanded((current) => !current)}
              disabled={savedViewsQuery.isLoading || savedViews.length === 0}
              aria-expanded={savedViewsExpanded}
            >
              <Bookmark className="h-4 w-4" />
              {savedViewsExpanded ? 'Ocultar visoes salvas' : `Ver visoes salvas (${savedViews.length})`}
              {savedViewsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <Input
              label="Buscar"
              value={filterText}
              onChange={(event) => {
                setActiveSavedViewId(null);
                setFilterText(event.target.value);
              }}
              placeholder="Título, descrição ou termo livre"
            />
          </div>
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
            label="Situação"
            options={STATUS_OPTIONS}
            value={filterStatus}
            onChange={(event) => {
              setActiveSavedViewId(null);
              setFilterStatus(event.target.value as '' | 'true' | 'false');
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdvancedFiltersExpanded((current) => !current)}
            aria-expanded={advancedFiltersExpanded}
          >
            <Filter className="h-4 w-4" />
            Filtros avançados
            {advancedFiltersActiveCount > 0 && <Badge color="accent">{advancedFiltersActiveCount}</Badge>}
            {advancedFiltersExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {advancedFiltersActiveCount > 0 && !advancedFiltersExpanded && (
            <span className="text-xs text-slate-500">Cliente e/ou estado filtrados.</span>
          )}
        </div>

        {advancedFiltersExpanded && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
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
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Limpar filtros
            </Button>
          )}

          {!savedViewsQuery.isLoading && !savedViewsQuery.isError && savedViews.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma visão salva disponível.</p>
          )}
        </div>

        {savedViewsQuery.isLoading ? (
          <div className="mt-4"><Loading /></div>
        ) : savedViewsQuery.isError ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <p className="text-sm text-slate-400">Não foi possível carregar as visões salvas.</p>
            <Button size="sm" variant="ghost" onClick={() => savedViewsQuery.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : savedViewsExpanded && savedViews.length > 0 ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-white">Visões salvas</h3>
              </div>
              <Badge color="slate">{savedViews.length}</Badge>
            </div>

            <div className="grid max-h-80 gap-3 overflow-y-auto pr-1 lg:grid-cols-2">
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
          </div>
        ) : null}
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
            {renderPaginationBar('top')}
            <DataTable
              columns={columns}
              data={visibleTickets}
              keyExtractor={(ticket) => ticket.id}
              onRowClick={(ticket) => navigate(`/tickets/${ticket.id}`)}
              onRowContextMenu={openTicketContextMenu}
              rowHoverDelayMs={1260}
              rowHoverCard={renderTicketHoverCard}
              onRowHoverCardChange={(ticket) => setHoverPreviewTicketId(ticket?.id ?? null)}
              showPagination={false}
            />
            {renderPaginationBar('bottom')}
          </>
        )}
      </Card>

      {ticketContextMenu && (
        <div
          ref={contextMenuRef}
          className="absolute z-[80] w-64 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 p-1 shadow-2xl backdrop-blur"
          style={{ top: ticketContextMenu.y, left: ticketContextMenu.x }}
          role="menu"
          aria-label={`Acoes do chamado ${ticketContextMenu.ticket.title}`}
        >
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void handleContextMenuFollow()}
            disabled={addTicketWatcher.isPending || !currentUserId}
            role="menuitem"
          >
            <span>Acompanhar</span>
            <span className="text-xs text-slate-500">watcher</span>
          </button>
          <button
            type="button"
            className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void handleContextMenuTakeOwnership()}
            disabled={updateTicket.isPending || !currentUserId}
            role="menuitem"
          >
            <span>Assumir</span>
            <span className="text-xs text-slate-500">atribuicao rapida</span>
          </button>
          <button
            type="button"
            className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleContextMenuOpenAssign}
            disabled={updateTicket.isPending || iamUsersQuery.isLoading || (iamUsersQuery.data?.length ?? 0) === 0}
            role="menuitem"
          >
            <span>Transferir / Atribuir</span>
            <span className="text-xs text-slate-500">selecionar usuario</span>
          </button>
        </div>
      )}

      <CreateTicketModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <Modal open={assignModalOpen} onClose={closeAssignModal} title="Transferir / Atribuir chamado">
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Chamado selecionado</p>
            <p className="mt-1 truncate text-sm text-slate-200">{assignTargetTicket?.title ?? '-'}</p>
          </div>

          <Select
            label="Novo responsável"
            options={assignUserOptions}
            value={assignTargetUserId}
            onChange={(event) => setAssignTargetUserId(event.target.value)}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={closeAssignModal}>
              Cancelar
            </Button>
            <Button
              onClick={() => void handleConfirmAssign()}
              loading={updateTicket.isPending}
              disabled={iamUsersQuery.isLoading || (iamUsersQuery.data?.length ?? 0) === 0}
            >
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>

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

  // Ticket schema (dynamic fields) for the selected department
  const schemaQuery = useDepartmentTicketSchema(selectedDept || null, !!selectedDept);
  const schemaFields = useMemo(() => {
    if (!schemaQuery.data) return [];
    return schemaQuery.data.filter((f) => f.isActive).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [schemaQuery.data]);

  const [customFieldDrafts, setCustomFieldDrafts] = useState<Record<string, string>>({});

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

  const clearCustomFields = () => setCustomFieldDrafts({});

  const handleClientChange = (id: string) => {
    setSelectedClient(id);
    setSelectedSite('');
    setSelectedDept('');
    clearCustomFields();
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
    clearCustomFields();
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
    clearCustomFields();
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

    // Build customFieldValues from schema drafts
    const customFieldValues: Record<string, unknown> = {};
    for (const field of schemaFields) {
      const draftValue = customFieldDrafts[field.definitionId] ?? '';
      customFieldValues[field.definitionId] = parseCustomFieldValue(field.dataType, draftValue);
    }

    const payload: CreateTicketRequest = {
      ...form,
      ...(Object.keys(customFieldValues).length > 0 ? { customFieldValues } : {}),
    };

    create.mutate(payload, {
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
        <Input label="Título *" value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="Min. 3 caracteres" />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">Descrição *</label>
          <textarea
            className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            rows={4}
            placeholder="Descreva o chamado (min. 3 caracteres)"
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </div>

        {/* Dynamic custom fields from department schema */}
        {schemaFields.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-medium text-slate-400 mb-3">
              Campos do Departamento
            </p>
            <div className="space-y-3">
              {schemaFields.map((field) => (
                <TicketSchemaFieldInput
                  key={field.definitionId}
                  field={field}
                  value={customFieldDrafts[field.definitionId] ?? ''}
                  onChange={(value) =>
                    setCustomFieldDrafts((prev) => ({ ...prev, [field.definitionId]: value }))
                  }
                />
              ))}
            </div>
          </div>
        )}

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

/** Renders a single dynamic schema field in the ticket creation form */
function TicketSchemaFieldInput({
  field,
  value,
  onChange,
}: {
  field: TicketSchemaField;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = `${field.label}${field.isRequired ? ' *' : ''}`;
  const hint = field.validationRegex ? `Formato: ${field.validationRegex}` : undefined;

  switch (field.dataType) {
    case CustomFieldDataType.Boolean:
      return (
        <Select
          label={label}
          value={value}
          options={[
            { value: '', label: 'Selecione...' },
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' },
          ]}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case CustomFieldDataType.Dropdown:
      return (
        <Select
          label={label}
          value={value}
          options={[
            { value: '', label: 'Selecione...' },
            ...field.options.map((opt) => ({ value: opt, label: opt })),
          ]}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case CustomFieldDataType.ListBox:
      return (
        <TextArea
          label={label}
          rows={2}
          value={value}
          hint={field.options.length > 0 ? `Opções: ${field.options.join(', ')}` : 'Valores separados por vírgula'}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case CustomFieldDataType.Integer:
      return <Input label={label} type="number" step="1" value={value} onChange={(e) => onChange(e.target.value)} hint={hint} />;
    case CustomFieldDataType.Decimal:
      return <Input label={label} type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} hint={hint} />;
    case CustomFieldDataType.Date:
      return <Input label={label} type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
    case CustomFieldDataType.DateTime:
      return <Input label={label} type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <Input label={label} value={value} onChange={(e) => onChange(e.target.value)} hint={hint} placeholder={field.description ?? undefined} />;
  }
}
