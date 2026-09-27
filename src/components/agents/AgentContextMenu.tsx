import { useState } from 'react';
import {
  Bell,
  Bug,
  Monitor,
  Move,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ApiError, agentUpdatesApi } from '@/api';
import { ConfirmDialog, ContextMenu, type ContextMenuItem } from '@/components/ui';
import { TransferAgentModal } from '@/components/agents/TransferAgentModal';
import PowerActionModal from '@/components/agents/PowerActionModal';
import AgentNotificationModal, { type AgentNotificationPayload } from '@/components/agents/AgentNotificationModal';
import WakeOnLanModal from '@/components/agents/WakeOnLanModal';
import { useApproveZeroTouch, useDeleteAgent, useRestartAgent, useShutdownAgent, useWakeOnLan } from '@/hooks/useAgents';
import { useSendAgentNotification } from '@/hooks/useAgentAlerts';
import { useAuthorization } from '@/auth/authorization';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { openRemoteDebugPopup } from '@/pages/agents/remoteDebugLauncher';
import { openRemoteSessionPopup } from '@/pages/agents/remoteSessionLauncher';
import type { AgentCardAgent } from './AgentCard';

interface AgentContextMenuProps {
  agent: AgentCardAgent;
  now: number;
  position: { x: number; y: number };
  onClose: () => void;
}

/**
 * Menu de contexto do agente (botão direito), com as mesmas ações da listagem
 * geral /agents. Encapsula os modais de transferência, energia, WoL,
 * notificação e exclusão.
 */
export function AgentContextMenu({ agent, now, position, onClose }: AgentContextMenuProps) {
  const approveZeroTouch = useApproveZeroTouch();
  const restartAgent = useRestartAgent();
  const shutdownAgent = useShutdownAgent();
  const wakeOnLan = useWakeOnLan();
  const deleteAgent = useDeleteAgent();
  const sendAgentNotification = useSendAgentNotification();
  const { hasAnyPermission } = useAuthorization();

  const canManageAgent = hasAnyPermission(['Agents.Edit', 'agents.*', 'admin.*']);
  const canExecuteAgent = hasAnyPermission(['Agents.Execute', 'Agents.Edit', 'agents.*', 'admin.*']);
  const online = isAgentOnlineNow(agent, now);

  const [remoteDebugAgentId, setRemoteDebugAgentId] = useState<string | null>(null);
  const [updatingAgentId, setUpdatingAgentId] = useState<string | null>(null);
  const [approvingAgentId, setApprovingAgentId] = useState<string | null>(null);
  const [transferAgent, setTransferAgent] = useState<AgentCardAgent | null>(null);
  const [powerActionAgent, setPowerActionAgent] = useState<{ agent: AgentCardAgent; action: 'restart' | 'shutdown' } | null>(null);
  const [wolAgent, setWolAgent] = useState<AgentCardAgent | null>(null);
  const [notificationAgent, setNotificationAgent] = useState<AgentCardAgent | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const openRemoteControl = () => {
    openRemoteSessionPopup({ agentId: agent.id, kind: 'screen', transport: 'nats' });
  };

  const openRemoteDebug = async () => {
    if (remoteDebugAgentId) return;
    setRemoteDebugAgentId(agent.id);
    try {
      await openRemoteDebugPopup({ agentId: agent.id, payload: { logLevel: 'debug', preferredTransport: 'nats', ttlMinutes: 20 } });
      toast.success(`Debug remoto aberto para ${agent.displayName ?? agent.hostname}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao abrir o console de remote debug.');
    } finally {
      setRemoteDebugAgentId(null);
    }
  };

  const handleTriggerAgentUpdate = async () => {
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

  const handleApproveZeroTouch = async () => {
    if (!agent.zeroTouchPending || !canManageAgent || approvingAgentId) return;
    if (!window.confirm(`Aprovar o provisionamento Zero-Touch do agente "${agent.displayName ?? agent.hostname}"?`)) return;

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

  const handleDeleteAgent = async () => {
    try {
      await deleteAgent.mutateAsync(agent.id);
      toast.success(`Agente ${agent.displayName ?? agent.hostname} movido para a lixeira.`);
      setDeleteConfirmOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao mover o agente para a lixeira.');
    }
  };

  const handlePowerActionConfirm = async (data: { delaySeconds: number; force: boolean; message: string; notifyUser: boolean }) => {
    if (!powerActionAgent) return;
    if (powerActionAgent.action === 'restart') {
      await restartAgent.mutateAsync({ id: powerActionAgent.agent.id, data });
    } else {
      await shutdownAgent.mutateAsync({ id: powerActionAgent.agent.id, data });
    }
  };

  const handleWakeOnLanConfirm = async (data: { broadcastAddress?: string }) => {
    if (!wolAgent) throw new Error('No agent selected');
    return await wakeOnLan.mutateAsync({ id: wolAgent.id, data });
  };

  const handleNotificationConfirm = async (data: AgentNotificationPayload) => {
    if (!notificationAgent) return;
    await sendAgentNotification.mutateAsync({ agentId: notificationAgent.id, ...data });
  };

  const items: ContextMenuItem[] = [
    {
      key: 'remote',
      label: 'Acesso remoto',
      icon: <Monitor className="h-4 w-4" />,
      onClick: openRemoteControl,
    },
    {
      key: 'debug',
      label: remoteDebugAgentId === agent.id ? 'Abrindo debug...' : 'Ver debug',
      icon: <Bug className="h-4 w-4" />,
      disabled: remoteDebugAgentId === agent.id,
      onClick: () => { void openRemoteDebug(); },
    },
    {
      key: 'update',
      label: updatingAgentId === agent.id ? 'Disparando update...' : 'Atualizar agente',
      icon: <RefreshCw className="h-4 w-4" />,
      disabled: updatingAgentId === agent.id,
      onClick: () => { void handleTriggerAgentUpdate(); },
    },
    {
      key: 'notify',
      label: 'Enviar notificação',
      icon: <Bell className="h-4 w-4" />,
      disabled: !canExecuteAgent,
      hint: canExecuteAgent ? undefined : 'sem permissão',
      onClick: () => setNotificationAgent(agent),
    },
  ];

  if (online) {
    items.push({
      key: 'power',
      label: 'Energia',
      icon: <Zap className="h-4 w-4" />,
      children: [
        {
          key: 'restart',
          label: 'Reiniciar',
          icon: <RotateCcw className="h-4 w-4" />,
          onClick: () => setPowerActionAgent({ agent, action: 'restart' }),
        },
        {
          key: 'shutdown',
          label: 'Desligar',
          icon: <Power className="h-4 w-4" />,
          danger: true,
          onClick: () => setPowerActionAgent({ agent, action: 'shutdown' }),
        },
        {
          key: 'wake',
          label: 'Ligar',
          icon: <Zap className="h-4 w-4" />,
          disabled: true,
          hint: 'em breve',
        },
      ],
    });
  } else {
    items.push({
      key: 'wol',
      label: wakeOnLan.isPending ? 'Enviando...' : 'Wake-on-LAN',
      icon: <Zap className="h-4 w-4" />,
      disabled: wakeOnLan.isPending,
      onClick: () => setWolAgent(agent),
    });
  }

  if (canManageAgent && agent.zeroTouchPending) {
    items.push({
      key: 'approve',
      label: approvingAgentId === agent.id ? 'Aprovando...' : 'Aprovar Zero-Touch',
      icon: <ShieldCheck className="h-4 w-4" />,
      disabled: approvingAgentId === agent.id,
      onClick: () => { void handleApproveZeroTouch(); },
    });
  }

  if (canManageAgent) {
    items.push({
      key: 'transfer',
      label: 'Transferir agente',
      icon: <Move className="h-4 w-4" />,
      onClick: () => setTransferAgent(agent),
    });
    items.push({
      key: 'delete',
      label: 'Mover para a lixeira',
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      separatorBefore: true,
      disabled: deleteAgent.isPending,
      onClick: () => setDeleteConfirmOpen(true),
    });
  }

  return (
    <>
      <ContextMenu position={position} items={items} onClose={onClose} />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Mover agente para a lixeira"
        message={
          <>
            O agente <span className="font-semibold">{agent.displayName ?? agent.hostname}</span> será movido para a lixeira e poderá ser restaurado depois. Os dados (hardware, software, comandos, tokens) são mantidos.
          </>
        }
        confirmLabel="Mover para a lixeira"
        isLoading={deleteAgent.isPending}
        onClose={() => { if (!deleteAgent.isPending) setDeleteConfirmOpen(false); }}
        onConfirm={() => { void handleDeleteAgent(); }}
      />

      <TransferAgentModal
        open={!!transferAgent}
        onClose={() => setTransferAgent(null)}
        agent={transferAgent ? { id: transferAgent.id, siteId: transferAgent.siteId, hostname: transferAgent.hostname, displayName: transferAgent.displayName } as AgentCardAgent : null}
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
    </>
  );
}
