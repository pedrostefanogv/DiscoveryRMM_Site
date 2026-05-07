import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Cpu, MemoryStick, Ticket as TicketIcon, Tags,
  Wifi, WifiOff, AppWindow, Search, Clock, HardDrive, Printer, Bug, AlertTriangle, Trash2, ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getDeleteAgentErrorMessage, useAgent, useAgentHardware, useAgentSoftware, useAgentSoftwareSnapshot, useApproveZeroTouch, useDeleteAgent } from '@/hooks/useAgents';
import { useTickets } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { useRunMeshCentralNodeLinksBackfill, useRunMeshCentralNodeLinksBackfillDryRun } from '@/hooks';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, Input, Select, DataTable, Modal, StatCard, AgentHeartbeatCard, type Column } from '@/components/ui';
import { NotesPanel } from '@/components/notes/NotesPanel';
import type { AgentSoftwareInventoryItem, ListeningPortInfo, MeshCentralNodeLinksBackfillItem, MeshCentralNodeLinksBackfillReport, OpenSocketInfo } from '@/api';
import { ApiError, LogLevel, agentUpdatesApi } from '@/api';
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

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('pt-BR');
}

function formatSocketFamily(family: string | null): string {
  if (!family) return '—';
  if (family === '2') return 'IPv4';
  if (family === '23') return 'IPv6';
  return family;
}

interface InventoryPrinter {
  name: string;
  driverName: string | null;
  portName: string | null;
  printerStatus: string | null;
  isDefault: boolean;
  isNetworkPrinter: boolean;
  shared: boolean;
  shareName: string | null;
  location: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function normalizePrinterEntries(value: unknown): InventoryPrinter[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((printer) => ({
      name: asNullableString(printer.name) ?? 'Impressora sem nome',
      driverName: asNullableString(printer.driverName),
      portName: asNullableString(printer.portName),
      printerStatus: asNullableString(printer.printerStatus),
      isDefault: asBoolean(printer.isDefault),
      isNetworkPrinter: asBoolean(printer.isNetworkPrinter),
      shared: asBoolean(printer.shared),
      shareName: asNullableString(printer.shareName),
      location: asNullableString(printer.location),
    }));
}

function parseInventoryPrinters(
  inventoryRaw: string | null,
  topLevelPrinters?: unknown,
  topLevelInventoryRaw?: unknown,
): InventoryPrinter[] {
  const fromTopLevel = normalizePrinterEntries(topLevelPrinters);
  if (fromTopLevel.length > 0) return fromTopLevel;

  const rawCandidate = topLevelInventoryRaw ?? inventoryRaw;
  if (!rawCandidate) return [];

  let parsed: unknown = rawCandidate;
  if (typeof rawCandidate === 'string') {
    try {
      parsed = JSON.parse(rawCandidate);
    } catch {
      return [];
    }
  }

  if (!isRecord(parsed)) return [];
  const components = parsed.components;
  if (!isRecord(components)) return [];

  return normalizePrinterEntries(components.printers);
}

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

type AgentDetailDataTab = 'software' | 'tickets' | 'listeningPorts' | 'openSockets' | 'logs';

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [softwareLimitSelected, setSoftwareLimitSelected] = useState('10');
  const [softwareOrder, setSoftwareOrder] = useState<'asc' | 'desc'>('desc');
  const [softwareSearchInput, setSoftwareSearchInput] = useState('');
  const [softwareSearchApplied, setSoftwareSearchApplied] = useState('');
  const [softwarePage, setSoftwarePage] = useState(1);
  const [softwarePageCursors, setSoftwarePageCursors] = useState<Array<string | undefined>>([undefined]);
  const [automaticLabels, setAutomaticLabels] = useState<AgentLabel[]>([]);
  const [isLoadingLabels, setIsLoadingLabels] = useState(true);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [isOpeningRemoteDebug, setIsOpeningRemoteDebug] = useState(false);
  const [isReconcilingNodeLink, setIsReconcilingNodeLink] = useState(false);
  const [isApplyingNodeLink, setIsApplyingNodeLink] = useState(false);
  const [isTriggeringAgentUpdate, setIsTriggeringAgentUpdate] = useState(false);
  const [isApprovingZeroTouch, setIsApprovingZeroTouch] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [nodeLinkPreviewOpen, setNodeLinkPreviewOpen] = useState(false);
  const [nodeLinkPreviewError, setNodeLinkPreviewError] = useState<string | null>(null);
  const [nodeLinkPreviewReport, setNodeLinkPreviewReport] = useState<MeshCentralNodeLinksBackfillReport | null>(null);
  const [activeDataTab, setActiveDataTab] = useState<AgentDetailDataTab>('software');

  const { hasAnyPermission } = useAuthorization();
  const canManageAgent = hasAnyPermission(['Agents.Edit', 'agents.*', 'admin.*']);
  const deleteAgent = useDeleteAgent();
  const approveZeroTouch = useApproveZeroTouch();
  const agent = useAgent(id!);
  const liveHeartbeat = useAgentHeartbeat(id!);
  const hw = useAgentHardware(id!);
  const softwareCursor = softwarePageCursors[softwarePage - 1];
  const software = useAgentSoftware(id!, {
    cursor: softwareCursor,
    limit: Number(softwareLimitSelected),
    search: softwareSearchApplied,
    order: softwareOrder,
  });
  const softwareSnapshot = useAgentSoftwareSnapshot(id!);
  const agentLogs = useLogs({ agentId: id, limit: 10 });
  const agentTickets = useTickets({ agentId: id, limit: 5 });
  const nodeLinkBackfillDryRun = useRunMeshCentralNodeLinksBackfillDryRun();
  const nodeLinkBackfillApply = useRunMeshCentralNodeLinksBackfill();
  const now = useNowTick(5_000);

  useEffect(() => {
    let isCancelled = false;

    async function loadAgentLabels() {
      if (!id) {
        setAutomaticLabels([]);
        setIsLoadingLabels(false);
        return;
      }

      setIsLoadingLabels(true);
      setLabelsError(null);

      try {
        const data = await agentLabelsApi.getAgentLabels(id);
        if (isCancelled) return;

        const automaticOnly = data
          .filter(item => item.sourceType === AgentLabelSourceType.Automatic)
          .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        setAutomaticLabels(automaticOnly);
      } catch {
        if (isCancelled) return;
        setLabelsError('Falha ao carregar labels automáticas.');
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

  const a = agent.data;
  const aWithHeartbeat = useMemo(() => {
    if (!a) return null;
    const hasFreshLiveHeartbeat =
      liveHeartbeat && isHeartbeatTimestampFresh(liveHeartbeat.timestampUtc, now);

    const freshFallbackMetrics =
      a.heartbeatMetrics && isHeartbeatTimestampFresh(a.heartbeatMetrics.timestampUtc, now)
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

  if (agent.isLoading) return <Loading />;
  if (agent.isError || !a || !aWithHeartbeat) return <ErrorDisplay onRetry={() => agent.refetch()} />;

  const isOnlineNow = isAgentOnlineNow(aWithHeartbeat, now);
  const isZeroTouchPending = aWithHeartbeat.zeroTouchPending === true;
  const softwareItems = software.data?.items ?? [];
  const softwareLimitReturned = software.data?.limit ?? Number(softwareLimitSelected);
  const softwareTotalCount = software.data?.count ?? softwareSnapshot.data?.totalInstalled ?? 0;
  const softwareTotalPages = Math.max(1, Math.ceil(softwareTotalCount / softwareLimitReturned));
  const canGoPrevSoftwarePage = softwarePage > 1 && !software.isFetching;
  const canGoNextSoftwarePage = Boolean(software.data?.hasMore && software.data?.nextCursor) && !software.isFetching;
  const disks = hw.data?.disks ?? [];
  const totalDiskBytes = disks.reduce((acc, disk) => acc + (disk.totalSizeBytes ?? 0), 0);
  const freeDiskBytes = disks.reduce((acc, disk) => acc + (disk.freeSpaceBytes ?? 0), 0);
  const usedDiskBytes = Math.max(0, totalDiskBytes - freeDiskBytes);
  const diskUsagePercent = totalDiskBytes > 0 ? Math.min(100, Math.round((usedDiskBytes / totalDiskBytes) * 100)) : null;
  const printers = parseInventoryPrinters(
    hw.data?.hardware?.inventoryRaw ?? null,
    hw.data?.printers,
    hw.data?.inventoryRaw,
  );
  const listeningPorts: ListeningPortInfo[] = hw.data?.listeningPorts ?? [];
  const openSockets: OpenSocketInfo[] = hw.data?.openSockets ?? [];
  const currentNodeLinkItem = nodeLinkPreviewReport?.items.find((item) => item.agentId === a.id) ?? null;

  const listeningPortColumns: Column<ListeningPortInfo>[] = [
    {
      key: 'protocol',
      header: 'Protocolo',
      className: 'w-24',
      render: item => <span className="font-mono uppercase text-slate-300">{item.protocol ?? '—'}</span>,
    },
    {
      key: 'address',
      header: 'Endereço',
      render: item => (
        <span className="font-mono text-slate-300">
          {item.address ?? '—'}:{item.port}
        </span>
      ),
    },
    {
      key: 'process',
      header: 'Processo',
      render: item => (
        <div>
          <p className="text-sm text-white">{item.processName ?? '—'}</p>
          <p className="text-xs text-slate-500">PID {item.processId}</p>
        </div>
      ),
    },
    {
      key: 'collectedAt',
      header: 'Última coleta',
      render: item => formatDate(item.collectedAt),
    },
  ];

  const openSocketColumns: Column<OpenSocketInfo>[] = [
    {
      key: 'protocol',
      header: 'Protocolo',
      className: 'w-24',
      render: item => <span className="font-mono uppercase text-slate-300">{item.protocol ?? '—'}</span>,
    },
    {
      key: 'family',
      header: 'Família',
      className: 'w-20',
      render: item => <Badge color="slate">{formatSocketFamily(item.family)}</Badge>,
    },
    {
      key: 'local',
      header: 'Origem',
      render: item => (
        <span className="font-mono text-slate-300">
          {item.localAddress ?? '—'}:{item.localPort}
        </span>
      ),
    },
    {
      key: 'remote',
      header: 'Destino',
      render: item => (
        <span className="font-mono text-slate-300">
          {item.remoteAddress ?? '—'}:{item.remotePort}
        </span>
      ),
    },
    {
      key: 'process',
      header: 'Processo',
      render: item => (
        <div>
          <p className="text-sm text-white">{item.processName ?? '—'}</p>
          <p className="text-xs text-slate-500">PID {item.processId}</p>
        </div>
      ),
    },
    {
      key: 'collectedAt',
      header: 'Última coleta',
      render: item => formatDate(item.collectedAt),
    },
  ];

  const resetSoftwarePagination = () => {
    setSoftwarePage(1);
    setSoftwarePageCursors([undefined]);
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
  };

  const handleDeleteAgent = () => {
    if (!id) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteAgent = async () => {
    if (!id) return;
    try {
      await deleteAgent.mutateAsync(id);
      toast.success('Agente excluído com sucesso.');
      setDeleteConfirmOpen(false);
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
      toast.success('Self-update do agente disparado com sucesso.');
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

  const goToNextSoftwarePage = () => {
    if (!software.data?.nextCursor) return;
    setSoftwarePageCursors((prev) => {
      const next = [...prev];
      next[softwarePage] = software.data.nextCursor ?? undefined;
      return next;
    });
    setSoftwarePage((p) => p + 1);
  };

  const goToPreviousSoftwarePage = () => {
    setSoftwarePage((p) => Math.max(1, p - 1));
  };

  const softwareLimitOptions = [
    { value: '10', label: '10 por página' },
    { value: '30', label: '30 por página' },
    { value: '50', label: '50 por página' },
  ];
  const softwareOrderOptions = [
    { value: 'desc', label: 'Mais recente primeiro' },
    { value: 'asc', label: 'Mais antigo primeiro' },
  ];
  const softwareColumns: Column<AgentSoftwareInventoryItem>[] = [
    {
      key: 'name',
      header: 'Aplicativo',
      render: item => (
        <div>
          <p className="font-medium text-white">{item.name}</p>
          <p className="text-xs text-slate-500">{item.publisher ?? 'Sem fabricante'}</p>
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Versão',
      className: 'font-mono',
      render: item => item.version ?? '—',
    },
    {
      key: 'source',
      header: 'Fonte',
      render: item => item.source ?? '—',
    },
    {
      key: 'lastSeenAt',
      header: 'Última coleta',
      render: item => formatDate(item.lastSeenAt ?? item.collectedAt),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} aria-label="Voltar" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{a.displayName ?? a.hostname}</h1>
          <p className="text-sm text-slate-400">{a.hostname} — {a.operatingSystem} {a.osVersion}</p>
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
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void handleOpenRemoteDebug();
          }}
          loading={isOpeningRemoteDebug}
        >
          <Bug className="h-4 w-4" />
          Ver Debug
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void handleTriggerAgentUpdate();
          }}
          loading={isTriggeringAgentUpdate}
        >
          Atualizar agente
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/automation/operations?agentId=${a.id}`)}
        >
          Automacao
        </Button>
        {canManageAgent && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              handleDeleteAgent();
            }}
            loading={deleteAgent.isPending}
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        )}
      </div>

      {/* Live Heartbeat Metrics */}
      <AgentHeartbeatCard metrics={aWithHeartbeat.heartbeatMetrics} showEmpty />

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Cpu}
          label="Processador"
          value={hw.data?.hardware?.processor ? `${hw.data.hardware.processorCores ?? '?'}C / ${hw.data.hardware.processorThreads ?? '?'}T` : '—'}
          tone="primary"
          trend={hw.data?.hardware?.processor
            ? <span className="max-w-[120px] truncate text-xs text-slate-400" title={hw.data.hardware.processor}>{hw.data.hardware.processor.split(' ').slice(0, 3).join(' ')}</span>
            : undefined}
        />
        <StatCard
          icon={MemoryStick}
          label="Memória RAM"
          value={formatBytes(hw.data?.hardware?.totalMemoryBytes ?? null)}
          tone="accent"
          trend={hw.data?.memoryModules?.length
            ? <span className="text-xs text-slate-400">{hw.data.memoryModules.length} módulo(s)</span>
            : undefined}
        />
        <Card className="border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-slate-900/30 to-slate-900/20 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-md bg-cyan-400/15 p-1.5 text-cyan-300">
              <Tags className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-cyan-200/80">Labels automáticas</p>
              <p className="text-xs text-slate-400">Aplicadas por regras</p>
            </div>
          </div>

          {isLoadingLabels ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <span key={idx} className="h-6 w-20 animate-pulse rounded-full bg-white/10" />
              ))}
            </div>
          ) : labelsError ? (
            <p className="text-sm text-danger">Falha ao carregar labels.</p>
          ) : automaticLabels.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma label automática aplicada.</p>
          ) : (
            <div className="max-h-[86px] overflow-y-auto pr-1">
              <div className="flex flex-wrap gap-2">
                {automaticLabels.map(item => (
                  <Badge key={item.id} color="accent">{item.label}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
        <StatCard
          icon={AppWindow}
          label="Softwares instalados"
          value={softwareSnapshot.isLoading ? '—' : (softwareSnapshot.data?.totalInstalled ?? 0)}
          tone="success"
          trend={softwareSnapshot.data?.lastCollectedAt
            ? <span className="text-xs text-slate-400">Coletado {new Date(softwareSnapshot.data.lastCollectedAt).toLocaleDateString('pt-BR')}</span>
            : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NotesPanel
          entityType="agent"
          entityId={a.id}
          title="Notas do Agente"
        />

        {/* Disk */}
        <Card>
          <CardHeader title="Disco" subtitle="Espaço agregado do agente" />

          {disks.length === 0 ? (
            <p className="text-sm text-slate-500">Sem dados de disco coletados para este agente.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <p className="text-xs text-slate-500">Usado</p>
                  <p className="text-sm font-medium text-white">{formatBytes(usedDiskBytes)}</p>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <p className="text-xs text-slate-500">Livre</p>
                  <p className="text-sm font-medium text-white">{formatBytes(freeDiskBytes)}</p>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-sm font-medium text-white">{formatBytes(totalDiskBytes)}</p>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-slate-400">
                    <HardDrive className="h-3.5 w-3.5" />
                    Utilização
                  </span>
                  <span className="font-medium text-slate-300">{diskUsagePercent ?? 0}%</span>
                </div>
                <progress
                  className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-cyan-400 [&::-moz-progress-bar]:bg-cyan-400"
                  value={diskUsagePercent ?? 0}
                  max={100}
                />
              </div>

              <div className="max-h-40 space-y-2 overflow-y-auto">
                {disks.map((disk) => {
                  const diskUsedBytes = Math.max(0, disk.totalSizeBytes - disk.freeSpaceBytes);
                  const diskUsedPercent = disk.totalSizeBytes > 0
                    ? Math.min(100, Math.round((diskUsedBytes / disk.totalSizeBytes) * 100))
                    : 0;

                  return (
                    <div key={disk.id} className="rounded-lg bg-white/5 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-200">
                          {disk.driveLetter}{disk.label ? ` (${disk.label})` : ''}
                        </span>
                        <span className="text-slate-400">{diskUsedPercent}% usado</span>
                      </div>
                      <progress
                        className="mt-2 h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-cyan-400 [&::-moz-progress-bar]:bg-cyan-400"
                        value={diskUsedPercent}
                        max={100}
                      />
                      <p className="mt-1 text-slate-500">
                        {formatBytes(diskUsedBytes)} usados de {formatBytes(disk.totalSizeBytes)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Agent Info + Hardware Detail */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Info do Agente */}
        <Card>
          <CardHeader title="Informações" />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-400">Hostname</dt>
              <dd className="mt-0.5 font-mono text-white">{a.hostname}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Sistema Operacional</dt>
              <dd className="mt-0.5 text-white">{a.operatingSystem ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Versão do SO</dt>
              <dd className="mt-0.5 font-mono text-white">{a.osVersion ?? '—'}</dd>
            </div>
            <div className="border-t border-white/5 pt-3">
              <dt className="text-slate-400">MeshCentral Node ID</dt>
              <dd className="mt-0.5 font-mono text-white">{a.meshCentralNodeId ?? '—'}</dd>
              <p className="mt-1 text-xs text-slate-500">
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
            </div>
            {hw.data?.hardware?.osBuild && (
              <div>
                <dt className="text-slate-400">Build</dt>
                <dd className="mt-0.5 font-mono text-white">{hw.data.hardware.osBuild}</dd>
              </div>
            )}
            <div className="border-t border-white/5 pt-3">
              <dt className="text-slate-400">Versão do Agente</dt>
              <dd className="mt-0.5 font-mono text-white">{a.agentVersion ?? '—'}</dd>
            </div>
            {isZeroTouchPending && (
              <div>
                <dt className="text-slate-400">Zero-Touch Config Registration</dt>
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
              <dt className="text-slate-400">Último IP</dt>
              <dd className="mt-0.5 font-mono text-white">{a.lastIpAddress ?? hw.data?.networkAdapters?.find(n => n.ipAddress && !n.ipAddress.startsWith('169.254'))?.ipAddress ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Última vez online</dt>
              <dd className="mt-0.5 text-white">{a.lastSeen ? formatDate(a.lastSeen) : (a.lastSeenAt ? formatDate(a.lastSeenAt) : '—')}</dd>
            </div>
            {hw.data?.hardware?.manufacturer && (
              <div className="border-t border-white/5 pt-3">
                <dt className="text-slate-400">Fabricante / Modelo</dt>
                <dd className="mt-0.5 text-white">{hw.data.hardware.manufacturer} {hw.data.hardware.model ?? ''}</dd>
              </div>
            )}
            {hw.data?.hardware?.serialNumber && (
              <div>
                <dt className="text-slate-400">Número de série</dt>
                <dd className="mt-0.5 font-mono text-white">{hw.data.hardware.serialNumber}</dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Impressoras */}
        <Card>
          <CardHeader title="Impressoras" subtitle={`${printers.length} impressora(s) detectada(s)`} />
          {printers.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma impressora coletada para este agente.</p>
          ) : (
            <div className="space-y-2">
              {printers.map((printer, index) => (
                <div key={`${printer.name}-${printer.portName ?? index}`} className="rounded-lg bg-white/5 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{printer.name}</p>
                      {printer.driverName && (
                        <p className="truncate text-xs text-slate-500">Driver: {printer.driverName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {printer.isDefault && <Badge color="primary">Padrão</Badge>}
                      <Badge color={printerStatusColor(printer.printerStatus)}>{printer.printerStatus ?? 'Sem status'}</Badge>
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
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
        </Card>

        {/* Adaptadores de Rede */}
        {hw.data?.networkAdapters && hw.data.networkAdapters.length > 0 && (
          <Card>
            <CardHeader title="Adaptadores de Rede" subtitle={`${hw.data.networkAdapters.length} adaptador(es)`} />
            <div className="space-y-2">
              {hw.data.networkAdapters.map(n => (
                <div key={n.id} className="rounded-lg bg-white/5 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{n.name}</p>
                      {n.macAddress && <p className="font-mono text-xs text-slate-500">{n.macAddress}</p>}
                    </div>
                    <Badge color={n.isDhcpEnabled ? 'success' : 'slate'}>{n.isDhcpEnabled ? 'DHCP' : 'Estático'}</Badge>
                  </div>
                  {(n.ipAddress || n.gateway) && (
                    <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                      {n.ipAddress && (
                        <div>
                          <span className="text-slate-500">IP: </span>
                          <span className="font-mono text-slate-300">{n.ipAddress}</span>
                          {n.subnetMask && <span className="text-slate-500"> / {n.subnetMask}</span>}
                        </div>
                      )}
                      {n.gateway && (
                        <div>
                          <span className="text-slate-500">Gateway: </span>
                          <span className="font-mono text-slate-300">{n.gateway}</span>
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
        <div className="mb-4 flex flex-wrap gap-2 border-b border-white/10 pb-3">
          <button
            type="button"
            onClick={() => setActiveDataTab('software')}
            aria-pressed={activeDataTab === 'software'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'software' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-white/10 bg-white/5 text-slate-300 hover:text-slate-100'}`}
          >
            Inventário de Aplicativos
            <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs text-slate-300">{softwareTotalCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveDataTab('tickets')}
            aria-pressed={activeDataTab === 'tickets'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'tickets' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-white/10 bg-white/5 text-slate-300 hover:text-slate-100'}`}
          >
            Últimos Chamados
            <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs text-slate-300">{agentTickets.data?.length ?? 0}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveDataTab('listeningPorts')}
            aria-pressed={activeDataTab === 'listeningPorts'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'listeningPorts' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-white/10 bg-white/5 text-slate-300 hover:text-slate-100'}`}
          >
            Portas em Escuta
            <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs text-slate-300">{listeningPorts.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveDataTab('openSockets')}
            aria-pressed={activeDataTab === 'openSockets'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'openSockets' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-white/10 bg-white/5 text-slate-300 hover:text-slate-100'}`}
          >
            Conexões Abertas
            <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs text-slate-300">{openSockets.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveDataTab('logs')}
            aria-pressed={activeDataTab === 'logs'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'logs' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-white/10 bg-white/5 text-slate-300 hover:text-slate-100'}`}
          >
            Logs Recentes
            <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs text-slate-300">{agentLogs.data?.length ?? 0}</span>
          </button>
        </div>

        {activeDataTab === 'software' && (
          <>
            <CardHeader
              title="Inventário de Aplicativos"
              subtitle={`${softwareTotalCount} aplicativo(s) no inventário`}
            />
            {software.isLoading ? (
              <Loading message="Carregando inventário de aplicativos..." />
            ) : software.isError ? (
              <ErrorDisplay onRetry={() => software.refetch()} />
            ) : (
              <>
                {softwareSnapshot.data?.updatedAt && (
                  <div className="mb-3 flex items-center justify-end gap-2 text-xs text-slate-500">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Última coleta: <span className="text-slate-300">{formatDate(softwareSnapshot.data.updatedAt)}</span></span>
                  </div>
                )}

                <div className="mb-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <p className="text-xs text-slate-500">Total instalado</p>
                    <p className="text-sm font-medium text-white">{softwareSnapshot.data?.totalInstalled ?? softwareTotalCount}</p>
                  </div>
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <p className="text-xs text-slate-500">Primeira detecção</p>
                    <p className="text-sm text-slate-300">{formatDate(softwareSnapshot.data?.firstSeenAt ?? null)}</p>
                  </div>
                  <div className="rounded-lg bg-white/5 px-3 py-2">
                    <p className="text-xs text-slate-500">Última coleta</p>
                    <p className="text-sm text-slate-300">{formatDate(softwareSnapshot.data?.lastCollectedAt ?? null)}</p>
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
                    options={softwareLimitOptions}
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

                <DataTable
                  columns={softwareColumns}
                  data={softwareItems}
                  keyExtractor={item => item.inventoryId}
                  emptyMessage="Nenhum aplicativo encontrado para este agente"
                />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Página {softwarePage} de {softwareTotalPages} | {softwareItems.length} item(ns) nesta página
                    {softwareSearchApplied ? ` | filtro: "${softwareSearchApplied}"` : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={goToPreviousSoftwarePage} disabled={!canGoPrevSoftwarePage}>
                      Voltar
                    </Button>
                    <div className="rounded-md border border-white/10 px-3 py-1 text-xs text-slate-300">
                      {softwarePage}
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
            <CardHeader title="Últimos Chamados" subtitle={`${agentTickets.data?.length ?? 0} chamado(s) retornado(s)`} />
            <div className="space-y-2">
              {agentTickets.isLoading && (
                <div className="py-4 text-center text-sm text-slate-400">
                  Carregando chamados...
                </div>
              )}
              {!agentTickets.isLoading && (!agentTickets.data || agentTickets.data.length === 0) && (
                <div className="py-4 text-center text-sm text-slate-400">
                  Nenhum chamado encontrado
                </div>
              )}
              {!agentTickets.isLoading && agentTickets.data && agentTickets.data.length > 0 && (
                <div className="space-y-2">
                  {agentTickets.data.map(ticket => {
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
                        className="w-full rounded-lg bg-white/5 px-3 py-2.5 text-left transition-colors hover:bg-white/10"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <TicketIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <p className="truncate text-sm font-medium text-white">
                                {ticket.title}
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">
                              {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
                              {ticket.closedAt && ' • Encerrado'}
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

        {activeDataTab === 'listeningPorts' && (
          <>
            <CardHeader
              title="Portas em Escuta"
              subtitle={`${listeningPorts.length} porta(s) ativa(s)`}
            />
            {listeningPorts.length === 200 && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Lista truncada pelo backend no limite de 200 itens. Podem existir mais portas em escuta.
              </div>
            )}
            <DataTable
              columns={listeningPortColumns}
              data={listeningPorts}
              keyExtractor={item => item.id}
              emptyMessage="Nenhuma porta em escuta encontrada"
            />
          </>
        )}

        {activeDataTab === 'openSockets' && (
          <>
            <CardHeader
              title="Conexões Abertas"
              subtitle={`${openSockets.length} conexão(ões) ativa(s)`}
            />
            {openSockets.length === 500 && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Lista truncada pelo backend no limite de 500 itens. Podem existir mais conexões abertas.
              </div>
            )}
            <DataTable
              columns={openSocketColumns}
              data={openSockets}
              keyExtractor={item => item.id}
              emptyMessage="Nenhuma conexão aberta encontrada"
            />
          </>
        )}

        {activeDataTab === 'logs' && (
          <>
            <CardHeader title="Logs Recentes" />
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {(agentLogs.data ?? []).map(log => {
                const l = levelLabels[log.level] ?? { label: '?', color: 'slate' as const };
                return (
                  <div key={log.id} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2">
                    <Badge color={l.color} className="mt-0.5 shrink-0">{l.label}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-300">{log.message}</p>
                      <p className="text-xs text-slate-500">{formatDate(log.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
              {agentLogs.isLoading && <p className="text-sm text-slate-500">Carregando...</p>}
              {(agentLogs.data?.length ?? 0) === 0 && !agentLogs.isLoading && (
                <p className="text-sm text-slate-500">Nenhum log registrado</p>
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
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-slate-200">
            <p>
              Você está prestes a excluir o agente{' '}
              <span className="font-semibold text-white">{a.displayName ?? a.hostname}</span>.
            </p>
            <p className="mt-1 text-slate-400">Esta ação não pode ser desfeita.</p>
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
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  Foram encontrados vínculos ambíguos no site. Trate manualmente antes de aplicar reconcile.
                </div>
              )}

              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Agent atual</p>
                {currentNodeLinkItem ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-white">
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
                    <p className="font-mono text-xs text-slate-300">
                      Atual: {currentNodeLinkItem.currentNodeId ?? 'Sem vínculo'}
                    </p>
                    <p className="font-mono text-xs text-slate-300">
                      Sugerido: {currentNodeLinkItem.suggestedNodeId ?? 'Sem sugestão'}
                    </p>
                    {(currentNodeLinkItem.candidateNodeIds?.length ?? 0) > 0 && (
                      <p className="font-mono text-xs text-slate-300">
                        Candidates: {currentNodeLinkItem.candidateNodeIds?.join(', ')}
                      </p>
                    )}
                    {currentNodeLinkItem.error && (
                      <p className="text-xs text-danger">Erro: {currentNodeLinkItem.error}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">
                    O dry-run não retornou este agent no conjunto de itens do site.
                  </p>
                )}
              </div>

              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {nodeLinkPreviewReport.items.slice(0, 25).map((item: MeshCentralNodeLinksBackfillItem) => (
                  <div key={item.agentId} className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm text-white">
                        {item.displayName ?? item.hostname}
                      </p>
                      <Badge color={nodeLinkStatusColor(item.status)}>{item.status}</Badge>
                    </div>
                    <p className="font-mono text-xs text-slate-400">
                      Atual: {item.currentNodeId ?? 'Sem vínculo'} | Sugerido: {item.suggestedNodeId ?? 'Sem sugestão'}
                    </p>
                  </div>
                ))}
                {nodeLinkPreviewReport.items.length > 25 && (
                  <p className="text-xs text-slate-500">
                    Exibindo 25 de {nodeLinkPreviewReport.items.length} itens.
                  </p>
                )}
              </div>
            </>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
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
    </div>
  );
}
