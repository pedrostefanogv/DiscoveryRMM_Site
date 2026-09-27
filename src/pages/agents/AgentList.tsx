import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Wifi, WifiOff, Activity, Building2, Clock, HardDrive, MapPin, LayoutGrid, List, Bug, Trash2, ShieldCheck, ArrowUp, ArrowDown, Radio, RefreshCw, Move, RotateCcw, Power, Zap, Server, Apple, Thermometer, ChevronRight, Bell, ArchiveRestore, Undo2 } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { useAgentLabelUsage, useAgentIdsByLabel, useAgentLabelsByAgentIds } from '@/hooks/useAgentLabels';
import toast from 'react-hot-toast';
import { useClients } from '@/hooks/useClients';
import { useAllSites } from '@/hooks/useSites';
import { getDeleteAgentErrorMessage, getPurgeAgentErrorMessage, useApproveZeroTouch, useDeleteAgent, useDeletedAgents, usePurgeAgent, useRestartAgent, useRestoreAgent, useShutdownAgent, useWakeOnLan } from '@/hooks/useAgents';
import { ApiError, agentUpdatesApi, agentsApi } from '@/api';
import { Badge, ErrorDisplay, Input, Select, StatCard, Modal, PageHeader, SkeletonCard, EmptyState, MetricBar, Button, ConfirmDialog } from '@/components/ui';
import { TransferAgentModal } from '@/components/agents/TransferAgentModal';
import PowerActionModal from '@/components/agents/PowerActionModal';
import AgentNotificationModal, { type AgentNotificationPayload } from '@/components/agents/AgentNotificationModal';
import WakeOnLanModal from '@/components/agents/WakeOnLanModal';
import type { Agent } from '@/api';
import { getAgentLastSeen, isAgentOnlineNow } from '@/utils/agentStatus';
import { useNowTick } from '@/hooks/useNowTick';
import { isHeartbeatTimestampFresh, useAllAgentHeartbeats } from '@/stores/heartbeatStore';
import { useAuthorization } from '@/auth/authorization';
import { useSendAgentNotification } from '@/hooks/useAgentAlerts';
import { openRemoteDebugPopup } from './remoteDebugLauncher';
import { openRemoteSessionPopup } from './remoteSessionLauncher';

type AgentWithClient = Agent & { clientName: string; clientId: string; siteName?: string };
type ContextMenuState = { x: number; y: number; agent: AgentWithClient } | null;
type ProvisioningFilter = 'all' | 'pendingApproval' | 'approved';
type AgentSortField = 'name' | 'site' | 'client' | 'lastSeen' | 'status';
type SortDirection = 'asc' | 'desc';
const DELETED_PAGE_SIZE = 200;

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
  if (!dateStr) return { text: '\u2014', fullDate: null };
  const diff = now - new Date(dateStr).getTime();
  const fullDate = formatDateBrazil(dateStr);
  if (diff < 60_000) return { text: 'agora mesmo', fullDate };
  if (diff < 3_600_000) return { text: `há ${Math.floor(diff / 60_000)} min`, fullDate };
  if (diff < 86_400_000) return { text: `há ${Math.floor(diff / 3_600_000)} h`, fullDate };
  return { text: fullDate, fullDate };
}

function getOsIconComponent(os: string | null) {
  if (!os) return <Monitor className="h-5 w-5 text-primary" />;
  const lower = os.toLowerCase();
  if (lower.includes('windows')) return <Monitor className="h-5 w-5 text-primary" />;
  if (lower.includes('linux') || lower.includes('ubuntu') || lower.includes('debian') || lower.includes('centos')) return <Server className="h-5 w-5 text-accent" />;
  if (lower.includes('mac') || lower.includes('darwin')) return <Apple className="h-5 w-5 text-foreground" />;
  return <Monitor className="h-5 w-5 text-primary" />;
}

export default function AgentList() {
  const navigate = useNavigate();
  const now = useNowTick(5_000);
  const clients = useClients();
  const deleteAgent = useDeleteAgent();
  const restoreAgent = useRestoreAgent();
  const purgeAgent = usePurgeAgent();
  const approveZeroTouch = useApproveZeroTouch();
  const restartAgent = useRestartAgent();
  const shutdownAgent = useShutdownAgent();
  const wakeOnLan = useWakeOnLan();
  const sendAgentNotification = useSendAgentNotification();
  const { hasAnyPermission } = useAuthorization();
  const canManageAgent = hasAnyPermission(['Agents.Edit', 'agents.*', 'admin.*']);
  // Enviar notificação é uma ação de execução no endpoint (Agents.Execute).
  const canExecuteAgent = hasAnyPermission(['Agents.Execute', 'Agents.Edit', 'agents.*', 'admin.*']);

  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [filterProvisioning, setFilterProvisioning] = useState<ProvisioningFilter>('all');
  const [filterLabel, setFilterLabel] = useState('');
  const [sortBy, setSortBy] = useState<AgentSortField>('client');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [remoteDebugAgentId, setRemoteDebugAgentId] = useState<string | null>(null);
  const [approvingAgentId, setApprovingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedPage, setDeletedPage] = useState(1);
  // Soft delete (mover para a lixeira) — confirmação simples.
  const [deleteConfirmAgent, setDeleteConfirmAgent] = useState<AgentWithClient | null>(null);
  // Hard delete (exclusão definitiva) — exige digitar o nome do agente.
  const [purgeTarget, setPurgeTarget] = useState<AgentWithClient | null>(null);
  const [purgeConfirmName, setPurgeConfirmName] = useState('');
  // Segundo passo quando o backend responde 409 (agente com chamados vinculados).
  const [purgeForceTarget, setPurgeForceTarget] = useState<AgentWithClient | null>(null);
  const [restoringAgentId, setRestoringAgentId] = useState<string | null>(null);
  const [updatingAgentId, setUpdatingAgentId] = useState<string | null>(null);
  const [transferAgent, setTransferAgent] = useState<AgentWithClient | null>(null);
  const [powerActionAgent, setPowerActionAgent] = useState<{ agent: AgentWithClient; action: "restart" | "shutdown" } | null>(null);
  const [wolAgent, setWolAgent] = useState<AgentWithClient | null>(null);
  const [notificationAgent, setNotificationAgent] = useState<AgentWithClient | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  // Submenu de energia ("Ligar / Reiniciar / Desligar") aberto ao lado via hover.
  const [powerSubmenuOpen, setPowerSubmenuOpen] = useState(false);
  const lastKnownIpByAgentRef = useRef<Map<string, string>>(new Map());

  // Lixeira: busca somente quando a visão de excluídos está aberta.
  const deletedAgents = useDeletedAgents(
    {
      clientId: filterClient || undefined,
      search: search.trim() || undefined,
      page: deletedPage,
      pageSize: DELETED_PAGE_SIZE,
    },
    { enabled: showDeleted },
  );

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = (event: Event) => {
      // Não fecha se o clique for DENTRO do context menu
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };
    // BUG-06: removido listener de 'contextmenu' que fechava o menu ao abrir outro.
    // Em vez disso, usamos stopPropagation no handler que abre o context menu
    // e mousedown com capture para detectar cliques fora do menu.
    window.addEventListener('mousedown', closeMenu, true);
    window.addEventListener('scroll', closeMenu, true);

    return () => {
      window.removeEventListener('mousedown', closeMenu, true);
      window.removeEventListener('scroll', closeMenu, true);
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

  const openRemoteControl = async (agent: AgentWithClient) => {
    setContextMenu(null);

    try {
      // Redireciona para o novo acesso remoto nativo (transporte primário: NATS)
      openRemoteSessionPopup({ agentId: agent.id, kind: 'screen', transport: 'nats' });
      return;
    } catch (error) {
      // Erros são tratados internamente pelo openRemoteSessionPopup (toast/notificação)
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

  // ── Soft delete: mover para a lixeira ────────────────────────────────────
  const openDeleteAgentModal = (agent: AgentWithClient) => {
    setContextMenu(null);
    setDeleteConfirmAgent(agent);
  };

  const closeDeleteAgentModal = () => {
    if (deleteAgent.isPending) return;
    setDeleteConfirmAgent(null);
  };

  const handleDeleteAgent = async () => {
    if (!deleteConfirmAgent) return;
    const agent = deleteConfirmAgent;
    setDeletingAgentId(agent.id);
    try {
      await deleteAgent.mutateAsync(agent.id);
      toast.success(`Agente ${agent.displayName ?? agent.hostname} movido para a lixeira.`);
      setDeleteConfirmAgent(null);
    } catch (error) {
      toast.error(getDeleteAgentErrorMessage(error));
    } finally {
      setDeletingAgentId(null);
    }
  };

  // ── Hard delete: exclusão definitiva (com digitação do nome) ─────────────
  const runPurge = async (agent: AgentWithClient, force: boolean) => {
    try {
      await purgeAgent.mutateAsync({ id: agent.id, force });
      toast.success(`Agente ${agent.displayName ?? agent.hostname} excluído definitivamente.`);
      setPurgeTarget(null);
      setPurgeConfirmName('');
      setPurgeForceTarget(null);
    } catch (error) {
      if (!force && error instanceof ApiError && error.status === 409) {
        // Agente com chamados vinculados: exige a confirmação reforçada.
        setPurgeForceTarget(agent);
        setPurgeTarget(null);
        setPurgeConfirmName('');
        return;
      }
      toast.error(getPurgeAgentErrorMessage(error));
    }
  };

  const openPurgeAgentModal = (agent: AgentWithClient) => {
    setContextMenu(null);
    setPurgeTarget(agent);
    setPurgeConfirmName('');
  };

  const closePurgeAgentModal = () => {
    if (purgeAgent.isPending) return;
    setPurgeTarget(null);
    setPurgeConfirmName('');
  };

  const handlePurgeAgent = async () => {
    if (!purgeTarget) return;
    const agent = purgeTarget;
    const expectedName = (agent.displayName ?? agent.hostname).trim();
    if (purgeConfirmName.trim() !== expectedName) {
      toast.error('O nome digitado não confere. Verifique e tente novamente.');
      return;
    }
    await runPurge(agent, false);
  };

  const handleForcePurge = async () => {
    if (!purgeForceTarget) return;
    await runPurge(purgeForceTarget, true);
  };

  const handleRestoreAgent = async (agent: AgentWithClient) => {
    if (restoringAgentId) return;
    setRestoringAgentId(agent.id);
    try {
      await restoreAgent.mutateAsync(agent.id);
      toast.success(`Agente ${agent.displayName ?? agent.hostname} restaurado.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao restaurar o agente.');
    } finally {
      setRestoringAgentId(null);
    }
  };

  const openTransferAgentModal = (agent: AgentWithClient) => {
    setContextMenu(null);
    setTransferAgent(agent);
  };

  const closeTransferAgentModal = () => {
    setTransferAgent(null);
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

  const handleRestartAgent = (agent: AgentWithClient) => {
    setContextMenu(null);
    setPowerActionAgent({ agent, action: "restart" });
  };

  const handleShutdownAgent = (agent: AgentWithClient) => {
    setContextMenu(null);
    setPowerActionAgent({ agent, action: "shutdown" });
  };

  const handleWakeOnLan = (agent: AgentWithClient) => {
    setContextMenu(null);
    setWolAgent(agent);
  };

  const openNotificationModal = (agent: AgentWithClient) => {
    setContextMenu(null);
    setNotificationAgent(agent);
  };

  const handleNotificationConfirm = async (data: AgentNotificationPayload) => {
    if (!notificationAgent) return;
    await sendAgentNotification.mutateAsync({ agentId: notificationAgent.id, ...data });
  };

  const handlePowerActionConfirm = async (data: { delaySeconds: number; force: boolean; message: string; notifyUser: boolean }) => {
    if (!powerActionAgent) return;
    const { agent, action } = powerActionAgent;
    if (action === "restart") {
      await restartAgent.mutateAsync({ id: agent.id, data });
    } else {
      await shutdownAgent.mutateAsync({ id: agent.id, data });
    }
  };

  const handleWakeOnLanConfirm = async (data: { broadcastAddress?: string }) => {
    if (!wolAgent) throw new Error("No agent selected");
    return await wakeOnLan.mutateAsync({ id: wolAgent.id, data });
  };

  // Carrega os agentes de TODOS os clientes (decisão de produto): a contagem
  // das labels mostrada na tela precisa bater com a lista exibida. Um cliente
  // selecionado no filtro continua reduzindo o escopo para 1 requisição.
  const queriedClients = useMemo(() => {
    const allClients = clients.data ?? [];
    if (filterClient) {
      return allClients.filter(c => c.id === filterClient);
    }
    return allClients;
  }, [clients.data, filterClient]);

  const agentQueries = useQueries({
    queries: queriedClients.map(c => ({
      queryKey: ['agents', 'byClient', c.id] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        agentsApi.listByClient(c.id, { signal }),
      refetchInterval: 300_000,
      refetchIntervalInBackground: false,
    })),
  });

  // Uma única requisição global de sites (antes era 1 por cliente) para o
  // nome do site exibido em cada agente.
  const allSitesQuery = useAllSites(true);

  const siteNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allSitesQuery.data ?? []) {
      map.set(s.id, s.name);
    }
    return map;
  }, [allSitesQuery.data]);

  const allAgents = useMemo<AgentWithClient[]>(() => {
    if (!queriedClients.length) return [];
    return queriedClients.flatMap((c, i) => {
      const q = agentQueries[i];
      if (!q?.data) return [];
      return q.data.map(a => ({
        ...a,
        clientName: c.name,
        clientId: c.id,
        siteName: siteNameMap.get(a.siteId),
      }));
    });
  }, [queriedClients, agentQueries, siteNameMap]);

  // Merge live heartbeat metrics from the reactive store \u2014 survives REST polling overwrites
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
          diskReadPercent: live.diskReadPercent,
          diskWritePercent: live.diskWritePercent,
          diskResponseMs: live.diskResponseMs,
          p2pPeers: live.p2pPeers,
          uptimeSeconds: live.uptimeSeconds,
          processCount: live.processCount,
          cpuTemperatureCelsius: live.cpuTemperatureCelsius,
          ipAddress: live.ipAddress,
          hostname: live.hostname,
          agentVersion: live.agentVersion,
          commitHash: live.commitHash,
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

  // Labels de todos os agentes listados: 1 query em vez de N (evita N+1 na UI).
  const labelsByAgentId = useAgentLabelsByAgentIds(agentsWithStableIp.map(agent => agent.id));

  // Filtro por label resolvido no SERVIDOR (paginado por cursor): antes a UI dependia
  // das labels já carregadas, o que quebrava em frotas maiores que o limite de 500.
  const labelUsage = useAgentLabelUsage();
  const agentsWithFilterLabel = useAgentIdsByLabel(filterLabel || null);

  const distinctLabels = useMemo(() => {
    const set = new Set<string>();
    for (const usage of labelUsage.data ?? []) set.add(usage.label);
    // Inclui labels dos agentes já carregados que ainda não apareceram no ranking.
    for (const labels of labelsByAgentId.values()) {
      for (const label of labels) set.add(label);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [labelUsage.data, labelsByAgentId]);

  const labelFilterIds = useMemo(
    () => new Set(agentsWithFilterLabel.data?.ids ?? []),
    [agentsWithFilterLabel.data],
  );

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
    if (filterLabel && !labelFilterIds.has(a.id)) return false;
    if (search) {
      const q = search.toLowerCase();
      const agentLabels = (labelsByAgentId.get(a.id) ?? []).join(' ').toLowerCase();
      return (
        (a.displayName ?? a.hostname).toLowerCase().includes(q) ||
        a.hostname.toLowerCase().includes(q) ||
        (a.operatingSystem ?? '').toLowerCase().includes(q) ||
        (a.lastIpAddress ?? '').includes(q) ||
        a.clientName.toLowerCase().includes(q) ||
        agentLabels.includes(q)
      );
    }
    return true;
  }), [agentsWithStableIp, filterStatus, filterClient, filterProvisioning, search, filterLabel, labelFilterIds, labelsByAgentId, now]);

  const filtered = useMemo(
    () => [...baseFiltered].sort((a, b) => compareAgentsBySort(a, b, sortBy, sortDirection, now)),
    [baseFiltered, sortBy, sortDirection, now],
  );

  // A busca da lixeira é resolvida no servidor (GET /agents/deleted?search=).
  const deletedItems = deletedAgents.data?.items ?? [];

  const deletedTotal = deletedAgents.data?.total ?? 0;
  const deletedTotalPages = Math.max(1, Math.ceil(deletedTotal / DELETED_PAGE_SIZE));

  // Se a última página da lixeira ficar vazia (ex.: excluir o último item),
  // volta automaticamente para uma página válida.
  useEffect(() => {
    setDeletedPage(page => Math.min(page, deletedTotalPages));
  }, [deletedTotalPages]);

  // Trocar o cliente filtrado ou a busca reinicia a paginação da lixeira.
  useEffect(() => {
    setDeletedPage(1);
  }, [filterClient, search]);

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
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3">
          <div className="min-w-[240px] flex-1">
            <Input
              placeholder="Buscar por nome, hostname, OS, IP ou cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select
            fullWidth={false}
            options={clientOptions}
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
          />
          <Select
            fullWidth={false}
            options={statusOptions}
            value={filterStatus}
            disabled={showDeleted}
            onChange={e => setFilterStatus(e.target.value as 'all' | 'online' | 'offline')}
          />
          <Select
            fullWidth={false}
            options={provisioningOptions}
            value={filterProvisioning}
            disabled={showDeleted}
            onChange={e => setFilterProvisioning(e.target.value as ProvisioningFilter)}
          />
          <Select
            fullWidth={false}
            options={[
              { value: '', label: 'Todas as labels' },
              ...distinctLabels.map(label => {
                const count = labelUsage.data?.find(usage => usage.label === label)?.agentCount;
                return { value: label, label: count ? `${label} (${count})` : label };
              }),
            ]}
            value={filterLabel}
            onChange={e => setFilterLabel(e.target.value)}
            disabled={showDeleted}
          />
          <Select
            fullWidth={false}
            options={sortOptions}
            value={sortBy}
            disabled={showDeleted}
            onChange={e => setSortBy(e.target.value as AgentSortField)}
          />
          <button
            type="button"
            onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
            className="flex h-10 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-light text-foreground transition-colors hover:bg-surface-hover"
            title={sortDirection === 'asc' ? 'Ordenação crescente' : 'Ordenação decrescente'}
            aria-label={sortDirection === 'asc' ? 'Ordenação crescente' : 'Ordenação decrescente'}
          >
            {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </button>
        </div>
        {/* Lixeira + toggle card / lista */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowDeleted(current => !current);
              setDeletedPage(1);
              setContextMenu(null);
            }}
            className={'inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm transition-colors ' + (showDeleted ? 'bg-primary/20 text-primary' : 'bg-surface-light text-muted hover:text-foreground')}
            title={showDeleted ? 'Voltar para os agentes ativos' : 'Ver agentes excluídos (lixeira)'}
            aria-pressed={showDeleted}
          >
            {showDeleted ? <Undo2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
            {showDeleted ? 'Voltar' : 'Excluídos'}
          </button>
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              onClick={() => setViewMode('card')}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === 'card' ? 'bg-primary/20 text-primary' : 'bg-surface-light text-muted hover:text-foreground'}`}
              title="Visualização em cards"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex h-9 w-9 items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-primary/20 text-primary' : 'bg-surface-light text-muted hover:text-foreground'}`}
              title="Visualização em lista"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {filterLabel ? (
        <p className="text-xs text-muted">
          {agentsWithFilterLabel.isLoading
            ? `Filtrando por "${filterLabel}"...`
            : `Label "${filterLabel}": ${agentsWithFilterLabel.data?.total ?? 0} agente(s).`}
          {agentsWithFilterLabel.data?.truncated
            ? ' Exibindo os primeiros 20.000; refine com outra label.'
            : ''}
        </p>
      ) : null}


      {/* Conteúdo */}
      {showDeleted ? (
        deletedAgents.isLoading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : deletedAgents.isError ? (
          <ErrorDisplay onRetry={() => deletedAgents.refetch()} />
        ) : deletedItems.length === 0 ? (
          <EmptyState
            icon={Trash2}
            title="A lixeira está vazia"
            description="Agentes excluídos aparecem aqui e podem ser restaurados ou removidos definitivamente."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">
                {deletedTotal} agente{deletedTotal !== 1 ? 's' : ''} excluído{deletedTotal !== 1 ? 's' : ''}
                {deletedItems.length < deletedTotal ? ' (mostrando ' + deletedItems.length + ' nesta página)' : ''}
              </p>
              {deletedTotalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={deletedPage <= 1}
                    onClick={() => setDeletedPage(page => Math.max(1, page - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-muted">
                    Página {deletedPage} de {deletedTotalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={deletedPage >= deletedTotalPages}
                    onClick={() => setDeletedPage(page => page + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted">Agente</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted">Cliente / Site</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted md:table-cell">Sistema Operacional</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted lg:table-cell">IP</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted">Excluído em</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {deletedItems.map(agent => {
                    const displayName = agent.displayName ?? agent.hostname;
                    const clientName = clients.data?.find(c => c.id === agent.clientId)?.name ?? '—';
                    const siteName = siteNameMap.get(agent.siteId);
                    const deletedLabel = agent.deletedAt ? formatDateBrazil(agent.deletedAt) : '—';
                    const trashAgent: AgentWithClient = {
                      ...agent,
                      clientName,
                      clientId: agent.clientId ?? '',
                      siteName,
                    };
                    return (
                      <tr key={agent.id} className="align-top">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/10">
                              <ArchiveRestore className="h-4 w-4 text-danger" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">{displayName}</p>
                              {agent.displayName && agent.displayName !== agent.hostname && (
                                <p className="truncate font-mono text-xs text-muted">{agent.hostname}</p>
                              )}
                              <Badge color="danger">Excluído</Badge>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted">
                          <span className="block">{clientName}</span>
                          {siteName && <span className="block text-xs text-muted/80">{siteName}</span>}
                        </td>
                        <td className="hidden px-4 py-3 text-muted md:table-cell">{agent.operatingSystem ?? '—'}{agent.osVersion ? ` · ${agent.osVersion}` : ''}</td>
                        <td className="hidden px-4 py-3 font-mono text-muted lg:table-cell">{agent.lastIpAddress ?? '—'}</td>
                        <td className="px-4 py-3 text-muted">{deletedLabel}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => { void handleRestoreAgent(trashAgent); }}
                              loading={restoringAgentId === agent.id}
                              disabled={restoreAgent.isPending || purgeAgent.isPending}
                            >
                              <ArchiveRestore className="h-4 w-4" /> Restaurar
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => openPurgeAgentModal(trashAgent)}
                              disabled={restoreAgent.isPending || purgeAgent.isPending}
                            >
                              <Trash2 className="h-4 w-4" /> Excluir definitivamente
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : isLoadingAgents ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title={agentsWithStableIp.length === 0 ? 'Nenhum agente encontrado' : 'Nenhum agente corresponde aos filtros'}
          description={agentsWithStableIp.length === 0 ? 'Nenhum dispositivo registrado no sistema.' : 'Tente ajustar os filtros de busca.'}
          action={(search || filterClient || filterStatus !== 'all' || filterProvisioning !== 'all' || filterLabel) ? {
            label: 'Limpar filtros',
            onClick: () => {
              setSearch('');
              setFilterClient('');
              setFilterStatus('all');
              setFilterProvisioning('all');
              setFilterLabel('');
            },
          } : undefined}
        />
      ) : (
        <>
          <p className="text-xs text-muted">
            {filtered.length} agente{filtered.length !== 1 ? 's' : ''} exibido{filtered.length !== 1 ? 's' : ''} · Ordenação: {activeSortLabel} ({sortDirection === 'asc' ? 'crescente' : 'decrescente'})
          </p>

          {/* -- CARD VIEW -- */}
          {viewMode === 'card' && (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
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
                    className="group relative flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 text-left transition-all hover:border-primary/30 hover:bg-surface-light hover:shadow-lg"
                  >
                    <div className="absolute right-4 top-4">
                      <Badge color={online ? 'success' : 'slate'}>
                        <span className="flex items-center gap-1">
                          {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                          {online ? 'Online' : 'Offline'}
                        </span>
                      </Badge>
                    </div>
                    <div className="flex items-start gap-3 pr-6">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                        {getOsIconComponent(a.operatingSystem)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">{displayName}</p>
                        {a.displayName && a.displayName !== a.hostname && (
                          <p className="truncate font-mono text-xs text-muted">{a.hostname}</p>
                        )}
                        {isZeroTouchPending && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <Badge color="warning">Aguardando aprovação</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2 text-muted">
                        <Activity className="h-3.5 w-3.5 shrink-0 text-muted" />
                        <span className="truncate">{a.operatingSystem ?? '\u2014'}{a.osVersion ? ` · ${a.osVersion}` : ''}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted">
                        <span className="h-3.5 w-3.5 shrink-0 pt-px text-center font-mono text-[10px] leading-none text-muted">IP</span>
                        <span className="font-mono">{a.lastIpAddress ?? 'IP indisponível'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted" />
                        <span className="truncate">{a.clientName}</span>
                        {a.siteName && (
                          <>
                            <span className="text-muted/50">·</span>
                            <MapPin className="h-3 w-3 shrink-0 text-muted" />
                            <span className="truncate">{a.siteName}</span>
                          </>
                        )}
                      </div>
                      {/* Footer row: peers, ping, temp, disk% — before the heartbeat separator */}
                      <div className="flex items-center gap-3 text-muted pt-0.5">
                        {a.heartbeatMetrics?.p2pPeers != null && (
                          <span className="flex items-center gap-1 text-[10px]">
                            <Radio className="h-3 w-3" />
                            {a.heartbeatMetrics.p2pPeers} peers
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[10px]">
                          <Clock className="h-3 w-3" />
                          {relativeTime.text}
                        </span>
                        {a.heartbeatMetrics?.cpuTemperatureCelsius != null && (() => {
                          const t = a.heartbeatMetrics.cpuTemperatureCelsius;
                          const tempColor = t > 80 ? 'text-danger' : t > 60 ? 'text-warning' : '';
                          return (
                            <span className={`flex items-center gap-1 text-[10px] ${tempColor}`}>
                              <Thermometer className="h-3 w-3" />
                              {Math.round(t)}°C
                            </span>
                          );
                        })()}
                        {a.heartbeatMetrics?.diskPercent != null && (() => {
                          const pct = a.heartbeatMetrics.diskPercent;
                          const colorClass = pct >= 90 ? 'text-danger' : pct >= 70 ? 'text-warning' : '';
                          return (
                            <span className={`flex items-center gap-1 text-[10px] ${colorClass}`}>
                              <HardDrive className="h-3 w-3" />
                              {Math.round(pct)}%
                            </span>
                          );
                        })()}
                      </div>
                      {/* Heartbeat metrics */}
                      {a.heartbeatMetrics && (
                        <div className="border-t border-border pt-2 mt-1 space-y-1.5">
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
                          {(a.heartbeatMetrics.diskReadPercent != null || a.heartbeatMetrics.diskWritePercent != null) && (
                            <div className="flex items-stretch gap-2">
                              <span className="shrink-0 text-xs text-muted min-w-[2rem]">HDD</span>
                              {/* Leitura — mini bar ciano */}
                              <div className="flex flex-1 items-center gap-1.5">
                                <ArrowUp className="h-3 w-3 shrink-0 text-cyan-600 dark:text-cyan-400" />
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cyan-500/20">
                                  <div
                                    className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                                    style={{ width: `${Math.min(100, Math.max(0, a.heartbeatMetrics.diskReadPercent ?? 0))}%` }}
                                  />
                                </div>
                                <span className="shrink-0 text-[10px] font-medium tabular-nums text-cyan-600 dark:text-cyan-400">
                                  {a.heartbeatMetrics.diskReadPercent != null ? `${Math.round(a.heartbeatMetrics.diskReadPercent)}%` : '\u2014'}
                                </span>
                              </div>
                              {/* Escrita — mini bar âmbar */}
                              <div className="flex flex-1 items-center gap-1.5">
                                <ArrowDown className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-500/20">
                                  <div
                                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                                    style={{ width: `${Math.min(100, Math.max(0, a.heartbeatMetrics.diskWritePercent ?? 0))}%` }}
                                  />
                                </div>
                                <span className="shrink-0 text-[10px] font-medium tabular-nums text-amber-600 dark:text-amber-400">
                                  {a.heartbeatMetrics.diskWritePercent != null ? `${Math.round(a.heartbeatMetrics.diskWritePercent)}%` : '\u2014'}
                                </span>
                              </div>
                            </div>
                          )}

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

          {/* -- LIST VIEW -- */}
          {viewMode === 'list' && (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted">Agente</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted md:table-cell">Sistema Operacional</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted lg:table-cell">IP</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted sm:table-cell">Cliente</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted">Status</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted 2xl:table-cell">CPU</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted 2xl:table-cell">RAM</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted 2xl:table-cell">Leitura</th>
                    <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted lg:table-cell">Ping</th>
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
                        className="cursor-pointer transition-colors hover:bg-surface-light"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                              {getOsIconComponent(a.operatingSystem)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">{displayName}</p>
                              {a.displayName && a.displayName !== a.hostname && (
                                <p className="truncate font-mono text-xs text-muted">{a.hostname}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                          {a.operatingSystem ?? '\u2014'}{a.osVersion ? ` · ${a.osVersion}` : ''}
                        </td>
                        <td className="hidden px-4 py-3 font-mono text-muted lg:table-cell">
                          {a.lastIpAddress ?? '\u2014'}
                        </td>
                        <td className="hidden px-4 py-3 text-muted sm:table-cell">
                          {a.clientName}
                        </td>
                        <td className="px-4 py-3">
                          {isZeroTouchPending && canManageAgent ? (
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
                          ) : isZeroTouchPending ? (
                            <Badge color="warning">Aguardando aprovação</Badge>
                          ) : (
                            <Badge color={online ? 'success' : 'slate'}>
                              <span className="flex items-center gap-1">
                                {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                                {online ? 'Online' : 'Offline'}
                              </span>
                            </Badge>
                          )}
                        </td>
                        {/* Heartbeat metrics columns */}
                        <td className="hidden px-4 py-3 2xl:table-cell">
                          {a.heartbeatMetrics?.cpuPercent != null ? (
                            <MetricBar label="" value={a.heartbeatMetrics.cpuPercent} compact hideValue />
                          ) : (
                            <span className="text-xs text-muted">{'\u2014'}</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 2xl:table-cell">
                          {a.heartbeatMetrics?.memoryPercent != null ? (
                            <MetricBar label="" value={a.heartbeatMetrics.memoryPercent} compact hideValue />
                          ) : (
                            <span className="text-xs text-muted">{'\u2014'}</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 2xl:table-cell">
                          {a.heartbeatMetrics?.diskReadPercent != null ? (
                            <MetricBar label="" value={a.heartbeatMetrics.diskReadPercent} compact hideValue color="primary" />
                          ) : (
                            <span className="text-xs text-muted">{'\u2014'}</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-muted lg:table-cell" title={relativeTime.fullDate ?? undefined}>
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
            className="fixed z-50 min-w-[200px] rounded-lg border border-border bg-surface shadow-xl"
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover"
              onClick={() => {
                void openRemoteControl(contextMenu.agent);
              }}
            >
              <Monitor className="h-4 w-4" />
              Acesso remoto
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover"
              onClick={() => {
                void openRemoteDebug(contextMenu.agent);
              }}
              disabled={remoteDebugAgentId === contextMenu.agent.id}
            >
              <Bug className="h-4 w-4" />
              {remoteDebugAgentId === contextMenu.agent.id ? 'Abrindo debug...' : 'Ver debug'}
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                void handleTriggerAgentUpdate(contextMenu.agent);
              }}
              disabled={updatingAgentId === contextMenu.agent.id}
            >
              <RefreshCw className="h-4 w-4" />
              {updatingAgentId === contextMenu.agent.id ? 'Disparando update...' : 'Atualizar agente'}
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => openNotificationModal(contextMenu.agent)}
              disabled={!canExecuteAgent}
              title={canExecuteAgent ? undefined : 'Sem permissão para executar ações no agente'}
            >
              <Bell className="h-4 w-4" />
              Enviar notificação
              {!canExecuteAgent && <Badge>sem permissão</Badge>}
            </button>
            {isAgentOnlineNow(contextMenu.agent, now) && (
              <div
                className="relative flex w-full"
                onMouseEnter={() => setPowerSubmenuOpen(true)}
                onMouseLeave={() => setPowerSubmenuOpen(false)}
              >
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-amber-700 transition-colors hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10"
                >
                  <Zap className="h-4 w-4" />
                  Energia
                  <ChevronRight className="ml-auto h-4 w-4" />
                </button>
                {powerSubmenuOpen && (
                  <div className="absolute left-full top-0 z-50 min-w-[180px] overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => handleRestartAgent(contextMenu.agent)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reiniciar
                    </button>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-500/10"
                      onClick={() => handleShutdownAgent(contextMenu.agent)}
                    >
                      <Power className="h-4 w-4" />
                      Desligar
                    </button>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-success transition-colors hover:bg-success/10 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled
                      title="Disponível em breve"
                    >
                      <Zap className="h-4 w-4" />
                      Ligar
                      <Badge>em breve</Badge>
                    </button>
                  </div>
                )}
              </div>
            )}
            {!isAgentOnlineNow(contextMenu.agent, now) && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-violet-700 dark:text-violet-300 transition-colors hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => handleWakeOnLan(contextMenu.agent)}
                disabled={wakeOnLan.isPending}
              >
                <Zap className="h-4 w-4" />
                {wakeOnLan.isPending ? 'Enviando...' : 'Wake-on-LAN'}
              </button>
            )}
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
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover"
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
                className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-500/10"
                onClick={() => {
                  openDeleteAgentModal(contextMenu.agent);
                }}
                disabled={deleteAgent.isPending}
              >
                <Trash2 className="h-4 w-4" />
                {deletingAgentId === contextMenu.agent.id ? 'Movendo...' : 'Mover para a lixeira'}
              </button>
            )}
          </div>
        </>
      )}

      {/* Soft delete: mover para a lixeira (restaurável) */}
      <ConfirmDialog
        open={deleteConfirmAgent !== null}
        title="Mover agente para a lixeira"
        message={
          <>
            O agente <span className="font-semibold">{deleteConfirmAgent?.displayName ?? deleteConfirmAgent?.hostname}</span> será movido para a lixeira e poderá ser restaurado depois. Os dados (hardware, software, comandos, tokens) são mantidos.
          </>
        }
        confirmLabel="Mover para a lixeira"
        isLoading={deleteAgent.isPending}
        onClose={closeDeleteAgentModal}
        onConfirm={() => { void handleDeleteAgent(); }}
      />

      {/* Hard delete: exclusão definitiva (exige digitar o nome) */}
      <Modal
        open={!!purgeTarget}
        onClose={closePurgeAgentModal}
        title="Excluir agente definitivamente"
        maxWidth="max-w-lg"
      >
        {purgeTarget && (
          <div className="space-y-4">
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-foreground">
              <p>
                Você está prestes a excluir DEFINITIVAMENTE o agente{' '}
                <span className="font-semibold text-foreground">{purgeTarget.displayName ?? purgeTarget.hostname}</span>.
              </p>
              <p className="mt-1 text-muted">Esta ação não pode ser desfeita. Hardware, software, comandos, tokens, labels e histórico do agente são removidos do banco. Chamados e logs já registrados permanecem no histórico, mas deixam de ficar vinculados ao agente.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="purge-confirm-name" className="text-sm font-medium text-foreground">
                Digite <span className="font-semibold text-danger">{purgeTarget.displayName ?? purgeTarget.hostname}</span> para confirmar:
              </label>
              <Input
                id="purge-confirm-name"
                value={purgeConfirmName}
                onChange={(e) => setPurgeConfirmName(e.target.value)}
                placeholder={purgeTarget.displayName ?? purgeTarget.hostname}
                disabled={purgeAgent.isPending}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={closePurgeAgentModal}
                disabled={purgeAgent.isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  void handlePurgeAgent();
                }}
                loading={purgeAgent.isPending}
                disabled={purgeConfirmName.trim() !== (purgeTarget.displayName ?? purgeTarget.hostname).trim() || purgeAgent.isPending}
              >
                Excluir definitivamente
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Agente com chamados vinculados: confirmação reforçada (force) */}
      <ConfirmDialog
        open={purgeForceTarget !== null}
        title="Agente vinculado a chamados"
        message={
          <>
            O agente <span className="font-semibold">{purgeForceTarget?.displayName ?? purgeForceTarget?.hostname}</span> possui chamados vinculados. Eles continuam registrados no histórico, mas sem vínculo com o agente. Excluir definitivamente?
          </>
        }
        confirmLabel="Excluir definitivamente"
        isLoading={purgeAgent.isPending}
        onClose={() => { if (!purgeAgent.isPending) setPurgeForceTarget(null); }}
        onConfirm={() => { void handleForcePurge(); }}
      />

      <TransferAgentModal
        open={!!transferAgent}
        onClose={closeTransferAgentModal}
        agent={transferAgent ? { id: transferAgent.id, siteId: transferAgent.siteId, hostname: transferAgent.hostname, displayName: transferAgent.displayName } as Agent : null}
      />

      {powerActionAgent && (
        <PowerActionModal
          agent={powerActionAgent.agent}
          action={powerActionAgent.action}
          onClose={() => setPowerActionAgent(null)}
          onConfirm={handlePowerActionConfirm}
          isLoading={restartAgent.isPending || shutdownAgent.isPending}
        />
      )}

      {wolAgent && (
        <WakeOnLanModal
          agent={wolAgent}
          onClose={() => setWolAgent(null)}
          onConfirm={handleWakeOnLanConfirm}
          isLoading={wakeOnLan.isPending}
        />
      )}

      {notificationAgent && (
        <AgentNotificationModal
          agent={notificationAgent}
          onClose={() => setNotificationAgent(null)}
          onConfirm={handleNotificationConfirm}
          isLoading={sendAgentNotification.isPending}
        />
      )}
    </div>
  );
}
