import toast from 'react-hot-toast';
import { ContextMenu, Icon, type ContextMenuItem } from '@/components/ui';
import { useAuthorization } from '@/auth/authorization';
import { isAgentPossiblyOnline } from '@/utils/agentStatus';
import { openRemoteSessionPopup } from '@/pages/agents/remoteSessionLauncher';
import type { PatchPendingAgent } from '@/api/types';

/**
 * Menu de contexto (botão direito) da lista de pendências de patch
 * (/patches/pending).
 *
 * Por que estas ações vivem aqui: a coluna "actions" da tabela guarda apenas os
 * atalhos de uso frequente (Aprovar pendentes / Verificar atualizações /
 * Instalar aprovadas). O menu de contexto é o lugar do "resto" — as mesmas
 * ações de patch mais o acesso remoto — sem inflar a linha com mais um botão.
 * O componente NÃO fala com a API de patch: os handlers chegam por prop, já
 * prontos na página (que é quem tem os hooks de mutação e o toast).
 *
 * PERMISSÕES — a tela tem DOIS donos de permissão distintos:
 * 1. Ações de patch (Aprovar/Verificar/Instalar): usam as MESMAS permissões da
 *    página, para que o menu e os botões da tabela nunca discordem.
 *      canApprove = Patches.Edit | patches.* | admin.*
 *      canExecute = Patches.Execute | patches.* | admin.*
 *    Nada de Agents.* aqui: quem só cuida de patch não deve ganhar ou perder
 *    acesso por causa de um menu de contexto.
 * 2. Acesso remoto: abre uma SESSÃO AO VIVO, então o bloqueio real não é
 *    permissão e sim o sinal de online. Seguimos o padrão de SINAL, não de gate
 *    extra: nada de Agents.* nesta tela (o usuário pode não ter essa família);
 *    o backend continua sendo a autoridade e barraria de qualquer forma. O
 *    hint "agente offline" existe só para explicar ao usuário por que o item
 *    está apagado em vez de deixá-lo clicar e falhar.
 */
interface PatchPendingContextMenuProps {
  agent: PatchPendingAgent;
  now: number;
  position: { x: number; y: number };
  onApprove: (agent: PatchPendingAgent) => void;
  onScan: (agent: PatchPendingAgent) => void;
  onInstall: (agent: PatchPendingAgent) => void;
  onClose: () => void;
  /** Varredura deste agente em andamento na página (spinner/botão desabilitado). */
  scanning?: boolean;
}

export function PatchPendingContextMenu({
  agent,
  now,
  position,
  onApprove,
  onScan,
  onInstall,
  onClose,
  scanning = false,
}: PatchPendingContextMenuProps) {
  const { hasAnyPermission } = useAuthorization();

  // Mesmas permissões da página de pendências — ver comentário do topo.
  const canApprove = hasAnyPermission(['Patches.Edit', 'patches.*', 'admin.*']);
  const canExecute = hasAnyPermission(['Patches.Execute', 'patches.*', 'admin.*']);

  // Mesmo cast de isPendingAgentOnline (PatchesPending): PatchPendingAgent não é
  // AgentStatusLike, mas o endpoint desta lista SEMPRE serializa "Online" ou
  // "Offline" (o handler reduz o enum antes do DTO).
  const canReachAgent = isAgentPossiblyOnline(
    {
      status: (agent.status ?? undefined) as 'Online' | 'Offline' | undefined,
      lastSeenAt: agent.lastSeenAt,
    },
    now,
  );
  const offlineHint = 'agente offline';

  const openRemoteControl = () => {
    // window.open é síncrono: chamamos direto no clique e tratamos a popup
    // bloqueada com toast, como manda o launcher.
    try {
      void openRemoteSessionPopup({ agentId: agent.agentId, kind: 'screen', transport: 'nats' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao abrir o acesso remoto.');
    }
  };

  const items: ContextMenuItem[] = [
    {
      key: 'approve',
      label: 'Aprovar pendentes',
      icon: <Icon name="check_circle" className="h-4 w-4" />,
      disabled: !canApprove,
      hint: canApprove ? undefined : 'sem permissão',
      onClick: () => onApprove(agent),
    },
    {
      key: 'scan',
      label: scanning ? 'Verificando...' : 'Verificar atualizações',
      icon: <Icon name="refresh" className={`h-4 w-4${scanning ? ' animate-spin' : ''}`} />,
      // A varredura é uma ação de patch: só a permissão (e um scan já em
      // andamento) bloqueiam. O agente offline continua podendo ser enfileirado.
      disabled: scanning || !canExecute,
      hint: !canExecute ? 'sem permissão' : undefined,
      onClick: () => onScan(agent),
    },
    {
      key: 'install',
      label: 'Instalar aprovadas',
      icon: <Icon name="download" className="h-4 w-4" />,
      disabled: !canExecute,
      hint: !canExecute ? 'sem permissão' : undefined,
      onClick: () => onInstall(agent),
    },
    {
      key: 'remote',
      label: 'Acesso remoto',
      icon: <Icon name="desktop_windows" className="h-4 w-4" />,
      // Sessão ao vivo: sem o agent online a sessão não conecta.
      separatorBefore: true,
      disabled: !canReachAgent,
      hint: canReachAgent ? undefined : offlineHint,
      onClick: openRemoteControl,
    },
  ];

  return <ContextMenu position={position} items={items} onClose={onClose} />;
}

export default PatchPendingContextMenu;
