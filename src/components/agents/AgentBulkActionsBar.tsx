import { useEffect, useMemo, useState } from 'react';

import toast from 'react-hot-toast';
import { agentUpdatesApi, agentsApi } from '@/api';
import { Icon, Button } from '@/components/ui';
import { useSendAgentNotification } from '@/hooks/useAgentAlerts';
import { useRestartAgent, useShutdownAgent, useWakeOnLan } from '@/hooks/useAgents';
import { useAuthorization } from '@/auth/authorization';
import { isAgentOnlineNow } from '@/utils/agentStatus';
import { formatBulkResult, runBulkAgentAction } from '@/utils/bulkAgentActions';
import NotificationComposerModal, {
  type NotificationPayload,
} from '@/components/notifications/NotificationComposerModal';
import BulkPowerActionModal, { type BulkPowerAction } from './BulkPowerActionModal';
import type { AgentCardAgent } from './AgentCard';

interface AgentBulkActionsBarProps {
  /** Agentes selecionados na aba (vazio esconde a barra). */
  agents: readonly AgentCardAgent[];
  now: number;
  /** Rótulo do escopo usado nas mensagens ("cliente" ou "site"). */
  scopeLabel: string;
  /** Limpa a seleção (chamado depois de cada ação e pelo botão "Limpar"). */
  onClear: () => void;
}

/**
 * Barra de ações em massa da aba Agentes (detalhe de cliente/site).
 *
 * O backend não expõe fan-out de energia por cliente/site para um subconjunto
 * arbitrário de agentes, então cada ação vira um fan-out no cliente
 * (`runBulkAgentAction`) com o resultado agregado em um único toast. As ações
 * são as mesmas do menu de contexto do agente, só que aplicadas de uma vez:
 *
 * - Notificar: comando persistido (entrega quando o agente reconectar);
 * - Reiniciar / Desligar: comandos de energia, exigem o agente ONLINE;
 * - Ligar (Wake-on-LAN): só faz sentido para máquinas desligadas;
 * - Atualizar agente: força o auto-update do binário;
 * - Atualizar inventário: pede re-coleta de hardware/software/portas/conexões.
 */
export function AgentBulkActionsBar({
  agents,
  now,
  scopeLabel,
  onClear,
}: AgentBulkActionsBarProps) {
  const sendNotification = useSendAgentNotification();
  const restartAgent = useRestartAgent();
  const shutdownAgent = useShutdownAgent();
  const wakeOnLan = useWakeOnLan();
  const { hasAnyPermission } = useAuthorization();
  // Executar nos agentes é Agents.Execute (mesma checagem do broadcast por
  // escopo no cabeçalho da página). Patches/energia/notificação/WoL/refresh-data
  // caem todos nessa permissão no servidor.
  const canExecute = hasAnyPermission(['Agents.Execute', 'Agents.Edit', 'agents.*', 'admin.*']);
  // "Atualizar agente" NÃO é Agents.*: o force-update é do domínio Deployment
  // (POST /agent-updates/agents/{id}/force-update exige Deployment.Edit). Sem
  // este gate o botão apareceria para quem só pode ler e o fan-out inteiro
  // voltaria 403.
  const canForceUpdate = hasAnyPermission([
    'Deployment.Edit',
    'deployment.*',
    'deploy.*',
    'admin.*',
  ]);

  const [notifyOpen, setNotifyOpen] = useState(false);
  const [powerAction, setPowerAction] = useState<BulkPowerAction | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Uma única passada separa online/offline: os dois conjuntos são usados
  // várias vezes (contadores da barra, alvo de energia, alvo do Wake-on-LAN).
  const { onlineAgents, offlineAgents } = useMemo(() => {
    const online: AgentCardAgent[] = [];
    const offline: AgentCardAgent[] = [];
    for (const item of agents) {
      if (isAgentOnlineNow(item, now)) online.push(item);
      else offline.push(item);
    }
    return { onlineAgents: online, offlineAgents: offline };
  }, [agents, now]);
  const onlineCount = onlineAgents.length;
  const offlineCount = offlineAgents.length;

  // Seleção esvaziada (ação concluída, "Limpar" ou refetch sem os agentes
  // marcados): fecha os modais. Sem isto o `notifyOpen`/power ficariam ligados e
  // o modal reapareceria sozinho na próxima vez que houvesse seleção.
  useEffect(() => {
    if (agents.length > 0) return;
    setNotifyOpen(false);
    setPowerAction(null);
  }, [agents.length]);

  if (agents.length === 0) return null;

  const noPermissionHint = canExecute ? undefined : 'Sem permissão para executar ações nos agentes';
  const noForceUpdateHint = canForceUpdate
    ? undefined
    : 'Sem permissão para disparar atualizações de agente (Deployment.Edit)';

  /**
   * Executa a ação para `targets` (por padrão, todos os selecionados) e resume
   * o resultado em UM toast. O lote nunca lança: falhas de agentes individuais
   * viram contagem, então qualquer falha é reportada como erro (com o número de
   * sucessos) e o sucesso total como sucesso.
   */
  const runAction = async (
    key: string,
    label: string,
    action: (agent: AgentCardAgent) => Promise<unknown>,
    targets: readonly AgentCardAgent[] = agents,
  ) => {
    if (busyAction || targets.length === 0) return;
    setBusyAction(key);
    try {
      const result = await runBulkAgentAction(targets, action);
      const message = formatBulkResult(label, result);
      if (result.failed > 0) toast.error(message);
      else toast.success(message);
      onClear();
    } finally {
      setBusyAction(null);
    }
  };

  const handleNotifyConfirm = async (data: NotificationPayload) => {
    await runAction('notify', 'Notificação', (agent) =>
      sendNotification.mutateAsync({
        agentId: agent.id,
        title: data.title,
        message: data.message,
        alertType: data.alertType,
        timeoutSeconds: data.timeoutSeconds,
        icon: data.icon,
      }),
    );
    setNotifyOpen(false);
  };

  const handlePowerConfirm = async (data: {
    delaySeconds: number;
    force: boolean;
    message: string;
    notifyUser: boolean;
  }) => {
    const action = powerAction;
    if (!action) return;
    // Só os online recebem comando de energia (diferente de notificação/update,
    // o dispatcher não reentrega energia quando o agente reconectar).
    await runAction(
      action,
      action === 'restart' ? 'Reinicialização' : 'Desligamento',
      (agent) =>
        action === 'restart'
          ? restartAgent.mutateAsync({ id: agent.id, data })
          : shutdownAgent.mutateAsync({ id: agent.id, data }),
      onlineAgents,
    );
  };

  // Wake-on-LAN só é oferecido para quem está OFFLINE (mesma regra do menu de
  // contexto do agente): acordar uma máquina ligada não faz sentido e o servidor
  // ainda relaya o pacote por outro agente online do MESMO site, o que viraria
  // falha em massa quando o site inteiro está desligado.
  const handleWakeOnLan = () =>
    runAction('wol', 'Wake-on-LAN', (agent) => wakeOnLan.mutateAsync({ id: agent.id }), offlineAgents);

  const handleForceUpdate = () =>
    runAction('update', 'Atualização do agente disparada', (agent) =>
      agentUpdatesApi.forceAgentCheck(agent.id),
    );

  const handleRefreshInventory = () =>
    runAction('refresh', 'Releitura de inventário', (agent) =>
      agentsApi.refreshData(agent.id, {
        hardware: true,
        software: true,
        listeningPorts: true,
        openConnections: true,
        printers: true,
        startupItems: true,
        scheduledTasks: true,
      }),
    );

  const powerPending = restartAgent.isPending || shutdownAgent.isPending;

  return (
    <>
      <div
        role="region"
        aria-label="Ações em massa dos agentes selecionados"
        className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2"
      >
        <span className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Icon name="done_all" className="h-4 w-4 text-primary" aria-hidden="true" />
          {agents.length} selecionado(s)
          <span className="text-muted">
            {onlineCount} online{offlineCount > 0 ? ` · ${offlineCount} offline` : ''}
          </span>
        </span>

        <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden="true" />

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setNotifyOpen(true)}
          disabled={!canExecute || busyAction !== null}
          title={noPermissionHint ?? `Enviar notificação para os ${agents.length} agente(s) selecionado(s)`}
        >
          <Icon name="notifications" className="h-4 w-4" /> Notificar
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setPowerAction('restart')}
          disabled={!canExecute || busyAction !== null || onlineCount === 0}
          title={
            noPermissionHint ??
            (onlineCount === 0
              ? 'Nenhum agente selecionado está online'
              : 'Reiniciar os agentes selecionados')
          }
        >
          <Icon name="restart_alt" className="h-4 w-4" /> Reiniciar
        </Button>

        <Button
          size="sm"
          // "danger" (sólido) e não ghost+text-danger: a classe de texto perderia
          // para o text-muted-foreground do ghost na ordem do CSS gerado, então a
          // ação destrutiva apareceria igual às demais.
          variant="danger"
          onClick={() => setPowerAction('shutdown')}
          disabled={!canExecute || busyAction !== null || onlineCount === 0}
          title={
            noPermissionHint ??
            (onlineCount === 0
              ? 'Nenhum agente selecionado está online'
              : 'Desligar os agentes selecionados')
          }
        >
          <Icon name="power_settings_new" className="h-4 w-4" /> Desligar
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => { void handleWakeOnLan(); }}
          disabled={!canExecute || busyAction !== null || offlineCount === 0}
          title={
            noPermissionHint ??
            (offlineCount === 0
              ? 'Todos os agentes selecionados já estão online'
              : `Enviar Wake-on-LAN para os ${offlineCount} agente(s) offline selecionado(s)`)
          }
        >
          <Icon name="bolt" className="h-4 w-4" /> Ligar
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => { void handleForceUpdate(); }}
          disabled={!canForceUpdate || busyAction !== null}
          title={noForceUpdateHint ?? 'Forçar a verificação de atualização do binário do agente'}
        >
          <Icon name="refresh" className="h-4 w-4" /> Atualizar agente
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => { void handleRefreshInventory(); }}
          disabled={!canExecute || busyAction !== null}
          title={noPermissionHint ?? 'Pedir re-coleta de hardware, software, portas e conexões'}
        >
          <Icon name="inventory_2" className="h-4 w-4" /> Atualizar inventário
        </Button>

        <Button size="sm" variant="ghost" onClick={onClear} disabled={busyAction !== null}>
          <Icon name="close" className="h-4 w-4" /> Limpar seleção
        </Button>
      </div>

      {notifyOpen && (
        <NotificationComposerModal
          heading="Notificar agentes selecionados"
          targetLabel={`${agents.length} agente(s) selecionado(s)`}
          targetHint={`No ${scopeLabel}: ${onlineCount} online · ${offlineCount} offline`}
          recipientCount={agents.length}
          recipientScopeLabel={`os ${agents.length} selecionados`}
          showSuccessToast={false}
          onClose={() => setNotifyOpen(false)}
          onConfirm={handleNotifyConfirm}
          isLoading={busyAction === 'notify'}
        />
      )}

      {powerAction && (
        <BulkPowerActionModal
          open
          action={powerAction}
          agents={agents}
          now={now}
          onClose={() => setPowerAction(null)}
          onConfirm={handlePowerConfirm}
          isLoading={powerPending}
        />
      )}
    </>
  );
}
