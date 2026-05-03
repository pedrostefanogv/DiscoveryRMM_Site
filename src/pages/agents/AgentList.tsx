import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Wifi, WifiOff, Activity, Building2, Clock, LayoutGrid, List, Bug, Trash2, ShieldCheck } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useClients } from '@/hooks/useClients';
import { useApproveZeroTouch, useDeleteAgent } from '@/hooks/useAgents';
import { ApiError, AutomationExecutionStatus, agentUpdatesApi, agentsApi, authApi } from '@/api';
import { Badge, Loading, ErrorDisplay, Input, Select, StatCard, Modal, PageHeader, SkeletonCard, EmptyState } from '@/components/ui';
import type { Agent, AutomationExecutionReport } from '@/api';
import { getAgentLastSeen, isAgentOnlineNow } from '@/utils/agentStatus';
import { useNowTick } from '@/hooks/useNowTick';
import { useAuthorization } from '@/auth/authorization';
import { openRemoteDebugPopup } from './remoteDebugLauncher';

type AgentWithClient = Agent & { clientName: string; clientId: string };
type ContextMenuState = { x: number; y: number; agent: AgentWithClient } | null;
type ProvisioningFilter = 'all' | 'pendingApproval';
type AutomationFilter = 'all' | 'pendingExecution';
type AgentAutomationQueueState = {
  latestStatus: AutomationExecutionReport['status'] | null;
  pendingExecution: boolean;
};
const MAX_CLIENTS_IN_OVERVIEW = 5;

function formatRelative(dateStr: string | null, now: number): string {
  if (!dateStr) return '—';
  const diff = now - new Date(dateStr).getTime();
  if (diff < 60_000) return 'agora mesmo';
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `há ${Math.floor(diff / 3_600_000)} h`;
  return `há ${Math.floor(diff / 86_400_000)} d`;
}

function getOsIcon(os: string | null): string {
  if (!os) return '💻';
  const lower = os.toLowerCase();
  if (lower.includes('windows')) return '🪟';
  if (lower.includes('linux') || lower.includes('ubuntu') || lower.includes('debian') || lower.includes('centos')) return '🐧';
  if (lower.includes('mac') || lower.includes('darwin')) return '';
  return '💻';
}

function statusToInt(status: unknown): number | null {
  if (typeof status === 'number') return status;
  if (typeof status === 'string') {
    if (status === 'Dispatched') return AutomationExecutionStatus.Dispatched;
    if (status === 'Acknowledged') return AutomationExecutionStatus.Acknowledged;
    if (status === 'Completed') return AutomationExecutionStatus.Completed;
    if (status === 'Failed') return AutomationExecutionStatus.Failed;
    const parsed = Number(status);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isAutomationPendingStatus(status: unknown): boolean {
  const code = statusToInt(status);
  return code === AutomationExecutionStatus.Dispatched || code === AutomationExecutionStatus.Acknowledged;
}

function getAutomationBadge(status: unknown): { color: 'slate' | 'primary' | 'success' | 'danger'; label: string } {
  const code = statusToInt(status);
  if (code === AutomationExecutionStatus.Dispatched || code === AutomationExecutionStatus.Acknowledged) {
    return { color: 'primary', label: 'Aguardando execução' };
  }
  if (code === AutomationExecutionStatus.Completed) {
    return { color: 'success', label: 'Sem fila' };
  }
  if (code === AutomationExecutionStatus.Failed) {
    return { color: 'danger', label: 'Falha recente' };
  }
  return { color: 'slate', label: 'Sem execução recente' };
}

function newestExecution(executions: AutomationExecutionReport[]): AutomationExecutionReport | null {
  if (!executions.length) return null;
  const sorted = [...executions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return sorted[0] ?? null;
}

export default function AgentList() {
  const navigate = useNavigate();
  const now = useNowTick(5_000);
  const clients = useClients();
  const deleteAgent = useDeleteAgent();
  const approveZeroTouch = useApproveZeroTouch();
  const { hasAnyPermission } = useAuthorization();
  const canManageAgent = hasAnyPermission(['Agents.Edit', 'agents.*', 'admin.*']);

  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [filterProvisioning, setFilterProvisioning] = useState<ProvisioningFilter>('all');
  const [filterAutomation, setFilterAutomation] = useState<AutomationFilter>('all');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [remoteAgent, setRemoteAgent] = useState<AgentWithClient | null>(null);
  const [remoteDebugAgentId, setRemoteDebugAgentId] = useState<string | null>(null);
  const [approvingAgentId, setApprovingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [updatingAgentId, setUpdatingAgentId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('contextmenu', closeMenu);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('contextmenu', closeMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setContextMenu(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - 220));
    const top = Math.max(8, Math.min(contextMenu.y, window.innerHeight - 64));
    contextMenuRef.current.style.left = `${left}px`;
    contextMenuRef.current.style.top = `${top}px`;
  }, [contextMenu]);

  const closeRemoteModal = () => {
    setRemoteOpen(false);
    setRemoteLoading(false);
    setRemoteError(null);
    setRemoteUrl(null);
    setRemoteAgent(null);
  };

  const openRemoteControl = async (agent: AgentWithClient) => {
    setContextMenu(null);
    setRemoteAgent(agent);
    setRemoteOpen(true);
    setRemoteLoading(true);
    setRemoteError(null);
    setRemoteUrl(null);

    try {
      const response = await authApi.getMeshCentralEmbedUrl({
        clientId: agent.clientId,
        siteId: agent.siteId,
        agentId: agent.id,
      });

      setRemoteUrl(response.url);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 403) {
          setRemoteError('Suporte remoto desabilitado para este escopo ou sem permissão de acesso.');
        } else if (error.status === 503) {
          setRemoteError('MeshCentral indisponível no momento. Verifique a integração operacional.');
        } else {
          setRemoteError(error.message);
        }
      } else if (error instanceof Error) {
        setRemoteError(error.message);
      } else {
        setRemoteError('Falha ao iniciar o controle remoto.');
      }
    } finally {
      setRemoteLoading(false);
    }
  };

  const openRemoteDebug = async (agent: AgentWithClient) => {
    setContextMenu(null);
    if (remoteDebugAgentId) return;

    setRemoteDebugAgentId(agent.id);
    try {
      await openRemoteDebugPopup({
        agentId: agent.id,
        payload: {
          logLevel: 'info',
          preferredTransport: 'signalr',
          ttlMinutes: 20,
        },
      });
      toast.success(`Debug remoto aberto para ${agent.displayName ?? agent.hostname}.`);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Falha ao abrir o console de remote debug.';
      toast.error(message);
    } finally {
      setRemoteDebugAgentId(null);
    }
  };

  const handleDeleteAgent = async (agent: AgentWithClient) => {
    setContextMenu(null);

    const confirmed = window.confirm(
      `Excluir o agente "${agent.displayName ?? agent.hostname}"? Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;

    setDeletingAgentId(agent.id);
    try {
      await deleteAgent.mutateAsync(agent.id);
      toast.success(`Agente ${agent.displayName ?? agent.hostname} excluído com sucesso.`);
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Falha ao excluir o agente.';
      toast.error(message);
    } finally {
      setDeletingAgentId(null);
    }
  };

  const handleTriggerAgentUpdate = async (agent: AgentWithClient) => {
    setContextMenu(null);
    if (updatingAgentId) return;

    setUpdatingAgentId(agent.id);
    try {
      await agentUpdatesApi.forceAgentCheck(agent.id);
      toast.success(`Verificação de update disparada para ${agent.displayName ?? agent.hostname}.`);
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Falha ao disparar atualização do agente.';
      toast.error(message);
    } finally {
      setUpdatingAgentId(null);
    }
  };

  const handleApproveZeroTouch = async (agent: AgentWithClient) => {
    setContextMenu(null);
    if (!agent.zeroTouchPending || !canManageAgent || approvingAgentId) return;

    const confirmed = window.confirm(
      `Aprovar o provisionamento Zero-Touch do agente "${agent.displayName ?? agent.hostname}"?`,
    );
    if (!confirmed) return;

    setApprovingAgentId(agent.id);
    try {
      await approveZeroTouch.mutateAsync(agent.id);
      toast.success(`Agente ${agent.displayName ?? agent.hostname} aprovado para comunicação com a API.`);
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Falha ao aprovar o agente.';
      toast.error(message);
    } finally {
      setApprovingAgentId(null);
    }
  };

  const queriedClients = useMemo(() => {
    const allClients = clients.data ?? [];
    if (filterClient) {
      return allClients.filter(c => c.id === filterClient);
    }
    return allClients.slice(0, MAX_CLIENTS_IN_OVERVIEW);
  }, [clients.data, filterClient]);

  // Evita fan-out total: carrega apenas cliente filtrado ou um subconjunto.
  const agentQueries = useQueries({
    queries: queriedClients.map(c => ({
      queryKey: ['agents', 'byClient', c.id] as const,
      queryFn: () => agentsApi.listByClient(c.id),
      refetchInterval: 15_000,
      refetchIntervalInBackground: true,
    })),
  });

  const allAgents = useMemo<AgentWithClient[]>(() => {
    if (!queriedClients.length) return [];
    return queriedClients.flatMap((c, i) => {
      const q = agentQueries[i];
      if (!q?.data) return [];
      return q.data.map(a => ({ ...a, clientName: c.name, clientId: c.id }));
    });
  }, [queriedClients, agentQueries]);

  const totalOnline = allAgents.filter(a => isAgentOnlineNow(a, now)).length;
  const totalOffline = allAgents.length - totalOnline;

  const baseFiltered = useMemo(() => allAgents.filter(a => {
    const online = isAgentOnlineNow(a, now);
    if (filterStatus === 'online' && !online) return false;
    if (filterStatus === 'offline' && online) return false;
    if (filterClient && a.clientId !== filterClient) return false;
    if (filterProvisioning === 'pendingApproval' && !a.zeroTouchPending) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (a.displayName ?? a.hostname).toLowerCase().includes(q) ||
        a.hostname.toLowerCase().includes(q) ||
        (a.operatingSystem ?? '').toLowerCase().includes(q) ||
        (a.lastIpAddress ?? '').includes(q) ||
        a.clientName.toLowerCase().includes(q)
      );
    }
    return true;
  }), [allAgents, filterStatus, filterClient, filterProvisioning, search, now]);

  const automationStatusQueries = useQueries({
    queries: baseFiltered.map((agent) => ({
      queryKey: ['agents', 'automationExecutions', agent.id, 'latest'] as const,
      queryFn: async (): Promise<AgentAutomationQueueState> => {
        const executions = await agentsApi.getAutomationExecutions(agent.id, 10);
        const latest = newestExecution(executions);
        const latestStatus = latest?.status ?? null;
        return {
          latestStatus,
          pendingExecution: isAutomationPendingStatus(latestStatus),
        };
      },
      staleTime: 10_000,
      refetchInterval: 15_000,
      refetchIntervalInBackground: true,
    })),
  });

  const automationStateByAgent = useMemo(() => {
    const map = new Map<string, AgentAutomationQueueState>();
    baseFiltered.forEach((agent, index) => {
      const query = automationStatusQueries[index];
      if (query?.data) map.set(agent.id, query.data);
    });
    return map;
  }, [baseFiltered, automationStatusQueries]);

  const automationLoadingByAgent = useMemo(() => {
    const loading = new Set<string>();
    baseFiltered.forEach((agent, index) => {
      const query = automationStatusQueries[index];
      if (!query) return;
      if ((query.isLoading || query.isFetching) && !query.data) {
        loading.add(agent.id);
      }
    });
    return loading;
  }, [baseFiltered, automationStatusQueries]);

  const filtered = useMemo(() => baseFiltered.filter((agent) => {
    if (filterAutomation !== 'pendingExecution') return true;
    const state = automationStateByAgent.get(agent.id);
    return state?.pendingExecution === true;
  }), [baseFiltered, filterAutomation, automationStateByAgent]);

  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  const clientOptions = [
    { value: '', label: 'Todos os clientes' },
    ...(clients.data ?? []).map(c => ({ value: c.id, label: c.name })),
  ];

  const statusOptions = [
    { value: 'all', label: 'Todos os status' },
    { value: 'online', label: 'Online' },
    { value: 'offline', label: 'Offline' },
  ];

  const provisioningOptions = [
    { value: 'all', label: 'Provisionamento: todos' },
    { value: 'pendingApproval', label: 'Provisionamento: aguardando aprovação' },
  ];

  const automationOptions = [
    { value: 'all', label: 'Automação: todos' },
    { value: 'pendingExecution', label: 'Automação: aguardando execução' },
  ];

  const isLoadingBaseAgents = clients.isLoading || agentQueries.some(q => q.isLoading && !q.data);
  const isLoadingAutomationForFilter =
    filterAutomation === 'pendingExecution' &&
    baseFiltered.length > 0 &&
    automationStatusQueries.some((q) => (q.isLoading || q.isFetching) && !q.data);
  const isLoadingAgents = isLoadingBaseAgents || isLoadingAutomationForFilter;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Agentes" description="Gerenciamento de dispositivos monitorados" />

      {/* StatCards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Monitor} label="Total de Agentes" value={allAgents.length} tone="primary" />
        <StatCard
          icon={Wifi}
          label="Online"
          value={totalOnline}
          tone="success"
          trend={
            allAgents.length > 0 ? (
              <span className="text-success text-sm font-medium">
                {Math.round((totalOnline / allAgents.length) * 100)}%
              </span>
            ) : undefined
          }
        />
        <StatCard
          icon={WifiOff}
          label="Offline"
          value={totalOffline}
          tone="warning"
          trend={
            allAgents.length > 0 && totalOffline > 0 ? (
              <span className="text-warning text-sm font-medium">
                {Math.round((totalOffline / allAgents.length) * 100)}%
              </span>
            ) : undefined
          }
        />
      </div>

      {/* Filtros + toggle de visualização */}
      <div className="flex gap-3">
        <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_220px_180px_260px_260px]">
          <Input
            placeholder="Buscar por nome, hostname, OS, IP ou cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <Select
            options={clientOptions}
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
          />
          <Select
            options={statusOptions}
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as 'all' | 'online' | 'offline')}
          />
          <Select
            options={provisioningOptions}
            value={filterProvisioning}
            onChange={e => setFilterProvisioning(e.target.value as ProvisioningFilter)}
          />
          <Select
            options={automationOptions}
            value={filterAutomation}
            onChange={e => setFilterAutomation(e.target.value as AutomationFilter)}
          />
        </div>
        {/* Toggle card / lista */}
        <div className="flex shrink-0 items-end">
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            <button
              onClick={() => setViewMode('card')}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === 'card' ? 'bg-primary/20 text-primary' : 'bg-white/5 text-slate-400 hover:text-slate-200'}`}
              title="Visualização em cards"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-primary/20 text-primary' : 'bg-white/5 text-slate-400 hover:text-slate-200'}`}
              title="Visualização em lista"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {!filterClient && (clients.data?.length ?? 0) > MAX_CLIENTS_IN_OVERVIEW && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Exibindo agentes dos primeiros {MAX_CLIENTS_IN_OVERVIEW} clientes para reduzir carga. Selecione um cliente no filtro para visualizar dados específicos.
        </div>
      )}

      {/* Conteúdo */}
      {isLoadingAgents ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title={allAgents.length === 0 ? 'Nenhum agente encontrado' : 'Nenhum agente corresponde aos filtros'}
          description={allAgents.length === 0 ? 'Nenhum dispositivo registrado no sistema.' : 'Tente ajustar os filtros de busca.'}
          action={(search || filterClient || filterStatus !== 'all' || filterProvisioning !== 'all' || filterAutomation !== 'all') ? {
            label: 'Limpar filtros',
            onClick: () => {
              setSearch('');
              setFilterClient('');
              setFilterStatus('all');
              setFilterProvisioning('all');
              setFilterAutomation('all');
            },
          } : undefined}
        />
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {filtered.length} agente{filtered.length !== 1 ? 's' : ''} exibido{filtered.length !== 1 ? 's' : ''}
          </p>

          {/* ── CARD VIEW ── */}
          {viewMode === 'card' && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(a => {
                const online = isAgentOnlineNow(a, now);
                const lastSeen = getAgentLastSeen(a);
                const displayName = a.displayName ?? a.hostname;
                const isZeroTouchPending = a.zeroTouchPending === true;
                const automationState = automationStateByAgent.get(a.id);
                const automationLoading = automationLoadingByAgent.has(a.id);
                const automationBadge = getAutomationBadge(automationState?.latestStatus ?? null);
                return (
                  <div
                    key={a.id}
                    onClick={() => navigate(`/agents/${a.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/agents/${a.id}`);
                      }
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setContextMenu({ x: event.clientX, y: event.clientY, agent: a });
                    }}
                    role="button"
                    tabIndex={0}
                    className="group relative flex flex-col gap-4 rounded-xl border border-white/5 bg-surface p-5 text-left transition-all hover:border-primary/30 hover:bg-white/5 hover:shadow-lg"
                  >
                    <span className={`absolute right-4 top-4 h-2.5 w-2.5 rounded-full ${online ? 'bg-success shadow-[0_0_6px_theme(colors.success)]' : 'bg-slate-600'}`} />
                    <div className="flex items-start gap-3 pr-6">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xl">
                        {getOsIcon(a.operatingSystem)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-white transition-colors group-hover:text-primary">{displayName}</p>
                        {a.displayName && a.displayName !== a.hostname && (
                          <p className="truncate font-mono text-xs text-slate-500">{a.hostname}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge color={online ? 'success' : 'slate'}>
                            <span className="flex items-center gap-1">
                              {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                              {online ? 'Online' : 'Offline'}
                            </span>
                          </Badge>
                          <Badge color={isZeroTouchPending ? 'warning' : 'success'}>
                            {isZeroTouchPending ? 'Aguardando aprovação' : 'Provisionado'}
                          </Badge>
                          <Badge color={automationLoading ? 'slate' : automationBadge.color}>
                            {automationLoading ? 'Automação: verificando...' : `Automação: ${automationBadge.label}`}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Activity className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span className="truncate">{a.operatingSystem ?? '—'}{a.osVersion ? ` · ${a.osVersion}` : ''}</span>
                      </div>
                      {a.lastIpAddress && (
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="h-3.5 w-3.5 shrink-0 pt-px text-center font-mono text-[10px] leading-none text-slate-500">IP</span>
                          <span className="font-mono">{a.lastIpAddress}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-slate-400">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span className="truncate">{a.clientName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span>{formatRelative(lastSeen, now)}</span>
                      </div>
                    </div>
                    {canManageAgent && isZeroTouchPending && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleApproveZeroTouch(a);
                          }}
                          disabled={approvingAgentId === a.id}
                          className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {approvingAgentId === a.id ? 'Aprovando...' : 'Aprovar'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── LIST VIEW ── */}
          {viewMode === 'list' && (
            <div className="overflow-hidden rounded-xl border border-white/5 bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left">
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Agente</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 md:table-cell">Sistema Operacional</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 lg:table-cell">IP</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 sm:table-cell">Cliente</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 md:table-cell">Provisionamento</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 lg:table-cell">Automação</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 lg:table-cell">Último contato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map(a => {
                    const online = isAgentOnlineNow(a, now);
                    const lastSeen = getAgentLastSeen(a);
                    const displayName = a.displayName ?? a.hostname;
                    const isZeroTouchPending = a.zeroTouchPending === true;
                    const automationState = automationStateByAgent.get(a.id);
                    const automationLoading = automationLoadingByAgent.has(a.id);
                    const automationBadge = getAutomationBadge(automationState?.latestStatus ?? null);
                    return (
                      <tr
                        key={a.id}
                        onClick={() => navigate(`/agents/${a.id}`)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setContextMenu({ x: event.clientX, y: event.clientY, agent: a });
                        }}
                        className="cursor-pointer transition-colors hover:bg-white/5"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-base">
                              {getOsIcon(a.operatingSystem)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-white">{displayName}</p>
                              {a.displayName && a.displayName !== a.hostname && (
                                <p className="truncate font-mono text-xs text-slate-500">{a.hostname}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 text-slate-300 md:table-cell">
                          {a.operatingSystem ?? '—'}{a.osVersion ? ` · ${a.osVersion}` : ''}
                        </td>
                        <td className="hidden px-4 py-3 font-mono text-slate-400 lg:table-cell">
                          {a.lastIpAddress ?? '—'}
                        </td>
                        <td className="hidden px-4 py-3 text-slate-400 sm:table-cell">
                          {a.clientName}
                        </td>
                        <td className="px-4 py-3">
                          <Badge color={online ? 'success' : 'slate'}>
                            <span className="flex items-center gap-1">
                              {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                              {online ? 'Online' : 'Offline'}
                            </span>
                          </Badge>
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <div className="flex flex-col items-start gap-1.5">
                            <Badge color={isZeroTouchPending ? 'warning' : 'success'}>
                              {isZeroTouchPending ? 'Aguardando aprovação' : 'Provisionado'}
                            </Badge>
                            {canManageAgent && isZeroTouchPending && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleApproveZeroTouch(a);
                                }}
                                disabled={approvingAgentId === a.id}
                                className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/20 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                                {approvingAgentId === a.id ? 'Aprovando...' : 'Aprovar'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 lg:table-cell">
                          <Badge color={automationLoading ? 'slate' : automationBadge.color}>
                            {automationLoading ? 'Verificando...' : automationBadge.label}
                          </Badge>
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
                          {formatRelative(lastSeen, now)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            ref={contextMenuRef}
            className="fixed z-50 min-w-[200px] overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-xl"
          >
            <button
              className="w-full px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
              onClick={() => {
                void openRemoteControl(contextMenu.agent);
              }}
            >
              Controle remoto
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
              onClick={() => {
                void openRemoteDebug(contextMenu.agent);
              }}
              disabled={remoteDebugAgentId === contextMenu.agent.id}
            >
              <Bug className="h-4 w-4" />
              {remoteDebugAgentId === contextMenu.agent.id ? 'Abrindo debug...' : 'Ver debug'}
            </button>
            <button
              className="w-full px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                void handleTriggerAgentUpdate(contextMenu.agent);
              }}
              disabled={updatingAgentId === contextMenu.agent.id}
            >
              {updatingAgentId === contextMenu.agent.id ? 'Disparando update...' : 'Disparar self-update'}
            </button>
            {canManageAgent && contextMenu.agent.zeroTouchPending && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-warning transition-colors hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  void handleApproveZeroTouch(contextMenu.agent);
                }}
                disabled={approvingAgentId === contextMenu.agent.id}
              >
                <ShieldCheck className="h-4 w-4" />
                {approvingAgentId === contextMenu.agent.id ? 'Aprovando...' : 'Aprovar Zero-Touch'}
              </button>
            )}
            {canManageAgent && (
              <button
                className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  void handleDeleteAgent(contextMenu.agent);
                }}
                disabled={deleteAgent.isPending}
              >
                <Trash2 className="h-4 w-4" />
                {deletingAgentId === contextMenu.agent.id ? 'Excluindo...' : 'Excluir agente'}
              </button>
            )}
          </div>
        </>
      )}

      <Modal
        open={remoteOpen}
        onClose={closeRemoteModal}
        title={`Controle remoto${remoteAgent ? ` - ${remoteAgent.displayName ?? remoteAgent.hostname}` : ''}`}
        maxWidth="max-w-6xl"
      >
        <div className="space-y-3">
          {remoteLoading && <Loading message="Gerando sessao remota..." />}

          {!remoteLoading && remoteError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {remoteError}
            </div>
          )}

          {!remoteLoading && remoteUrl && (
            <iframe
              title="MeshCentral Remote"
              src={remoteUrl}
              className="h-[70vh] w-full rounded-lg border border-white/10 bg-white"
              allow="clipboard-read; clipboard-write; fullscreen"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
