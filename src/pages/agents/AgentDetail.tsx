import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Bell, Cpu, MemoryStick, Ticket as TicketIcon,
  Monitor, Wifi, WifiOff, AppWindow, Search, Clock, HardDrive, Printer, Bug, AlertTriangle, Trash2, ShieldCheck, Plus, Gauge, Power, RotateCcw, Zap, ChevronDown, ChevronRight, RefreshCw, ArrowUpCircle, Info, Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getDeleteAgentErrorMessage, useAgent, useAgentHardware, useAgentHardwareComponents, useAgentListeningPortsPage, useAgentOpenSocketsPage, useAgentSoftwarePage, useAgentSoftwareSnapshot, useApproveZeroTouch, useDeleteAgent, useRestartAgent, useShutdownAgent, useWakeOnLan } from '@/hooks/useAgents';
import {
  agentDetailBackTarget,
  agentDetailTabFromSlug,
  agentDetailTabSlug,
  formatBytes,
  formatDate,
  formatSocketFamily,
  type AgentDetailDataTab,
} from './agentDetailUtils';
import { useTickets } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { Button, Card, CardHeader, Badge, Loading, ErrorDisplay, Input, Select, DataTable, Modal, StatCard, AgentHeartbeatCard, Tooltip, ContextMenu, type ContextMenuItem, type Column } from '@/components/ui';
import { ensureArray } from '@/utils/ensureArray';
import PowerActionModal from '@/components/agents/PowerActionModal';
import AgentNotificationModal, { type AgentNotificationPayload } from '@/components/agents/AgentNotificationModal';
import AgentStartupItemsPanel from '@/components/agents/AgentStartupItemsPanel';
import AgentScheduledTasksPanel from '@/components/agents/AgentScheduledTasksPanel';
import WakeOnLanModal from '@/components/agents/WakeOnLanModal';
import { NotesPanel } from '@/components/notes/NotesPanel';
import type { AgentSoftwareInventoryItem, ListeningPortInfo, LogEntry, OpenSocketInfo, ScheduledTaskInfo, StartupItemInfo } from '@/api';
import { ApiError, agentUpdatesApi, agentsApi } from '@/api';
import { getLogLevelMeta, getTicketPriorityMeta } from '@/utils/labels';
import {
  LISTENING_PORTS_BACKEND_LIMIT,
  LISTENING_PORTS_MAX_PAGE_SIZE,
  OPEN_SOCKETS_BACKEND_LIMIT,
  OPEN_SOCKETS_MAX_PAGE_SIZE,
} from '@/api/backendLimits';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { useNowTick } from '@/hooks/useNowTick';
import { isHeartbeatTimestampFresh, useAgentHeartbeat } from '@/stores/heartbeatStore';
import { agentLabelsApi } from '@/modules/agent-labels/api';
import type { AgentLabelSuppression } from '@/modules/agent-labels/types';
import { AgentLabelSourceType, type AgentLabel } from '@/modules/agent-labels/types';
import { openRemoteDebugPopup } from './remoteDebugLauncher';
import { openRemoteSessionPopup } from './remoteSessionLauncher';
import { useAuthorization } from '@/auth/authorization';
import { useSendAgentNotification } from '@/hooks/useAgentAlerts';

// formatBytes, formatDate, formatSocketFamily — importadas de ./agentDetailUtils

function printerStatusColor(status: string | null): 'success' | 'warning' | 'danger' | 'slate' {
  if (!status) return 'slate';
  const normalized = status.toLowerCase();
  if (normalized.includes('ready') || normalized.includes('pronta')) return 'success';
  if (normalized.includes('error') || normalized.includes('erro') || normalized.includes('offline')) return 'danger';
  if (normalized.includes('warn') || normalized.includes('warning') || normalized.includes('paus')) return 'warning';
  return 'slate';
}

// Commit do agente para exibição — ignora placeholders de builds locais sem
// injeção de ldflags ("unknown"/"dev"/vazio), que não identificam um build.
function agentCommitHash(commitHash: string | null | undefined): string | null {
  if (!commitHash) return null;
  const trimmed = commitHash.trim();
  const normalized = trimmed.toLowerCase();
  if (!normalized || normalized === 'unknown' || normalized === 'dev') return null;
  return trimmed;
}

// Espelha o clamp de pageSize do backend (GetAgentSoftwarePageQueryHandler).
// A opção "Todos" usa este tamanho em uma única requisição.
const SOFTWARE_MAX_PAGE_SIZE = 2000;

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [softwareLimitSelected, setSoftwareLimitSelected] = useState('10');
  const [softwareOrder, setSoftwareOrder] = useState<'asc' | 'desc'>('desc');
  const [softwareSearchInput, setSoftwareSearchInput] = useState('');
  const [softwareSearchApplied, setSoftwareSearchApplied] = useState('');
  const [softwarePage, setSoftwarePage] = useState(1);
  // ── Portas em Escuta / Conexões Abertas: paginação por cursor (ponteiro) ──
  // A pilha guarda o cursor de cada página (página 1 = cursor indefinido);
  // "Avançar" empurra o nextCursor do backend e "Voltar" desempilha.
  const [portsCursors, setPortsCursors] = useState<(string | undefined)[]>([undefined]);
  const [listeningPortsLimit, setListeningPortsLimit] = useState('10');
  const [listeningPortsSearchInput, setListeningPortsSearchInput] = useState('');
  const [listeningPortsSearchApplied, setListeningPortsSearchApplied] = useState('');
  const [socketsCursors, setSocketsCursors] = useState<(string | undefined)[]>([undefined]);
  const [openSocketsLimit, setOpenSocketsLimit] = useState('10');
  const [openSocketsSearchInput, setOpenSocketsSearchInput] = useState('');
  const [openSocketsSearchApplied, setOpenSocketsSearchApplied] = useState('');
  // Filtro de estado TCP (server-side): 'all' | 'open' | estado exato.
  const [openSocketsStateFilter, setOpenSocketsStateFilter] = useState('all');
  const [allLabels, setAllLabels] = useState<AgentLabel[]>([]);
  const [isLoadingLabels, setIsLoadingLabels] = useState(true);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [isAddingManualLabel, setIsAddingManualLabel] = useState(false);
  const [distinctLabels, setDistinctLabels] = useState<string[]>([]);
  // Labels suprimidas: removidas manualmente e que o reconcile respeita enquanto a
  // condição da regra continuar verdadeira. Visíveis para poder liberá-las.
  const [labelSuppressions, setLabelSuppressions] = useState<AgentLabelSuppression[]>([]);
  const [isReleasingSuppression, setIsReleasingSuppression] = useState<string | null>(null);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [labelPickerQuery, setLabelPickerQuery] = useState('');
  const labelPickerRef = useRef<HTMLDivElement>(null);
  const [isOpeningRemoteDebug, setIsOpeningRemoteDebug] = useState(false);
  const [isOpeningRemoteControl, setIsOpeningRemoteControl] = useState(false);
  const [isTriggeringAgentUpdate, setIsTriggeringAgentUpdate] = useState(false);
  const [isApprovingZeroTouch, setIsApprovingZeroTouch] = useState(false);
  const [isRefreshingPorts, setIsRefreshingPorts] = useState(false);
  const [isRefreshingConnections, setIsRefreshingConnections] = useState(false);
  const [isRefreshingSoftware, setIsRefreshingSoftware] = useState(false);
  // InventoryId do app cuja atualização está sendo disparada (spinner por linha).
  const [updatingSoftwareId, setUpdatingSoftwareId] = useState<string | null>(null);
  // App bloqueado pela loja aguardando confirmação do operador.
  const [pendingUnapprovedUpdate, setPendingUnapprovedUpdate] = useState<AgentSoftwareInventoryItem | null>(null);
  // App aguardando confirmação de desinstalação.
  const [pendingUninstall, setPendingUninstall] = useState<AgentSoftwareInventoryItem | null>(null);
  // Menu de contexto (botão direito) da lista de aplicativos.
  const [softwareMenu, setSoftwareMenu] = useState<{ x: number; y: number; item: AgentSoftwareInventoryItem } | null>(null);
  // App aberto no modal de detalhes (a lista ficou enxuta: o detalhe traz
  // fabricante, origem, datas e identificadores do pacote).
  const [softwareDetails, setSoftwareDetails] = useState<AgentSoftwareInventoryItem | null>(null);
  // Filtro rápido "somente com atualização pendente" na aba de aplicativos.
  const [softwareOnlyUpdates, setSoftwareOnlyUpdates] = useState(false);
  // Texto digitado para liberar a desinstalação (a ação é irreversível no host:
  // além do comando, o desinstalador pode remover dados do aplicativo).
  const [uninstallConfirmText, setUninstallConfirmText] = useState('');
  // Timers de refetch agendado após update/uninstall (o agent reenvia o
  // inventário ~2 min depois da alteração).
  const softwareRefetchTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => {
    softwareRefetchTimers.current.forEach(clearTimeout);
    softwareRefetchTimers.current = [];
  }, []);
  const [isRefreshingPrinters, setIsRefreshingPrinters] = useState(false);
  const [isRefreshingStartup, setIsRefreshingStartup] = useState(false);
  const [isRefreshingScheduledTasks, setIsRefreshingScheduledTasks] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmHostname, setDeleteConfirmHostname] = useState('');
  // A aba ativa é lida da querystring (?tab=aplicativos, ?tab=tarefas-agendadas...).
  // A troca de aba usa `replace` para NÃO empilhar entradas no histórico: a URL
  // continua compartilhável, mas o botão "Voltar" (e o voltar do navegador)
  // saem da página de detalhes em vez de percorrer as abas visitadas.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeDataTab = useMemo(
    () => agentDetailTabFromSlug(searchParams.get('tab')),
    [searchParams],
  );
  const handleSelectDataTab = useCallback(
    (tab: AgentDetailDataTab) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', agentDetailTabSlug(tab));
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );
  // Botão "Voltar" do cabeçalho: sai da página de detalhes (listagem de agentes
  // ou página anterior real), nunca percorre as abas internas. Trocar de aba
  // usa `replace`, então o histórico não acumula as abas visitadas; se o
  // detalhe for a primeira entrada do histórico (link direto / refresh), volta
  // para a listagem de agentes em vez de tentar sair do app.
  const handleGoBack = useCallback(() => {
    const historyIndex =
      typeof window !== 'undefined' ? window.history.state?.idx : undefined;
    const fallback = agentDetailBackTarget(historyIndex);
    if (fallback === null) {
      navigate(-1);
      return;
    }
    navigate(fallback, { replace: true });
  }, [navigate]);
  const [isPowerMenuOpen, setIsPowerMenuOpen] = useState(false);
  // Submenu de energia ("Ligar / Reiniciar / Desligar") aberto ao lado via hover.
  const [powerSubmenuOpen, setPowerSubmenuOpen] = useState(false);
  const [powerAction, setPowerAction] = useState<'restart' | 'shutdown' | null>(null);
  const [wakeOnLanModalOpen, setWakeOnLanModalOpen] = useState(false);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);

  const { hasAnyPermission } = useAuthorization();
  const canManageAgent = hasAnyPermission(['Agents.Edit', 'agents.*', 'admin.*']);
  // Ações de execução no agente (refresh/atualização) exigem Agents.Execute.
  const canExecuteAgent = hasAnyPermission(['Agents.Execute', 'Agents.Edit', 'agents.*', 'admin.*']);
  const deleteAgent = useDeleteAgent();
  const approveZeroTouch = useApproveZeroTouch();
  const restartAgent = useRestartAgent();
  const shutdownAgent = useShutdownAgent();
  const wakeOnLan = useWakeOnLan();
  const sendAgentNotification = useSendAgentNotification();
  const agent = useAgent(id!);
  const liveHeartbeat = useAgentHeartbeat(id!);
  const hw = useAgentHardware(id!);
  // Payload pesado (impressoras/portas/conexões/discos) carregado apenas
  // quando uma aba que o consome está ativa (P1.2 — abas sob demanda).
  const dataTabNeedsComponents =
    activeDataTab === 'printers' ||
    activeDataTab === 'startupItems' ||
    activeDataTab === 'scheduledTasks';
  // Portas e conexões têm endpoints próprios paginados por cursor; o payload
  // pesado do /hardware/components é buscado sem as listas de rede.
  const hwComponents = useAgentHardwareComponents(id!, {
    enabled: dataTabNeedsComponents,
    includeNetwork: false,
  });
  // Paginação por cursor (ponteiro) das abas de rede: busca apenas a página
  // visível com total filtrado e o próximo ponteiro — substitui o fetch-all de
  // portas/sockets que vinha do /hardware/components.
  const portsPageQuery = useAgentListeningPortsPage(id!, {
    cursor: portsCursors[portsCursors.length - 1],
    limit: listeningPortsLimit === 'max' ? LISTENING_PORTS_MAX_PAGE_SIZE : Number(listeningPortsLimit),
    search: listeningPortsSearchApplied,
  });
  const socketsPageQuery = useAgentOpenSocketsPage(id!, {
    cursor: socketsCursors[socketsCursors.length - 1],
    limit: openSocketsLimit === 'max' ? OPEN_SOCKETS_MAX_PAGE_SIZE : Number(openSocketsLimit),
    search: openSocketsSearchApplied,
    state: openSocketsStateFilter,
  });
  // Paginação server-side por offset (P1.1): busca apenas a página visível com
  // total FILTRADO. Substitui o fetch-all por cursor (limit=500 + auto-fetch),
  // que com o cursor quebrado do backend causava o loop contínuo de requests.
  const softwarePageSize =
    softwareLimitSelected === 'max' ? SOFTWARE_MAX_PAGE_SIZE : Number(softwareLimitSelected);
  const software = useAgentSoftwarePage(id!, {
    page: softwarePage,
    pageSize: softwarePageSize,
    search: softwareSearchApplied,
    order: softwareOrder,
    onlyUpdates: softwareOnlyUpdates,
  });
  const softwareSnapshot = useAgentSoftwareSnapshot(id!);
  const agentLogs = useLogs({ agentId: id, limit: 10 }, { enabled: activeDataTab === 'logs' });
  const agentTickets = useTickets({ agentId: id, limit: 5 }, { enabled: activeDataTab === 'tickets' });
  // Tick de 15s (antes 5s): re-renderizava a página inteira a cada 5s só para
  // o freshness do heartbeat (P1.4).
  const now = useNowTick(15_000);
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
        const [data, distinct, suppressions] = await Promise.all([
          agentLabelsApi.getAgentLabels(id),
          agentLabelsApi.getDistinctLabels(),
          // Labels suprimidas: removidas manualmente e que o reconcile está respeitando.
          agentLabelsApi.getSuppressions(id).catch(() => []),
        ]);
        if (isCancelled) return;

        const sorted = data.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        setAllLabels(sorted);
        setDistinctLabels(distinct);
        setLabelSuppressions(suppressions);
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

  async function handleReleaseSuppression(suppressionId: string, label: string) {
    setIsReleasingSuppression(suppressionId);
    try {
      await agentLabelsApi.releaseSuppression(suppressionId);
      setLabelSuppressions(prev => prev.filter(item => item.id !== suppressionId));
      toast.success(`Supressão de "${label}" liberada. A label volta na próxima reconciliação.`);
    } catch {
      toast.error('Falha ao liberar a supressão.');
    } finally {
      setIsReleasingSuppression(null);
    }
  }

  async function handleRemoveManualLabel(labelId: string) {
    try {
      await agentLabelsApi.removeManualLabel(labelId);
      setAllLabels(prev => prev.filter(item => item.id !== labelId));
      // Se era uma label automática, passa a constar como suprimida (não volta sozinha).
      if (id) {
        const refreshed = await agentLabelsApi.getSuppressions(id).catch(() => null);
        if (refreshed) setLabelSuppressions(refreshed);
      }
      toast.success('Label removida.');
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
        cpuTemperatureCelsius: liveHeartbeat.cpuTemperatureCelsius,
        ipAddress: liveHeartbeat.ipAddress,
        hostname: liveHeartbeat.hostname,
        agentVersion: liveHeartbeat.agentVersion,
        timestampUtc: liveHeartbeat.timestampUtc,
      },
    };
  }, [a, liveHeartbeat, now]);

  // ── Software: paginação server-side — itens e totais vêm do endpoint (P1.1) ──
  // O totalCount do endpoint reflete o filtro de busca ativo (P1.3): o número
  // de páginas fica correto sob pesquisa. Enquanto a página não chega, usa o
  // total do snapshot como fallback (não filtrado).
  const softwareTotalCount =
    software.data?.totalCount ?? softwareSnapshot.data?.totalInstalled ?? 0;
  const softwareTotalPages =
    software.data?.totalPages ?? Math.max(1, Math.ceil(softwareTotalCount / softwarePageSize));
  const safeSoftwarePage = Math.min(softwarePage, softwareTotalPages);
  const softwareItemsAll = software.data?.items ?? [];
  // O filtro "somente com atualização" é aplicado no servidor (onlyUpdates no
  // endpoint): totalCount/totalPages já refletem o subconjunto. Este filtro
  // local fica só como defesa em profundidade.
  const softwareItems = softwareOnlyUpdates
    ? softwareItemsAll.filter((item) => item.updateAvailable)
    : softwareItemsAll;
  const softwareUpdatesCount = softwareItemsAll.filter((item) => item.updateAvailable).length;
  // Total do agente (não só a página) vem do snapshot; fallback para a página.
  const softwareUpdatesTotal = softwareSnapshot.data?.updateAvailableCount ?? softwareUpdatesCount;

  // Corrige estado da página para o range válido quando o total diminui (ex.: busca/filtro)
  useEffect(() => {
    if (softwarePage !== safeSoftwarePage) {
      setSoftwarePage(safeSoftwarePage);
    }
  }, [softwarePage, safeSoftwarePage]);

  // ── Listening Ports / Open Sockets — página atual por cursor (antes dos early returns) ──
  const portsPageItems: ListeningPortInfo[] = portsPageQuery.data?.items ?? [];
  const portsTotalCount = portsPageQuery.data?.totalCount ?? 0;
  const socketsPageItems: OpenSocketInfo[] = socketsPageQuery.data?.items ?? [];
  const socketsTotalCount = socketsPageQuery.data?.totalCount ?? 0;
  const startupItems: StartupItemInfo[] = hwComponents.data?.startupItems ?? [];
  const scheduledTasks: ScheduledTaskInfo[] = hwComponents.data?.scheduledTasks ?? [];

  // ── Listening Ports pagination (cursor server-side) ──
  const portsLimitNum = listeningPortsLimit === 'max' ? LISTENING_PORTS_MAX_PAGE_SIZE : Number(listeningPortsLimit);
  const portsPageIndex = portsCursors.length;
  const portsTotalPages = Math.max(1, Math.ceil(portsTotalCount / portsLimitNum));
  const canGoPrevPortsPage = portsPageIndex > 1;
  const canGoNextPortsPage = Boolean(portsPageQuery.data?.hasMore && portsPageQuery.data?.nextCursor);
  const resetPortsPagination = () => setPortsCursors([undefined]);
  const goToNextPortsPage = () => {
    const next = portsPageQuery.data?.nextCursor;
    if (next) setPortsCursors((prev) => [...prev, next]);
  };
  const goToPreviousPortsPage = () => setPortsCursors((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));

  const handleApplyPortsSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setListeningPortsSearchApplied(listeningPortsSearchInput.trim());
    resetPortsPagination();
  };
  const handleClearPortsSearch = () => {
    setListeningPortsSearchInput('');
    setListeningPortsSearchApplied('');
    resetPortsPagination();
  };
  const handlePortsLimitChange = (value: string) => {
    setListeningPortsLimit(value);
    resetPortsPagination();
  };

  // ── Open Sockets pagination (cursor server-side) ──
  const socketsLimitNum = openSocketsLimit === 'max' ? OPEN_SOCKETS_MAX_PAGE_SIZE : Number(openSocketsLimit);
  const socketsPageIndex = socketsCursors.length;
  const socketsTotalPages = Math.max(1, Math.ceil(socketsTotalCount / socketsLimitNum));
  const canGoPrevSocketsPage = socketsPageIndex > 1;
  const canGoNextSocketsPage = Boolean(socketsPageQuery.data?.hasMore && socketsPageQuery.data?.nextCursor);
  const resetSocketsPagination = () => setSocketsCursors([undefined]);
  const goToNextSocketsPage = () => {
    const next = socketsPageQuery.data?.nextCursor;
    if (next) setSocketsCursors((prev) => [...prev, next]);
  };
  const goToPreviousSocketsPage = () => setSocketsCursors((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));

  const handleApplySocketsSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setOpenSocketsSearchApplied(openSocketsSearchInput.trim());
    resetSocketsPagination();
  };
  const handleClearSocketsSearch = () => {
    setOpenSocketsSearchInput('');
    setOpenSocketsSearchApplied('');
    resetSocketsPagination();
  };
  const handleSocketsLimitChange = (value: string) => {
    setOpenSocketsLimit(value);
    resetSocketsPagination();
  };
  const handleSocketsStateChange = (value: string) => {
    setOpenSocketsStateFilter(value);
    resetSocketsPagination();
  };

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
  const getDiskStatusClass = (pct: number | null | undefined): string => {
    if (pct == null) return 'status-bar-success';
    if (pct >= 90) return 'status-bar-danger';
    if (pct >= 70) return 'status-bar-warning';
    return 'status-bar-success';
  };
  const getDiskStatusTextClass = (pct: number | null | undefined): string => {
    if (pct == null) return 'text-success';
    if (pct >= 90) return 'text-danger';
    if (pct >= 70) return 'text-warning';
    return 'text-success';
  };
  const getSmartStatusClass = (status: string | null | undefined): string => {
    switch (status) {
      case 'OK': return 'text-success';
      case 'Atenção': return 'text-warning';
      case 'Falha prevista': return 'text-danger';
      default: return 'text-muted';
    }
  };
  const getSmartBadgeClass = (status: string | null | undefined): string => {
    switch (status) {
      case 'OK': return 'bg-success/15 text-success';
      case 'Atenção': return 'bg-warning/15 text-warning';
      case 'Falha prevista': return 'bg-danger/15 text-danger';
      default: return 'bg-surface-hover text-muted';
    }
  };
  const getTempClass = (temp: number | null | undefined): string => {
    if (temp == null) return 'text-muted';
    if (temp >= 55) return 'text-danger';
    if (temp >= 45) return 'text-warning';
    return 'text-success';
  };
  const formatHours = (hours: number | null | undefined): string => {
    if (hours == null) return '\u2014';
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 365) return `${days}d`;
    const years = (hours / 8760).toFixed(1);
    return `${years} anos`;
  };
  const printers = hwComponents.data?.printers ?? [];
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
      key: 'state',
      header: 'Estado',
      className: 'w-32',
      sortable: false,
      render: item => {
        // Estado TCP no momento da coleta (MIB_TCP_STATE). TIME_WAIT/CLOSE_WAIT
        // significam conexão já encerrada — explicam listas grandes de
        // "conexões" do próprio agente.
        const state = (item.state ?? '').toUpperCase();
        const tone =
          state === 'ESTABLISHED' ? 'success'
          : state === 'TIME_WAIT' || state === 'CLOSE_WAIT' || state === 'FIN_WAIT1' || state === 'FIN_WAIT2' || state === 'CLOSING' || state === 'LAST_ACK' ? 'warning'
          : 'slate';
        return <Badge color={tone}>{item.state || '—'}</Badge>;
      },
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

  // Filtro "somente com atualização": aplicado no servidor (o endpoint devolve
  // total/páginas só dos apps com update pendente) e reinicia a paginação.
  const handleToggleSoftwareOnlyUpdates = () => {
    setSoftwareOnlyUpdates((prev) => !prev);
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

  const handleOpenRemoteControl = async () => {
    if (!id || isOpeningRemoteControl) return;

    setIsOpeningRemoteControl(true);
    try {
      await openRemoteSessionPopup({ agentId: id, kind: 'screen', transport: 'nats' });
      toast.success('Sessão remota iniciada com sucesso.');
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Falha ao iniciar sessão remota.';
      toast.error(message);
    } finally {
      setIsOpeningRemoteControl(false);
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

  const handleOpenNotification = () => {
    setIsPowerMenuOpen(false);
    setNotificationModalOpen(true);
  };

  const handleNotificationConfirm = async (data: AgentNotificationPayload) => {
    if (!id) {
      throw new Error('Agente inválido para envio de notificação.');
    }

    await sendAgentNotification.mutateAsync({ agentId: id, ...data });
  };

  const handlePowerActionConfirm = async (data: { delaySeconds: number; force: boolean; message: string; notifyUser: boolean }) => {
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
      // Nova coleta pode mudar o snapshot: o cursor antigo pode apontar para o
      // índice errado, então volta para a 1ª página.
      resetPortsPagination();
      await portsPageQuery.refetch();
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
      // Nova coleta pode mudar o snapshot: volta para a 1ª página.
      resetSocketsPagination();
      await socketsPageQuery.refetch();
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

  const scheduleSoftwareRefetch = () => {
    softwareRefetchTimers.current.forEach(clearTimeout);
    softwareRefetchTimers.current = [];
    [45_000, 110_000, 170_000].forEach((delay) => {
      const timer = setTimeout(() => {
        void software.refetch();
        void softwareSnapshot.refetch();
      }, delay);
      softwareRefetchTimers.current.push(timer);
    });
  };

  const handleUpdateSoftware = async (item: AgentSoftwareInventoryItem, confirmUnapproved = false) => {
    if (!id || updatingSoftwareId) return;
    setUpdatingSoftwareId(item.inventoryId);
    try {
      await agentsApi.updateSoftware(id, item.inventoryId, confirmUnapproved);
      setPendingUnapprovedUpdate(null);
      toast.success(`Atualização de "${item.name}" enviada ao agente.`);
      scheduleSoftwareRefetch();
    } catch (error) {
      // 409 = app não aprovado na loja: pede confirmação explícita e reenvia.
      if (!confirmUnapproved && error instanceof ApiError && error.status === 409) {
        setPendingUnapprovedUpdate(item);
        return;
      }
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar atualização do aplicativo.';
      toast.error(msg);
    } finally {
      setUpdatingSoftwareId(null);
    }
  };

  // Nome exato que o operador deve digitar para liberar a desinstalação.
  const uninstallConfirmTarget = (pendingUninstall?.name ?? '').trim();
  const canConfirmUninstall =
    uninstallConfirmTarget !== '' && uninstallConfirmText.trim() === uninstallConfirmTarget;

  // Abre o modal de desinstalação SEMPRE com o campo de confirmação limpo. Os
  // dois pontos de entrada (menu de contexto e modal de detalhes) passam por
  // aqui, para nunca liberar o botão com um texto digitado numa abertura anterior.
  const openUninstallModal = (item: AgentSoftwareInventoryItem) => {
    setUninstallConfirmText('');
    setPendingUninstall(item);
  };

  // Fecha o modal e descarta o texto digitado (mesmo motivo acima).
  const closeUninstallModal = () => {
    setPendingUninstall(null);
    setUninstallConfirmText('');
  };

  const handleUninstallSoftware = async (item: AgentSoftwareInventoryItem) => {
    if (!id || updatingSoftwareId) return;
    setUpdatingSoftwareId(item.inventoryId);
    try {
      await agentsApi.uninstallSoftware(id, item.inventoryId);
      // closeUninstallModal também limpa o texto de confirmação — manter o valor
      // permitiria reenviar o comando sem redigitar.
      closeUninstallModal();
      toast.success('Desinstalação de "' + item.name + '" enviada ao agente.');
      scheduleSoftwareRefetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar desinstalação do aplicativo.';
      toast.error(msg);
    } finally {
      setUpdatingSoftwareId(null);
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

  const handleRefreshStartup = async () => {
    if (!id || isRefreshingStartup) return;
    setIsRefreshingStartup(true);
    try {
      await agentsApi.refreshData(id, { startupItems: true });
      toast.success('Solicitação de coleta de inicialização enviada ao agente.');
      await new Promise(r => setTimeout(r, 2000));
      await hwComponents.refetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar refresh de inicialização.';
      toast.error(msg);
    } finally {
      setIsRefreshingStartup(false);
    }
  };

  const handleRefreshScheduledTasks = async () => {
    if (!id || isRefreshingScheduledTasks) return;
    setIsRefreshingScheduledTasks(true);
    try {
      await agentsApi.refreshData(id, { scheduledTasks: true });
      toast.success('Solicitação de coleta de tarefas agendadas enviada ao agente.');
      await new Promise(r => setTimeout(r, 2500));
      await hwComponents.refetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar refresh de tarefas agendadas.';
      toast.error(msg);
    } finally {
      setIsRefreshingScheduledTasks(false);
    }
  };

  const pageSizeOptions = [
    { value: '10', label: '10 por página' },
    { value: '30', label: '30 por página' },
    { value: '50', label: '50 por página' },
    { value: '100', label: '100 por página' },
    { value: 'max', label: 'Todos' },
  ];
  // Filtro de estado TCP. "open" exclui conexões já encerradas — tira o ruído
  // de TIME_WAIT que faz o próprio discovery-service.exe dominar a lista.
  const socketStateOptions = [
    { value: 'all', label: 'Todos os estados' },
    { value: 'open', label: 'Somente abertas (sem TIME_WAIT)' },
    { value: 'ESTABLISHED', label: 'ESTABLISHED' },
    { value: 'TIME_WAIT', label: 'TIME_WAIT' },
    { value: 'CLOSE_WAIT', label: 'CLOSE_WAIT' },
  ];
  const softwareOrderOptions = [
    { value: 'desc', label: 'Mais recente primeiro' },
    { value: 'asc', label: 'Mais antigo primeiro' },
  ];
  // Lista enxuta de propósito: só Aplicativo e Versão. As colunas Fonte, Ações e
  // Última coleta saíram — a origem e as datas ficam no detalhe, e as ações
  // passaram para o menu de contexto (botão direito), deixando a varredura da
  // lista muito mais limpa.
  const softwareColumns: Column<AgentSoftwareInventoryItem>[] = [
    {
      key: 'name',
      header: 'Aplicativo',
      sortable: false,
      render: item => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-foreground" title={item.name}>
            {item.name}
          </span>
          {updatingSoftwareId === item.inventoryId && (
            <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-label="Processando" />
          )}
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Versão',
      className: 'font-mono whitespace-nowrap',
      sortable: false,
      render: item => (
        <div className="flex flex-wrap items-center gap-2">
          <span>{item.version ?? '\u2014'}</span>
          {item.updateAvailable && item.availableVersion && (
            <Badge color="warning">&rarr; {item.availableVersion}</Badge>
          )}
        </div>
      ),
    },
  ];

  // Ações no botão direito. "Ver detalhes" vem primeiro por ser a ação
  // inofensiva e mais usada; atualizar/desinstalar só aparecem quando aplicáveis,
  // para o menu não oferecer uma ação que o servidor recusaria.
  const softwareMenuItems: ContextMenuItem[] = softwareMenu
    ? [
        {
          key: 'details',
          label: 'Ver detalhes',
          icon: <Info className="h-4 w-4" />,
          onClick: () => {
            const item = softwareMenu.item;
            setSoftwareMenu(null);
            setSoftwareDetails(item);
          },
        },
        {
          key: 'copy',
          label: 'Copiar nome',
          icon: <Copy className="h-4 w-4" />,
          onClick: () => {
            const item = softwareMenu.item;
            setSoftwareMenu(null);
            void navigator.clipboard?.writeText(item.name);
            toast.success('Nome copiado.');
          },
        },
        ...(softwareMenu.item.updateAvailable
          ? [
              {
                key: 'update',
                label: 'Atualizar aplicativo',
                icon: <ArrowUpCircle className="h-4 w-4" />,
                separatorBefore: true,
                disabled: !isOnlineNow || !canExecuteAgent || updatingSoftwareId !== null,
                hint: !canExecuteAgent
                  ? 'sem permissão'
                  : !isOnlineNow
                    ? 'agente offline'
                    : undefined,
                onClick: () => {
                  const item = softwareMenu.item;
                  setSoftwareMenu(null);
                  void handleUpdateSoftware(item);
                },
              } satisfies ContextMenuItem,
            ]
          : []),
        ...(softwareMenu.item.uninstallAvailable
          ? [
              {
                key: 'uninstall',
                label: 'Desinstalar aplicativo',
                icon: <Trash2 className="h-4 w-4" />,
                danger: true,
                disabled: !isOnlineNow || !canExecuteAgent || updatingSoftwareId !== null,
                hint: !canExecuteAgent
                  ? 'sem permissão'
                  : !isOnlineNow
                    ? 'agente offline'
                    : undefined,
                onClick: () => {
                  const item = softwareMenu.item;
                  setSoftwareMenu(null);
                  openUninstallModal(item);
                },
              } satisfies ContextMenuItem,
            ]
          : []),
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={handleGoBack} aria-label="Voltar" className="rounded-lg p-2 text-muted hover:bg-surface-light hover:text-foreground">
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
            <div className="absolute right-0 top-full z-50 mt-2 min-w-[220px] rounded-lg border border-border bg-surface shadow-xl">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  setIsPowerMenuOpen(false);
                  void handleOpenRemoteControl();
                }}
                disabled={isOpeningRemoteControl}
              >
                <Monitor className="h-4 w-4" />
                {isOpeningRemoteControl ? 'Abrindo remoto...' : 'Controle remoto'}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleOpenNotification}
                disabled={!canExecuteAgent}
              >
                <Bell className="h-4 w-4" />
                Enviar notificação
              </button>

              <div className="border-t border-border" />

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
                <div
                  className="relative flex w-full"
                  onMouseEnter={() => setPowerSubmenuOpen(true)}
                  onMouseLeave={() => setPowerSubmenuOpen(false)}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-warning transition-colors hover:bg-warning/10 dark:text-amber-300 dark:hover:bg-amber-500/10"
                    disabled={restartAgent.isPending || shutdownAgent.isPending}
                  >
                    <Zap className="h-4 w-4" />
                    Energia
                    <ChevronRight className="ml-auto h-4 w-4" />
                  </button>
                  {powerSubmenuOpen && (
                    <div className="absolute right-full top-0 z-50 min-w-[180px] overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
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
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-success transition-colors hover:bg-success/10 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled
                        title="Disponível em breve"
                      >
                        <Zap className="h-4 w-4" />
                        Ligar
                        <span className="ml-auto rounded bg-surface-hover px-1.5 py-0.5 text-[10px] text-muted-foreground">em breve</span>
                      </button>
                    </div>
                  )}
                </div>
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

            {labelSuppressions.length > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="mb-2 text-xs font-medium text-amber-300">
                  Labels suprimidas ({labelSuppressions.length})
                </p>
                <p className="mb-2 text-[11px] text-muted">
                  Removidas manualmente. A regra não as reaplica enquanto a condição continuar
                  verdadeira; quando a condição deixar de valer, voltam a ser aplicadas
                  automaticamente.
                </p>
                <div className="flex flex-wrap gap-2">
                  {labelSuppressions.map(item => (
                    <span
                      key={item.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted"
                      title={
                        item.ruleName
                          ? `Regra: ${item.ruleName}`
                          : 'Sem regra associada no momento'
                      }
                    >
                      <span className="line-through">{item.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {item.suppressedBy ? `por ${item.suppressedBy}` : 'manual'}
                      </span>
                      <button
                        className="ml-0.5 inline-flex items-center justify-center rounded-full p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-success"
                        title="Liberar supressão (a label volta a ser aplicada)"
                        disabled={isReleasingSuppression === item.id}
                        onClick={() => void handleReleaseSuppression(item.id, item.label)}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
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
          <CardHeader title="Disco" subtitle="Espaço agregado do agente" />

          {disks.length === 0 ? (
            <p className="text-sm text-muted">Sem dados de disco coletados para este agente.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-surface-light px-3 py-2">
                  <p className="text-xs text-muted">Usado</p>
                  <p className="text-sm font-medium text-foreground">{formatBytes(usedDiskBytes)}</p>
                </div>
                <div className="rounded-lg bg-surface-light px-3 py-2">
                  <p className="text-xs text-muted">Livre</p>
                  <p className="text-sm font-medium text-foreground">{formatBytes(freeDiskBytes)}</p>
                </div>
                <div className="rounded-lg bg-surface-light px-3 py-2">
                  <p className="text-xs text-muted">Total</p>
                  <p className="text-sm font-medium text-foreground">{formatBytes(totalDiskBytes)}</p>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-muted">
                    <HardDrive className="h-3.5 w-3.5" />
                    Utilização
                  </span>
                  <span className={`font-medium ${getDiskStatusTextClass(diskUsagePercent)}`}>{diskUsagePercent ?? 0}%</span>
                </div>
                <progress
                  className={`h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-surface-hover ${getDiskStatusClass(diskUsagePercent)}`}
                  value={diskUsagePercent ?? 0}
                  max={100}
                />
              </div>

              <div className="max-h-80 space-y-2 overflow-y-auto">
                {disks.map((disk) => {
                  const diskUsedBytes = Math.max(0, disk.totalSizeBytes - disk.freeSpaceBytes);
                  const diskUsedPercent = disk.totalSizeBytes > 0
                    ? Math.min(100, Math.round((diskUsedBytes / disk.totalSizeBytes) * 100))
                    : 0;
                  const smartStatus = disk.smartStatus ?? null;
                  const hasSmart = smartStatus != null && smartStatus !== 'Indisponível';

                  return (
                    <Tooltip
                      key={disk.id}
                      position="top"
                      delay={250}
                      className="block"
                      variant="hover-card"
                      content={(
                        <div className="w-64 space-y-2 text-left text-[11px] text-muted-foreground">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">
                              {disk.driveLetter}{disk.label ? ` (${disk.label})` : ''}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getSmartBadgeClass(smartStatus)}`}>
                              {hasSmart ? smartStatus : 'Sem dados'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                            <div>
                              <p className="text-muted">Saúde</p>
                              <p className={`font-medium ${getSmartStatusClass(smartStatus)}`}>
                                {hasSmart ? smartStatus : 'Indisponível'}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted">Temperatura</p>
                              <p className={`font-medium ${getTempClass(disk.temperatureC)}`}>
                                {disk.temperatureC != null ? `${disk.temperatureC}°C` : '\u2014'}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted">Horas ligadas</p>
                              <p className="font-medium text-foreground">{formatHours(disk.powerOnHours)}</p>
                            </div>
                            <div>
                              <p className="text-muted">Tipo</p>
                              <p className="font-medium text-foreground">{disk.mediaType || '\u2014'}</p>
                            </div>
                            <div>
                              <p className="text-muted">Sistema de arquivos</p>
                              <p className="font-medium text-foreground">{disk.fileSystem || '\u2014'}</p>
                            </div>
                            <div>
                              <p className="text-muted">Erros acumulados</p>
                              <p className={`font-medium ${(disk.reallocatedSectors ?? 0) > 0 ? 'text-warning' : 'text-success'}`}>
                                {disk.reallocatedSectors ?? 0}
                              </p>
                            </div>
                          </div>

                          <div className="border-t border-border pt-1.5 text-muted">
                            {formatBytes(diskUsedBytes)} usados de {formatBytes(disk.totalSizeBytes)}
                          </div>
                        </div>
                      )}
                    >
                      <div className="rounded-lg bg-surface-light px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 font-medium text-foreground">
                            {hasSmart && (
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${smartStatus === 'OK' ? 'bg-success' : smartStatus === 'Atenção' ? 'bg-warning' : 'bg-danger'}`} />
                            )}
                            {disk.driveLetter}{disk.label ? ` (${disk.label})` : ''}
                          </span>
                          <span className={`${getDiskStatusTextClass(diskUsedPercent)}`}>{diskUsedPercent}% usado</span>
                        </div>
                        <progress
                          className={`mt-2 h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-surface-hover ${getDiskStatusClass(diskUsedPercent)}`}
                          value={diskUsedPercent}
                          max={100}
                        />
                        <p className="mt-1 text-muted">
                          {formatBytes(diskUsedBytes)} usados de {formatBytes(disk.totalSizeBytes)}
                        </p>
                        {disk.powerOnHours != null && (
                          <p className="mt-0.5 text-muted">
                            Horas ligadas: <span className="text-muted-foreground">{formatHours(disk.powerOnHours)}</span>
                          </p>
                        )}
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
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
            {hw.data?.hardware?.osBuild && (
              <div>
                <dt className="text-muted">Build</dt>
                <dd className="mt-0.5 font-mono text-foreground">{hw.data.hardware.osBuild}</dd>
              </div>
            )}
            {hw.data?.hardware?.serialNumber && (
              <div>
                <dt className="text-muted">Número de série</dt>
                <dd className="mt-0.5 font-mono text-foreground">{hw.data.hardware.serialNumber}</dd>
              </div>
            )}
            <div className="border-t border-border pt-3">
              <dt className="text-muted">Versão do Agente</dt>
              <dd className="mt-0.5 font-mono text-foreground">{a.agentVersion ?? '\u2014'}</dd>
            </div>
            <div>
              <dt className="text-muted">Commit</dt>
              <dd className="mt-0.5 font-mono text-foreground">
                {agentCommitHash(a.commitHash) ? (
                  <Tooltip content={agentCommitHash(a.commitHash)!} className="inline-flex">
                    <span className="cursor-default">{agentCommitHash(a.commitHash)!.slice(0, 7)}</span>
                  </Tooltip>
                ) : (
                  '\u2014'
                )}
              </dd>
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
                  {(n.ipAddress || n.ipv6Address || n.gateway) && (
                    <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                      {n.ipAddress && (
                        <div>
                          <span className="text-muted">IP: </span>
                          <span className="font-mono text-muted-foreground">{n.ipAddress}</span>
                          {n.subnetMask && <span className="text-muted"> / {n.subnetMask}</span>}
                        </div>
                      )}
                      {n.ipv6Address && (
                        <div className="col-span-full">
                          <span className="text-muted">IPv6: </span>
                          <span className="font-mono text-xs text-muted-foreground break-all">{n.ipv6Address}</span>
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
            onClick={() => handleSelectDataTab('software')}
            aria-selected={activeDataTab === 'software'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'software' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Aplicativos
            <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{softwareTotalCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => handleSelectDataTab('printers')}
            aria-selected={activeDataTab === 'printers'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'printers' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Impressoras
            {hwComponents.data && (
              <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{printers.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => handleSelectDataTab('tickets')}
            aria-selected={activeDataTab === 'tickets'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'tickets' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Últimos Chamados
            {agentTickets.data && (
              <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{agentTickets.data?.items?.length ?? 0}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => handleSelectDataTab('listeningPorts')}
            aria-selected={activeDataTab === 'listeningPorts'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'listeningPorts' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Portas em Escuta
            {portsPageQuery.data && (
              <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{portsTotalCount}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => handleSelectDataTab('openSockets')}
            aria-selected={activeDataTab === 'openSockets'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'openSockets' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Conexões Abertas
            {socketsPageQuery.data && (
              <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{socketsTotalCount}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => handleSelectDataTab('startupItems')}
            aria-selected={activeDataTab === 'startupItems'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'startupItems' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Inicialização
            {hwComponents.data && (
              <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{startupItems.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => handleSelectDataTab('scheduledTasks')}
            aria-selected={activeDataTab === 'scheduledTasks'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'scheduledTasks' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Tarefas Agendadas
            {hwComponents.data && (
              <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{scheduledTasks.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => handleSelectDataTab('logs')}
            aria-selected={activeDataTab === 'logs'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${activeDataTab === 'logs' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-surface-light text-muted-foreground hover:text-foreground'}`}
          >
            Logs Recentes
            {agentLogs.data && (
              <span className="rounded-full bg-surface-hover/60 px-2 py-0.5 text-xs text-muted-foreground">{logsArray.length}</span>
            )}
          </button>
        </div>

        {activeDataTab === 'software' && (
          <div style={{ maxHeight: 'min(860px, 75vh)' }} className="w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-auto">
            <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground sm:text-xl">Aplicativos</h3>
                <p className="text-sm text-muted">
                  {softwareOnlyUpdates
                    ? `${softwareTotalCount} aplicativo(s) com atualização pendente`
                    : `${softwareTotalCount} aplicativo(s) no inventário`}
                  {softwareUpdatesTotal > 0 && !softwareOnlyUpdates && (
                    <span className="ml-2 font-medium text-warning">· {softwareUpdatesTotal} com atualização disponível</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
              {/* Filtro rápido: mostra só os apps com atualização pendente. */}
              {softwareUpdatesTotal > 0 && (
                <Button
                  size="sm"
                  variant={softwareOnlyUpdates ? 'primary' : 'secondary'}
                  onClick={handleToggleSoftwareOnlyUpdates}
                  aria-pressed={softwareOnlyUpdates}
                  title={
                    softwareOnlyUpdates
                      ? 'Mostrando apenas aplicativos com atualização pendente'
                      : 'Mostrar apenas aplicativos com atualização pendente'
                  }
                >
                  <ArrowUpCircle className="h-4 w-4" />
                  Com atualização
                  <span className="ml-1 rounded-full bg-black/10 px-1.5 text-xs">{softwareUpdatesTotal}</span>
                </Button>
              )}
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

                <div className="mb-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg bg-surface-light px-3 py-2">
                    <p className="text-xs text-muted">Total instalado</p>
                    <p className="text-sm font-medium text-foreground">{softwareTotalCount}</p>
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
                      {softwareOnlyUpdates ? ' · somente com atualização' : ''}
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
                    onRowContextMenu={(event, item) => {
                      event.preventDefault();
                      setSoftwareMenu({ x: event.clientX, y: event.clientY, item });
                    }}
                    emptyMessage={
                      softwareOnlyUpdates
                        ? 'Nenhum aplicativo com atualização pendente'
                        : 'Nenhum aplicativo encontrado para este agente'
                    }
                    showPagination={false}
                    maxHeight="min(640px, 55vh)"
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
          </div>
        )}

        {activeDataTab === 'tickets' && (
          <div style={{ maxHeight: 'min(860px, 75vh)' }} className="w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-auto">
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
                    const priority = getTicketPriorityMeta(ticket.priority);
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
                          <Badge color={priority.color} className="shrink-0">
                            {priority.label}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            </>
          </div>
        )}

        {activeDataTab === 'printers' && (
          <div style={{ maxHeight: 'min(860px, 75vh)' }} className="w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-auto">
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
          </div>
        )}

        {activeDataTab === 'listeningPorts' && (
          <div style={{ maxHeight: 'min(860px, 75vh)' }} className="w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-auto">
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
            {portsTotalCount >= LISTENING_PORTS_BACKEND_LIMIT && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Lista truncada pelo backend no limite de {LISTENING_PORTS_BACKEND_LIMIT} itens. Podem existir mais portas em escuta.
              </div>
            )}
            <form className="mb-4 grid gap-3 lg:grid-cols-[1fr_160px_auto_auto]" onSubmit={handleApplyPortsSearch}>
              <Input
                value={listeningPortsSearchInput}
                onChange={(e) => setListeningPortsSearchInput(e.target.value)}
                placeholder="Pesquisar por processo, PID, protocolo, endereço ou porta"
              />
              <Select
                value={listeningPortsLimit}
                options={pageSizeOptions}
                onChange={(e) => handlePortsLimitChange(e.target.value)}
              />
              <Button type="submit" variant="secondary" size="sm">
                <Search className="h-4 w-4" />
                Buscar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearPortsSearch}>
                Limpar
              </Button>
            </form>
            {portsPageItems.length > 0 && (
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Página {portsPageIndex} de {portsTotalPages} · {portsTotalCount} itens no total
                  {listeningPortsSearchApplied ? ` | filtro: "${listeningPortsSearchApplied}"` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={goToPreviousPortsPage} disabled={!canGoPrevPortsPage}>
                    Voltar
                  </Button>
                  <div className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground">
                    {portsPageIndex}
                  </div>
                  <Button variant="secondary" size="sm" onClick={goToNextPortsPage} disabled={!canGoNextPortsPage || portsPageQuery.isFetching} loading={portsPageQuery.isFetching}>
                    Avançar
                  </Button>
                </div>
              </div>
            )}
            <div style={{ minHeight: '400px' }} className="relative">
              <DataTable
                columns={listeningPortColumns}
                data={portsPageItems}
                keyExtractor={item => `${item.protocol}|${item.address}:${item.port}|${item.processId}`}
                emptyMessage="Nenhuma porta em escuta encontrada"
                showPagination={false}
                maxHeight="min(640px, 55vh)"
              />
            </div>
            {portsPageItems.length > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Página {portsPageIndex} de {portsTotalPages} · {portsTotalCount} itens no total
                  {listeningPortsSearchApplied ? ` | filtro: "${listeningPortsSearchApplied}"` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={goToPreviousPortsPage} disabled={!canGoPrevPortsPage}>
                    Voltar
                  </Button>
                  <div className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground">
                    {portsPageIndex}
                  </div>
                  <Button variant="secondary" size="sm" onClick={goToNextPortsPage} disabled={!canGoNextPortsPage || portsPageQuery.isFetching} loading={portsPageQuery.isFetching}>
                    Avançar
                  </Button>
                </div>
              </div>
            )}
            </>
          </div>
        )}

        {activeDataTab === 'openSockets' && (
          <div style={{ maxHeight: 'min(860px, 75vh)' }} className="w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-auto">
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
            {socketsTotalCount >= OPEN_SOCKETS_BACKEND_LIMIT && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Lista truncada pelo backend no limite de {OPEN_SOCKETS_BACKEND_LIMIT} itens. Podem existir mais conexões abertas.
              </div>
            )}
            <form className="mb-4 grid gap-3 lg:grid-cols-[1fr_170px_220px_auto_auto]" onSubmit={handleApplySocketsSearch}>
              <Input
                value={openSocketsSearchInput}
                onChange={(e) => setOpenSocketsSearchInput(e.target.value)}
                placeholder="Pesquisar por processo, PID, protocolo, endereço, porta ou estado"
              />
              <Select
                value={openSocketsStateFilter}
                options={socketStateOptions}
                onChange={(e) => handleSocketsStateChange(e.target.value)}
              />
              <Select
                value={openSocketsLimit}
                options={pageSizeOptions}
                onChange={(e) => handleSocketsLimitChange(e.target.value)}
              />
              <Button type="submit" variant="secondary" size="sm">
                <Search className="h-4 w-4" />
                Buscar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearSocketsSearch}>
                Limpar
              </Button>
            </form>
            {socketsPageItems.length > 0 && (
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Página {socketsPageIndex} de {socketsTotalPages} · {socketsTotalCount} itens no total
                  {openSocketsSearchApplied ? ` | filtro: "${openSocketsSearchApplied}"` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={goToPreviousSocketsPage} disabled={!canGoPrevSocketsPage}>
                    Voltar
                  </Button>
                  <div className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground">
                    {socketsPageIndex}
                  </div>
                  <Button variant="secondary" size="sm" onClick={goToNextSocketsPage} disabled={!canGoNextSocketsPage || socketsPageQuery.isFetching} loading={socketsPageQuery.isFetching}>
                    Avançar
                  </Button>
                </div>
              </div>
            )}
            <div style={{ minHeight: '400px' }} className="relative">
              <DataTable
                columns={openSocketColumns}
                data={socketsPageItems}
                keyExtractor={item => `${item.protocol}|${item.family}|${item.localAddress}:${item.localPort}|${item.remoteAddress}:${item.remotePort}|${item.processId}`}
                emptyMessage="Nenhuma conexão aberta encontrada"
                showPagination={false}
                maxHeight="min(640px, 55vh)"
              />
            </div>
            {socketsPageItems.length > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Página {socketsPageIndex} de {socketsTotalPages} · {socketsTotalCount} itens no total
                  {openSocketsSearchApplied ? ` | filtro: "${openSocketsSearchApplied}"` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={goToPreviousSocketsPage} disabled={!canGoPrevSocketsPage}>
                    Voltar
                  </Button>
                  <div className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground">
                    {socketsPageIndex}
                  </div>
                  <Button variant="secondary" size="sm" onClick={goToNextSocketsPage} disabled={!canGoNextSocketsPage || socketsPageQuery.isFetching} loading={socketsPageQuery.isFetching}>
                    Avançar
                  </Button>
                </div>
              </div>
            )}
            </>
          </div>
        )}

        {activeDataTab === 'startupItems' && (
          // Sem altura/rolagem própria: a tabela do painel já rola por dentro,
          // evitando a barra de rolagem duplicada (aninhada) em telas pequenas.
          <div className='w-full min-w-0 max-w-full'>
            <AgentStartupItemsPanel
              agentId={id!}
              items={startupItems}
              canManage={canManageAgent}
              isOnline={isOnlineNow}
              isLoading={hwComponents.isLoading}
              isError={Boolean(hwComponents.isError)}
              onRetry={() => void hwComponents.refetch()}
              isRefreshing={isRefreshingStartup || hwComponents.isFetching}
              onRefresh={handleRefreshStartup}
              onDataRefetch={() => void hwComponents.refetch()}
            />
          </div>
        )}

        {activeDataTab === 'scheduledTasks' && (
          // Sem altura/rolagem própria: a tabela do painel já rola por dentro,
          // evitando a barra de rolagem duplicada (aninhada) em telas pequenas.
          <div className='w-full min-w-0 max-w-full'>
            <AgentScheduledTasksPanel
              agentId={id!}
              tasks={scheduledTasks}
              canManage={canManageAgent}
              isOnline={isOnlineNow}
              isLoading={hwComponents.isLoading}
              isError={Boolean(hwComponents.isError)}
              onRetry={() => void hwComponents.refetch()}
              isRefreshing={isRefreshingScheduledTasks || hwComponents.isFetching}
              onRefresh={handleRefreshScheduledTasks}
              onDataRefetch={() => void hwComponents.refetch()}
            />
          </div>
        )}

        {activeDataTab === 'logs' && (
          <div style={{ maxHeight: 'min(860px, 75vh)' }} className="w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-auto">
            <>
            <CardHeader title="Logs Recentes" />
            <div className="space-y-2">
              {logsArray.map(log => {
                const l = getLogLevelMeta(log.level);
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
          </div>
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

      {notificationModalOpen && id && (
        <AgentNotificationModal
          agent={a}
          onClose={() => setNotificationModalOpen(false)}
          onConfirm={handleNotificationConfirm}
          isLoading={sendAgentNotification.isPending}
        />
      )}

      <Modal
        open={!!pendingUnapprovedUpdate}
        onClose={() => setPendingUnapprovedUpdate(null)}
        title="Atualização não aprovada na loja"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
            <p>
              O aplicativo{' '}
              <span className="font-semibold text-foreground">{pendingUnapprovedUpdate?.name}</span>{' '}
              não está aprovado na política da loja para este agente.
            </p>
            <p className="mt-1 text-muted">
              Deseja executar a atualização mesmo assim? A ação será registrada no histórico de comandos do agente.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setPendingUnapprovedUpdate(null)}
              disabled={updatingSoftwareId !== null}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (pendingUnapprovedUpdate) {
                  void handleUpdateSoftware(pendingUnapprovedUpdate, true);
                }
              }}
              loading={updatingSoftwareId !== null && updatingSoftwareId === pendingUnapprovedUpdate?.inventoryId}
            >
              <ArrowUpCircle className="h-4 w-4" />
              Atualizar mesmo assim
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!pendingUninstall}
        onClose={closeUninstallModal}
        title="Desinstalar aplicativo"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-foreground">
            <p>
              Você está prestes a desinstalar{' '}
              <span className="font-semibold text-foreground">{pendingUninstall?.name}</span>
              {pendingUninstall?.version ? ' (v' + pendingUninstall.version + ')' : ''} do agente{' '}
              <span className="font-semibold text-foreground">{a.displayName ?? a.hostname}</span>.
            </p>
            <p className="mt-1 text-muted">
              O agent tentará pelo gerenciador de pacotes (winget/choco), pelo MSI (ProductCode) ou pelo
              desinstalador do registro. A ação não pode ser desfeita no host.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="uninstall-confirm-name" className="text-sm font-medium text-foreground">
              Digite <span className="font-semibold text-danger">{uninstallConfirmTarget}</span> para confirmar:
            </label>
            <Input
              id="uninstall-confirm-name"
              value={uninstallConfirmText}
              onChange={(e) => setUninstallConfirmText(e.target.value)}
              placeholder={uninstallConfirmTarget}
              disabled={updatingSoftwareId !== null}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={closeUninstallModal}
              disabled={updatingSoftwareId !== null}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingUninstall) {
                  void handleUninstallSoftware(pendingUninstall);
                }
              }}
              loading={updatingSoftwareId !== null && updatingSoftwareId === pendingUninstall?.inventoryId}
              disabled={!canConfirmUninstall || updatingSoftwareId !== null}
              title={
                canConfirmUninstall
                  ? 'Desinstalar ' + uninstallConfirmTarget
                  : 'Digite o nome do aplicativo para liberar a desinstalação'
              }
            >
              <Trash2 className="h-4 w-4" />
              Desinstalar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Detalhes do aplicativo — absorve o que as colunas removidas mostravam
          (fabricante, origem, datas e identificadores do pacote). */}
      <Modal
        open={!!softwareDetails}
        onClose={() => setSoftwareDetails(null)}
        title="Detalhes do aplicativo"
        maxWidth="max-w-lg"
      >
        {softwareDetails && (
          <div className="space-y-4">
            <div>
              <p className="font-medium text-foreground">{softwareDetails.name}</p>
              <p className="text-sm text-muted">{softwareDetails.publisher ?? 'Sem fabricante'}</p>
            </div>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Versão instalada</dt>
                <dd className="font-mono text-foreground">{softwareDetails.version ?? '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Versão disponível</dt>
                <dd className="font-mono text-foreground">
                  {softwareDetails.updateAvailable && softwareDetails.availableVersion ? (
                    <span className="text-warning">&rarr; {softwareDetails.availableVersion}</span>
                  ) : (
                    '\u2014'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Fonte</dt>
                <dd className="text-foreground">{softwareDetails.source ?? '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Gerenciador</dt>
                <dd className="text-foreground">{softwareDetails.updateSource ?? '\u2014'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Última coleta</dt>
                <dd className="text-foreground">{formatDate(softwareDetails.collectedAt)}</dd>
              </div>
              {softwareDetails.installSource && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted">Origem da instalação</dt>
                  <dd className="break-all font-mono text-xs text-muted-foreground">{softwareDetails.installSource}</dd>
                </div>
              )}
            </dl>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSoftwareDetails(null)}>
                Fechar
              </Button>
              {softwareDetails.updateAvailable && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const item = softwareDetails;
                    setSoftwareDetails(null);
                    void handleUpdateSoftware(item);
                  }}
                  disabled={!isOnlineNow || !canExecuteAgent || updatingSoftwareId !== null}
                >
                  <ArrowUpCircle className="h-4 w-4" />
                  Atualizar
                </Button>
              )}
              {softwareDetails.uninstallAvailable && (
                <Button
                  variant="danger"
                  onClick={() => {
                    const item = softwareDetails;
                    setSoftwareDetails(null);
                    openUninstallModal(item);
                  }}
                  disabled={!isOnlineNow || !canExecuteAgent || updatingSoftwareId !== null}
                >
                  <Trash2 className="h-4 w-4" />
                  Desinstalar
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {softwareMenu && (
        <ContextMenu
          position={{ x: softwareMenu.x, y: softwareMenu.y }}
          items={softwareMenuItems}
          onClose={() => setSoftwareMenu(null)}
        />
      )}
    </div>
  );
}
