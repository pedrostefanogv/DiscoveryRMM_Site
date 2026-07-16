import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Cpu, MemoryStick, Ticket as TicketIcon,
  Wifi, WifiOff, AppWindow, Search, Clock, Printer, Bug, AlertTriangle, Trash2, ShieldCheck, Plus, Gauge, Power, RotateCcw, Zap, ChevronDown, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getDeleteAgentErrorMessage, useAgent, useAgentHardware, useAgentHardwareComponents, useAgentSoftware, useAgentSoftwareSnapshot, useApproveZeroTouch, useDeleteAgent, useRestartAgent, useShutdownAgent, useWakeOnLan } from '@/hooks/useAgents';
import { formatBytes, formatDate, formatSocketFamily } from './agentDetailUtils';
import { useTickets } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { useRunMeshCentralNodeLinksBackfill, useRunMeshCentralNodeLinksBackfillDryRun } from '@/hooks';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, Input, Select, DataTable, Modal, StatCard, AgentHeartbeatCard, Tooltip, type Column } from '@/components/ui';
import { ensureArray } from '@/utils/ensureArray';
import PowerActionModal from '@/components/agents/PowerActionModal';
import WakeOnLanModal from '@/components/agents/WakeOnLanModal';
import { NotesPanel } from '@/components/notes/NotesPanel';
import type { AgentSoftwareInventoryItem, ListeningPortInfo, LogEntry, MeshCentralNodeLinksBackfillItem, MeshCentralNodeLinksBackfillReport, OpenSocketInfo } from '@/api';
import { ApiError, LogLevel, agentUpdatesApi, agentsApi } from '@/api';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { useNowTick } from '@/hooks/useNowTick';
import { isHeartbeatTimestampFresh, useAgentHeartbeat } from '@/stores/heartbeatStore';
import { agentLabelsApi } from '@/modules/agent-labels/api';
import { AgentLabelSourceType, type AgentLabel } from '@/modules/agent-labels/types';
import { openRemoteDebugPopup } from './remoteDebugLauncher';
import { useAuthorization } from '@/auth/authorization';

const levelLabels: Record<number, { label: string; color: 'slate' | 'primary' | 'warning' | 'danger' | 'accent' }> = {
  [LogLevel.Debug]: { label: 'Debug', color: 'slate' },
  [LogLevel.Info]: { label: 'Info', color: 'primary' },
  [LogLevel.Warning]: { label: 'Aviso', color: 'warning' },
  [LogLevel.Error]: { label: 'Erro', color: 'danger' },
  [LogLevel.Critical]: { label: 'Crítico', color: 'danger' },
};

// formatBytes, formatDate, formatSocketFamily — importadas de ./agentDetailUtils

function printerStatusColor(status: string | null): 'success' | 'warning' | 'danger' | 'slate' {
  if (!status) return 'slate';
  const normalized = status.toLowerCase();
  if (normalized.includes('ready') || normalized.includes('pronta')) return 'success';
  if (normalized.includes('error') || normalized.includes('erro') || normalized.includes('offline')) return 'danger';
  if (normalized.includes('warn') || normalized.includes('warning') || normalized.includes('paus')) return 'warning';
  return 'slate';
}

function nodeLinkStatusColor(status: string): 'success' | 'warning' | 'danger' | 'accent' | 'slate' {
  const normalized = status.toLowerCase();
  if (normalized === 'verified') return 'success';
  if (normalized === 'linked') return 'accent';
  if (normalized === 'suggested') return 'warning';
  if (normalized === 'ambiguous' || normalized === 'error') return 'danger';
  return 'slate';
}

type AgentDetailDataTab = 'software' | 'printers' | 'tickets' | 'listeningPorts' | 'openSockets' | 'logs';

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [softwareLimitSelected, setSoftwareLimitSelected] = useState('10');
  const [softwareOrder, setSoftwareOrder] = useState<'asc' | 'desc'>('desc');
  const [softwareSearchInput, setSoftwareSearchInput] = useState('');
  const [softwareSearchApplied, setSoftwareSearchApplied] = useState('');
  const [softwarePage, setSoftwarePage] = useState(1);
  const [listeningPortsPage, setListeningPortsPage] = useState(1);
  const [listeningPortsLimit, setListeningPortsLimit] = useState('10');
  const [listeningPortsSearch, setListeningPortsSearch] = useState('');
  const [openSocketsPage, setOpenSocketsPage] = useState(1);
  const [openSocketsLimit, setOpenSocketsLimit] = useState('10');
  const [openSocketsSearch, setOpenSocketsSearch] = useState('');
  const [allLabels, setAllLabels] = useState<AgentLabel[]>([]);
  const [isLoadingLabels, setIsLoadingLabels] = useState(true);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [isAddingManualLabel, setIsAddingManualLabel] = useState(false);
  const [distinctLabels, setDistinctLabels] = useState<string[]>([]);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [labelPickerQuery, setLabelPickerQuery] = useState('');
  const labelPickerRef = useRef<HTMLDivElement>(null);
  const [isOpeningRemoteDebug, setIsOpeningRemoteDebug] = useState(false);
  const [isReconcilingNodeLink, setIsReconcilingNodeLink] = useState(false);
  const [isApplyingNodeLink, setIsApplyingNodeLink] = useState(false);
  const [isTriggeringAgentUpdate, setIsTriggeringAgentUpdate] = useState(false);
  const [isApprovingZeroTouch, setIsApprovingZeroTouch] = useState(false);
  const [isRefreshingPorts, setIsRefreshingPorts] = useState(false);
  const [isRefreshingConnections, setIsRefreshingConnections] = useState(false);
  const [isRefreshingSoftware, setIsRefreshingSoftware] = useState(false);
  const [isRefreshingPrinters, setIsRefreshingPrinters] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmHostname, setDeleteConfirmHostname] = useState('');
  const [nodeLinkPreviewOpen, setNodeLinkPreviewOpen] = useState(false);
  const [nodeLinkPreviewError, setNodeLinkPreviewError] = useState<string | null>(null);
  const [nodeLinkPreviewReport, setNodeLinkPreviewReport] = useState<MeshCentralNodeLinksBackfillReport | null>(null);
  const [activeDataTab, setActiveDataTab] = useState<AgentDetailDataTab>('software');
  const [isPowerMenuOpen, setIsPowerMenuOpen] = useState(false);
  const [powerAction, setPowerAction] = useState<'restart' | 'shutdown' | null>(null);
  const [wakeOnLanModalOpen, setWakeOnLanModalOpen] = useState(false);

  const { hasAnyPermission } = useAuthorization();
  const canManageAgent = hasAnyPermission(['Agents.Edit', 'agents.*', 'admin.*']);
  const deleteAgent = useDeleteAgent();
  const approveZeroTouch = useApproveZeroTouch();
  const restartAgent = useRestartAgent();
  const shutdownAgent = useShutdownAgent();
  const wakeOnLan = useWakeOnLan();
  const agent = useAgent(id!);
  const liveHeartbeat = useAgentHeartbeat(id!);
  const hw = useAgentHardware(id!);
  const hwComponents = useAgentHardwareComponents(id!);
  // Busca todos os itens de uma vez (limit=500) e faz paginação client-side.
  // O cursor pagination do backend retorna itens duplicados entre páginas,
  // então usar fetchNextPage + slice client-side é inviável.
  const software = useAgentSoftware(id!, {
    limit: 500,
    search: softwareSearchApplied,
    order: softwareOrder,
  });
  const softwareSnapshot = useAgentSoftwareSnapshot(id!);
  const agentLogs = useLogs({ agentId: id, limit: 10 });
  const agentTickets = useTickets({ agentId: id, limit: 5 });
  const nodeLinkBackfillDryRun = useRunMeshCentralNodeLinksBackfillDryRun();
  const nodeLinkBackfillApply = useRunMeshCentralNodeLinksBackfill();
  const now = useNowTick(5_000);
  const powerMenuRef = useRef<HTMLDivElement>(null);

  // Normaliza logs como array plano (defesa contra API retornar objeto paginado)
  const logsArray = useMemo(() => ensureArray<LogEntry>(agentLogs.data), [agentLogs.data]);

  useEffect(() => {
    let isCancelled = false;

    async function loadAgentLabels() {
      if (!id) {
        setAllLabels([]);
        setIsLoadingLabels(false);
        return;
      }

      setIsLoadingLabels(true);
      setLabelsError(null);

      try {
        const [data, distinct] = await Promise.all([
          agentLabelsApi.getAgentLabels(id),
          agentLabelsApi.getDistinctLabels(),
        ]);
        if (isCancelled) return;

        const sorted = data.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        setAllLabels(sorted);
        setDistinctLabels(distinct);
      } catch {
        if (isCancelled) return;
        setLabelsError('Falha ao carregar labels.');
      } finally {
        if (!isCancelled) {
          setIsLoadingLabels(false);
        }
      }
    }

    void loadAgentLabels();

    return () => {
      isCancelled = true;
    };
  }, [id]);

  // Close label picker on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (labelPickerRef.current && !labelPickerRef.current.contains(event.target as Node)) {
        setShowLabelPicker(false);
        setLabelPickerQuery('');
      }

      if (powerMenuRef.current && !powerMenuRef.current.contains(event.target as Node)) {
        setIsPowerMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleAddManualLabel(label: string) {
    if (!label || !id) return;

    setIsAddingManualLabel(true);
    try {
      const created = await agentLabelsApi.addManualLabel(id, label);
      setAllLabels(prev =>
        [...prev, created].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
      );
      toast.success(`Label "${label}" adicionada.`);
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err) {
        const apiErr = err as { status?: number; message?: string };
        if (apiErr.status === 409) {
          toast.error('Este agente já possui essa label.');
          return;
        }
        if (apiErr.status === 400) {
          toast.error(apiErr.message || 'Label inválida.');
          return;
        }
      }
      toast.error('Falha ao adicionar label manual.');
    } finally {
      setIsAddingManualLabel(false);
    }
  }

  async function handleRemoveManualLabel(labelId: string) {
    try {
      await agentLabelsApi.removeManualLabel(labelId);
      setAllLabels(prev => prev.filter(item => item.id !== labelId));
      toast.success('Label manual removida.');
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err) {
        const apiErr = err as { status?: number; message?: string };
        if (apiErr.status === 400) {
          toast.error(apiErr.message || 'Não é possível remover label automática por este endpoint.');
          return;
        }
        if (apiErr.status === 404) {
          toast.error('Label não encontrada.');
          return;
        }
      }
      toast.error('Falha ao remover label manual.');
    }
  }

  const a = agent.data;
  const aWithHeartbeat = useMemo(() => {
    if (!a) return null;
    const hasFreshLiveHeartbeat =
      liveHeartbeat &&
      isHeartbeatTimestampFresh(
        liveHeartbeat.timestampUtc,
        now,
        undefined,
        liveHeartbeat.receivedAtUtc,
      );

    const freshFallbackMetrics =
      a.heartbeatMetrics &&
      isHeartbeatTimestampFresh(
        a.heartbeatMetrics.timestampUtc,
        now,
        undefined,
        a.heartbeatMetrics.receivedAtUtc,
      )
        ? a.heartbeatMetrics
        : undefined;

    if (!hasFreshLiveHeartbeat) {
      if (freshFallbackMetrics === a.heartbeatMetrics) {
        return a;
      }

      return {
        ...a,
        heartbeatMetrics: freshFallbackMetrics,
      };
    }

    return {
      ...a,
      heartbeatMetrics: {
        cpuPercent: liveHeartbeat.cpuPercent,
        memoryPercent: liveHeartbeat.memoryPercent,
        diskPercent: liveHeartbeat.diskPercent,
        memoryTotalGb: liveHeartbeat.memoryTotalGb,
        memoryUsedGb: liveHeartbeat.memoryUsedGb,
        diskTotalGb: liveHeartbeat.diskTotalGb,
        diskUsedGb: liveHeartbeat.diskUsedGb,
        diskReadPercent: liveHeartbeat.diskReadPercent,
        diskWritePercent: liveHeartbeat.diskWritePercent,
        diskResponseMs: liveHeartbeat.diskResponseMs,
        p2pPeers: liveHeartbeat.p2pPeers,
        uptimeSeconds: liveHeartbeat.uptimeSeconds,
        processCount: liveHeartbeat.processCount,
        ipAddress: liveHeartbeat.ipAddress,
        hostname: liveHeartbeat.hostname,
        agentVersion: liveHeartbeat.agentVersion,
        timestampUtc: liveHeartbeat.timestampUtc,
      },
    };
  }, [a, liveHeartbeat, now]);

  // ── Software pagination data (client-side sobre todos os itens carregados da API) ──
  // Deduplica por inventoryId (backend pode retornar duplicatas entre páginas de cursor)
  const softwareAllItems = useMemo(() => {
    const allPages = software.data?.pages.flatMap(p => p.items ?? []) ?? [];
    const seen = new Set<string>();
    return allPages.filter(item => {
      if (seen.has(item.inventoryId)) return false;
      seen.add(item.inventoryId);
      return true;
    });
  }, [software.data?.pages]);

  // snapshot.totalInstalled é a fonte de verdade para o total; fallback para itens carregados
  const softwareTotalCount = softwareSnapshot.data?.totalInstalled ?? softwareAllItems.length;
  const limit = softwareLimitSelected === 'max' ? Math.max(1, softwareTotalCount) : Number(softwareLimitSelected);
  const softwareTotalPages = Math.max(1, Math.ceil(softwareTotalCount / limit));
  const safeSoftwarePage = Math.min(softwarePage, softwareTotalPages);
  const startIdx = (safeSoftwarePage - 1) * limit;
  const softwareItems = softwareAllItems.slice(startIdx, startIdx + limit);

  // Auto-fetch de páginas restantes da API enquanto houver hasMore
  useEffect(() => {
    if (
      software.hasNextPage &&
      !software.isFetching &&
      !software.isFetchingNextPage &&
      software.data
    ) {
      software.fetchNextPage();
    }
  }, [
    software.hasNextPage,
    software.isFetching,
    software.isFetchingNextPage,
    software.fetchNextPage,
    software.data,
  ]);

  // Corrige estado da página para o range válido quando o total diminui (ex.: busca/filtro)
  useEffect(() => {
    if (softwarePage !== safeSoftwarePage) {
      setSoftwarePage(safeSoftwarePage);
    }
  }, [softwarePage, safeSoftwarePage]);

  // ── Listening Ports / Open Sockets — extrair do hwComponents (antes dos early returns) ──
  const listeningPorts: ListeningPortInfo[] = hwComponents.data?.listeningPorts ?? [];
  const openSockets: OpenSocketInfo[] = hwComponents.data?.openSockets ?? [];

  // ── Listening Ports pagination data (client-side) ──
  const portsFiltered = useMemo(() => {
    const q = listeningPortsSearch.toLowerCase();
    if (!q) return listeningPorts;
    return listeningPorts.filter(
      p =>
        (p.processName ?? '').toLowerCase().includes(q) ||
        String(p.processId).includes(q) ||
        (p.protocol ?? '').toLowerCase().includes(q) ||
        (p.address ?? '').toLowerCase().includes(q) ||
        String(p.port).includes(q) ||
        (p.processPath ?? '').toLowerCase().includes(q),
    );
  }, [listeningPorts, listeningPortsSearch]);
  const portsLimit = Number(listeningPortsLimit);
  const portsTotalCount = portsFiltered.length;
  const portsTotalPages = Math.max(1, Math.ceil(portsTotalCount / portsLimit));
  const safePortsPage = Math.min(listeningPortsPage, portsTotalPages);
  const portsStartIdx = (safePortsPage - 1) * portsLimit;
  const portsPageItems = portsFiltered.slice(portsStartIdx, portsStartIdx + portsLimit);

  useEffect(() => {
    if (listeningPortsPage !== safePortsPage) {
      setListeningPortsPage(safePortsPage);
    }
  }, [listeningPortsPage, safePortsPage]);

  const canGoPrevPortsPage = safePortsPage > 1;
  const canGoNextPortsPage = safePortsPage < portsTotalPages;
  const resetPortsPagination = () => setListeningPortsPage(1);
  const goToNextPortsPage = () => setListeningPortsPage((p) => Math.min(p + 1, portsTotalPages));
  const goToPreviousPortsPage = () => setListeningPortsPage((p) => Math.max(1, p - 1));

  // ── Open Sockets pagination data (client-side) ──
  const socketsFiltered = useMemo(() => {
    const q = openSocketsSearch.toLowerCase();
    if (!q) return openSockets;
    return openSockets.filter(
      s =>
        (s.processName ?? '').toLowerCase().includes(q) ||
        String(s.processId).includes(q) ||
        (s.protocol ?? '').toLowerCase().includes(q) ||
        (s.localAddress ?? '').toLowerCase().includes(q) ||
        (s.remoteAddress ?? '').toLowerCase().includes(q) ||
        String(s.localPort).includes(q) ||
        String(s.remotePort).includes(q),
    );
  }, [openSockets, openSocketsSearch]);
  const socketsLimit = Number(openSocketsLimit);
  const socketsTotalCount = socketsFiltered.length;
  const socketsTotalPages = Math.max(1, Math.ceil(socketsTotalCount / socketsLimit));
  const safeSocketsPage = Math.min(openSocketsPage, socketsTotalPages);
  const socketsStartIdx = (safeSocketsPage - 1) * socketsLimit;
  const socketsPageItems = socketsFiltered.slice(socketsStartIdx, socketsStartIdx + socketsLimit);

  useEffect(() => {
    if (openSocketsPage !== safeSocketsPage) {
      setOpenSocketsPage(safeSocketsPage);
    }
  }, [openSocketsPage, safeSocketsPage]);

  const canGoPrevSocketsPage = safeSocketsPage > 1;
  const canGoNextSocketsPage = safeSocketsPage < socketsTotalPages;
  const resetSocketsPagination = () => setOpenSocketsPage(1);
  const goToNextSocketsPage = () => setOpenSocketsPage((p) => Math.min(p + 1, socketsTotalPages));
  const goToPreviousSocketsPage = () => setOpenSocketsPage((p) => Math.max(1, p - 1));

  if (agent.isLoading) return <Loading />;
  if (agent.isError || !a || !aWithHeartbeat) return <ErrorDisplay onRetry={() => agent.refetch()} />;

  const isOnlineNow = isAgentOnlineNow(aWithHeartbeat, now);
  const isZeroTouchPending = aWithHeartbeat.zeroTouchPending === true;
  const canGoPrevSoftwarePage = safeSoftwarePage > 1;
  const canGoNextSoftwarePage = safeSoftwarePage < softwareTotalPages;
  const disks = hw.data?.disks ?? [];
  const totalDiskBytes = disks.reduce((acc, disk) => acc + (disk.totalSizeBytes ?? 0), 0);
  const freeDiskBytes = disks.reduce((acc, disk) => acc + (disk.freeSpaceBytes ?? 0), 0);
  const usedDiskBytes = Math.max(0, totalDiskBytes - freeDiskBytes);
  const diskUsagePercent = totalDiskBytes > 0 ? Math.min(100, Math.round((usedDiskBytes / totalDiskBytes) * 100)) : null;
  const printers = hwComponents.data?.printers ?? [];
  const currentNodeLinkItem = nodeLinkPreviewReport?.items.find((item) => item.agentId === a.id) ?? null;
  const machineScoreRaw = a.machineScore ?? hw.data?.hardware?.machineScore ?? null;
  const machineScore = typeof machineScoreRaw === 'number' && Number.isFinite(machineScoreRaw)
    ? Math.max(1, Math.round(machineScoreRaw))
    : null;
  const machineScoreTone: 'success' | 'accent' | 'warning' =
    machineScore === null
      ? 'warning'
      : machineScore >= 100
        ? 'success'
        : machineScore >= 60
          ? 'accent'
          : 'warning';
  const machineScoreHint =
    machineScore === null
      ? null
      : machineScore >= 100
        ? 'Acima da baseline'
        : machineScore >= 60
          ? 'Intermediário'
          : 'Entrada';
  const processorModelFull = hw.data?.hardware?.processor ?? null;
  const processorModelDisplay = processorModelFull
    ? processorModelFull.split(' ').slice(0, 4).join(' ')
    : 'Modelo indisponível';
  const processorValue = hw.data?.hardware?.processor
    ? `${hw.data.hardware.processorCores ?? '?'}C / ${hw.data.hardware.processorThreads ?? '?'}T`
    : '\u2014';
  const softwareTotalInstalled = softwareSnapshot.isLoading ? '\u2014' : (softwareSnapshot.data?.totalInstalled ?? softwareTotalCount);
  const softwareLastCollectedAt = softwareSnapshot.data?.lastCollectedAt ?? softwareSnapshot.data?.updatedAt ?? null;
  const softwareLastCollectedLabel = softwareLastCollectedAt
    ? new Date(softwareLastCollectedAt).toLocaleString('pt-BR')
    : 'Sem coleta registrada';
  const manualLabelsCount = allLabels.filter((item) => item.sourceType === AgentLabelSourceType.Manual).length;
  const automaticLabelsCount = Math.max(0, allLabels.length - manualLabelsCount);

  const listeningPortColumns: Column<ListeningPortInfo>[] = [
    {
      key: 'protocol',
      header: 'Protocolo',
      className: 'w-24',
      sortable: false,
      render: item => <span className="font-mono uppercase text-muted-foreground">{item.protocol ?? '\u2014'}</span>,
    },
    {
      key: 'address',
      header: 'Endereço',
      sortable: false,
      render: item => (
        <span className="font-mono text-muted-foreground">
          {item.address ?? '\u2014'}:{item.port}
        </span>
      ),
    },
    {
      key: 'process',
      header: 'Processo',
      sortable: false,
      render: item => (
        <div>
          <p className="text-sm text-foreground">{item.processName ?? '\u2014'}</p>
          <p className="text-xs text-muted">PID {item.processId}</p>
        </div>
      ),
    },
    {
      key: 'collectedAt',
      header: 'Última coleta',
      sortable: false,
      render: item => formatDate(item.collectedAt),
    },
  ];

  const openSocketColumns: Column<OpenSocketInfo>[] = [
    {
      key: 'protocol',
      header: 'Protocolo',
      className: 'w-24',
      sortable: false,
      render: item => <span className="font-mono uppercase text-muted-foreground">{item.protocol ?? '\u2014'}</span>,
    },
    {
      key: 'family',
      header: 'Família',
      className: 'w-20',
      sortable: false,
      render: item => <Badge color="slate">{formatSocketFamily(item.family)}</Badge>,
    },
    {
      key: 'local',
      header: 'Origem',
      sortable: false,
      render: item => (
        <span className="font-mono text-muted-foreground">
          {item.localAddress ?? '\u2014'}:{item.localPort}
        </span>
      ),
    },
    {
      key: 'remote',
      header: 'Destino',
      sortable: false,
      render: item => (
        <span className="font-mono text-muted-foreground">
          {item.remoteAddress ?? '\u2014'}:{item.remotePort}
        </span>
      ),
    },
    {
      key: 'process',
      header: 'Processo',
      sortable: false,
      render: item => (
        <div>
          <p className="text-sm text-foreground">{item.processName ?? '\u2014'}</p>
          <p className="text-xs text-muted">PID {item.processId}</p>
        </div>
      ),
    },
    {
      key: 'collectedAt',
      header: 'Última coleta',
      sortable: false,
      render: item => formatDate(item.collectedAt),
    },
  ];

  const resetSoftwarePagination = () => {
    setSoftwarePage(1);
  };

  const handleApplySoftwareFilters = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSoftwareSearchApplied(softwareSearchInput.trim());
    resetSoftwarePagination();
  };

  const handleClearSoftwareSearch = () => {
    setSoftwareSearchInput('');
    setSoftwareSearchApplied('');
    resetSoftwarePagination();
  };

  const handleSoftwareLimitChange = (value: string) => {
    setSoftwareLimitSelected(value);
    resetSoftwarePagination();
  };

  const handleSoftwareOrderChange = (value: 'asc' | 'desc') => {
    setSoftwareOrder(value);
    resetSoftwarePagination();
  };

  const handleOpenRemoteDebug = async () => {
    if (!id || isOpeningRemoteDebug) return;

    setIsOpeningRemoteDebug(true);
    try {
      await openRemoteDebugPopup({
        agentId: id,
        payload: {
          logLevel: 'info',
          preferredTransport: 'nats',
          ttlMinutes: 20,
        },
      });
      toast.success('Console de debug aberto em nova janela.');
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Falha ao abrir o console de remote debug.';
      toast.error(message);
    } finally {
      setIsOpeningRemoteDebug(false);
    }
  };

  const closeDeleteAgentModal = () => {
    if (deleteAgent.isPending) return;
    setDeleteConfirmOpen(false);
    setDeleteConfirmHostname('');
  };

  const handleDeleteAgent = () => {
    if (!id) return;
    setDeleteConfirmHostname('');
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteAgent = async () => {
    if (!id) return;
    const expectedHostname = (a.displayName ?? a.hostname).trim();

    if (deleteConfirmHostname.trim() !== expectedHostname) {
      toast.error('O hostname digitado não confere. Verifique e tente novamente.');
      return;
    }

    try {
      await deleteAgent.mutateAsync(id);
      toast.success('Agente excluído com sucesso.');
      setDeleteConfirmOpen(false);
      setDeleteConfirmHostname('');
      navigate('/agents', { replace: true });
    } catch (error) {
      toast.error(getDeleteAgentErrorMessage(error));
    }
  };

  const handleTriggerAgentUpdate = async () => {
    if (!id || isTriggeringAgentUpdate) return;

    setIsTriggeringAgentUpdate(true);
    try {
      await agentUpdatesApi.forceAgentCheck(id);
      toast.success('Atualização do agente disparada com sucesso.');
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Falha ao disparar atualização do agente.';
      toast.error(message);
    } finally {
      setIsTriggeringAgentUpdate(false);
    }
  };

  const handleApproveZeroTouch = async () => {
    if (!id || !isZeroTouchPending || !canManageAgent || isApprovingZeroTouch) return;

    const confirmed = window.confirm(
      `Aprovar o provisionamento Zero-Touch do agente "${a.displayName ?? a.hostname}"?`,
    );
    if (!confirmed) return;

    setIsApprovingZeroTouch(true);
    try {
      await approveZeroTouch.mutateAsync(id);
      toast.success('Agente aprovado para comunicação com a API.');
      await agent.refetch();
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Falha ao aprovar o agente.';
      toast.error(message);
    } finally {
      setIsApprovingZeroTouch(false);
    }
  };

  const handleOpenPowerAction = (action: 'restart' | 'shutdown') => {
    setIsPowerMenuOpen(false);
    setPowerAction(action);
  };

  const handleOpenWakeOnLan = () => {
    setIsPowerMenuOpen(false);
    setWakeOnLanModalOpen(true);
  };

  const handlePowerActionConfirm = async (data: { delaySeconds: number; force: boolean; message: string }) => {
    if (!id || !powerAction) return;

    if (powerAction === 'restart') {
      await restartAgent.mutateAsync({ id, data });
    } else {
      await shutdownAgent.mutateAsync({ id, data });
    }

    await agent.refetch();
  };

  const handleWakeOnLanConfirm = async (data: { broadcastAddress?: string }) => {
    if (!id) {
      throw new Error('Agente inválido para Wake-on-LAN.');
    }

    const response = await wakeOnLan.mutateAsync({ id, data });
    await agent.refetch();
    return response;
  };

  const handleNodeLinkDryRun = async () => {
    if (!a.siteId || isReconcilingNodeLink) return;

    setNodeLinkPreviewOpen(true);
    setNodeLinkPreviewError(null);
    setNodeLinkPreviewReport(null);
    setIsReconcilingNodeLink(true);
    try {
      const report = await nodeLinkBackfillDryRun.mutateAsync({
        siteId: a.siteId,
      });
      setNodeLinkPreviewReport(report);
      const current = report.items.find((item) => item.agentId === a.id);
      if (current) {
        toast.success(
          `Node link dry-run: ${current.status} · sugestão ${current.suggestedNodeId ?? 'N/A'}`,
        );
      } else {
        toast.success('Dry-run de node links concluído para o site.');
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setNodeLinkPreviewError('Sem permissão para reconciliar links de node neste escopo.');
        toast.error('Sem permissão para reconciliar links de node neste escopo.');
      } else if (error instanceof ApiError && error.status === 503) {
        setNodeLinkPreviewError('Falha operacional/configuração do MeshCentral.');
        toast.error('Falha operacional/configuração do MeshCentral.');
      } else {
        const message = error instanceof Error
          ? error.message
          : 'Falha ao executar dry-run de node links.';
        setNodeLinkPreviewError(message);
        toast.error(message);
      }
    } finally {
      setIsReconcilingNodeLink(false);
    }
  };

  const handleNodeLinkApply = async () => {
    if (!a.siteId || isApplyingNodeLink || !nodeLinkPreviewReport) return;
    if (nodeLinkPreviewReport.ambiguousAgents > 0) {
      toast.error('Existem links ambiguos no site. Faça tratativa manual antes de aplicar.');
      return;
    }

    const confirmed = window.confirm(
      'Aplicar reconcile atualizará vínculos meshcentral_node_id no site. Deseja continuar?',
    );
    if (!confirmed) return;

    setIsApplyingNodeLink(true);
    try {
      const report = await nodeLinkBackfillApply.mutateAsync({
        applyChanges: true,
        siteId: a.siteId,
      });
      setNodeLinkPreviewReport(report);
      setNodeLinkPreviewError(null);
      toast.success('Reconcile de node links aplicado com sucesso.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast.error('Sem permissão para aplicar reconcile de node links neste escopo.');
      } else if (error instanceof ApiError && error.status === 503) {
        toast.error('Falha operacional/configuração do MeshCentral.');
      } else {
        const message = error instanceof Error
          ? error.message
          : 'Falha ao aplicar reconcile de node links.';
        toast.error(message);
      }
    } finally {
      setIsApplyingNodeLink(false);
    }
  };

  const goToNextSoftwarePage = () => setSoftwarePage((p) => Math.min(p + 1, softwareTotalPages));
  const goToPreviousSoftwarePage = () => setSoftwarePage((p) => Math.max(1, p - 1));

  // -- On-demand data refresh handlers ----------------------------------

  const handleRefreshPorts = async () => {
    if (!id || isRefreshingPorts) return;
    setIsRefreshingPorts(true);
    try {
      await agentsApi.refreshData(id, { listeningPorts: true });
      toast.success('Solicitação de coleta de portas enviada ao agente.');
      await new Promise(r => setTimeout(r, 2000));
      await hwComponents.refetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar refresh de portas.';
      toast.error(msg);
    } finally {
      setIsRefreshingPorts(false);
    }
  };

  const handleRefreshConnections = async () => {
    if (!id || isRefreshingConnections) return;
    setIsRefreshingConnections(true);
    try {
      await agentsApi.refreshData(id, { openConnections: true });
      toast.success('Solicitação de coleta de conexões enviada ao agente.');
      await new Promise(r => setTimeout(r, 2000));
      await hwComponents.refetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar refresh de conexões.';
      toast.error(msg);
    } finally {
      setIsRefreshingConnections(false);
    }
  };

  const handleRefreshSoftware = async () => {
    if (!id || isRefreshingSoftware) return;
    setIsRefreshingSoftware(true);
    try {
      await agentsApi.refreshData(id, { software: true });
      toast.success('Solicitação de coleta de software enviada ao agente.');

      // Polling do snapshot até que updatedAt mude (máx 10 tentativas, 2s cada)
      const previousUpdatedAt = softwareSnapshot.data?.updatedAt;
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000));
        const refreshed = await softwareSnapshot.refetch();
        if (refreshed.data?.updatedAt && refreshed.data.updatedAt !== previousUpdatedAt) break;
        attempts++;
      }

      await software.refetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar refresh de software.';
      toast.error(msg);
    } finally {
      setIsRefreshingSoftware(false);
    }
  };

  const handleRefreshPrinters = async () => {
    if (!id || isRefreshingPrinters) return;
    setIsRefreshingPrinters(true);
    try {
      await agentsApi.refreshData(id, { printers: true, hardware: true });
      toast.success('Solicitação de coleta de impressoras enviada ao agente.');
      await new Promise(r => setTimeout(r, 2000));
      await hwComponents.refetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar refresh de impressoras.';
      toast.error(msg);
    } finally {
      setIsRefreshingPrinters(false);
    }
  };

  const pageSizeOptions = [
    { value: '10', label: '10 por página' },
    { value: '30', label: '30 por página' },
    { value: '50', label: '50 por página' },
    { value: '100', label: '100 por página' },
    { value: 'max', label: 'Todos' },
  ];
  const softwareOrderOptions = [
    { value: 'desc', label: 'Mais recente primeiro' },
    { value: 'asc', label: 'Mais antigo primeiro' },
  ];
  const softwareColumns: Column<AgentSoftwareInventoryItem>[] = [
    {
      key: 'name',
      header: 'Aplicativo',
      sortable: false,
      render: item => (
        <div>
          <p className="font-medium text-foreground">{item.name}</p>
          <p className="text-xs text-muted">{item.publisher ?? 'Sem fabricante'}</p>
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Versão',
      className: 'font-mono',
      sortable: false,
      render: item => item.version ?? '\u2014',
    },
    {
      key: 'source',
      header: 'Fonte',
      sortable: false,
      render: item => item.source ?? '\u2014',
    },
    {
      key: 'collectedAt',
      header: 'Última coleta',
      sortable: false,
      render: item => formatDate(item.collectedAt),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="rounded-lg p-2 text-muted hover:bg-surface-light hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{a.displayName ?? a.hostname}</h1>
          <p className="text-sm text-muted">{a.hostname} — {a.operatingSystem} {a.osVersion}</p>
        </div>
        <Badge color={isOnlineNow ? 'success' : 'slate'}>
          <span className="flex items-center gap-1">
            {isOnlineNow ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnlineNow ? 'Online' : 'Offline'}
          </span>
        </Badge>
        {isZeroTouchPending && (
          <>
            <Badge color="warning">Zero-Touch: aguardando aprovação</Badge>
          </>
        )}
        <div className="relative" ref={powerMenuRef}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsPowerMenuOpen((current) => !current)}
          >
            <Power className="h-4 w-4" />
            Ações
            <ChevronDown className="h-4 w-4" />
          </Button>
          {isPowerMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 min-w-[220px] overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  setIsPowerMenuOpen(false);
                  void handleOpenRemoteDebug();
                }}
                disabled={isOpeningRemoteDebug}
              >
                <Bug className="h-4 w-4" />
                {isOpeningRemoteDebug ? 'Abrindo debug...' : 'Ver Debug'}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  setIsPowerMenuOpen(false);
                  void handleTriggerAgentUpdate();
                }}
                disabled={isTriggeringAgentUpdate}
              >
                <RefreshCw className="h-4 w-4" />
                {isTriggeringAgentUpdate ? 'Atualizando...' : 'Atualizar agente'}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover"
                onClick={() => {
                  setIsPowerMenuOpen(false);
                  navigate(`/automation/operations?agentId=${a.id}`);
                }}
              >
                <AppWindow className="h-4 w-4" />
                Automação
              </button>

              <div className="border-t border-border" />

              {isOnlineNow ? (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-warning transition-colors hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleOpenPowerAction('restart')}
                    disabled={restartAgent.isPending || shutdownAgent.isPending}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reiniciar
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleOpenPowerAction('shutdown')}
                    disabled={restartAgent.isPending || shutdownAgent.isPending}
                  >
                    <Power className="h-4 w-4" />
                    Desligar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleOpenWakeOnLan}
                  disabled={wakeOnLan.isPending}
                >
                  <Zap className="h-4 w-4" />
                  {wakeOnLan.isPending ? 'Enviando Wake-on-LAN...' : 'Wake-on-LAN'}
                </button>
              )}

              {isZeroTouchPending && canManageAgent && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-warning transition-colors hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    setIsPowerMenuOpen(false);
                    void handleApproveZeroTouch();
                  }}
                  disabled={isApprovingZeroTouch}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {isApprovingZeroTouch ? 'Aprovando...' : 'Aprovar Zero-Touch'}
                </button>
              )}

              {canManageAgent && (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    setIsPowerMenuOpen(false);
                    handleDeleteAgent();
                  }}
                  disabled={deleteAgent.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteAgent.isPending ? 'Excluindo...' : 'Excluir agente'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Heartbeat Metrics */}
      <AgentHeartbeatCard metrics={aWithHeartbeat.heartbeatMetrics} showEmpty />

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Tooltip
          position="bottom"
          delay={1200}
          className="block h-full"
          variant="hover-card"
          content={(
            <div className="space-y-2 text-left text-[11px] text-muted-foreground">
              <p>
                <span className="text-muted">Modelo completo:</span>{' '}
                {processorModelFull ?? 'Não informado'}
              </p>
              <p>
                <span className="text-muted">Núcleos físicos:</span>{' '}
                {hw.data?.hardware?.processorCores ?? '\u2014'}
              </p>
              <p>
                <span className="text-muted">Threads lógicas:</span>{' '}
                {hw.data?.hardware?.processorThreads ?? '\u2014'}
              </p>
              <p>
                <span className="text-muted">Arquitetura:</span>{' '}
                {hw.data?.hardware?.processorArchitecture ?? 'Não informada'}
              </p>
            </div>
          )}
        >
          <div className="glass-card flex h-full items-center gap-4 rounded-xl border border-border bg-surface p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-white/5">
              <Cpu className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-muted" title={processorModelFull ?? undefined}>
                {processorModelDisplay}
              </p>
              <p className="text-2xl font-bold text-foreground tabular-nums">{processorValue}</p>
            </div>
          </div>
        </Tooltip>
        <div className="h-full [&>div]:h-full">
          <StatCard
            icon={MemoryStick}
            label="Memória RAM"
            value={formatBytes(hw.data?.hardware?.totalMemoryBytes ?? null)}
            tone="accent"
            trend={hw.data?.memoryModules?.length
              ? <span className="text-xs text-muted">{hw.data.memoryModules.length} módulo(s)</span>
              : undefined}
          />
        </div>
        <Tooltip
          position="bottom"
          delay={1200}
          className="block h-full"
          variant="hover-card"
          content={(
            <div className="space-y-3 text-left">
              <p className="text-[11px] text-muted-foreground">
                O score combina CPU (50%) e RAM (50%), com baseline em 16c/32t + 64 GB = score 100.
              </p>

              <div className="grid gap-1 text-[11px] text-muted-foreground">
                <p><span className="text-muted">CPU (50%):</span> núcleos físicos valem 1.0 e threads extras valem 0.3 cada.</p>
                <p><span className="text-muted">RAM (50%):</span> progressão linear pela quantidade de GB.</p>
              </div>

              <div className="rounded-lg border border-border bg-surface-light px-3 py-2 font-mono text-[11px] text-foreground">
                <p>cpuRaw = cores + (threads - cores) * 0.3</p>
                <p>cpuScore = (cpuRaw / 20.8) * 100</p>
                <p>ramScore = (ramGB / 64) * 100</p>
                <p>machineScore = round((cpuScore * 0.5) + (ramScore * 0.5), min=1)</p>
              </div>

              <div className="grid gap-1 text-[11px] text-muted-foreground">
                <p>2c/2t + 4 GB -&gt; ~8</p>
                <p>8c/16t + 16 GB -&gt; ~38</p>
                <p>16c/32t + 64 GB -&gt; 100</p>
                <p>32c/64t + 128 GB -&gt; acima de 100</p>
              </div>

              <p className="text-[11px] text-muted">
                Sem teto: quanto mais recurso, maior o MachineScore.
              </p>
            </div>
          )}
        >
          <div className="h-full [&>div]:h-full">
            <StatCard
              icon={Gauge}
              label="MachineScore"
              value={machineScore === null ? '\u2014' : machineScore}
              tone={machineScoreTone}
              trend={machineScoreHint ? <span className="text-xs text-muted">{machineScoreHint}</span> : undefined}
            />
          </div>
        </Tooltip>
        <Tooltip
          position="bottom"
          delay={1200}
          className="block h-full"
          variant="hover-card"
          content={(
            <div className="space-y-2 text-left text-[11px] text-muted-foreground">
              <p>Labels do agente: automáticas por regras e manuais.</p>
              {isLoadingLabels ? (
                <p>Carregando labels...</p>
              ) : labelsError ? (
                <p>{labelsError}</p>
              ) : (
                <>
                  <p><span className="text-muted">Total:</span> {allLabels.length}</p>
                  <p><span className="text-muted">Automáticas:</span> {automaticLabelsCount}</p>
                  <p><span className="text-muted">Manuais:</span> {manualLabelsCount}</p>
                  <p className="text-muted">Use o botão + para vincular labels manuais existentes.</p>
                </>
              )}
            </div>
          )}
        >
          <div className="glass-card relative h-full rounded-xl border border-border bg-surface p-5">
            <div className="relative mb-3 h-8" ref={labelPickerRef}>
              <Button
                size="sm"
                variant="ghost"
                className="absolute right-0 top-0 h-9 w-9 shrink-0 p-0"
                title="Vincular label manual existente"
                aria-label="Adicionar label manual"
                onClick={() => {
                  setLabelPickerQuery('');
                  setShowLabelPicker(prev => !prev);
                }}
              >
                <Plus className="h-5 w-5" />
              </Button>

              {showLabelPicker ? (
                <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-border bg-surface p-2 shadow-xl">
                  <Input
                    placeholder="Filtrar labels..."
                    value={labelPickerQuery}
                    onChange={event => setLabelPickerQuery(event.target.value)}
                    className="mb-2"
                    autoFocus
                  />
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {distinctLabels
                      .filter(l => l.toLowerCase().includes(labelPickerQuery.toLowerCase()))
                      .map(l => {
                        const alreadyHas = allLabels.some(
                          al => al.label.toLowerCase() === l.toLowerCase(),
                        );
                        return (
                          <button
                            key={l}
                            disabled={alreadyHas || isAddingManualLabel}
                            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                              alreadyHas
                                ? 'cursor-not-allowed text-muted'
                                : 'text-foreground hover:bg-surface-hover'
                            }`}
                            onClick={() => {
                              if (alreadyHas || !id) return;
                              void handleAddManualLabel(l);
                              setShowLabelPicker(false);
                              setLabelPickerQuery('');
                            }}
                          >
                            {l}
                            {alreadyHas ? (
                              <span className="ml-2 text-xs text-muted">(já vinculada)</span>
                            ) : null}
                          </button>
                        );
                      })}
                    {distinctLabels.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted">
                        Nenhuma label cadastrada. Crie uma regra com modo Manual em Labels Automáticas.
                      </p>
                    ) : null}
                    {distinctLabels.filter(l => l.toLowerCase().includes(labelPickerQuery.toLowerCase())).length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted">Nenhuma label encontrada.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {isLoadingLabels ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <span key={idx} className="h-6 w-20 animate-pulse rounded-full bg-surface-hover" />
                ))}
              </div>
            ) : labelsError ? (
              <p className="text-sm text-danger">{labelsError}</p>
            ) : allLabels.length > 0 ? (
              <div className="max-h-[100px] overflow-y-auto pr-1">
                <div className="flex flex-wrap gap-2">
                  {allLabels.map(item => (
                    <Badge
                      key={item.id}
                      color={item.sourceType === AgentLabelSourceType.Manual ? 'slate' : 'accent'}
                      className="group relative"
                    >
                      <span>{item.label}</span>
                      {item.sourceType === AgentLabelSourceType.Manual ? (
                        <button
                          className="ml-1.5 inline-flex items-center justify-center rounded-full p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                          title="Remover label manual"
                          onClick={() => void handleRemoveManualLabel(item.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ) : null}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">Nenhuma label aplicada.</p>
            )}
          </div>
        </Tooltip>
        <Tooltip
          position="bottom"
          delay={1200}
          className="block h-full"
          variant="hover-card"
          content={(
            <div className="space-y-2 text-left text-[11px] text-muted-foreground">
              <p>Inventário de softwares instalados no agente.</p>
              <p><span className="text-muted">Quantidade total:</span> {softwareTotalInstalled}</p>
              <p><span className="text-muted">Última coleta:</span> {softwareLastCollectedLabel}</p>
            </div>
          )}
        >
          <div className="glass-card flex h-full items-center gap-4 rounded-xl border border-border bg-surface p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success/15 ring-1 ring-white/5">
              <AppWindow className="h-6 w-6 text-success" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-3xl font-bold text-foreground tabular-nums">{softwareTotalInstalled}</p>
            </div>
          </div>
        </Tooltip>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NotesPanel
          entityType="agent"
          entityId={a.id}
          title="Notas do Agente"
        />

        {/* Disk */}
        <Card>
          <CardHeader
            title="Disco"
            subtitle={disks.length > 0
              ? `${formatBytes(usedDiskBytes)} usados de ${formatBytes(totalDiskBytes)} · ${diskUsagePercent ?? 0}%`
              : 'Espaço agregado do agente'}
          />

          {disks.length === 0 ? (
            <p className="text-sm text-muted">Sem dados de disco coletados para este agente.</p>
          ) : (
            <div className="space-y-2">
              {disks.map((disk) => {
                const diskUsedBytes = Math.max(0, disk.totalSizeBytes - disk.freeSpaceBytes);
                const diskUsedPercent = disk.totalSizeBytes > 0
                  ? Math.min(100, Math.round((diskUsedBytes / disk.totalSizeBytes) * 100))
                  : 0;

                return (
                  <div key={disk.id} className="rounded-lg bg-surface-light px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {disk.driveLetter}{disk.label ? ` (${disk.label})` : ''}
                      </span>
                      <span className="text-muted">{diskUsedPercent}% · {formatBytes(diskUsedBytes)} / {formatBytes(disk.totalSizeBytes)}</span>
                    </div>
                    <progress
                      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-surface-hover [&::-webkit-progress-value]:bg-cyan-400 [&::-moz-progress-bar]:bg-cyan-400"
                      value={diskUsedPercent}
                      max={100}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Agent Info + Hardware Detail */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Info do Agente */}
        <Card>
          <CardHeader title="Informações" />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted">Hostname</dt>
              <dd className="mt-0.5 font-mono text-foreground">{a.hostname}</dd>
            </div>
            <div>
              <dt className="text-muted">Sistema Operacional</dt>
              <dd className="mt-0.5 text-foreground">{a.operatingSystem ?? '\u2014'}</dd>
            </div>
            <div>
              <dt className="text-muted">Versão do SO</dt>
              <dd className="mt-0.5 font-mono text-foreground">{a.osVersion ?? '\u2014'}</dd>
            </div>
            <div className="border-t border-border pt-3">
              <dt className="text-muted">MeshCentral Node ID</dt>
              <dd className="mt-0.5 text-foreground">
                <span className="font-mono">{a.meshCentralNodeId ?? '\u2014'}</span>
                <p className="mt-1 text-xs text-muted">
                  Valor persistido no agent, utilizado automaticamente no suporte remoto.
                </p>
                {canManageAgent && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => {
                      void handleNodeLinkDryRun();
                    }}
                    loading={isReconcilingNodeLink}
                  >
                    Validar Node Link (dry-run)
                  </Button>
                )}
              </dd>
            </div>
            {hw.data?.hardware?.osBuild && (
              <div>
                <dt className="text-muted">Build</dt>
                <dd className="mt-0.5 font-mono text-foreground">{hw.data.hardware.osBuild}</dd>
              </div>
            )}
            <div className="border-t border-border pt-3">
              <dt className="text-muted">Versão do Agente</dt>
              <dd className="mt-0.5 font-mono text-foreground">{a.agentVersion ?? '\u2014'}</dd>
            </div>
            {isZeroTouchPending && (
              <div>
                <dt className="text-muted">Zero-Touch Config Registration</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <Badge color="warning">Aguardando aprovação</Badge>
                  {canManageAgent && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void handleApproveZeroTouch();
                      }}
                      loading={isApprovingZeroTouch}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Aprovar
                    </Button>
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted">Último IP</dt>
              <dd className="mt-0.5 font-mono text-foreground">{a.lastIpAddress ?? hw.data?.networkAdapters?.find(n => n.ipAddress && !n.ipAddress.startsWith('169.254'))?.ipAddress ?? '\u2014'}</dd>
            </div>
            <div>
              <dt className="text-muted">Última vez online</dt>
              <dd className="mt-0.5 text-foreground">{a.lastSeen ? formatDate(a.lastSeen) : (a.lastSeenAt ? formatDate(a.lastSeenAt) : '\u2014')}</dd>
            </div>
            {hw.data?.hardware?.manufacturer && (
              <div className="border-t border-border pt-3">
                <dt className="text-muted">Fabricante / Modelo</dt>
                <dd className="mt-0.5 text-foreground">{hw.data.hardware.manufacturer} {hw.data.hardware.model ?? ''}</dd>
              </div>
            )}
            {hw.data?.hardware?.serialNumber && (
              <div>
                <dt className="text-muted">Número de série</dt>
                <dd className="mt-0.5 font-mono text-foreground">{hw.data.hardware.serialNumber}</dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Adaptadores de Rede */}
        {hw.data?.networkAdapters && hw.data.networkAdapters.length > 0 && (
          <Card>
            <CardHeader title="Adaptadores de Rede" subtitle={`${hw.data.networkAdapters.length} adaptador(es)`} />
            <div className="space-y-2">
              {hw.data.networkAdapters.map(n => (
                <div key={n.id} className="rounded-lg bg-surface-light px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{n.name}</p>
                      {n.macAddress && <p className="font-mono text-xs text-muted">{n.macAddress}</p>}
                    </div>
                    <Badge color={n.isDhcpEnabled ? 'success' : 'slate'}>{n.isDhcpEnabled ? 'DHCP' : 'Estático'}</Badge>
                  </div>
                  {(n.ipAddress || n.gateway) && (
                    <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                      {n.ipAddress && (
                        <div>
                          <span className="text-muted">IP: </span>
                          <span className="font-mono text-muted-foreground">{n.ipAddress}</span>
                          {n.subnetMask && <span className="text-muted"> / {n.subnetMask}</span>}
                        </div>
                      )}
                      {n.gateway && (
                        <div>
                          <span className="text-muted">Gateway: </span>
                          <span className="font-mono text-muted-foreground">{n.gateway}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Card className="surface-card">
        <div role="tablist" aria-label="Abas de dados do agente" className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
          <button
            type="button"
            role="tab"
            onClick={() => setActiveDataTab('software')}
            aria-selected={activeDataTab === 'software'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'software' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Inventário de Aplicativos
            <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{softwareTotalCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => setActiveDataTab('printers')}
            aria-selected={activeDataTab === 'printers'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'printers' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Impressoras
            <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{printers.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => setActiveDataTab('tickets')}
            aria-selected={activeDataTab === 'tickets'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'tickets' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Últimos Chamados
            <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{agentTickets.data?.items?.length ?? 0}</span>
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => setActiveDataTab('listeningPorts')}
            aria-selected={activeDataTab === 'listeningPorts'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'listeningPorts' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Portas em Escuta
            <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{listeningPorts.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => setActiveDataTab('openSockets')}
            aria-selected={activeDataTab === 'openSockets'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'openSockets' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Conexões Abertas
            <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{openSockets.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => setActiveDataTab('logs')}
            aria-selected={activeDataTab === 'logs'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'logs' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Logs Recentes
            <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{logsArray.length}</span>
          </button>
        </div>

        {activeDataTab === 'software' && (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground sm:text-xl">Inventário de Aplicativos</h3>
                <p className="text-sm text-muted">{softwareTotalCount} aplicativo(s) no inventário</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefreshSoftware}
                loading={isRefreshingSoftware}
                disabled={!isOnlineNow}
                title={!isOnlineNow ? 'Agente offline \u2014 refresh indisponível' : 'Solicitar nova coleta de software ao agente'}
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </Button>
            </div>
            {software.isLoading ? (
              <Loading message="Carregando inventário de aplicativos..." />
            ) : software.isError ? (
              <ErrorDisplay onRetry={() => software.refetch()} />
            ) : (
              <>
                {softwareSnapshot.data?.updatedAt && (
                  <div className="mb-3 flex items-center justify-end gap-2 text-xs text-muted">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Última coleta: <span className="text-muted-foreground">{formatDate(softwareSnapshot.data.updatedAt)}</span></span>
                  </div>
                )}

                <div className="mb-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg bg-surface-light px-3 py-2">
                    <p className="text-xs text-muted">Total instalado</p>
                    <p className="text-sm font-medium text-foreground">{softwareTotalCount}</p>
                  </div>
                  <div className="rounded-lg bg-surface-light px-3 py-2">
                    <p className="text-xs text-muted">Primeira detecção</p>
                    <p className="text-sm text-muted-foreground">{formatDate(softwareSnapshot.data?.firstSeenAt ?? null)}</p>
                  </div>
                  <div className="rounded-lg bg-surface-light px-3 py-2">
                    <p className="text-xs text-muted">Última coleta</p>
                    <p className="text-sm text-muted-foreground">{formatDate(softwareSnapshot.data?.lastCollectedAt ?? null)}</p>
                  </div>
                </div>

                <form className="mb-4 grid gap-3 lg:grid-cols-[1fr_200px_160px_auto_auto]" onSubmit={handleApplySoftwareFilters}>
                  <Input
                    value={softwareSearchInput}
                    onChange={(e) => setSoftwareSearchInput(e.target.value)}
                    placeholder="Pesquisar por nome, versão, fabricante, installId, serial ou fonte"
                  />
                  <Select
                    value={softwareOrder}
                    options={softwareOrderOptions}
                    onChange={(e) => handleSoftwareOrderChange(e.target.value as 'asc' | 'desc')}
                  />
                  <Select
                    value={softwareLimitSelected}
                    options={pageSizeOptions}
                    onChange={(e) => handleSoftwareLimitChange(e.target.value)}
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    <Search className="h-4 w-4" />
                    Buscar
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={handleClearSoftwareSearch}>
                    Limpar
                  </Button>
                </form>

                {softwareItems.length > 0 && (
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted">
                      Página {safeSoftwarePage} de {softwareTotalPages} · {softwareTotalCount} itens no total
                      {softwareSearchApplied ? ` | filtro: "${softwareSearchApplied}"` : ''}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={goToPreviousSoftwarePage} disabled={!canGoPrevSoftwarePage}>
                        Voltar
                      </Button>
                      <div className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground">
                        {safeSoftwarePage}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={goToNextSoftwarePage}
                        disabled={!canGoNextSoftwarePage}
                        loading={software.isFetching}
                      >
                        Avançar
                      </Button>
                    </div>
                  </div>
                )}

                <div style={{ minHeight: '400px' }} className="relative">
                  <DataTable
                    columns={softwareColumns}
                    data={softwareItems}
                    keyExtractor={item => item.inventoryId}
                    emptyMessage="Nenhum aplicativo encontrado para este agente"
                    showPagination={false}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted">
                    Página {safeSoftwarePage} de {softwareTotalPages} · {softwareTotalCount} itens no total
                    {softwareSearchApplied ? ` | filtro: "${softwareSearchApplied}"` : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={goToPreviousSoftwarePage} disabled={!canGoPrevSoftwarePage}>
                      Voltar
                    </Button>
                    <div className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground">
                      {safeSoftwarePage}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={goToNextSoftwarePage}
                      disabled={!canGoNextSoftwarePage}
                      loading={software.isFetching}
                    >
                      Avançar
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {activeDataTab === 'tickets' && (
          <>
            <CardHeader title="Últimos Chamados" subtitle={`${agentTickets.data?.items?.length ?? 0} chamado(s) retornado(s)`} />
            <div className="space-y-2">
              {agentTickets.isLoading && (
                <div className="py-4 text-center text-sm text-muted">
                  Carregando chamados...
                </div>
              )}
              {!agentTickets.isLoading && (!agentTickets.data || agentTickets.data.items.length === 0) && (
                <div className="py-4 text-center text-sm text-muted">
                  Nenhum chamado encontrado
                </div>
              )}
              {!agentTickets.isLoading && agentTickets.data && agentTickets.data.items.length > 0 && (
                <div className="space-y-2">
                  {agentTickets.data.items.map(ticket => {
                    const priorityColors: Record<string, 'slate' | 'success' | 'warning' | 'danger'> = {
                      Low: 'slate',
                      Medium: 'success',
                      High: 'warning',
                      Critical: 'danger',
                    };
                    const priorityLabels: Record<string, string> = {
                      Low: 'Baixa',
                      Medium: 'Média',
                      High: 'Alta',
                      Critical: 'Crítica',
                    };
                    return (
                      <button
                        key={ticket.id}
                        onClick={() => navigate(`/tickets/${ticket.id}`)}
                        className="w-full rounded-lg bg-surface-light px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <TicketIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                              <p className="truncate text-sm font-medium text-foreground">
                                {ticket.title}
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-muted">
                              {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
                              {ticket.closedAt && '  Encerrado'}
                            </p>
                          </div>
                          <Badge color={priorityColors[ticket.priority] ?? 'slate'} className="shrink-0">
                            {priorityLabels[ticket.priority] ?? ticket.priority}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {activeDataTab === 'printers' && (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground sm:text-xl">Impressoras</h3>
                <p className="text-sm text-muted">{printers.length} impressora(s) detectada(s)</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefreshPrinters}
                loading={isRefreshingPrinters || hwComponents.isFetching}
                disabled={!isOnlineNow}
                title={!isOnlineNow ? 'Agente offline \u2014 refresh indisponível' : 'Solicitar nova coleta de impressoras ao agente'}
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </Button>
            </div>
            {printers.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma impressora coletada para este agente.</p>
            ) : (
              <div className="space-y-2">
                {printers.map((printer, index) => (
                  <div key={`${printer.name}-${printer.portName ?? index}`} className="rounded-lg bg-surface-light px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{printer.name}</p>
                        {printer.driverName && (
                          <p className="truncate text-xs text-muted">Driver: {printer.driverName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {printer.isDefault && <Badge color="primary">Padrão</Badge>}
                        <Badge color={printerStatusColor(printer.printerStatus)}>{printer.printerStatus ?? 'Sem status'}</Badge>
                      </div>
                    </div>

                    <div className="mt-2 grid gap-2 text-xs text-muted sm:grid-cols-2">
                      <span className="flex items-center gap-1">
                        <Printer className="h-3.5 w-3.5" />
                        {printer.isNetworkPrinter ? 'Rede' : 'Local'}
                      </span>
                      <span>{printer.portName ? `Porta: ${printer.portName}` : 'Porta não informada'}</span>
                      <span>{printer.location ? `Local: ${printer.location}` : 'Local não informado'}</span>
                      <span>
                        {printer.shared
                          ? `Compartilhada${printer.shareName ? ` (${printer.shareName})` : ''}`
                          : 'Não compartilhada'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeDataTab === 'listeningPorts' && (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground sm:text-xl">Portas em Escuta</h3>
                <p className="text-sm text-muted">{portsTotalCount} porta(s) ativa(s)</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefreshPorts}
                loading={isRefreshingPorts}
                disabled={!isOnlineNow}
                title={!isOnlineNow ? 'Agente offline \u2014 refresh indisponível' : 'Solicitar nova coleta de portas ao agente'}
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </Button>
            </div>
            {listeningPorts.length === 200 && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Lista truncada pelo backend no limite de 200 itens. Podem existir mais portas em escuta.
              </div>
            )}
            <form className="mb-4 grid gap-3 lg:grid-cols-[1fr_160px_auto_auto]" onSubmit={(e) => { e.preventDefault(); }}>
              <Input
                value={listeningPortsSearch}
                onChange={(e) => { setListeningPortsSearch(e.target.value); resetPortsPagination(); }}
                placeholder="Pesquisar por processo, PID, protocolo, endereço ou porta"
              />
              <Select
                value={listeningPortsLimit}
                options={pageSizeOptions}
                onChange={(e) => { setListeningPortsLimit(e.target.value); resetPortsPagination(); }}
              />
              <Button type="submit" variant="secondary" size="sm">
                <Search className="h-4 w-4" />
                Buscar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setListeningPortsSearch(''); resetPortsPagination(); }}>
                Limpar
              </Button>
            </form>
            {portsPageItems.length > 0 && (
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Página {safePortsPage} de {portsTotalPages} · {portsTotalCount} itens no total
                  {listeningPortsSearch ? ` | filtro: "${listeningPortsSearch}"` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={goToPreviousPortsPage} disabled={!canGoPrevPortsPage}>
                    Voltar
                  </Button>
                  <div className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground">
                    {safePortsPage}
                  </div>
                  <Button variant="secondary" size="sm" onClick={goToNextPortsPage} disabled={!canGoNextPortsPage}>
                    Avançar
                  </Button>
                </div>
              </div>
            )}
            <div style={{ minHeight: '400px' }} className="relative">
              <DataTable
                columns={listeningPortColumns}
                data={portsPageItems}
                keyExtractor={item => item.id}
                emptyMessage="Nenhuma porta em escuta encontrada"
                showPagination={false}
              />
            </div>
            {portsPageItems.length > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Página {safePortsPage} de {portsTotalPages} · {portsTotalCount} itens no total
                  {listeningPortsSearch ? ` | filtro: "${listeningPortsSearch}"` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={goToPreviousPortsPage} disabled={!canGoPrevPortsPage}>
                    Voltar
                  </Button>
                  <div className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground">
                    {safePortsPage}
                  </div>
                  <Button variant="secondary" size="sm" onClick={goToNextPortsPage} disabled={!canGoNextPortsPage}>
                    Avançar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {activeDataTab === 'openSockets' && (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground sm:text-xl">Conexões Abertas</h3>
                <p className="text-sm text-muted">{socketsTotalCount} conexão(ões) ativa(s)</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefreshConnections}
                loading={isRefreshingConnections}
                disabled={!isOnlineNow}
                title={!isOnlineNow ? 'Agente offline \u2014 refresh indisponível' : 'Solicitar nova coleta de conexões ao agente'}
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </Button>
            </div>
            {openSockets.length === 500 && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Lista truncada pelo backend no limite de 500 itens. Podem existir mais conexões abertas.
              </div>
            )}
            <form className="mb-4 grid gap-3 lg:grid-cols-[1fr_160px_auto_auto]" onSubmit={(e) => { e.preventDefault(); }}>
              <Input
                value={openSocketsSearch}
                onChange={(e) => { setOpenSocketsSearch(e.target.value); resetSocketsPagination(); }}
                placeholder="Pesquisar por processo, PID, protocolo, endereço ou porta"
              />
              <Select
                value={openSocketsLimit}
                options={pageSizeOptions}
                onChange={(e) => { setOpenSocketsLimit(e.target.value); resetSocketsPagination(); }}
              />
              <Button type="submit" variant="secondary" size="sm">
                <Search className="h-4 w-4" />
                Buscar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setOpenSocketsSearch(''); resetSocketsPagination(); }}>
                Limpar
              </Button>
            </form>
            {socketsPageItems.length > 0 && (
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Página {safeSocketsPage} de {socketsTotalPages} · {socketsTotalCount} itens no total
                  {openSocketsSearch ? ` | filtro: "${openSocketsSearch}"` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={goToPreviousSocketsPage} disabled={!canGoPrevSocketsPage}>
                    Voltar
                  </Button>
                  <div className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground">
                    {safeSocketsPage}
                  </div>
                  <Button variant="secondary" size="sm" onClick={goToNextSocketsPage} disabled={!canGoNextSocketsPage}>
                    Avançar
                  </Button>
                </div>
              </div>
            )}
            <div style={{ minHeight: '400px' }} className="relative">
              <DataTable
                columns={openSocketColumns}
                data={socketsPageItems}
                keyExtractor={item => item.id}
                emptyMessage="Nenhuma conexão aberta encontrada"
                showPagination={false}
              />
            </div>
            {socketsPageItems.length > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Página {safeSocketsPage} de {socketsTotalPages} · {socketsTotalCount} itens no total
                  {openSocketsSearch ? ` | filtro: "${openSocketsSearch}"` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={goToPreviousSocketsPage} disabled={!canGoPrevSocketsPage}>
                    Voltar
                  </Button>
                  <div className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground">
                    {safeSocketsPage}
                  </div>
                  <Button variant="secondary" size="sm" onClick={goToNextSocketsPage} disabled={!canGoNextSocketsPage}>
                    Avançar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {activeDataTab === 'logs' && (
          <>
            <CardHeader title="Logs Recentes" />
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {logsArray.map(log => {
                const l = levelLabels[log.level] ?? { label: '?', color: 'slate' as const };
                return (
                  <div key={log.id} className="flex items-start gap-2 rounded-lg bg-surface-light px-3 py-2">
                    <Badge color={l.color} className="mt-0.5 shrink-0">{l.label}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-muted-foreground">{log.message}</p>
                      <p className="text-xs text-muted">{formatDate(log.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
              {agentLogs.isLoading && <p className="text-sm text-muted">Carregando...</p>}
              {(logsArray.length === 0) && !agentLogs.isLoading && (
                <p className="text-sm text-muted">Nenhum log registrado</p>
              )}
            </div>
          </>
        )}
      </Card>

      <Modal
        open={deleteConfirmOpen}
        onClose={closeDeleteAgentModal}
        title="Confirmar exclusão de agente"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-foreground">
            <p>
              Você está prestes a excluir o agente{' '}
              <span className="font-semibold text-foreground">{a.displayName ?? a.hostname}</span>.
            </p>
            <p className="mt-1 text-muted">Esta ação não pode ser desfeita. Todos os dados do agente (hardware, software, comandos, tokens) serão permanentemente removidos.</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="delete-confirm-hostname-detail" className="text-sm font-medium text-foreground">
              Digite <span className="font-semibold text-danger">{a.displayName ?? a.hostname}</span> para confirmar:
            </label>
            <Input
              id="delete-confirm-hostname-detail"
              value={deleteConfirmHostname}
              onChange={(e) => setDeleteConfirmHostname(e.target.value)}
              placeholder={a.displayName ?? a.hostname}
              disabled={deleteAgent.isPending}
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={closeDeleteAgentModal}
              disabled={deleteAgent.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void confirmDeleteAgent();
              }}
              loading={deleteAgent.isPending}
              disabled={deleteConfirmHostname.trim() !== (a.displayName ?? a.hostname).trim() || deleteAgent.isPending}
            >
              Excluir agente
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={nodeLinkPreviewOpen}
        onClose={() => {
          setNodeLinkPreviewOpen(false);
        }}
        title="Preview de Reconcile Mesh Node Link"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          {isReconcilingNodeLink && !nodeLinkPreviewReport && (
            <Loading message="Executando dry-run de node links para este site..." />
          )}

          {nodeLinkPreviewError && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {nodeLinkPreviewError}
            </div>
          )}

          {nodeLinkPreviewReport && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge color="accent">Total: {nodeLinkPreviewReport.totalAgents}</Badge>
                <Badge color="success">Verified: {nodeLinkPreviewReport.verifiedAgents}</Badge>
                <Badge color="accent">Updated: {nodeLinkPreviewReport.updatedAgents}</Badge>
                <Badge color={nodeLinkPreviewReport.ambiguousAgents > 0 ? 'danger' : 'slate'}>
                  Ambiguous: {nodeLinkPreviewReport.ambiguousAgents}
                </Badge>
                <Badge color={nodeLinkPreviewReport.missingAgents > 0 ? 'warning' : 'slate'}>
                  Missing: {nodeLinkPreviewReport.missingAgents}
                </Badge>
                <Badge color="slate">Modo: {nodeLinkPreviewReport.applyChanges ? 'Apply' : 'Dry-run'}</Badge>
              </div>

              {nodeLinkPreviewReport.ambiguousAgents > 0 && (
                <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  Foram encontrados vínculos ambíguos no site. Trate manualmente antes de aplicar reconcile.
                </div>
              )}

              <div className="rounded-md border border-border bg-surface-light px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-muted">Agent atual</p>
                {currentNodeLinkItem ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-foreground">
                      {(currentNodeLinkItem.displayName ?? currentNodeLinkItem.hostname)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge color={nodeLinkStatusColor(currentNodeLinkItem.status)}>
                        {currentNodeLinkItem.status}
                      </Badge>
                      <Badge color={currentNodeLinkItem.applied ? 'success' : 'slate'}>
                        {currentNodeLinkItem.applied ? 'Aplicado' : 'Não aplicado'}
                      </Badge>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      Atual: {currentNodeLinkItem.currentNodeId ?? 'Sem vínculo'}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      Sugerido: {currentNodeLinkItem.suggestedNodeId ?? 'Sem sugestão'}
                    </p>
                    {(currentNodeLinkItem.candidateNodeIds?.length ?? 0) > 0 && (
                      <p className="font-mono text-xs text-muted-foreground">
                        Candidates: {currentNodeLinkItem.candidateNodeIds?.join(', ')}
                      </p>
                    )}
                    {currentNodeLinkItem.error && (
                      <p className="text-xs text-danger">Erro: {currentNodeLinkItem.error}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    O dry-run não retornou este agent no conjunto de itens do site.
                  </p>
                )}
              </div>

              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {nodeLinkPreviewReport.items.slice(0, 25).map((item: MeshCentralNodeLinksBackfillItem) => (
                  <div key={item.agentId} className="rounded-md border border-border bg-black/20 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm text-foreground">
                        {item.displayName ?? item.hostname}
                      </p>
                      <Badge color={nodeLinkStatusColor(item.status)}>{item.status}</Badge>
                    </div>
                    <p className="font-mono text-xs text-muted">
                      Atual: {item.currentNodeId ?? 'Sem vínculo'} | Sugerido: {item.suggestedNodeId ?? 'Sem sugestão'}
                    </p>
                  </div>
                ))}
                {nodeLinkPreviewReport.items.length > 25 && (
                  <p className="text-xs text-muted">
                    Exibindo 25 de {nodeLinkPreviewReport.items.length} itens.
                  </p>
                )}
              </div>
            </>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            <Button
              variant="ghost"
              onClick={() => {
                void handleNodeLinkDryRun();
              }}
              loading={isReconcilingNodeLink}
            >
              Reexecutar dry-run
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void handleNodeLinkApply();
              }}
              loading={isApplyingNodeLink}
              disabled={!nodeLinkPreviewReport || nodeLinkPreviewReport.ambiguousAgents > 0}
            >
              Aplicar reconcile no site
            </Button>
          </div>
        </div>
      </Modal>

      {powerAction && (
        <PowerActionModal
          agent={a}
          action={powerAction}
          onClose={() => {
            setPowerAction(null);
          }}
          onConfirm={handlePowerActionConfirm}
          isLoading={restartAgent.isPending || shutdownAgent.isPending}
        />
      )}

      {wakeOnLanModalOpen && (
        <WakeOnLanModal
          agent={a}
          onClose={() => {
            setWakeOnLanModalOpen(false);
          }}
          onConfirm={handleWakeOnLanConfirm}
          isLoading={wakeOnLan.isPending}
        />
      )}
    </div>
  );
}
