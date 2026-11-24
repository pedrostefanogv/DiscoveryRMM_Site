import { useState } from 'react';
import toast from 'react-hot-toast';
import { ApiError, agentsApi, type ScheduledTaskInfo, type StartupItemInfo } from '@/api';
import { DetailTabs, type DetailTab } from '@/components/entity/DetailTabs';
import AgentStartupItemsPanel from '@/components/agents/AgentStartupItemsPanel';
import AgentScheduledTasksPanel from '@/components/agents/AgentScheduledTasksPanel';
import type { AgentAutostartView } from '@/pages/agents/agentDetailUtils';

const AUTOSTART_TABS: DetailTab<AgentAutostartView>[] = [
  { id: 'startupItems', label: 'Inicialização', icon: 'power_settings_new' },
  { id: 'scheduledTasks', label: 'Tarefas Agendadas', icon: 'schedule' },
];

interface AgentAutostartTabProps {
  agentId: string;
  activeView: AgentAutostartView;
  onSelectView: (view: AgentAutostartView) => void;
  startupItems: StartupItemInfo[];
  scheduledTasks: ScheduledTaskInfo[];
  canManage: boolean;
  canExecute?: boolean;
  isOnline: boolean;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onRefetch: () => void;
}

export function AgentAutostartTab({
  agentId,
  activeView,
  onSelectView,
  startupItems,
  scheduledTasks,
  canManage,
  canExecute = canManage,
  isOnline,
  isLoading,
  isError,
  isFetching,
  onRetry,
  onRefetch,
}: AgentAutostartTabProps) {
  const [isRefreshingStartup, setIsRefreshingStartup] = useState(false);
  const [isRefreshingScheduledTasks, setIsRefreshingScheduledTasks] = useState(false);

  const tabs: DetailTab<AgentAutostartView>[] = [
    {
      ...AUTOSTART_TABS[0],
      badge: !isLoading && startupItems.length > 0 ? startupItems.length : undefined,
    },
    {
      ...AUTOSTART_TABS[1],
      badge: !isLoading && scheduledTasks.length > 0 ? scheduledTasks.length : undefined,
    },
  ];

  const handleRefreshStartup = async () => {
    if (!agentId || isRefreshingStartup || !canExecute) return;
    setIsRefreshingStartup(true);
    try {
      await agentsApi.refreshData(agentId, { startupItems: true });
      toast.success('Solicitação de coleta de inicialização enviada ao agente.');
      await new Promise(r => setTimeout(r, 2000));
      await onRefetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar refresh de inicialização.';
      toast.error(msg);
    } finally {
      setIsRefreshingStartup(false);
    }
  };

  const handleRefreshScheduledTasks = async () => {
    if (!agentId || isRefreshingScheduledTasks || !canExecute) return;
    setIsRefreshingScheduledTasks(true);
    try {
      await agentsApi.refreshData(agentId, { scheduledTasks: true });
      toast.success('Solicitação de coleta de tarefas agendadas enviada ao agente.');
      await new Promise(r => setTimeout(r, 2500));
      await onRefetch();
    } catch (error) {
      const msg = error instanceof ApiError ? error.message : 'Falha ao solicitar refresh de tarefas agendadas.';
      toast.error(msg);
    } finally {
      setIsRefreshingScheduledTasks(false);
    }
  };

  return (
    <div className="space-y-4">
      <DetailTabs
        tabs={tabs}
        active={activeView}
        onChange={onSelectView}
        ariaLabel="Seções de execução automática do agente"
        panelIdPrefix="agent-autostart-tabs"
      />

      <div
        id="agent-autostart-tabs-panel"
        role="tabpanel"
        aria-labelledby={`agent-autostart-tabs-tab-${activeView}`}
      >
        {activeView === 'startupItems' && (
          // Sem altura/rolagem própria: a tabela do painel já rola por dentro,
          // evitando a barra de rolagem duplicada (aninhada) em telas pequenas.
          <div className="w-full min-w-0 max-w-full">
            <AgentStartupItemsPanel
              agentId={agentId}
              items={startupItems}
              canManage={canManage}
              canRefresh={canExecute}
              isOnline={isOnline}
              isLoading={isLoading}
              isError={isError}
              onRetry={onRetry}
              isRefreshing={isRefreshingStartup || isFetching}
              onRefresh={handleRefreshStartup}
              onDataRefetch={onRefetch}
            />
          </div>
        )}

        {activeView === 'scheduledTasks' && (
          // Sem altura/rolagem própria: a tabela do painel já rola por dentro,
          // evitando a barra de rolagem duplicada (aninhada) em telas pequenas.
          <div className="w-full min-w-0 max-w-full">
            <AgentScheduledTasksPanel
              agentId={agentId}
              tasks={scheduledTasks}
              canManage={canManage}
              canRefresh={canExecute}
              isOnline={isOnline}
              isLoading={isLoading}
              isError={isError}
              onRetry={onRetry}
              isRefreshing={isRefreshingScheduledTasks || isFetching}
              onRefresh={handleRefreshScheduledTasks}
              onDataRefetch={onRefetch}
            />
          </div>
        )}
      </div>
    </div>
  );
}
