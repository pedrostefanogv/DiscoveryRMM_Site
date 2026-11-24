import { formatDateTime } from '@/utils/format';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getDeleteAgentErrorMessage, useAgent, useAgentHardware, useAgentHardwareComponents, useAgentSoftwareSnapshot, useApproveZeroTouch, useDeleteAgent, usePowerAction, useRestartAgent, useShutdownAgent, useWakeOnLan } from '@/hooks/useAgents';
import {
  AGENT_DETAIL_DEFAULT_TAB,
  agentAutostartViewFromSlug,
  agentAutostartViewSlug,
  agentDetailBackTarget,
  agentDetailTabFromSlug,
  agentDetailTabSlug,
  agentNetworkViewFromSlug,
  agentNetworkViewSlug,
  formatBytes,
  formatDate,
  awaitAgentCommandById,
  notifyAgentCommandOutcome,
  type AgentAutostartView,
  type AgentDetailDataTab,
  type AgentNetworkView,
} from './agentDetailUtils';
import { useTickets } from '@/hooks/useTickets';
import { useLogs } from '@/hooks/useLogs';
import { Icon, Button, Card, CardHeader, Badge, Loading, ErrorDisplay, Input, ConfirmDialog, StatCard, Tooltip, PageHeader } from '@/components/ui';
import { ensureArray } from '@/utils/ensureArray';
import PowerActionModal from '@/components/agents/PowerActionModal';
import UpdatePowerActionModal from '@/components/agents/UpdatePowerActionModal';
import { hasPendingWindowsUpdatePowerOption } from '@/utils/agentReboot';
import AgentNotificationModal, { type AgentNotificationPayload } from '@/components/agents/AgentNotificationModal';
import { LiveAgentHeartbeatCard } from '@/components/agents/LiveAgentHeartbeatCard';
import { AgentPowerPanel } from '@/components/agents/AgentPowerPanel';
import { AgentLabelsHistoryTab } from '@/components/agents/AgentLabelsHistoryTab';
import { AgentAutostartTab } from '@/components/agents/AgentAutostartTab';
import { AgentNetworkTab } from '@/components/agents/AgentNetworkTab';
import { AgentSoftwareTab } from '@/components/agents/AgentSoftwareTab';
import AgentPoliciesPanel from '@/components/agents/AgentPoliciesPanel';
import AgentSensorsPanel from '@/components/agents/AgentSensorsPanel';
import { AgentWindowsUpdatesPanel } from '@/components/agents/AgentWindowsUpdatesPanel';
import WakeOnLanModal from '@/components/agents/WakeOnLanModal';
import { PowerActionVerbDialog } from '@/components/agents/PowerActionVerbDialog';
import { POWER_ACTION_VERBS, powerVerbIcon, type PowerActionVerb } from '@/components/agents/powerActionVerbs';
import { NotesPanel } from '@/components/notes/NotesPanel';
import { PinnedNotesCard } from '@/components/notes/PinnedNotesCard';
import { AgentCustomFieldsCard } from '@/components/custom-fields/AgentCustomFieldsCard';
import { AgentPinnedCustomFields } from '@/components/custom-fields/AgentPinnedCustomFields';
import { useAgentCustomFieldSchema } from '@/hooks/useCustomFields';
import { DetailTabs, type DetailTab } from '@/components/entity/DetailTabs';
import type { LogEntry, ScheduledTaskInfo, SensorUpsertRequest, StartupItemInfo } from '@/api';
import { ApiError, agentUpdatesApi, agentsApi, describeSensorsError } from '@/api';
import { getLogLevelMeta, getTicketPriorityMeta } from '@/utils/labels';
import { isAgentOnlineNow, isAgentPossiblyOnline } from '@/utils/agentStatus';
import { useNowTick } from '@/hooks/useNowTick';
import { useAgentHeartbeatSummary } from '@/stores/heartbeatStore';
import { agentLabelsApi } from '@/modules/agent-labels/api';
import { useAgentLabelHistory, useAgentLabelsForAgent, useManualLabelOptions } from '@/hooks/useAgentLabels';
import { AgentLabelSourceType } from '@/modules/agent-labels/types';
import { openRemoteDebugPopup } from './remoteDebugLauncher';
import { openAgentSupportChatWindow } from './agentSupportChatLauncher';
import { openRemoteSessionPopup } from './remoteSessionLauncher';
import { useAuthorization } from '@/auth/authorization';
import { useSendAgentNotification } from '@/hooks/useAgentAlerts';
import { useAgentAutomationPolicies, useForceAutomationSync } from '@/hooks/useAutomation';
import {
  useAgentSensors,
  useCreateSensor,
  useDeleteSensor,
  useResetSensorState,
  useRunSensors,
  useSyncSensorsNow,
  useUpdateSensor,
} from '@/hooks/useSensors';
import { useSensorsRealtime } from '@/hooks/useSensorsRealtime';
import { buildRecommendedSensorRequests } from '@/components/agents/sensorUtils';
import { buildCorrelationId } from '@/pages/automation/automationTasksUtils';

// formatBytes, formatDate, formatSocketFamily — importadas de ./agentDetailUtils

/**
 * Abas do detalhe do agente, no mesmo "segmented control" usado em
 * Clientes/Sites (DetailTabs). "Info" é a aba principal e a aba inicial.
 */
function buildAgentDetailTabs(): DetailTab<AgentDetailDataTab>[] {
  return [
    { id: 'info', label: 'Info', icon: "info" },
    {
      // Visão completa dos campos customizados: o card "Informações" mostra só
      // os destaques (isPinned) de forma resumida; aqui aparece tudo, com tipo,
      // capacidades, auditoria e edição pelo portal. Título compacto: "Informações
      // adicionais".
      id: 'customFields',
      label: 'Extras',
      icon: "sell",
    },
    { id: 'notes', label: 'Anotações', icon: "sticky_note_2" },
    { id: 'labelHistory', label: 'Labels', icon: "history" },
    { id: 'software', label: 'Aplicativos', icon: "web_asset" },
    { id: 'windowsUpdates', label: 'Atualizações', icon: "download" },
    { id: 'printers', label: 'Impressoras', icon: "print" },
    { id: 'tickets', label: 'Chamados', icon: "confirmation_number" },
    { id: 'network', label: 'Rede', icon: "lan" },
    {
      // "Inicialização" e "Tarefas Agendadas" descrevem o mesmo assunto (o que
      // o host executa sozinho) e ficam agrupadas numa aba só. O rótulo é
      // compacto ("Autoruns") para não alargar a barra; o slug da URL segue
      // "execucao-automatica" (contrato de deep link).
      id: 'autostart',
      label: 'Autoruns',
      icon: "bolt",
    },
    { id: 'policies', label: 'Políticas', icon: "verified_user" },
    // "Sensores" fica ao lado de "Políticas": as duas descrevem o que o agent
    // recebe no check-in (uma para automação, a outra para monitoramento).
    { id: 'sensors', label: 'Sensores', icon: "monitoring" },
    { id: 'logs', label: 'Logs', icon: "article" },
  ];
}

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

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddingManualLabel, setIsAddingManualLabel] = useState(false);
    const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [labelPickerQuery, setLabelPickerQuery] = useState('');
  const labelPickerRef = useRef<HTMLDivElement>(null);
  const [isOpeningRemoteDebug, setIsOpeningRemoteDebug] = useState(false);
  const [isOpeningRemoteControl, setIsOpeningRemoteControl] = useState(false);
  const [isTriggeringAgentUpdate, setIsTriggeringAgentUpdate] = useState(false);
  const [isApprovingZeroTouch, setIsApprovingZeroTouch] = useState(false);
  const [zeroTouchConfirmOpen, setZeroTouchConfirmOpen] = useState(false);
  const [isRefreshingPrinters, setIsRefreshingPrinters] = useState(false);
  const [printerSearch, setPrinterSearch] = useState('');
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const [logSearch, setLogSearch] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
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
        // A aba principal ("info") não polui a URL; as demais entram como deep link.
        if (tab === AGENT_DETAIL_DEFAULT_TAB) {
          next.delete('tab');
        } else {
          next.set('tab', agentDetailTabSlug(tab));
        }
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );
  // Sub-aba ativa da aba "Rede". Os slugs legados (?tab=portas-em-escuta e
  // ?tab=conexoes-abertas) continuam válidos: a aba de topo resolve para
  // "network" e o slug também define a sub-aba.
  const activeNetworkView = useMemo(
    () => agentNetworkViewFromSlug(searchParams.get('tab')),
    [searchParams],
  );
  const handleSelectNetworkView = useCallback(
    (view: AgentNetworkView) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', agentNetworkViewSlug(view));
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );
  // Sub-aba ativa de "Autoruns". Os slugs legados (?tab=inicializacao
  // e ?tab=tarefas-agendadas) continuam válidos: a aba de topo resolve para
  // "autostart" e o slug também define a sub-aba.
  const activeAutostartView = useMemo(
    () => agentAutostartViewFromSlug(searchParams.get('tab')),
    [searchParams],
  );
  const handleSelectAutostartView = useCallback(
    (view: AgentAutostartView) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', agentAutostartViewSlug(view));
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
  // Submenu de energia ("Reiniciar / Desligar") aberto ao lado via hover.
  const [powerSubmenuOpen, setPowerSubmenuOpen] = useState(false);
  const [powerAction, setPowerAction] = useState<'restart' | 'shutdown' | null>(null);
  const [updatePowerAction, setUpdatePowerAction] = useState<'restart' | 'shutdown' | null>(null);
  // Verbo de energia genérico pendente de confirmação num diálogo dedicado
  // (BIOS/UEFI, Opções Avançadas, bloquear sessão).
  const [powerVerb, setPowerVerb] = useState<PowerActionVerb | null>(null);
  const [wakeOnLanModalOpen, setWakeOnLanModalOpen] = useState(false);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);

  const { hasAnyPermission } = useAuthorization();
  const canManageAgent = hasAnyPermission(['Agents.Edit', 'agents.*', 'admin.*']);
  // Ações de execução no agente (refresh/atualização) exigem Agents.Execute.
  const canExecuteAgent = hasAnyPermission(['Agents.Execute', 'Agents.Edit', 'agents.*', 'admin.*']);
  // A aba "Políticas" consulta um endpoint que exige Automation.View.
  const canViewAutomation = hasAnyPermission([
    'automation.*',
    'automation.read',
    'Automation.View',
    'admin.*',
  ]);
  // Equivalente ao RequirePermission(Automation, Execute) do backend — habilita o
  // "Forçar sincronização" na aba de políticas.
  const canExecuteAutomation = hasAnyPermission([
    'Automation.Execute',
    'automation.execute',
    'Automation.Edit',
    'automation.*',
    'admin.*',
  ]);
  // A aba "Sensores" consulta endpoints que exigem Sensors.View (com o fallback
  // curinga do módulo, como já é padrão nas outras abas).
  const canViewSensors = hasAnyPermission([
    'Sensors.View',
    'sensors.view',
    'sensors.*',
    'admin.*',
  ]);
  // Executar agora / forçar sincronização exigem Sensors.Execute.
  const canRunSensors = hasAnyPermission([
    'Sensors.Execute',
    'sensors.execute',
    'Sensors.Edit',
    'sensors.edit',
    'sensors.*',
    'admin.*',
  ]);
  // O CRUD de definições tem permissões próprias no backend (Sensors.Create e
  // Sensors.Edit/Delete) — os botões seguem o que a API vai aceitar.
  const canCreateSensors = hasAnyPermission([
    'Sensors.Create',
    'sensors.create',
    'Sensors.Edit',
    'sensors.edit',
    'sensors.*',
    'admin.*',
  ]);
  const canManageSensors = hasAnyPermission([
    'Sensors.Edit',
    'sensors.edit',
    'Sensors.Delete',
    'sensors.delete',
    'sensors.*',
    'admin.*',
  ]);
  const deleteAgent = useDeleteAgent();
  const approveZeroTouch = useApproveZeroTouch();
  const restartAgent = useRestartAgent();
  const shutdownAgent = useShutdownAgent();
  const powerActionMutation = usePowerAction();
  const wakeOnLan = useWakeOnLan();
  const sendAgentNotification = useSendAgentNotification();
  const agent = useAgent(id!);
  const heartbeatSummaryJson = useAgentHeartbeatSummary(id!);
  const hw = useAgentHardware(id!);
  // Campos customizados visíveis no portal (webRead): alimenta o resumo do card
  // "Informações" (somente os destacados) e o contador da aba "Informações
  // adicionais". O fetch é o mesmo do card detalhado (chave de cache única).
  const agentCustomFields = useAgentCustomFieldSchema(id!);
  // Políticas de automação aplicáveis ao agente. O hook fica sempre montado
  // (regras de hooks) e o fetch só liga quando a aba "Políticas" está ativa.
  const agentPolicies = useAgentAutomationPolicies(
    id!,
    canViewAutomation && activeDataTab === 'policies',
  );
  const forcePolicySync = useForceAutomationSync();
  // Força o agent a re-sincronizar as políticas agora (aba "Políticas"), útil
  // quando o badge indica agent desatualizado e não se quer esperar o check-in.
  // ATENÇÃO: este useCallback precisa ficar ACIMA dos early returns de
  // carregamento/erro (mais abaixo). Chamá-lo depois deles faz a contagem de
  // hooks mudar entre o primeiro render (loading) e o render com dados, o que
  // derruba a página inteira com "Rendered more hooks than during the previous
  // render" (React error #310) — era o erro ao abrir um agent pela listagem,
  // que sumia no F5 porque nesse caso o primeiro render já vinha com dados.
  const handleForcePolicySync = useCallback(async () => {
    if (!id) return;
    try {
      await forcePolicySync.mutateAsync({
        agentId: id,
        request: { policies: true },
        correlationId: buildCorrelationId('force-policy-sync'),
      });
      toast.success('Sincronização de políticas solicitada ao agent.');
      // O agent responde logo em seguida; recarrega para refletir o que chegou.
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await agentPolicies.refetch();
    } catch (error) {
      const msg = error instanceof ApiError
        ? error.message
        : 'Falha ao solicitar sincronização de políticas.';
      toast.error(msg);
    }
  }, [id, forcePolicySync, agentPolicies]);

  // ── Sensores (aba "Sensores") ─────────────────────────────────────────────
  // Mesma armadilha do bloco acima: todos os hooks ficam ACIMA dos early returns
  // de carregamento/erro (React #310). O fetch do payload só liga quando a aba
  // está ativa e o usuário tem Sensors.View; as mutações só rodam por ação.
  const agentSensors = useAgentSensors(id!, canViewSensors && activeDataTab === 'sensors');
  const runSensors = useRunSensors();
  const syncSensorsNow = useSyncSensorsNow();
  const createSensor = useCreateSensor();
  const updateSensor = useUpdateSensor();
  const deleteSensor = useDeleteSensor();
  const resetSensorState = useResetSensorState();

  // Tempo real da aba: assina "SensorStatusChanged" no NATS e invalida o payload
  // do agente. Só assina com a aba ativa (Sensors.View); o polling de 30s de
  // useAgentSensors continua como fallback quando o NATS não está disponível.
  useSensorsRealtime(
    canViewSensors && activeDataTab === 'sensors' ? id : null,
    canViewSensors && activeDataTab === 'sensors',
    agent.data?.clientId ?? null,
    agent.data?.siteId ?? null,
  );

  // Progresso do CTA "Adicionar sensores recomendados" (4 POSTs sequenciais).
  const [recommendedSensorsProgress, setRecommendedSensorsProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const handleRunSensors = useCallback(
    async (sensorIds?: string[]) => {
      if (!id) return;
      try {
        const result = await runSensors.mutateAsync({ agentId: id, sensorIds });
        if (result.dispatched) {
          toast.success(
            result.message ?? `Coleta solicitada ao agent (${result.sensorCount} sensor(es)).`,
          );
        } else {
          toast.error(result.message ?? 'O agent não aceitou a coleta agora.');
        }
      } catch (error) {
        // 409 = comando não despachado (agent offline); describeSensorsError usa
        // a mensagem do servidor quando ela existe.
        toast.error(describeSensorsError(error, 'Falha ao solicitar a coleta dos sensores.'));
      }
    },
    [id, runSensors],
  );

  const handleSyncSensors = useCallback(async () => {
    if (!id) return;
    try {
      await syncSensorsNow.mutateAsync({ agentId: id });
      toast.success('Sincronização de sensores solicitada ao agent.');
      // O agent responde logo em seguida; recarrega para refletir o que chegou.
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await agentSensors.refetch();
    } catch (error) {
      toast.error(describeSensorsError(error, 'Falha ao solicitar sincronização de sensores.'));
    }
  }, [id, syncSensorsNow, agentSensors]);

  const handleSaveSensor = useCallback(
    async (data: SensorUpsertRequest, sensorId?: string) => {
      try {
        if (sensorId) await updateSensor.mutateAsync({ id: sensorId, data });
        else await createSensor.mutateAsync(data);
        toast.success(sensorId ? 'Sensor atualizado.' : 'Sensor criado.');
        await agentSensors.refetch();
      } catch (error) {
        toast.error(describeSensorsError(error, 'Falha ao salvar o sensor.'));
        // Repassa para o formulário exibir a mensagem dentro do modal.
        throw error;
      }
    },
    [updateSensor, createSensor, agentSensors],
  );

  const handleDeleteSensor = useCallback(
    async (sensorId: string) => {
      try {
        await deleteSensor.mutateAsync({ sensorId });
        toast.success('Sensor excluído.');
        await agentSensors.refetch();
      } catch (error) {
        toast.error(describeSensorsError(error, 'Falha ao excluir o sensor.'));
      }
    },
    [deleteSensor, agentSensors],
  );

  // ── Reset de estado (menu da linha e "todos" do cabeçalho) ─────────────────
  const handleResetSensorState = useCallback(
    async (sensorId: string) => {
      if (!id) return;
      try {
        await resetSensorState.mutateAsync({ agentId: id, sensorId });
        toast.success('Estado do sensor reiniciado.');
        await agentSensors.refetch();
      } catch (error) {
        toast.error(describeSensorsError(error, 'Falha ao reiniciar o estado do sensor.'));
      }
    },
    [id, resetSensorState, agentSensors],
  );

  const handleResetAllSensors = useCallback(async () => {
    if (!id) return;
    const sensors = agentSensors.data?.items ?? [];
    if (sensors.length === 0) return;
    let done = 0;
    const failed: string[] = [];
    let lastError: unknown = null;
    for (const sensor of sensors) {
      try {
        await resetSensorState.mutateAsync({ agentId: id, sensorId: sensor.sensorId });
        done += 1;
      } catch (error) {
        failed.push(sensor.name);
        lastError = error;
      }
    }
    if (failed.length === 0) {
      toast.success(`Estado de ${done} sensor(es) reiniciado.`);
    } else {
      toast.error(
        `${failed.length} sensor(es) não puderam ser reiniciados (${failed
          .slice(0, 2)
          .join(', ')}${failed.length > 2 ? '…' : ''}): ` +
          describeSensorsError(lastError, 'falha inesperada.'),
      );
    }
    await agentSensors.refetch();
  }, [id, resetSensorState, agentSensors]);

  // ── CTA do estado vazio: cria as 4 definições recomendadas ────────────────
  const handleAddRecommendedSensors = useCallback(async () => {
    if (!id) return;
    const requests = buildRecommendedSensorRequests(id);
    setRecommendedSensorsProgress({ done: 0, total: requests.length });
    let created = 0;
    const failed: string[] = [];
    let lastError: unknown = null;
    try {
      for (const request of requests) {
        try {
          await createSensor.mutateAsync(request);
          created += 1;
        } catch (error) {
          failed.push(request.name ?? 'sensor');
          lastError = error;
        } finally {
          // Progresso visível durante a criação (o CTA fica desabilitado).
          setRecommendedSensorsProgress({
            done: created + failed.length,
            total: requests.length,
          });
        }
      }
    } finally {
      setRecommendedSensorsProgress(null);
      await agentSensors.refetch();
    }
    if (failed.length === 0) {
      toast.success(`${created} sensores recomendados criados — o agent os recebe no próximo check-in.`);
    } else if (created > 0) {
      toast.error(
        `${created} sensor(es) criado(s); falhou: ${failed.join(', ')} — ` +
          describeSensorsError(lastError, 'tente novamente.'),
      );
    } else {
      toast.error(describeSensorsError(lastError, 'Falha ao criar os sensores recomendados.'));
    }
  }, [id, createSensor, agentSensors]);

  // Payload pesado (impressoras/portas/conexões/discos) carregado apenas
  // quando uma aba que o consome está ativa (P1.2 — abas sob demanda).
  const dataTabNeedsComponents =
    activeDataTab === 'printers' ||
    activeDataTab === 'autostart';
  // Portas e conexões têm endpoints próprios paginados por cursor; o payload
  // pesado do /hardware/components é buscado sem as listas de rede.
  const hwComponents = useAgentHardwareComponents(id!, {
    enabled: dataTabNeedsComponents,
    includeNetwork: false,
  });
  const softwareSnapshot = useAgentSoftwareSnapshot(id!);
  const agentLogs = useLogs({ agentId: id, limit: 50 }, { enabled: activeDataTab === 'logs' });
  const agentTickets = useTickets({ agentId: id, limit: 5 }, { enabled: activeDataTab === 'tickets' });
  // Tick de 15s (antes 5s): re-renderizava a página inteira a cada 5s só para
  // o freshness do heartbeat (P1.4).
  const now = useNowTick(15_000);
  const powerMenuRef = useRef<HTMLDivElement>(null);

  // Normaliza logs como array plano (defesa contra API retornar objeto paginado)
  const logsArray = useMemo(() => ensureArray<LogEntry>(agentLogs.data), [agentLogs.data]);

  const agentLabelsQuery = useAgentLabelsForAgent(id);
  const labelHistoryQuery = useAgentLabelHistory(id, activeDataTab === 'labelHistory');
  const manualLabelOptionsQuery = useManualLabelOptions(showLabelPicker || activeDataTab === 'info');
  const allLabels = agentLabelsQuery.data ?? [];
  const labelHistory = labelHistoryQuery.data ?? [];
  const manualLabelOptions = manualLabelOptionsQuery.data ?? [];
  const isLoadingLabels = agentLabelsQuery.isLoading;
  const labelsError = agentLabelsQuery.isError ? 'Falha ao carregar labels.' : null;

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
      await agentLabelsApi.addManualLabel(id, label);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agentLabels', 'agent', id] }),
        queryClient.invalidateQueries({ queryKey: ['agentLabels', 'history', id] }),
        queryClient.invalidateQueries({ queryKey: ['agentLabels', 'manualOptions'] }),
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agentLabels', 'agent', id] }),
        queryClient.invalidateQueries({ queryKey: ['agentLabels', 'history', id] }),
      ]);
      toast.success('Label removida.');
    } catch (err) {
      if (err && typeof err === 'object' && 'status' in err) {
        const apiErr = err as { status?: number; message?: string };
        // 400 nao e mais esperado: remover label automatica e valido (registra supressao).
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
    if (!heartbeatSummaryJson) return a;
    try {
      const [status, loggedUser, loggedUserSince, ipAddress, , agentVersion] = JSON.parse(
        heartbeatSummaryJson,
      ) as [
        'Online' | 'Offline',
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
      ];
      return {
        ...a,
        status: status ?? a.status,
        isOnline: status === 'Online' ? true : a.isOnline,
        loggedUser: loggedUser !== null ? loggedUser : a.loggedUser,
        loggedUserSince: loggedUserSince !== null ? loggedUserSince : a.loggedUserSince,
        lastIpAddress: ipAddress ?? a.lastIpAddress,
        agentVersion: agentVersion ?? a.agentVersion,
      };
    } catch {
      return a;
    }
  }, [a, heartbeatSummaryJson]);

  const startupItems: StartupItemInfo[] = hwComponents.data?.startupItems ?? [];
  const scheduledTasks: ScheduledTaskInfo[] = hwComponents.data?.scheduledTasks ?? [];

  if (agent.isLoading) return <Loading />;
  if (agent.isError || !a || !aWithHeartbeat) return <ErrorDisplay onRetry={() => agent.refetch()} />;

  const isOnlineNow = isAgentOnlineNow(aWithHeartbeat, now);
  // Nome usado na confirmação destrutiva (mover para a lixeira de um agente
  // online também dispara a desinstalação remota).
  const deleteConfirmName = a.displayName ?? a.hostname;
  // União com o status do servidor: ele pode considerar o agente online por até
  // ~3min depois de a UI já o tratar como offline (TTL do heartbeat + varredura).
  const deleteConfirmOnline = isOnlineNow || isAgentPossiblyOnline(a, now);
  // Sessões AO VIVO (controle remoto, chat, debug) exigem o agent acessível.
  // Update/notificação são comandos persistidos pelo dispatcher e funcionam
  // offline (entram na fila) — esses seguem habilitados.
  const canReachAgent = isAgentPossiblyOnline(a, now);
  const offlineLiveHint = 'Agente offline — sessão ao vivo indisponível';

  // Ações que passam pelo dispatcher de comandos NÃO exigem mais agente online:
  // o comando é persistido e a reentrega do servidor o entrega no reconhecimento.
  // Continuam exigindo online apenas as ações de sessão ao vivo (acesso remoto) e
  // a energia imediata (restart/shutdown), que são disruptivas por natureza.
  const offlineQueueHint = 'agente offline — o comando entra na fila e é entregue quando ele reconectar';
  const isZeroTouchPending = aWithHeartbeat.zeroTouchPending === true;
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
  const softwareTotalInstalled = softwareSnapshot.isLoading ? '\u2014' : (softwareSnapshot.data?.totalInstalled ?? 0);
  const softwareLastCollectedAt = softwareSnapshot.data?.lastCollectedAt ?? softwareSnapshot.data?.updatedAt ?? null;
  const softwareLastCollectedLabel = softwareLastCollectedAt
    ? formatDateTime(softwareLastCollectedAt)
    : 'Sem coleta registrada';
  const manualLabelsCount = allLabels.filter((item) => item.sourceType === AgentLabelSourceType.Manual).length;
  const automaticLabelsCount = Math.max(0, allLabels.length - manualLabelsCount);

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

  // Abre o chat de suporte com a MÁQUINA (conversa avulsa, sem chamado) numa
  // janela dedicada. window.open é síncrono: bloqueadores de popup barram a
  // abertura depois de um await.
  const handleOpenSupportChat = () => {
    if (!id) return;
    try {
      openAgentSupportChatWindow(id, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao abrir o chat de suporte.');
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
      const wasOnline = isAgentPossiblyOnline(aWithHeartbeat ?? a, now);
      await deleteAgent.mutateAsync(id);
      toast.success(
        wasOnline
          ? 'Agente movido para a lixeira. Comando de desinstalação enviado.'
          : 'Agente movido para a lixeira (offline — não foi desinstalado).',
      );
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

  const handleApproveZeroTouch = () => {
    if (!id || !isZeroTouchPending || !canManageAgent || isApprovingZeroTouch) return;
    setZeroTouchConfirmOpen(true);
  };

  const handleConfirmApproveZeroTouch = async () => {
    if (!id || !isZeroTouchPending || !canManageAgent || isApprovingZeroTouch) return;
    setIsApprovingZeroTouch(true);
    try {
      await approveZeroTouch.mutateAsync(id);
      toast.success('Agente aprovado para comunicação com a API.');
      setZeroTouchConfirmOpen(false);
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

  // Verbos do comando genérico "poweraction" (BIOS/UEFI, Opções Avançadas,
  // bloquear sessão). O agent valida a capacidade de cada verbo (ex.: /fw
  // exige UEFI) e devolve falha tipada no acompanhamento.
  const handleOpenPowerVerb = (verb: PowerActionVerb) => {
    setIsPowerMenuOpen(false);
    setPowerVerb(verb);
  };

  const handlePowerVerbConfirm = async () => {
    if (!id || !powerVerb) return;
    try {
      const response = await powerActionMutation.mutateAsync({ id, data: powerVerb.request });
      void awaitAgentCommandById(id, response.commandId).then(notifyAgentCommandOutcome);
      setPowerVerb(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : powerVerb.errorMessage);
    }
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

    // O POST devolve commandId: confirma só o despacho. O desfecho real vem do
    // histórico de comandos — polling único em background (helper compartilhado).
    const response = powerAction === 'restart'
      ? await restartAgent.mutateAsync({ id, data })
      : await shutdownAgent.mutateAsync({ id, data });
    void awaitAgentCommandById(id, response.commandId).then(notifyAgentCommandOutcome);

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

  // -- On-demand data refresh handlers ----------------------------------

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

  const copyField = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error(`Não foi possível copiar ${label.toLowerCase()}.`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={a.displayName ?? a.hostname}
        description={[a.hostname, [a.operatingSystem, a.osVersion].filter(Boolean).join(' ')].filter(Boolean).join(' — ')}
        onBack={handleGoBack}
      >
        <Badge color={isOnlineNow ? 'success' : 'slate'}>
          <span className="flex items-center gap-1">
            {isOnlineNow ? <Icon name="wifi" className="h-3 w-3" /> : <Icon name="wifi_off" className="h-3 w-3" />}
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
            aria-haspopup="menu"
            aria-expanded={isPowerMenuOpen}
          >
            <Icon name="power_settings_new" className="h-4 w-4" />
            Ações
            <Icon name="expand_more" className="h-4 w-4" />
          </Button>
          {isPowerMenuOpen && (
            <div role="menu" className="absolute right-0 top-full z-50 mt-2 min-w-[220px] rounded-lg border border-border bg-surface shadow-xl">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  setIsPowerMenuOpen(false);
                  void handleOpenRemoteControl();
                }}
                disabled={isOpeningRemoteControl || !canReachAgent}
                title={canReachAgent ? undefined : offlineLiveHint}
              >
                <Icon name="desktop_windows" className="h-4 w-4" />
                {isOpeningRemoteControl ? 'Abrindo remoto...' : 'Controle remoto'}
                {!canReachAgent && <span aria-hidden="true" className="ml-auto rounded bg-surface-hover px-1.5 py-0.5 text-[11px] text-muted-foreground">offline</span>}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  setIsPowerMenuOpen(false);
                  handleOpenSupportChat();
                }}
                disabled={!canReachAgent}
                title={canReachAgent ? undefined : offlineLiveHint}
              >
                <Icon name="chat" className="h-4 w-4" />
                Abrir chat
                {!canReachAgent && <span aria-hidden="true" className="ml-auto rounded bg-surface-hover px-1.5 py-0.5 text-[11px] text-muted-foreground">offline</span>}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleOpenNotification}
                disabled={!canExecuteAgent}
                title={!canExecuteAgent
                  ? 'Sem permissão para executar ações no agente'
                  : canReachAgent ? undefined : offlineQueueHint}
              >
                <Icon name="notifications" className="h-4 w-4" />
                Enviar notificação
                {!canReachAgent && <span aria-hidden="true" className="ml-auto rounded bg-surface-hover px-1.5 py-0.5 text-[11px] text-muted-foreground">na fila</span>}
              </button>

              <div className="border-t border-border" />

              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  setIsPowerMenuOpen(false);
                  void handleOpenRemoteDebug();
                }}
                disabled={isOpeningRemoteDebug || !canReachAgent}
                title={canReachAgent ? undefined : offlineLiveHint}
              >
                <Icon name="bug_report" className="h-4 w-4" />
                {isOpeningRemoteDebug ? 'Abrindo debug...' : 'Ver Debug'}
                {!canReachAgent && <span aria-hidden="true" className="ml-auto rounded bg-surface-hover px-1.5 py-0.5 text-[11px] text-muted-foreground">offline</span>}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => {
                  setIsPowerMenuOpen(false);
                  void handleTriggerAgentUpdate();
                }}
                disabled={isTriggeringAgentUpdate || !canExecuteAgent}
                title={
                  !canExecuteAgent
                    ? 'Sem permissão para executar ações no agente'
                    : canReachAgent
                      ? undefined
                      : offlineQueueHint
                }
              >
                <Icon name="refresh" className="h-4 w-4" />
                {isTriggeringAgentUpdate ? 'Atualizando...' : 'Atualizar agente'}
                {!canReachAgent && <span aria-hidden="true" className="ml-auto rounded bg-surface-hover px-1.5 py-0.5 text-[11px] text-muted-foreground">na fila</span>}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover"
                onClick={() => {
                  setIsPowerMenuOpen(false);
                  navigate(`/automation/operations?agentId=${a.id}`);
                }}
              >
                <Icon name="web_asset" className="h-4 w-4" />
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
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={powerSubmenuOpen}
                    onClick={() => setPowerSubmenuOpen((open) => !open)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-warning transition-colors hover:bg-warning/10 dark:text-amber-300 dark:hover:bg-amber-500/10"
                    disabled={restartAgent.isPending || shutdownAgent.isPending}
                  >
                    <Icon name="bolt" className="h-4 w-4" />
                    Energia
                    <Icon name="chevron_right" className="ml-auto h-4 w-4" />
                  </button>
                  {powerSubmenuOpen && (
                    <div className="absolute right-full top-0 z-50 min-w-[180px] overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleOpenPowerAction('restart')}
                        disabled={restartAgent.isPending || shutdownAgent.isPending}
                      >
                        <Icon name="restart_alt" className="h-4 w-4" />
                        Reiniciar
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleOpenPowerAction('shutdown')}
                        disabled={restartAgent.isPending || shutdownAgent.isPending}
                      >
                        <Icon name="power_settings_new" className="h-4 w-4" />
                        Desligar
                      </button>
                      {/* Verbos do comando genérico "poweraction" — declarados
                          em powerActionVerbs.tsx (fonte única dos três menus). */}
                      {POWER_ACTION_VERBS.map((verb) => (
                        <button
                          key={verb.kind}
                          type="button"
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60 ${verb.separatorBefore ? 'border-t border-border ' : ''}${verb.danger ? 'text-danger hover:bg-danger/10' : 'text-foreground'}`}
                          onClick={() => handleOpenPowerVerb(verb)}
                          disabled={restartAgent.isPending || shutdownAgent.isPending || powerActionMutation.isPending}
                          title={verb.hint}
                        >
                          {powerVerbIcon(verb)}
                          {verb.label}
                        </button>
                      ))}
                      {hasPendingWindowsUpdatePowerOption(a) && (
                        <>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => {
                              setPowerSubmenuOpen(false);
                              setIsPowerMenuOpen(false);
                              setUpdatePowerAction('restart');
                            }}
                            disabled={restartAgent.isPending || shutdownAgent.isPending || powerActionMutation.isPending}
                          >
                            <Icon name="refresh" className="h-4 w-4" />
                            Atualizar e reiniciar
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => {
                              setPowerSubmenuOpen(false);
                              setIsPowerMenuOpen(false);
                              setUpdatePowerAction('shutdown');
                            }}
                            disabled={restartAgent.isPending || shutdownAgent.isPending || powerActionMutation.isPending}
                          >
                            <Icon name="refresh" className="h-4 w-4" />
                            Atualizar e desligar
                          </button>
                        </>
                      )}
                      {/* "Ligar" não aparece com o agente online: o despertar
                          só faz sentido desligado, onde o item Wake-on-LAN é
                          oferecido no lugar do submenu de energia. */}
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
                  <Icon name="bolt" className="h-4 w-4" />
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
                  <Icon name="verified_user" className="h-4 w-4" />
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
                  <Icon name="delete" className="h-4 w-4" />
                  {deleteAgent.isPending ? 'Movendo...' : 'Mover para a lixeira'}
                </button>
              )}
            </div>
          )}
        </div>
      </PageHeader>

      {/* Live Heartbeat Metrics */}
      <LiveAgentHeartbeatCard agentId={a.id} fallbackMetrics={a.heartbeatMetrics} />


      {/* Stat Cards — exibidos apenas na aba principal Info para manter as abas de dados acima da dobra */}
      {activeDataTab === 'info' && (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Tooltip
          position="bottom"
          delay={300}
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
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-black/10 dark:ring-white/5">
              <Icon name="memory" className="h-6 w-6 text-primary" />
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
            icon="memory"
            label="Memória RAM"
            value={formatBytes(hw.data?.hardware?.totalMemoryBytes ?? null)}
            tone="accent"
          />
        </div>
        <Tooltip
          position="bottom"
          delay={300}
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
              icon="speed"
              label="MachineScore"
              value={machineScore === null ? '\u2014' : machineScore}
              tone={machineScoreTone}
              trend={machineScoreHint ? <span className="text-xs text-muted">{machineScoreHint}</span> : undefined}
            />
          </div>
        </Tooltip>
        <Tooltip
          position="bottom"
          delay={300}
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
            <div className="relative mb-3 flex h-8 items-center justify-between" ref={labelPickerRef}>
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Icon name="sell" className="h-3.5 w-3.5 text-accent" />
                Labels
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 shrink-0 p-0"
                title="Vincular label manual existente"
                aria-label="Adicionar label manual"
                onClick={() => {
                  setLabelPickerQuery('');
                  setShowLabelPicker(prev => !prev);
                }}
              >
                <Icon name="add" className="h-5 w-5" />
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
                    {manualLabelOptions
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
                    {manualLabelOptions.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted">
                        Nenhuma label manual disponível. Crie uma regra com modo Manual em Labels Automáticas (labels automáticas não aparecem aqui).
                      </p>
                    ) : manualLabelOptions.filter(l => l.toLowerCase().includes(labelPickerQuery.toLowerCase())).length === 0 ? (
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
                          className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                          title="Remover label manual"
                          onClick={() => void handleRemoveManualLabel(item.id)}
                        >
                          <Icon name="delete" className="h-3 w-3" />
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
          delay={300}
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
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success/15 ring-1 ring-black/10 dark:ring-white/5">
              <Icon name="web_asset" className="h-6 w-6 text-success" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted">Aplicativos</p>
              <p className="text-3xl font-bold text-foreground tabular-nums">{softwareTotalInstalled}</p>
            </div>
          </div>
        </Tooltip>
      </div>
      )}

      {/* Abas do agente: Info (principal) · Anotações · Histórico de labels · dados */}
      <DetailTabs
        tabs={buildAgentDetailTabs()}
        active={activeDataTab}
        onChange={handleSelectDataTab}
        ariaLabel="Seções do agente"
        panelIdPrefix="agent-tabs"
      />

      <div
        id="agent-tabs-panel"
        role="tabpanel"
        aria-labelledby={`agent-tabs-tab-${activeDataTab}`}
        className="space-y-6"
      >
        {activeDataTab === 'info' && (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Informações" />
                {/* Duas colunas: os dados cadastrais à esquerda e o painel de
                    dispositivo/energia (tipo de máquina, bateria e tomada) na
                    metade que antes ficava vazia à direita. */}
                <div className="grid gap-6 sm:grid-cols-2">
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted">Hostname</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-foreground">
                      <span>{a.hostname}</span>
                      <button
                        type="button"
                        aria-label="Copiar hostname"
                        title="Copiar hostname"
                        className="rounded p-0.5 text-muted hover:bg-surface-hover hover:text-foreground"
                        onClick={() => void copyField(a.hostname, 'Hostname')}
                      >
                        <Icon name="content_copy" className="h-3.5 w-3.5" />
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Usuário logado</dt>
                    <dd className="mt-0.5 text-foreground">
                      {(aWithHeartbeat ?? a).loggedUser?.trim() || '\u2014'}
                      {(aWithHeartbeat ?? a).loggedUserSince && (
                        <span className="ml-2 text-xs text-muted">
                          · desde {formatDate((aWithHeartbeat ?? a).loggedUserSince!)}
                        </span>
                      )}
                    </dd>
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
                            <Icon name="verified_user" className="h-4 w-4" />
                            Aprovar
                          </Button>
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted">Último IP</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-foreground">
                      {(() => {
                        const ipValue = a.lastIpAddress ?? hw.data?.networkAdapters?.find(n => n.ipAddress && !n.ipAddress.startsWith('169.254'))?.ipAddress;
                        return ipValue ? (
                          <>
                            <span>{ipValue}</span>
                            <button
                              type="button"
                              aria-label="Copiar último IP"
                              title="Copiar último IP"
                              className="rounded p-0.5 text-muted hover:bg-surface-hover hover:text-foreground"
                              onClick={() => void copyField(ipValue, 'IP')}
                            >
                              <Icon name="content_copy" className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          '\u2014'
                        );
                      })()}
                    </dd>
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
                      <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-foreground">
                        <span>{hw.data.hardware.serialNumber}</span>
                        <button
                          type="button"
                          aria-label="Copiar número de série"
                          title="Copiar número de série"
                          className="rounded p-0.5 text-muted hover:bg-surface-hover hover:text-foreground"
                          onClick={() => void copyField(hw.data!.hardware!.serialNumber!, 'Número de série')}
                        >
                          <Icon name="content_copy" className="h-3.5 w-3.5" />
                        </button>
                      </dd>
                    </div>
                  )}
                  {/* Resumo dos campos DESTACADOS, depois do bloco de fabricante/
                      modelo (e série). Sem campo destacado, a seção não aparece. */}
                  <AgentPinnedCustomFields items={agentCustomFields.data ?? []} />
                </dl>

                <AgentPowerPanel
                  agentId={a.id}
                  fallbackMetrics={a.heartbeatMetrics}
                  batteries={hw.data?.batteries}
                  isLaptop={a.isLaptop ?? hw.data?.hardware?.isLaptop ?? null}
                  machineType={a.machineType ?? hw.data?.hardware?.machineType ?? null}
                  inventoryCollectedAt={hw.data?.hardware?.inventoryCollectedAt ?? null}
                />
                </div>
              </Card>
              {/* Disk */}
              <Card>
                <CardHeader title="Disco" subtitle="Espaço agregado do agente" />

                {disks.length === 0 ? (
                  <p className="text-sm text-muted">Sem dados de disco coletados para este agente.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
                          <Icon name="storage" className="h-3.5 w-3.5" />
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

            <PinnedNotesCard agentId={a.id} onViewAll={() => handleSelectDataTab('notes')} />
          </>
        )}

        {activeDataTab === 'customFields' && (
          /* Visão completa: todos os campos visíveis no portal, com detalhe,
             edição conforme webEdit e auditoria da última alteração. */
          <AgentCustomFieldsCard agentId={a.id} canEdit={canManageAgent} />
        )}

        {activeDataTab === 'notes' && (
          <NotesPanel
            entityType="agent"
            entityId={a.id}
            title="Anotações do Agente"
            canEdit={canManageAgent}
            singular="anotação"
            plural="anotações"
          />
        )}

        {activeDataTab === 'labelHistory' && (
          <AgentLabelsHistoryTab
            history={labelHistory}
            isLoading={labelHistoryQuery.isFetching}
            isError={labelHistoryQuery.isError}
            onRefresh={() => void labelHistoryQuery.refetch()}
            activeLabels={allLabels}
            canManage={canManageAgent}
            onRemoveLabel={(labelId) => void handleRemoveManualLabel(labelId)}
          />
        )}

                {/* Wrapper das abas "de dados" (tabelas/painéis). As abas com painel próprio
            ficam fora dele — inclusive "customFields", cujo card já traz o seu. */}
        {activeDataTab !== 'info' && activeDataTab !== 'customFields' && activeDataTab !== 'notes' && activeDataTab !== 'labelHistory' && (
          <Card className="surface-card">
            {activeDataTab === 'windowsUpdates' && (
              <div className="w-full min-w-0 max-w-full">
                <AgentWindowsUpdatesPanel agentId={id!} />
              </div>
            )}

            {activeDataTab === 'software' && (
              <AgentSoftwareTab
                agentId={id!}
                agentName={a.displayName ?? a.hostname}
                isOnline={isOnlineNow}
                canExecute={canExecuteAgent}
                softwareSnapshot={softwareSnapshot}
              />
            )}

            {activeDataTab === 'tickets' && (
              <div className="w-full min-w-0 max-w-full">
                <CardHeader
                  title="Últimos Chamados"
                  subtitle={`${agentTickets.data?.items?.length ?? 0} chamado(s) retornado(s)`}
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate(`/tickets?agentId=${a.id}`)}
                    >
                      Ver todos os chamados
                    </Button>
                  }
                />
                <div className="space-y-2">
                  {agentTickets.isLoading && <Loading message="Carregando chamados..." />}
                  {agentTickets.isError && <ErrorDisplay onRetry={() => void agentTickets.refetch()} />}
                  {!agentTickets.isLoading && !agentTickets.isError && (!agentTickets.data || agentTickets.data.items.length === 0) && (
                    <div className="py-4 text-center text-sm text-muted">
                      Nenhum chamado encontrado
                    </div>
                  )}
                  {!agentTickets.isLoading && !agentTickets.isError && agentTickets.data && agentTickets.data.items.length > 0 && (
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
                                  <Icon name="confirmation_number" className="h-3.5 w-3.5 shrink-0 text-muted" />
                                  <p className="truncate text-sm font-medium text-foreground">
                                    {ticket.title}
                                  </p>
                                </div>
                                <p className="mt-1 text-xs text-muted">
                                  {formatDate(ticket.createdAt)}
                                  {ticket.closedAt && '  Encerrado'}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <Badge color={ticket.closedAt ? 'slate' : 'success'}>
                                  {ticket.closedAt ? 'Encerrado' : 'Aberto'}
                                </Badge>
                                <Badge color={priority.color} className="shrink-0">
                                  {priority.label}
                                </Badge>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeDataTab === 'printers' && (
              <div className="w-full min-w-0 max-w-full space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground sm:text-xl">Impressoras</h3>
                    <p className="text-sm text-muted">{printers.length} impressora(s) detectada(s)</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRefreshPrinters}
                    loading={isRefreshingPrinters || hwComponents.isFetching}
                    disabled={!canExecuteAgent}
                    title={
                      !canExecuteAgent
                        ? 'Sem permissão para executar ações no agente'
                        : !isOnlineNow
                          ? 'Agente offline — o pedido de coleta entra na fila e roda quando ele reconectar'
                          : 'Solicitar nova coleta de impressoras ao agente'
                    }
                  >
                    <Icon name="refresh" className="h-4 w-4" />
                    Atualizar
                  </Button>
                </div>

                {printers.length > 3 && (
                  <Input
                    value={printerSearch}
                    onChange={e => setPrinterSearch(e.target.value)}
                    placeholder="Filtrar impressoras por nome, driver ou porta..."
                  />
                )}

                {hwComponents.isLoading ? (
                  <Loading message="Carregando impressoras..." />
                ) : hwComponents.isError ? (
                  <ErrorDisplay onRetry={() => void hwComponents.refetch()} />
                ) : printers.length === 0 ? (
                  <p className="text-sm text-muted">Nenhuma impressora coletada para este agente.</p>
                ) : (() => {
                  const q = printerSearch.trim().toLowerCase();
                  const filteredPrinters = q
                    ? printers.filter(
                        p =>
                          p.name.toLowerCase().includes(q) ||
                          (p.driverName ?? '').toLowerCase().includes(q) ||
                          (p.portName ?? '').toLowerCase().includes(q),
                      )
                    : printers;
                  return filteredPrinters.length === 0 ? (
                    <p className="text-sm text-muted">Nenhuma impressora encontrada para o filtro informado.</p>
                  ) : (
                    <div className="space-y-2">
                      {filteredPrinters.map((printer, index) => (
                        <div key={`${printer.name}-${printer.portName ?? index}`} className="rounded-lg border border-border/60 bg-surface-light px-3 py-2.5">
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
                              <Icon name="print" className="h-3.5 w-3.5" />
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
                  );
                })()}
              </div>
            )}

            {activeDataTab === 'network' && (
              <AgentNetworkTab
                agentId={id!}
                activeView={activeNetworkView}
                onSelectView={handleSelectNetworkView}
                networkAdapters={hw.data?.networkAdapters}
                isOnline={isOnlineNow}
                canExecute={canExecuteAgent}
              />
            )}

            {activeDataTab === 'autostart' && (
              <AgentAutostartTab
                agentId={id!}
                activeView={activeAutostartView}
                onSelectView={handleSelectAutostartView}
                startupItems={startupItems}
                scheduledTasks={scheduledTasks}
                canManage={canManageAgent}
                canExecute={canExecuteAgent}
                isOnline={isOnlineNow}
                isLoading={hwComponents.isLoading}
                isError={Boolean(hwComponents.isError)}
                isFetching={hwComponents.isFetching}
                onRetry={() => void hwComponents.refetch()}
                onRefetch={() => void hwComponents.refetch()}
              />
            )}

            {activeDataTab === 'sensors' && (
              // Sem altura/rolagem própria: a tabela do painel já rola por dentro,
              // evitando a barra de rolagem duplicada (aninhada) em telas pequenas.
              <div className='w-full min-w-0 max-w-full'>
                <AgentSensorsPanel
                  agentId={id!}
                  canView={canViewSensors}
                  canExecute={canRunSensors}
                  canCreate={canCreateSensors}
                  canManage={canManageSensors}
                  payload={agentSensors.data}
                  isLoading={agentSensors.isLoading}
                  isError={Boolean(agentSensors.isError)}
                  isFetching={agentSensors.isFetching}
                  onRetry={() => void agentSensors.refetch()}
                  onRefresh={() => void agentSensors.refetch()}
                  isForcing={syncSensorsNow.isPending}
                  onForceSync={() => void handleSyncSensors()}
                  isRunning={runSensors.isPending}
                  onRun={handleRunSensors}
                  isSaving={createSensor.isPending || updateSensor.isPending}
                  onSaveSensor={handleSaveSensor}
                  onDeleteSensor={handleDeleteSensor}
                  onResetSensor={handleResetSensorState}
                  onResetAllSensors={handleResetAllSensors}
                  isResetting={resetSensorState.isPending}
                  onAddRecommended={handleAddRecommendedSensors}
                  isAddingRecommended={recommendedSensorsProgress !== null}
                  recommendedProgress={recommendedSensorsProgress}
                  clientId={agent.data?.clientId ?? null}
                  siteId={agent.data?.siteId ?? null}
                />
              </div>
            )}

            {activeDataTab === 'policies' && (
              // Sem altura/rolagem própria: a tabela do painel já rola por dentro,
              // evitando a barra de rolagem duplicada (aninhada) em telas pequenas.
              <div className='w-full min-w-0 max-w-full'>
                <AgentPoliciesPanel
                  canView={canViewAutomation}
                  canForceSync={canExecuteAutomation}
                  policies={agentPolicies.data}
                  isLoading={agentPolicies.isLoading}
                  isError={Boolean(agentPolicies.isError)}
                  onRetry={() => void agentPolicies.refetch()}
                  isRefreshing={agentPolicies.isFetching}
                  onRefresh={() => void agentPolicies.refetch()}
                  isForcing={forcePolicySync.isPending}
                  onForceSync={() => void handleForcePolicySync()}
                />
              </div>
            )}

            {activeDataTab === 'logs' && (() => {
              const q = logSearch.trim().toLowerCase();
              const filteredLogs = logsArray.filter(log => {
                if (logLevelFilter !== 'all') {
                  const lvl = String(log.level ?? '').toLowerCase();
                  if (logLevelFilter === 'error' && !lvl.includes('err') && !lvl.includes('crit') && lvl !== '3' && lvl !== '4') return false;
                  if (logLevelFilter === 'warning' && !lvl.includes('warn') && lvl !== '2') return false;
                  if (logLevelFilter === 'info' && !lvl.includes('info') && lvl !== '1') return false;
                }
                if (!q) return true;
                return log.message.toLowerCase().includes(q);
              });

              return (
                <div className="w-full min-w-0 max-w-full space-y-4">
                  <CardHeader
                    title="Logs Recentes"
                    subtitle={`${filteredLogs.length} de ${logsArray.length} registro(s)`}
                    action={
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void agentLogs.refetch()}
                          loading={agentLogs.isFetching}
                        >
                          <Icon name="refresh" className="h-4 w-4" />
                          Atualizar
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => navigate(`/logs?agentId=${a.id}`)}
                        >
                          Ver todos os logs
                        </Button>
                      </div>
                    }
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'all', label: 'Todos' },
                          { id: 'error', label: 'Erros' },
                          { id: 'warning', label: 'Avisos' },
                          { id: 'info', label: 'Info' },
                        ] as const
                      ).map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          aria-pressed={logLevelFilter === opt.id}
                          onClick={() => setLogLevelFilter(opt.id)}
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            logLevelFilter === opt.id
                              ? 'border-primary/60 bg-primary/20 text-primary-100'
                              : 'border-border bg-surface-light text-muted hover:bg-surface-hover hover:text-foreground'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="min-w-[200px] flex-1">
                      <Input
                        value={logSearch}
                        onChange={e => setLogSearch(e.target.value)}
                        placeholder="Filtrar logs por mensagem..."
                      />
                    </div>
                  </div>

                  {agentLogs.isLoading ? (
                    <Loading message="Carregando logs..." />
                  ) : agentLogs.isError ? (
                    <ErrorDisplay onRetry={() => void agentLogs.refetch()} />
                  ) : filteredLogs.length === 0 ? (
                    <p className="text-sm text-muted">
                      {logsArray.length === 0
                        ? 'Nenhum log registrado'
                        : 'Nenhum log encontrado para o filtro selecionado.'}
                    </p>
                  ) : (
                    <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                      {filteredLogs.map(log => {
                        const l = getLogLevelMeta(log.level);
                        return (
                          <div key={log.id} className="flex items-start gap-2 rounded-lg border border-border/60 bg-surface-light px-3 py-2">
                            <Badge color={l.color} className="mt-0.5 shrink-0">{l.label}</Badge>
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm text-muted-foreground">{log.message}</p>
                              <p className="text-xs text-muted">{formatDate(log.createdAt)}</p>
                            </div>
                            <button
                              type="button"
                              aria-label="Copiar mensagem do log"
                              title="Copiar mensagem"
                              className="shrink-0 rounded p-1 text-muted hover:bg-surface-hover hover:text-foreground"
                              onClick={() => void copyField(log.message, 'Log')}
                            >
                              <Icon name="content_copy" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={deleteConfirmOnline ? 'Mover para a lixeira e desinstalar do PC' : 'Mover agente para a lixeira'}
        message={
          deleteConfirmOnline ? (
            <>
              O agente <span className="font-semibold">{deleteConfirmName}</span> será movido para a lixeira e, como está <span className="font-semibold">online</span>, receberá um comando para se <span className="font-semibold">desinstalar deste computador</span> (serviço, binários e dados locais). Essa desinstalação é <span className="font-semibold">irreversível</span>: restaurar o agente da lixeira não o reinstala na máquina.
            </>
          ) : (
            <>
              O agente <span className="font-semibold">{deleteConfirmName}</span> será movido para a lixeira e poderá ser restaurado depois. Os dados (hardware, software, comandos, tokens) são mantidos. Ele está <span className="font-semibold">offline</span>: o comando de desinstalação será <span className="font-semibold">agendado</span> e executado quando o agente voltar a se comunicar com o servidor.
            </>
          )
        }
        confirmLabel={deleteConfirmOnline ? 'Mover e desinstalar' : 'Mover para a lixeira'}
        requireText={deleteConfirmOnline ? deleteConfirmName : undefined}
        isLoading={deleteAgent.isPending}
        onClose={closeDeleteAgentModal}
        onConfirm={() => { void confirmDeleteAgent(); }}
      />

      <PowerActionVerbDialog
        verb={powerVerb}
        agentName={a.displayName ?? a.hostname}
        isLoading={powerActionMutation.isPending}
        onClose={() => { if (!powerActionMutation.isPending) setPowerVerb(null); }}
        onConfirm={() => { void handlePowerVerbConfirm(); }}
      />

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

      {updatePowerAction && (
        <UpdatePowerActionModal
          open
          agentId={a.id}
          agentName={a.displayName ?? a.hostname}
          action={updatePowerAction}
          hasPendingWindowsUpdate={hasPendingWindowsUpdatePowerOption(a)}
          onClose={() => setUpdatePowerAction(null)}
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

      <ConfirmDialog
        open={zeroTouchConfirmOpen}
        title="Aprovar provisionamento Zero-Touch"
        message={`Aprovar o provisionamento Zero-Touch do agente "${a.displayName ?? a.hostname}"?`}
        confirmLabel="Aprovar"
        tone="primary"
        isLoading={isApprovingZeroTouch}
        onConfirm={() => void handleConfirmApproveZeroTouch()}
        onClose={() => { if (!isApprovingZeroTouch) setZeroTouchConfirmOpen(false); }}
      />
    </div>
  );
}
