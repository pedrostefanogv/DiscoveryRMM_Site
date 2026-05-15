import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Wifi, WifiOff, Activity, Building2, Clock, LayoutGrid, List, Bug, Trash2, ShieldCheck, ArrowUp, ArrowDown, Radio, RefreshCw, Move } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useClients } from '@/hooks/useClients';
import { getDeleteAgentErrorMessage, useApproveZeroTouch, useDeleteAgent } from '@/hooks/useAgents';
import { ApiError, agentUpdatesApi, agentsApi, authApi } from '@/api';
import { Badge, Loading, ErrorDisplay, Input, Select, StatCard, Modal, PageHeader, SkeletonCard, EmptyState, MetricBar } from '@/components/ui';
import { TransferAgentModal } from '@/components/agents/TransferAgentModal';
import type { Agent } from '@/api';
import { getAgentLastSeen, isAgentOnlineNow } from '@/utils/agentStatus';
import { useNowTick } from '@/hooks/useNowTick';
import { isHeartbeatTimestampFresh, useAllAgentHeartbeats } from '@/stores/heartbeatStore';
import { useAuthorization } from '@/auth/authorization';
import { openRemoteDebugPopup } from './remoteDebugLauncher';

type AgentWithClient = Agent & { clientName: string; clientId: string };
type ContextMenuState = { x: number; y: number; agent: AgentWithClient } | null;
type ProvisioningFilter = 'all' | 'pendingApproval' | 'approved';
type AgentSortField = 'name' | 'site' | 'client' | 'lastSeen' | 'status';
type SortDirection = 'asc' | 'desc';
const MAX_CLIENTS_IN_OVERVIEW = 5;

function normalizeIp(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
}

function getAgentDisplayName(agent: AgentWithClient): string {
  return (agent.displayName ?? agent.hostname).trim();
}

function getAgentLastSeenMs(agent: AgentWithClient): number | null {
  const value = getAgentLastSeen(agent);
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function compareAgentsTieBreaker(a: AgentWithClient, b: AgentWithClient): number {
  const byClient = a.clientName.localeCompare(b.clientName, 'pt-BR', { sensitivity: 'base' });
  if (byClient !== 0) return byClient;

  const byName = compareText(getAgentDisplayName(a), getAgentDisplayName(b));
  if (byName !== 0) return byName;

  const byHostname = compareText(a.hostname, b.hostname);
  if (byHostname !== 0) return byHostname;

  return a.id.localeCompare(b.id);
}

function compareAgentsBySort(
  a: AgentWithClient,
  b: AgentWithClient,
  sortBy: AgentSortField,
  sortDirection: SortDirection,
  now: number,
): number {
  const directionMultiplier = sortDirection === 'asc' ? 1 : -1;
  let baseComparison = 0;

  if (sortBy === 'name') {
    baseComparison = compareText(getAgentDisplayName(a), getAgentDisplayName(b));
  } else if (sortBy === 'site') {
    baseComparison = compareText(a.siteId, b.siteId);
  } else if (sortBy === 'client') {
    baseComparison = compareText(a.clientName, b.clientName);
  } else if (sortBy === 'status') {
    const aRank = isAgentOnlineNow(a, now) ? 0 : 1;
    const bRank = isAgentOnlineNow(b, now) ? 0 : 1;
    baseComparison = aRank - bRank;
  } else if (sortBy === 'lastSeen') {
    const aSeen = getAgentLastSeenMs(a);
    const bSeen = getAgentLastSeenMs(b);

    if (aSeen === null && bSeen === null) {
      baseComparison = 0;
    } else if (aSeen === null) {
      baseComparison = 1;
    } else if (bSeen === null) {
      baseComparison = -1;
    } else {
      baseComparison = aSeen - bSeen;
    }
  }

  if (baseComparison !== 0) {
    return baseComparison * directionMultiplier;
  }

  return compareAgentsTieBreaker(a, b);
}

function formatDateBrazil(value: string): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(dateStr: string | null, now: number): { text: string; fullDate: string | null } {
  if (!dateStr) return { text: '—', fullDate: null };
  const diff = now - new Date(dateStr).getTime();
  const fullDate = formatDateBrazil(dateStr);
  if (diff < 60_000) return { text: 'agora mesmo', fullDate };
  if (diff < 3_600_000) return { text: `há ${Math.floor(diff / 60_000)} min`, fullDate };
  if (diff < 86_400_000) return { text: `há ${Math.floor(diff / 3_600_000)} h`, fullDate };
  return { text: fullDate, fullDate };
}

function formatUptimeShort(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h`;
}

function getOsIcon(os: string | null): string {
  if (!os) return '💻';
  const lower = os.toLowerCase();
  if (lower.includes('windows')) return '🪟';
  if (lower.includes('linux') || lower.includes('ubuntu') || lower.includes('debian') || lower.includes('centos')) return '🐧';
  if (lower.includes('mac') || lower.includes('darwin')) return '';
  return '💻';
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
  const [sortBy, setSortBy] = useState<AgentSortField>('client');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
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
  const [deleteConfirmAgent, setDeleteConfirmAgent] = useState<AgentWithClient | null>(null);
  const [updatingAgentId, setUpdatingAgentId] = useState<string | null>(null);
  const [transferAgent, setTransferAgent] = useState<AgentWithClient | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const lastKnownIpByAgentRef = useRef<Map<string, string>>(new Map());

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
          logLevel: 'debug',
          preferredTransport: 'nats',
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

  const openDeleteAgentModal = (agent: AgentWithClient) => {
    setContextMenu(null);
    setDeleteConfirmAgent(agent);
  };

  const closeDeleteAgentModal = () => {
    if (deleteAgent.isPending) return;
    setDeleteConfirmAgent(null);
  };

  const openTransferAgentModal = (agent: AgentWithClient) => {
    setContextMenu(null);
    setTransferAgent(agent);
  };

  const closeTransferAgentModal = () => {
    setTransferAgent(null);
  };

  const handleDeleteAgent = async () => {
    if (!deleteConfirmAgent) return;
    const agent = deleteConfirmAgent;

    setDeletingAgentId(agent.id);
    try {
      await deleteAgent.mutateAsync(agent.id);
      toast.success(`Agente ${agent.displayName ?? agent.hostname} excluído com sucesso.`);
      setDeleteConfirmAgent(null);
    } catch (error) {
      toast.error(getDeleteAgentErrorMessage(error));
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
      refetchInterval: 300_000,
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

  // Merge live heartbeat metrics from the reactive store — survives REST polling overwrites
  const allHeartbeats = useAllAgentHeartbeats();

  const agentsWithHeartbeat = useMemo<AgentWithClient[]>(() => {
    return allAgents.map((agent) => {
      const live = allHeartbeats.get(agent.id);
      const hasFreshLiveHeartbeat =
        live &&
        isHeartbeatTimestampFresh(
          live.timestampUtc,
          now,
          undefined,
          live.receivedAtUtc,
        );

      const freshFallbackMetrics =
        agent.heartbeatMetrics &&
        isHeartbeatTimestampFresh(
          agent.heartbeatMetrics.timestampUtc,
          now,
          undefined,
          agent.heartbeatMetrics.receivedAtUtc,
        )
          ? agent.heartbeatMetrics
          : undefined;

      if (!hasFreshLiveHeartbeat) {
        if (freshFallbackMetrics === agent.heartbeatMetrics) {
          return agent;
        }

        return {
          ...agent,
          heartbeatMetrics: freshFallbackMetrics,
        };
      }

      return {
        ...agent,
        heartbeatMetrics: {
          cpuPercent: live.cpuPercent,
          memoryPercent: live.memoryPercent,
          diskPercent: live.diskPercent,
          memoryTotalGb: live.memoryTotalGb,
          memoryUsedGb: live.memoryUsedGb,
          diskTotalGb: live.diskTotalGb,
          diskUsedGb: live.diskUsedGb,
          p2pPeers: live.p2pPeers,
          uptimeSeconds: live.uptimeSeconds,
          processCount: live.processCount,
          ipAddress: live.ipAddress,
          hostname: live.hostname,
          agentVersion: live.agentVersion,
          timestampUtc: live.timestampUtc,
        },
      };
    });
  }, [allAgents, allHeartbeats, now]);

  useEffect(() => {
    for (const agent of agentsWithHeartbeat) {
      const ip = normalizeIp(agent.lastIpAddress);
      if (ip) {
        lastKnownIpByAgentRef.current.set(agent.id, ip);
      }
    }
  }, [agentsWithHeartbeat]);

  const agentsWithStableIp = useMemo<AgentWithClient[]>(() => {
    return agentsWithHeartbeat.map((agent) => {
      const currentIp = normalizeIp(agent.lastIpAddress);
      const stableIp = currentIp ?? lastKnownIpByAgentRef.current.get(agent.id) ?? null;

      if (stableIp === currentIp) {
        return agent;
      }

      return {
        ...agent,
        lastIpAddress: stableIp,
      };
    });
  }, [agentsWithHeartbeat]);

  const totalOnline = agentsWithStableIp.filter(a => isAgentOnlineNow(a, now)).length;
  const totalOffline = agentsWithStableIp.length - totalOnline;
  const totalPendingApproval = agentsWithStableIp.filter(a => a.zeroTouchPending === true).length;

  const baseFiltered = useMemo(() => agentsWithStableIp.filter(a => {
    const online = isAgentOnlineNow(a, now);
    if (filterStatus === 'online' && !online) return false;
    if (filterStatus === 'offline' && online) return false;
    if (filterClient && a.clientId !== filterClient) return false;
    if (filterProvisioning === 'pendingApproval' && !a.zeroTouchPending) return false;
    if (filterProvisioning === 'approved' && a.zeroTouchPending) return false;
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
  }), [agentsWithStableIp, filterStatus, filterClient, filterProvisioning, search, now]);

  const filtered = useMemo(
    () => [...baseFiltered].sort((a, b) => compareAgentsBySort(a, b, sortBy, sortDirection, now)),
    [baseFiltered, sortBy, sortDirection, now],
  );

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
    { value: 'all', label: 'Autorização: todos' },
    { value: 'approved', label: 'Autorização: autorizados' },
    { value: 'pendingApproval', label: 'Autorização: aguardando aprovação' },
  ];

  const sortOptions: Array<{ value: AgentSortField; label: string }> = [
    { value: 'name', label: 'Nome' },
    { value: 'site', label: 'Site' },
    { value: 'client', label: 'Cliente' },
    { value: 'lastSeen', label: 'Último ping' },
    { value: 'status', label: 'Status' },
  ];

  const activeSortLabel = sortOptions.find((option) => option.value === sortBy)?.label ?? 'Cliente';

  const isLoadingAgents = clients.isLoading || agentQueries.some(q => q.isLoading && !q.data);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Agentes" description="Gerenciamento de dispositivos monitorados" />

      {/* StatCards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Monitor}
          label="Total de Agentes"
          value={agentsWithStableIp.length}
          tone="primary"
          onClick={() => {
            setFilterStatus('all');
            setFilterProvisioning('all');
          }}
          active={filterStatus === 'all' && filterProvisioning === 'all'}
        />
        <StatCard
          icon={Wifi}
          label="Online"
          value={totalOnline}
          tone="success"
          onClick={() => setFilterStatus('online')}
          active={filterStatus === 'online'}
          trend={
            agentsWithStableIp.length > 0 ? (
              <span className="text-success text-sm font-medium">
                {Math.round((totalOnline / agentsWithStableIp.length) * 100)}%
              </span>
            ) : undefined
          }
        />
        <StatCard
          icon={WifiOff}
          label="Offline"
          value={totalOffline}
          tone="warning"
          onClick={() => setFilterStatus('offline')}
          active={filterStatus === 'offline'}
          trend={
            agentsWithStableIp.length > 0 && totalOffline > 0 ? (
              <span className="text-warning text-sm font-medium">
                {Math.round((totalOffline / agentsWithStableIp.length) * 100)}%
              </span>
            ) : undefined
          }
        />
        <StatCard
          icon={ShieldCheck}
          label="Aguardando autorização/aprovação"
          value={totalPendingApproval}
          tone="accent"
          onClick={() => setFilterProvisioning('pendingApproval')}
          active={filterProvisioning === 'pendingApproval'}
          trend={
            agentsWithStableIp.length > 0 && totalPendingApproval > 0 ? (
              <span className="text-accent text-sm font-medium">
                {Math.round((totalPendingApproval / agentsWithStableIp.length) * 100)}%
              </span>
            ) : undefined
          }
        />
      </div>

      {/* Filtros + toggle de visualização */}
      <div className="flex gap-3">
        <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_220px_180px_260px_180px_48px]">
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
            options={sortOptions}
            value={sortBy}
            onChange={e => setSortBy(e.target.value as AgentSortField)}
          />
          <button
            type="button"
            onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
            className="flex h-10 w-12 items-center justify-center self-end rounded-xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10"
            title={sortDirection === 'asc' ? 'Ordenação crescente' : 'Ordenação decrescente'}
            aria-label={sortDirection === 'asc' ? 'Ordenação crescente' : 'Ordenação decrescente'}
          >
            {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </button>
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
          title={agentsWithStableIp.length === 0 ? 'Nenhum agente encontrado' : 'Nenhum agente corresponde aos filtros'}
          description={agentsWithStableIp.length === 0 ? 'Nenhum dispositivo registrado no sistema.' : 'Tente ajustar os filtros de busca.'}
          action={(search || filterClient || filterStatus !== 'all' || filterProvisioning !== 'all') ? {
            label: 'Limpar filtros',
            onClick: () => {
              setSearch('');
              setFilterClient('');
              setFilterStatus('all');
              setFilterProvisioning('all');
            },
          } : undefined}
        />
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {filtered.length} agente{filtered.length !== 1 ? 's' : ''} exibido{filtered.length !== 1 ? 's' : ''} · Ordenação: {activeSortLabel} ({sortDirection === 'asc' ? 'crescente' : 'decrescente'})
          </p>

          {/* ── CARD VIEW ── */}
          {viewMode === 'card' && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(a => {
                const online = isAgentOnlineNow(a, now);
                const lastSeen = getAgentLastSeen(a);
                const displayName = a.displayName ?? a.hostname;
                const isZeroTouchPending = a.zeroTouchPending === true;
                const relativeTime = formatRelative(lastSeen, now);
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
                          {isZeroTouchPending && (
                            <Badge color="warning">Aguardando aprovação</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Activity className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span className="truncate">{a.operatingSystem ?? '—'}{a.osVersion ? ` · ${a.osVersion}` : ''}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <span className="h-3.5 w-3.5 shrink-0 pt-px text-center font-mono text-[10px] leading-none text-slate-500">IP</span>
                        <span className="font-mono">{a.lastIpAddress ?? 'IP indisponível'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span className="truncate">{a.clientName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span title={relativeTime.fullDate ?? undefined}>{relativeTime.text}</span>
                      </div>
                      {/* Heartbeat metrics */}
                      {a.heartbeatMetrics && (
                        <div className="border-t border-white/5 pt-2 mt-2 space-y-1.5">
                          <MetricBar
                            label="CPU"
                            value={a.heartbeatMetrics.cpuPercent}
                            compact
                          />
                          <MetricBar
                            label="RAM"
                            value={a.heartbeatMetrics.memoryPercent}
                            compact
                          />
                          <MetricBar
                            label="DISCO"
                            value={a.heartbeatMetrics.diskPercent}
                            compact
                          />
                          <div className="flex items-center gap-3 text-slate-500 pt-0.5">
                            {a.heartbeatMetrics.p2pPeers != null && (
                              <span className="flex items-center gap-1 text-[10px]">
                                <Radio className="h-3 w-3" />
                                {a.heartbeatMetrics.p2pPeers} peers
                              </span>
                            )}
                            {a.heartbeatMetrics.uptimeSeconds != null && (
                              <span className="flex items-center gap-1 text-[10px]">
                                <Clock className="h-3 w-3" />
                                {formatUptimeShort(a.heartbeatMetrics.uptimeSeconds)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
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
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 2xl:table-cell">CPU</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 2xl:table-cell">RAM</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 2xl:table-cell">Disco</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 lg:table-cell">Último contato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map(a => {
                    const online = isAgentOnlineNow(a, now);
                    const lastSeen = getAgentLastSeen(a);
                    const displayName = a.displayName ?? a.hostname;
                    const isZeroTouchPending = a.zeroTouchPending === true;
                    const relativeTime = formatRelative(lastSeen, now);
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
                            {isZeroTouchPending ? (
                              <>
                                <Badge color="warning">Aguardando aprovação</Badge>
                                {canManageAgent && (
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
                              </>
                            ) : (
                              <span className="text-xs text-slate-500">—</span>
                            )}
                          </div>
                        </td>
                        {/* Heartbeat metrics columns */}
                        <td className="hidden px-4 py-3 2xl:table-cell">
                          {a.heartbeatMetrics?.cpuPercent != null ? (
                            <MetricBar label="" value={a.heartbeatMetrics.cpuPercent} compact hideValue />
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 2xl:table-cell">
                          {a.heartbeatMetrics?.memoryPercent != null ? (
                            <MetricBar label="" value={a.heartbeatMetrics.memoryPercent} compact hideValue />
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 2xl:table-cell">
                          {a.heartbeatMetrics?.diskPercent != null ? (
                            <MetricBar label="" value={a.heartbeatMetrics.diskPercent} compact hideValue />
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell" title={relativeTime.fullDate ?? undefined}>
                          {relativeTime.text}
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
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
              onClick={() => {
                void openRemoteControl(contextMenu.agent);
              }}
            >
              <Monitor className="h-4 w-4" />
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
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                void handleTriggerAgentUpdate(contextMenu.agent);
              }}
              disabled={updatingAgentId === contextMenu.agent.id}
            >
              <RefreshCw className="h-4 w-4" />
              {updatingAgentId === contextMenu.agent.id ? 'Disparando update...' : 'Atualizar agente'}
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
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/10"
                onClick={() => {
                  openTransferAgentModal(contextMenu.agent);
                }}
              >
                <Move className="h-4 w-4" />
                Transferir agente
              </button>
            )}
            {canManageAgent && (
              <button
                className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  openDeleteAgentModal(contextMenu.agent);
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
        open={!!deleteConfirmAgent}
        onClose={closeDeleteAgentModal}
        title="Confirmar exclusão de agente"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-slate-200">
            <p>
              Você está prestes a excluir o agente{' '}
              <span className="font-semibold text-white">{deleteConfirmAgent?.displayName ?? deleteConfirmAgent?.hostname}</span>.
            </p>
            <p className="mt-1 text-slate-400">Esta ação não pode ser desfeita.</p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={closeDeleteAgentModal}
              disabled={deleteAgent.isPending}
            >
              Cancelar
            </button>
            <button
              className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                void handleDeleteAgent();
              }}
              disabled={deleteAgent.isPending}
            >
              {deleteAgent.isPending ? 'Excluindo...' : 'Excluir agente'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={remoteOpen}
        onClose={closeRemoteModal}
        title={`Controle remoto${remoteAgent ? ` - ${remoteAgent.displayName ?? remoteAgent.hostname}` : ''}`}
        maxWidth="max-w-6xl"
      >
        <div className="space-y-3">
          {remoteLoading && <Loading message="Gerando sessão remota..." />}

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

      <TransferAgentModal
        open={!!transferAgent}
        onClose={closeTransferAgentModal}
        agent={transferAgent ? { id: transferAgent.id, siteId: transferAgent.siteId, hostname: transferAgent.hostname, displayName: transferAgent.displayName } as Agent : null}
      />
    </div>
  );
}
