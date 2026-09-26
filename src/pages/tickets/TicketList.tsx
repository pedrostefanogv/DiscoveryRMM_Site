import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Bookmark,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CircleDot,
  CircleUserRound,
  Clock,
  Filter,
  Monitor,
  Pencil,
  Plus,
  Save,
  Tag,
  Ticket as TicketIcon,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { getUserIdFromJwt } from '@/auth/jwt';
import {
  useAddTicketWatcher,
  useCreateTicket,
  useTicket,
  useTicketWatchers,
  useTickets,
  useUpdateTicket,
} from '@/hooks/useTickets';
import { useClients } from '@/hooks/useClients';
import { useSites } from '@/hooks/useSites';
import { useAgent, useAgentsBySite } from '@/hooks/useAgents';
import { useWorkflowStates } from '@/hooks/useWorkflow';
import { useDepartments } from '@/hooks/useDepartments';
import { useTicketKpi } from '@/hooks/useTicketKpi';
import { useTicketTemplates } from '@/hooks/useSupportProductivity';
import { useDepartmentTicketSchema } from '@/hooks/useDepartmentCustomFields';
import { useIamUsers } from '@/hooks/useIdentity';
import {
  useCreateTicketSavedView,
  useDeleteTicketSavedView,
  useTicketSavedViews,
  useUpdateTicketSavedView,
} from '@/hooks/useTicketSavedViews';
import { Button, Card, ConfirmDialog, DataTable, Badge, Loading, Modal, Input, Select, Tooltip } from '@/components/ui';
import { TicketAnswerMatch } from '@/api';
import type {
  CreateTicketRequest,
  Ticket,
  TicketPriority,
  TicketSavedView,
  TicketSavedViewFilter,
  UserDto,
} from '@/api';
import type { Column } from '@/components/ui';
import toast from 'react-hot-toast';
import { TICKET_PRIORITY_META, getTicketPriorityMeta } from '@/utils/labels';
import { buildTicketCustomFieldValidation } from '@/utils/ticketCustomFields';
import { templateDefaultsToDrafts } from '@/utils/ticketTemplateDefaults';
import { parseTemplateQuestions, questionToSchemaField } from '@/utils/templateQuestions';
import { selectableTemplates } from '@/utils/ticketTemplateSelection';
import { buildCreateTicketPayload } from '@/utils/ticketCreatePayload';
import { TicketSchemaFieldInput } from '@/components/tickets/TicketSchemaFieldInput';
import { TicketAnswerSemanticSearchPanel } from '@/components/tickets/TicketAnswerSemanticSearchPanel';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const PRIORITY_OPTIONS = [
  { value: '', label: 'Todas' },
  ...(['Low', 'Medium', 'High', 'Critical'] as TicketPriority[]).map((priority) => ({
    value: priority,
    label: TICKET_PRIORITY_META[priority].label,
  })),
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

// Paginação por cursor em um único estado: page e cursors mudam juntos, então
// não há render intermediário com filtro novo + cursor antigo (race), nem
// duplo-avanço por closures desatualizadas.
type PaginationState = { page: number; cursors: Array<string | undefined> };
type PaginationAction =
  | { type: 'reset' }
  | { type: 'next'; cursor: string; fromPage: number }
  | { type: 'prev' };

function paginationReducer(state: PaginationState, action: PaginationAction): PaginationState {
  switch (action.type) {
    case 'reset':
      return { page: 1, cursors: [undefined] };
    case 'next': {
      // Ignora um segundo "next" disparado antes do re-render (duplo clique):
      // evita gravar o mesmo cursor em duas posições e pular página.
      if (action.fromPage !== state.page) return state;
      const cursors = [...state.cursors];
      cursors[state.page] = action.cursor;
      return { page: state.page + 1, cursors };
    }
    case 'prev':
      return { ...state, page: Math.max(1, state.page - 1) };
  }
}

function isTicketPriority(value: unknown): value is TicketPriority {
  return value === 'Low' || value === 'Medium' || value === 'High' || value === 'Critical';
}

function readFilterField(source: Record<string, unknown>, camelCase: string, pascalCase: string) {
  return source[camelCase] ?? source[pascalCase];
}

function readStringField(source: Record<string, unknown>, camelCase: string, pascalCase: string): string | undefined {
  const value = readFilterField(source, camelCase, pascalCase);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readBooleanField(source: Record<string, unknown>, camelCase: string, pascalCase: string): boolean | undefined {
  const value = readFilterField(source, camelCase, pascalCase);
  return typeof value === 'boolean' ? value : undefined;
}

function parseSavedViewFilter(raw: string): TicketSavedViewFilter {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const priority = readFilterField(parsed, 'priority', 'Priority');

    // Lê todos os campos de TicketsQuery (não só 5) para não descartar filtros
    // salvos por outras telas (site, agente, departamento, perfil, SLA etc.).
    return {
      clientId: readStringField(parsed, 'clientId', 'ClientId'),
      siteId: readStringField(parsed, 'siteId', 'SiteId'),
      workflowStateId: readStringField(parsed, 'workflowStateId', 'WorkflowStateId'),
      agentId: readStringField(parsed, 'agentId', 'AgentId'),
      departmentId: readStringField(parsed, 'departmentId', 'DepartmentId'),
      workflowProfileId: readStringField(parsed, 'workflowProfileId', 'WorkflowProfileId'),
      assignedToUserId: readStringField(parsed, 'assignedToUserId', 'AssignedToUserId'),
      priority: isTicketPriority(priority) ? priority : undefined,
      slaBreached: readBooleanField(parsed, 'slaBreached', 'SlaBreached'),
      isClosed: readBooleanField(parsed, 'isClosed', 'IsClosed'),
      text: readStringField(parsed, 'text', 'Text'),
      templateId: readStringField(parsed, 'templateId', 'TemplateId'),
      answerKey: readStringField(parsed, 'answerKey', 'AnswerKey'),
      answerValue: readStringField(parsed, 'answerValue', 'AnswerValue'),
      answerMatch:
        Number(parsed.answerMatch ?? parsed.AnswerMatch ?? 0) === TicketAnswerMatch.Contains
          ? TicketAnswerMatch.Contains
          : TicketAnswerMatch.Exact,
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
    parts.push(`Prioridade ${getTicketPriorityMeta(filter.priority).label}`);
  }

  if (typeof filter.isClosed === 'boolean') {
    parts.push(filter.isClosed ? 'Encerrados' : 'Abertos');
  }

  if (filter.text) {
    parts.push(`Busca: ${filter.text}`);
  }

  if (filter.templateId) {
    parts.push('Template selecionado');
  }

  if (filter.answerKey) {
    parts.push(
      filter.answerValue
        ? `Resposta ${filter.answerKey} ${filter.answerMatch === TicketAnswerMatch.Contains ? 'contém' : '='} ${filter.answerValue}`
        : `Com resposta em ${filter.answerKey}`,
    );
  }

  return parts.length > 0 ? parts.join(' · ') : 'Sem filtros adicionais';
}

function suggestSavedViewName(
  clientName?: string,
  stateName?: string,
  priority?: TicketPriority | '',
) {
  const parts = [clientName, stateName, priority ? getTicketPriorityMeta(priority).label : undefined].filter(Boolean);

  if (parts.length === 0) {
    return 'Minha visao';
  }

  return parts.join(' · ');
}

function formatTicketPreviewDescription(value: string | null | undefined, maxLength = 180) {
  const normalized = (value ?? '').trim();
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

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return 'agora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'agora';
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `há ${diffDays} d`;
  return date.toLocaleDateString('pt-BR');
}

function TicketHoverInfo({
  icon,
  label,
  value,
  dotColor,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  dotColor?: string | null;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-light px-3 py-2">
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground">
          {dotColor && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
              aria-hidden="true"
            />
          )}
          <span className="truncate">{value}</span>
        </p>
      </div>
    </div>
  );
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
            : 'text-foreground';

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
          <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
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
  const [filterTemplate, setFilterTemplate] = useState('');
  const [filterAnswerKey, setFilterAnswerKey] = useState('');
  const [filterAnswerValue, setFilterAnswerValue] = useState('');
  const [filterAnswerMatch, setFilterAnswerMatch] = useState<TicketAnswerMatch>(TicketAnswerMatch.Exact);
  // KPI agrega no servidor: usar valor adiado evita 1 request por tecla.
  const deferredFilterText = useDeferredValue(filterText);
  // As sugestões de resposta do questionário reaproveitam o termo do "Buscar".
  const debouncedFilterText = useDebouncedValue(filterText, 350);
  const [advancedFiltersExpanded, setAdvancedFiltersExpanded] = useState(false);
  const [savedViewsExpanded, setSavedViewsExpanded] = useState(false);
  const [hoverPreviewTicketId, setHoverPreviewTicketId] = useState<string | null>(null);
  const [ticketContextMenu, setTicketContextMenu] = useState<TicketContextMenuState | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTargetTicket, setAssignTargetTicket] = useState<Ticket | null>(null);
  const [assignTargetUserId, setAssignTargetUserId] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [{ page, cursors: pageCursors }, dispatchPagination] = useReducer(paginationReducer, {
    page: 1,
    cursors: [undefined],
  });
  const [savedViewForm, setSavedViewForm] = useState<SavedViewFormState>({
    name: 'Minha visao',
    isShared: false,
  });
  const [deletingSavedViewId, setDeletingSavedViewId] = useState<string | null>(null);
  const [deleteSavedViewTarget, setDeleteSavedViewTarget] = useState<TicketSavedView | null>(null);

  const currentUserId = useMemo(
    () => getUserIdFromJwt(session.accessToken),
    [session.accessToken],
  );

  const cursor = pageCursors[page - 1];
  const tickets = useTickets({
    clientId: filterClient || undefined,
    workflowStateId: filterState || undefined,
    priority: filterPriority || undefined,
    isClosed: filterStatus === '' ? undefined : filterStatus === 'true',
    text: filterText.trim() || undefined,
    templateId: filterTemplate || undefined,
    answerKey: filterAnswerKey || undefined,
    answerValue: filterAnswerValue.trim() || undefined,
    answerMatch: filterAnswerMatch,
    cursor,
    limit: pageSize,
  });
  const hoverPreviewTicketQuery = useTicket(hoverPreviewTicketId ?? '');
  const hoverPreviewWatchersQuery = useTicketWatchers(hoverPreviewTicketId ?? '');
  // KPI usa os mesmos filtros da lista (o backend é alinhado em paralelo).
  const kpiQuery = useTicketKpi({
    clientId: filterClient || undefined,
    workflowStateId: filterState || undefined,
    priority: filterPriority || undefined,
    isClosed: filterStatus === '' ? undefined : filterStatus === 'true',
    text: deferredFilterText.trim() || undefined,
    templateId: filterTemplate || undefined,
    answerKey: filterAnswerKey || undefined,
    answerValue: filterAnswerValue.trim() || undefined,
    answerMatch: filterAnswerMatch,
  });
  const savedViewsQuery = useTicketSavedViews(currentUserId ?? undefined);
  const createSavedView = useCreateTicketSavedView();
  const updateSavedView = useUpdateTicketSavedView();
  const deleteSavedView = useDeleteTicketSavedView();
  const addTicketWatcher = useAddTicketWatcher();
  const updateTicket = useUpdateTicket();
  const states = useWorkflowStates();
  const clients = useClients();
  const iamUsersQuery = useIamUsers();
  // Templates (mini questionário) para o filtro por resposta — escopo do
  // cliente filtrado (global + do cliente).
  const filterTemplatesQuery = useTicketTemplates({
    clientId: filterClient || undefined,
    includeGlobal: true,
  });

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

  // Reset síncrono da paginação: deve ser chamado no MESMO handler que altera o
  // filtro, para o próximo fetch já usar cursor undefined.
  const resetPagination = useCallback(() => {
    dispatchPagination({ type: 'reset' });
  }, []);

  const applyFilterChange = useCallback(
    (update: () => void) => {
      update();
      resetPagination();
      setActiveSavedViewId(null);
    },
    [resetPagination],
  );

  useEffect(() => {
    if (activeSavedViewId) {
      setSavedViewsExpanded(true);
    }
  }, [activeSavedViewId]);

  useEffect(() => {
    if (filterClient) {
      setAdvancedFiltersExpanded(true);
    }
  }, [filterClient]);

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
    const nextCursor = tickets.data?.nextCursor;
    if (!nextCursor) return;
    dispatchPagination({ type: 'next', cursor: nextCursor, fromPage: page });
  };

  const goToPrevPage = () => {
    dispatchPagination({ type: 'prev' });
  };

  const advancedFiltersActiveCount =
    Number(Boolean(filterClient)) +
    Number(Boolean(filterTemplate)) +
    // Filtro de resposta conta uma vez, com ou sem pergunta escolhida.
    Number(Boolean(filterAnswerKey || filterAnswerValue.trim()));
  const hasActiveFilters =
    Boolean(filterClient) ||
    Boolean(filterState) ||
    Boolean(filterPriority) ||
    Boolean(filterText) ||
    Boolean(filterTemplate) ||
    Boolean(filterAnswerKey) ||
    filterStatus !== DEFAULT_STATUS_FILTER;

  const filterTemplateOptions = [
    { value: '', label: 'Todos os templates' },
    ...(filterTemplatesQuery.data ?? []).map((template) => ({ value: template.id, label: template.name })),
  ];
  const filterQuestions = useMemo(() => {
    if (!filterTemplate) return [];
    const template = (filterTemplatesQuery.data ?? []).find((item) => item.id === filterTemplate);
    return parseTemplateQuestions(template?.questionsJson);
  }, [filterTemplate, filterTemplatesQuery.data]);
  const selectedFilterQuestion = filterQuestions.find((question) => question.key === filterAnswerKey);

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
            <p className="truncate font-medium text-foreground">{ticket.title}</p>
            <p className="truncate text-xs text-muted">{ticket.category ?? 'Sem categoria'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Prioridade',
      render: (ticket) => {
        const priority = getTicketPriorityMeta(ticket.priority);
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
          <span className="text-muted">-</span>
        );
      },
    },
    {
      key: 'client',
      header: 'Cliente',
      render: (ticket) => (
        <span className="text-sm text-muted-foreground">
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
        <span className="text-xs text-muted">
          {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
        </span>
      ),
    },
  ];

  const renderTicketHoverCard = (ticket: Ticket) => {
    const isPreviewTarget = hoverPreviewTicketId === ticket.id;
    const previewTicket = isPreviewTarget && hoverPreviewTicket ? hoverPreviewTicket : ticket;
    const assigneeLabel = resolveUserDisplayName(iamUsersById, previewTicket.assignedToUserId);
    const requesterLabel = previewTicket.requesterUserId
      ? resolveUserDisplayName(iamUsersById, previewTicket.requesterUserId)
      : 'Não informado';
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
    const state = previewTicket.workflowStateId ? stateMap.get(previewTicket.workflowStateId) : null;
    const stateLabel = state?.name ?? 'Sem estado';
    const clientLabel = clientMap.get(previewTicket.clientId)?.name ?? '-';
    const priorityMeta = getTicketPriorityMeta(previewTicket.priority);
    const isClosed = Boolean(previewTicket.closedAt);
    const detailsAreLoading = isPreviewTarget && (hoverPreviewTicketQuery.isLoading || iamUsersQuery.isLoading);

    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{previewTicket.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge color={priorityMeta.color}>{priorityMeta.label}</Badge>
              <Badge color={isClosed ? 'slate' : 'success'}>{isClosed ? 'Encerrado' : 'Aberto'}</Badge>
              {previewTicket.category && (
                <Badge color="slate">
                  <Tag className="mr-1 inline h-3 w-3" />
                  {previewTicket.category}
                </Badge>
              )}
            </div>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-muted">#{previewTicket.id.slice(0, 8)}</span>
        </div>

        <p className="rounded-lg border border-border bg-surface-light/60 px-3 py-2 text-xs leading-relaxed text-muted">
          {formatTicketPreviewDescription(previewTicket.description, 220)}
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <TicketHoverInfo
            icon={<Building2 className="h-3.5 w-3.5" />}
            label="Cliente"
            value={clientLabel}
          />
          <TicketHoverInfo
            icon={<CircleDot className="h-3.5 w-3.5" />}
            label="Estado"
            value={stateLabel}
            dotColor={state?.color}
          />
          <TicketHoverInfo
            icon={<UserRound className="h-3.5 w-3.5" />}
            label="Responsável"
            value={assigneeLabel}
          />
          <TicketHoverInfo
            icon={<CircleUserRound className="h-3.5 w-3.5" />}
            label="Solicitante"
            value={requesterLabel}
          />
          <TicketHoverInfo
            icon={<Monitor className="h-3.5 w-3.5" />}
            label="Máquina vinculada"
            value={linkedMachineLabel}
          />
          <TicketHoverInfo
            icon={<Users className="h-3.5 w-3.5" />}
            label="Watchers"
            value={watcherSummary}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Criado em {new Date(previewTicket.createdAt).toLocaleString('pt-BR')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Atualizado {formatRelativeTime(previewTicket.updatedAt)}
          </span>
        </div>

        {detailsAreLoading && <p className="text-[11px] text-muted">Carregando detalhes do chamado...</p>}
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
    setFilterTemplate('');
    setFilterAnswerKey('');
    setFilterAnswerValue('');
    setFilterAnswerMatch(TicketAnswerMatch.Exact);
    setAdvancedFiltersExpanded(false);
    resetPagination();
  };

  const buildCurrentFilter = (): TicketSavedViewFilter => ({
    clientId: filterClient || undefined,
    workflowStateId: filterState || undefined,
    priority: filterPriority || undefined,
    isClosed: filterStatus === '' ? undefined : filterStatus === 'true',
    text: filterText.trim() || undefined,
    templateId: filterTemplate || undefined,
    answerKey: filterAnswerKey || undefined,
    answerValue: filterAnswerValue.trim() || undefined,
    answerMatch: filterAnswerMatch,
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
    setFilterTemplate(filter.templateId ?? '');
    setFilterAnswerKey(filter.answerKey ?? '');
    setFilterAnswerValue(filter.answerValue ?? '');
    setFilterAnswerMatch(filter.answerMatch ?? TicketAnswerMatch.Exact);
    setActiveSavedViewId(view.id);
    setAdvancedFiltersExpanded(Boolean(filter.clientId || filter.workflowStateId));
    resetPagination();
    toast.success(`Visao aplicada: ${view.name}`);
  };

  const renderPaginationBar = (position: 'top' | 'bottom') => (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-muted ${
        position === 'top' ? 'border-b border-border' : 'border-t border-border'
      }`}
    >
      <div className="flex items-center gap-3">
        <span>Mostrando ate {pageSize} chamados por pagina</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted">{pageSize} chamados/pagina</span>
        <label className="flex items-center gap-2">
          <span className="text-muted">Por pagina</span>
          <select
            value={String(pageSize)}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setHoverPreviewTicketId(null);
              resetPagination();
            }}
            className="rounded-lg border border-border bg-surface-light px-2 py-1 text-xs text-foreground outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="Quantidade de chamados por pagina"
          >
            {PAGE_SIZE_OPTIONS.map((value) => (
              <option
                key={value}
                value={value}
                className="bg-white text-slate-900 dark:bg-surface dark:text-foreground"
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

   const handleDeleteSavedView = (view: TicketSavedView) => {
     setDeleteSavedViewTarget(view);
   };

   const confirmDeleteSavedView = async () => {
     const view = deleteSavedViewTarget;
     if (!view) return;

     setDeletingSavedViewId(view.id);
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
     } finally {
       setDeletingSavedViewId(null);
       setDeleteSavedViewTarget(null);
     }
  };

  return (
    <div ref={pageRef} className="relative space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chamados</h1>
          <p className="text-sm text-muted">
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
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted" />
            <h2 className="text-base font-semibold text-foreground">Filtros e visões salvas</h2>
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
              {savedViewsExpanded ? 'Ocultar visões salvas' : `Ver visões salvas (${savedViews.length})`}
              {savedViewsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="md:col-span-2 xl:col-span-3">
            <Input
              label="Buscar"
              value={filterText}
              onChange={(event) => {
                applyFilterChange(() => setFilterText(event.target.value));
              }}
              placeholder="Título, descrição, categoria ou respostas do questionário"
            />
            <TicketAnswerSemanticSearchPanel term={debouncedFilterText} />
          </div>
          <Select
            label="Prioridade"
            options={PRIORITY_OPTIONS}
            value={filterPriority}
            onChange={(event) => {
              applyFilterChange(() => setFilterPriority(event.target.value as TicketPriority | ''));
            }}
          />
          <Select
            label="Situação"
            options={STATUS_OPTIONS}
            value={filterStatus}
            onChange={(event) => {
              applyFilterChange(() => setFilterStatus(event.target.value as '' | 'true' | 'false'));
            }}
          />
          <Select
            label="Estado"
            options={stateOpts}
            value={filterState}
            onChange={(event) => {
              applyFilterChange(() => setFilterState(event.target.value));
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
            <span className="text-xs text-muted">Cliente filtrado.</span>
          )}
        </div>

        {advancedFiltersExpanded && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Select
              label="Cliente"
              options={clientOpts}
              value={filterClient}
              onChange={(event) => {
                const value = event.target.value;
                applyFilterChange(() => {
                  setFilterClient(value);
                  // Templates são escopados por cliente: reseta o filtro derivado.
                  setFilterTemplate('');
                  setFilterAnswerKey('');
                  setFilterAnswerValue('');
                });
              }}
            />
            <Select
              label="Template"
              options={filterTemplateOptions}
              value={filterTemplate}
              onChange={(event) => {
                const value = event.target.value;
                applyFilterChange(() => {
                  setFilterTemplate(value);
                  setFilterAnswerKey('');
                  setFilterAnswerValue('');
                });
              }}
            />
            {filterTemplate && (
              <>
                <Select
                  label="Pergunta do questionário"
                  options={[
                    { value: '', label: 'Qualquer pergunta' },
                    ...filterQuestions.map((question) => ({ value: question.key, label: question.label })),
                  ]}
                  value={filterAnswerKey}
                  onChange={(event) => {
                    const value = event.target.value;
                    applyFilterChange(() => {
                      setFilterAnswerKey(value);
                      setFilterAnswerValue('');
                    });
                  }}
                />
                {selectedFilterQuestion && selectedFilterQuestion.options.length > 0 ? (
                  <Select
                    label="Resposta"
                    options={[
                      { value: '', label: 'Qualquer resposta' },
                      ...selectedFilterQuestion.options.map((option) => ({ value: option, label: option })),
                    ]}
                    value={filterAnswerValue}
                    onChange={(event) => {
                      const value = event.target.value;
                      applyFilterChange(() => setFilterAnswerValue(value));
                    }}
                  />
                ) : (
                  <Input
                    label="Resposta"
                    value={filterAnswerValue}
                    placeholder={
                      filterAnswerKey
                        ? filterAnswerMatch === TicketAnswerMatch.Contains
                          ? 'Contém o termo...'
                          : 'Valor exato (vazio = qualquer resposta)'
                        : 'Busca em qualquer pergunta'
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      applyFilterChange(() => setFilterAnswerValue(value));
                    }}
                  />
                )}
                {(filterAnswerKey || filterAnswerValue.trim()) && (
                  <Select
                    label="Correspondência"
                    options={[
                      { value: String(TicketAnswerMatch.Exact), label: 'Igual' },
                      { value: String(TicketAnswerMatch.Contains), label: 'Contém' },
                    ]}
                    value={String(filterAnswerMatch)}
                    onChange={(event) => {
                      const value =
                        Number(event.target.value) === TicketAnswerMatch.Contains
                          ? TicketAnswerMatch.Contains
                          : TicketAnswerMatch.Exact;
                      applyFilterChange(() => setFilterAnswerMatch(value));
                    }}
                    hint="Contém ignora maiúsculas e acha itens dentro de listas."
                  />
                )}
              </>
            )}
          </div>
        )}

        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Limpar filtros
            </Button>
          </div>
        )}

        {savedViewsQuery.isLoading ? (
          <div className="mt-4"><Loading /></div>
        ) : savedViewsQuery.isError ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface-light px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <p className="text-sm text-muted">Não foi possível carregar as visões salvas.</p>
            <Button size="sm" variant="ghost" onClick={() => savedViewsQuery.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : savedViewsExpanded && savedViews.length > 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-surface-light p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-muted" />
                <h3 className="text-sm font-semibold text-foreground">Visões salvas</h3>
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
                    className={`rounded-xl border px-4 py-3 ${isActive ? 'border-primary/40 bg-primary/10' : 'border-border bg-surface-light'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{view.name}</p>
                          <Badge color={view.isShared ? 'accent' : 'slate'}>
                            {view.isShared ? 'Compartilhada' : 'Privada'}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted">
                          {formatSavedViewSummary(view, clientNameMap, stateNameMap)}
                        </p>
                        <p className="mt-2 text-[11px] text-muted">
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
                              loading={deletingSavedViewId === view.id}
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
            <p className="text-sm text-muted">Erro ao carregar chamados</p>
            <Button size="sm" variant="ghost" onClick={() => tickets.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : visibleTickets.length === 0 ? (
          <div className="py-12 text-center">
            <TicketIcon className="mx-auto mb-3 h-10 w-10 text-muted" />
            <p className="text-muted">Nenhum chamado encontrado</p>
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
              flush
            />
            {renderPaginationBar('bottom')}
          </>
        )}
      </Card>

      {ticketContextMenu && (
        <div
          ref={contextMenuRef}
          className="absolute z-[80] w-64 overflow-hidden rounded-xl border border-border bg-surface/95 p-1 shadow-2xl backdrop-blur"
          style={{ top: ticketContextMenu.y, left: ticketContextMenu.x }}
          role="menu"
          aria-label={`Acoes do chamado ${ticketContextMenu.ticket.title}`}
        >
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void handleContextMenuFollow()}
            disabled={addTicketWatcher.isPending || !currentUserId}
            role="menuitem"
          >
            <span>Acompanhar</span>
            <span className="text-xs text-muted">watcher</span>
          </button>
          <button
            type="button"
            className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void handleContextMenuTakeOwnership()}
            disabled={updateTicket.isPending || !currentUserId}
            role="menuitem"
          >
            <span>Assumir</span>
            <span className="text-xs text-muted">atribuicao rapida</span>
          </button>
          <button
            type="button"
            className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleContextMenuOpenAssign}
            disabled={updateTicket.isPending || iamUsersQuery.isLoading || (iamUsersQuery.data?.length ?? 0) === 0}
            role="menuitem"
          >
            <span>Transferir / Atribuir</span>
            <span className="text-xs text-muted">selecionar usuario</span>
          </button>
        </div>
      )}

      <CreateTicketModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <Modal open={assignModalOpen} onClose={closeAssignModal} title="Transferir / Atribuir chamado">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-light px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Chamado selecionado</p>
            <p className="mt-1 truncate text-sm text-foreground">{assignTargetTicket?.title ?? '-'}</p>
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
          <label className="flex items-center gap-3 rounded-xl border border-border bg-surface-light px-4 py-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={savedViewForm.isShared}
              onChange={(event) =>
                setSavedViewForm((current) => ({
                  ...current,
                  isShared: event.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-border-strong bg-transparent"
            />
            <span>Compartilhar com outros usuarios</span>
          </label>
          <div className="rounded-xl border border-border bg-surface-light px-4 py-3 text-sm text-muted">
            <div className="mb-2 flex items-center gap-2 text-muted-foreground">
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

      <ConfirmDialog
        open={deleteSavedViewTarget !== null}
        title="Excluir visão"
        message={
          <>
            Tem certeza que deseja excluir a visão{' '}
            <span className="font-semibold text-foreground">{deleteSavedViewTarget?.name}</span>? Esta ação não pode ser desfeita.
          </>
        }
        confirmLabel="Excluir"
        onConfirm={() => void confirmDeleteSavedView()}
        onClose={() => setDeleteSavedViewTarget(null)}
        isLoading={deletingSavedViewId !== null}
      />
    </div>
  );
}

function CreateTicketModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateTicket();
  const clients = useClients();

  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedDept, setSelectedDept] = useState('');

  const sites = useSites(selectedClient);
  const agents = useAgentsBySite(selectedSite);
  const departments = useDepartments({ clientId: selectedClient || undefined, includeGlobal: true });

  // Ticket schema (dynamic fields) for the selected department
  const schemaQuery = useDepartmentTicketSchema(selectedDept || null, !!selectedDept);
  const schemaFields = useMemo(() => {
    if (!schemaQuery.data) return [];
    return schemaQuery.data.filter((f) => f.isActive).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [schemaQuery.data]);

  const [customFieldDrafts, setCustomFieldDrafts] = useState<Record<string, string>>({});

  // Mini questionário do template (perguntas próprias do modelo, não são
  // campos do chamado) + respostas em rascunho.
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});

  const customFieldValidation = useMemo(
    () => buildTicketCustomFieldValidation(schemaFields, customFieldDrafts),
    [schemaFields, customFieldDrafts],
  );

  // Defaults do template aguardando o schema do departamento carregar.
  const pendingTemplateDefaultsRef = useRef<string | null>(null);
  useEffect(() => {
    const pending = pendingTemplateDefaultsRef.current;
    if (!pending || schemaFields.length === 0) return;
    pendingTemplateDefaultsRef.current = null;
    const drafts = templateDefaultsToDrafts(pending, schemaFields);
    if (Object.keys(drafts).length > 0) {
      // Valores já digitados pelo usuário têm precedência sobre os defaults.
      setCustomFieldDrafts((prev) => ({ ...drafts, ...prev }));
    }
  }, [schemaFields]);

  const templatesQuery = useTicketTemplates({
    clientId: selectedClient || undefined,
    departmentId: selectedDept || undefined,
    includeGlobal: true,
  });

  // Hierarquia de escopo: gerais sempre; os vinculados aparecem quando o
  // departamento correspondente é escolhido.
  const templateOptions = useMemo(
    () => selectableTemplates(templatesQuery.data ?? [], {
      clientId: selectedClient || null,
      departmentId: selectedDept || null,
    }),
    [templatesQuery.data, selectedClient, selectedDept],
  );

  const departmentNames = useMemo(
    () => new Map((departments.data ?? []).map((department) => [department.id, department.name])),
    [departments.data],
  );

  const templateQuestions = useMemo(() => {
    if (!selectedTemplateId) return [];
    const template = (templatesQuery.data ?? []).find((t) => t.id === selectedTemplateId);
    return parseTemplateQuestions(template?.questionsJson);
  }, [selectedTemplateId, templatesQuery.data]);

  const questionFields = useMemo(
    () => templateQuestions.map(questionToSchemaField),
    [templateQuestions],
  );

  const templateAnswerValidation = useMemo(
    () => buildTicketCustomFieldValidation(questionFields, questionDrafts),
    [questionFields, questionDrafts],
  );
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

  const applyTemplate = (id: string) => {
    if (!id) return;
    const template = (templatesQuery.data ?? []).find((t) => t.id === id);
    if (!template) return;

    setSelectedTemplateId(template.id);
    setQuestionDrafts({});

    setForm((current) => ({
      ...current,
      title: template.title || current.title,
      description: template.description || current.description,
      priority: (template.priority as TicketPriority) || current.priority,
      category: template.category ?? current.category,
      // Departamento do template quando o usuário ainda não escolheu um.
      departmentId: current.departmentId ?? template.departmentId ?? null,
    }));

    if (template.departmentId && !selectedDept) {
      setSelectedDept(template.departmentId);
      setForm((current) => ({ ...current, workflowProfileId: null }));
      // Schema ainda vai carregar: aplica os defaults quando ele chegar.
      pendingTemplateDefaultsRef.current = template.customFieldDefaultsJson;
      return;
    }

    const drafts = templateDefaultsToDrafts(template.customFieldDefaultsJson, schemaFields);
    if (Object.keys(drafts).length > 0) {
      setCustomFieldDrafts((prev) => ({ ...drafts, ...prev }));
    }
  };

  const set = <K extends keyof CreateTicketRequest>(key: K, value: CreateTicketRequest[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const clearCustomFields = () => setCustomFieldDrafts({});
  const clearTemplate = () => { setSelectedTemplateId(''); setQuestionDrafts({}); };

  const handleClientChange = (id: string) => {
    setSelectedClient(id);
    setSelectedSite('');
    clearTemplate();
    // O departamento é mantido se continuar disponível para o novo cliente; o
    // efeito de disponibilidade limpa (com campos/template) se ele sair.
    setForm((current) => ({
      ...current,
      clientId: id,
      siteId: null,
      agentId: null,
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
    // Template vinculado ao departamento anterior deixa de valer.
    clearTemplate();
    setForm((current) => ({ ...current, departmentId: id || null, workflowProfileId: null }));
  };

  // Departamento é obrigatório: pré-seleciona quando só há uma opção e limpa a
  // seleção quando ela sai do escopo do cliente atual.
  useEffect(() => {
    const options = departments.data ?? [];
    if (departments.isLoading) return;

    if (!selectedDept) {
      if (options.length === 1) handleDeptChange(options[0].id);
      return;
    }

    // Sem exceção para lista vazia: se o departamento não está (mais) disponível
    // para o cliente atual, a seleção precisa cair — inclusive quando o cliente
    // novo não tem nenhum departamento.
    if (!options.some((department) => department.id === selectedDept)) {
      handleDeptChange('');
    }
    // handleDeptChange é recriado a cada render; as deps relevantes são as abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments.data, departments.isLoading, selectedDept]);

  const clientOpts = [{ value: '', label: 'Selecione...' }, ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name }))];
  const siteOpts = [{ value: '', label: 'Nenhum' }, ...(sites.data ?? []).map((site) => ({ value: site.id, label: site.name }))];
  const agentOpts = [{ value: '', label: 'Nenhum' }, ...(agents.data ?? []).map((agent) => ({ value: agent.id, label: agent.displayName ?? agent.hostname }))];
  const deptOpts = [{ value: '', label: 'Selecione...' }, ...(departments.data ?? []).map((department) => ({ value: department.id, label: department.name }))];
  const priorityOpts = (['Low', 'Medium', 'High', 'Critical'] as TicketPriority[]).map((priority) => ({
    value: priority,
    label: TICKET_PRIORITY_META[priority].label,
  }));

  // ── Feedback de validação ────────────────────────────────────────────────
  // Erros na ordem em que os campos aparecem na ficha: o primeiro recebe foco
  // e todos entram no resumo do topo.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const orderedErrors = useMemo(() => {
    const list: { id: string; message: string }[] = [];
    if (!form.clientId) list.push({ id: 'field-client', message: 'Selecione o cliente.' });
    if (!selectedDept) list.push({ id: 'field-dept', message: 'Selecione o departamento.' });
    if (form.title.trim().length < 3) list.push({ id: 'field-title', message: 'Informe o título (mínimo 3 caracteres).' });
    if (form.description.trim().length < 3) list.push({ id: 'field-description', message: 'Descreva o chamado (mínimo 3 caracteres).' });
    for (const field of schemaFields) {
      const message = customFieldValidation.errorsByField[field.definitionId];
      if (message) list.push({ id: `field-schema-${field.definitionId}`, message });
    }
    for (const field of questionFields) {
      const message = templateAnswerValidation.errorsByField[field.definitionId];
      if (message) list.push({ id: `field-question-${field.definitionId}`, message });
    }
    return list;
  }, [
    form.clientId, form.title, form.description, selectedDept,
    schemaFields, customFieldValidation.errorsByField,
    questionFields, templateAnswerValidation.errorsByField,
  ]);

  const focusField = (id: string) => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    element?.focus?.();
  };

  const focusGuardRef = useRef(false);
  useEffect(() => {
    if (!submitAttempted) { focusGuardRef.current = false; return; }
    const first = orderedErrors[0];
    if (!first || focusGuardRef.current) return;
    focusGuardRef.current = true;
    focusField(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitAttempted, orderedErrors]);


  const resetAndClose = () => {
    onClose();
    setSubmitAttempted(false);
    setSelectedClient('');
    setSelectedSite('');
    setSelectedDept('');
    clearCustomFields();
    clearTemplate();
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
    // Mostra os destaques e manda o foco para o primeiro campo inválido.
    // O guard de foco é liberado a cada tentativa (o alvo pode ter mudado).
    focusGuardRef.current = false;
    setSubmitAttempted(true);
    if (orderedErrors.length > 0) {
      toast.error(orderedErrors[0].message);
      return;
    }

    const payload = buildCreateTicketPayload({
      form,
      templateId: selectedTemplateId || null,
      customFieldValues: customFieldValidation.values,
      templateAnswers: templateAnswerValidation.values,
      // Com template, os campos vazios vão como null para não reaplicar o default.
      departmentFieldIds: schemaFields.map((field) => field.definitionId),
    });

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
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        {submitAttempted && orderedErrors.length > 0 && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2">
            <p className="text-sm font-medium text-foreground">Corrija os campos destacados:</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
              {orderedErrors.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => focusField(item.id)}
                    className="text-left underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {item.message}
                  </button>
                </li>
              ))}
              {orderedErrors.length > 5 && (
                <li className="list-none text-muted">
                  …e mais {orderedErrors.length - 5} campo(s) com problema.
                </li>
              )}
            </ul>
          </div>
        )}
        <Select
          label="Cliente *"
          id="field-client"
          options={clientOpts}
          value={form.clientId}
          error={submitAttempted && !form.clientId ? 'Selecione o cliente.' : undefined}
          onChange={(event) => handleClientChange(event.target.value)}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Site" id="field-site" options={siteOpts} value={form.siteId ?? ''} onChange={(event) => handleSiteChange(event.target.value)} disabled={!selectedClient} hint={!selectedClient ? 'Selecione o cliente primeiro' : undefined} />
          <Select label="Agente" options={agentOpts} value={form.agentId ?? ''} onChange={(event) => set('agentId', event.target.value || null)} disabled={!selectedSite} hint={!selectedSite ? 'Selecione o site primeiro' : undefined} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Departamento *"
            id="field-dept"
            options={deptOpts}
            value={selectedDept}
            error={submitAttempted && !selectedDept ? 'Selecione o departamento.' : undefined}
            onChange={(event) => handleDeptChange(event.target.value)}
            hint={!selectedClient ? 'Departamentos globais — escolha o cliente para ver os dele' : undefined}
          />
          {!departments.isLoading && (departments.data?.length ?? 0) === 0 && (
            // Sem nenhum departamento (nem global) não há como abrir chamado:
            // aponta o caminho para criar em vez de deixar um beco sem saída.
            <p className="self-end pb-1 text-xs text-warning">
              Nenhum departamento cadastrado.{' '}
              <button
                type="button"
                onClick={() => navigate('/tickets/departments')}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Criar departamento
              </button>
            </p>
          )}
          {templateOptions.length > 0 ? (
            <Select
              label="Usar template (opcional)"
              options={[
                { value: '', label: 'Nenhum — abrir normalmente' },
                ...templateOptions.map((template) => ({
                  value: template.id,
                  label: template.departmentId
                    ? `${template.title || template.name} · ${departmentNames.get(template.departmentId) ?? 'departamento'}`
                    : template.title || template.name,
                })),
              ]}
              value={selectedTemplateId}
              disabled={!selectedClient}
              hint={
                !selectedClient
                  ? 'Selecione o cliente primeiro'
                  : selectedDept
                    ? 'Templates gerais e deste departamento'
                    : 'Templates gerais — escolha o departamento para ver os vinculados'
              }
              onChange={(event) => {
                const value = event.target.value;
                if (!value) {
                  clearTemplate();
                  return;
                }
                applyTemplate(value);
              }}
            />
          ) : (
            <div className="self-end pb-1">
              {(templatesQuery.data?.length ?? 0) > 0 && (
                <p className="text-xs text-muted">
                  {selectedDept
                    ? 'Nenhum template para este escopo — confira se o template está ativo e vinculado a este cliente/departamento.'
                    : 'Templates gerais: escolha o departamento para ver os vinculados.'}
                </p>
              )}
            </div>
          )}
        </div>
        <Input
          label="Título *"
          id="field-title"
          value={form.title}
          onChange={(event) => set('title', event.target.value)}
          placeholder="Min. 3 caracteres"
          error={submitAttempted && form.title.trim().length < 3 ? 'Informe o título (mínimo 3 caracteres).' : undefined}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-muted-foreground" htmlFor="field-description">Descrição *</label>
          <textarea
            id="field-description"
            aria-invalid={submitAttempted && form.description.trim().length < 3}
            className={`w-full resize-none rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${submitAttempted && form.description.trim().length < 3 ? 'border-danger/50' : ''}`}
            rows={4}
            placeholder="Descreva o chamado (min. 3 caracteres)"
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
          />
          {submitAttempted && form.description.trim().length < 3 && (
            <p className="mt-1 text-xs text-danger">Descreva o chamado (mínimo 3 caracteres).</p>
          )}
        </div>

        {/* Dynamic custom fields from department schema */}
        {schemaFields.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-light p-4">
            <p className="text-xs font-medium text-muted mb-3">
              Campos do Departamento
            </p>
            <div className="space-y-3">
              {schemaFields.map((field) => (
                <TicketSchemaFieldInput
                  key={field.definitionId}
                  id={`field-schema-${field.definitionId}`}
                  field={field}
                  error={submitAttempted ? customFieldValidation.errorsByField[field.definitionId] : undefined}
                  value={customFieldDrafts[field.definitionId] ?? ''}
                  onChange={(value) =>
                    setCustomFieldDrafts((prev) => ({ ...prev, [field.definitionId]: value }))
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Seletor de template movido para a linha do Departamento. */}

        {/* Mini questionário do template selecionado (não são campos do chamado) */}
        {templateQuestions.length > 0 && (
          <div className="rounded-lg border border-dashed border-primary/40 bg-surface-light p-4">
            <p className="mb-1 text-xs font-medium text-muted">Questionário do modelo</p>
            <p className="mb-3 text-xs text-muted">
              Perguntas adicionais do modelo selecionado — as respostas ficam registradas no chamado.
            </p>
            <div className="space-y-3">
              {questionFields.map((field) => (
                <TicketSchemaFieldInput
                  key={field.definitionId}
                  id={`field-question-${field.definitionId}`}
                  field={field}
                  error={submitAttempted ? templateAnswerValidation.errorsByField[field.definitionId] : undefined}
                  value={questionDrafts[field.definitionId] ?? ''}
                  onChange={(value) =>
                    setQuestionDrafts((prev) => ({ ...prev, [field.definitionId]: value }))
                  }
                />
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Prioridade" options={priorityOpts} value={form.priority} onChange={(event) => set('priority', event.target.value as TicketPriority)} />
          <Input label="Categoria" value={form.category ?? ''} onChange={(event) => set('category', event.target.value || null)} placeholder="Opcional, ate 100 chars" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={resetAndClose}>Cancelar</Button>
          <Button type="submit" loading={create.isPending}>Criar Chamado</Button>
        </div>
      </form>
    </Modal>
  );
}