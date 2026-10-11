import { useParams } from 'react-router-dom';
import { useAuthorization } from '@/auth/authorization';
import { ErrorDisplay, Loading } from '@/components/ui';
import { useAgent } from '@/hooks/useAgents';
import { useTicket } from '@/hooks/useTickets';
import TicketChatPanel from './TicketChatPanel';

const TICKET_CHAT_PERMISSIONS = ['tickets.chat', 'tickets.*', 'tickets.edit', 'admin.*'];

/**
 * Janela DEDICADA do chat do chamado (aberta por window.open, como o acesso
 * remoto e o remote debug).
 *
 * Motivo: a conversa precisa sobreviver à navegação do atendente — se ele sair
 * do chamado para consultar outra informação, a janela do chat continua ativa.
 * O histórico permanece vinculado ao chamado e visível aqui e na aba Chat.
 *
 * O cabeçalho identifica COM QUEM o atendente está falando (agent e usuário
 * logado na máquina): sem isso o suporte não sabe qual computador/pessoa está do
 * outro lado.
 */
export default function TicketChatWindow() {
  const { id } = useParams<{ id: string }>();
  const ticket = useTicket(id!);
  const authz = useAuthorization();
  const agent = useAgent(ticket.data?.agentId ?? undefined);

  if (ticket.isLoading) return <Loading />;
  if (ticket.isError || !ticket.data) {
    return <ErrorDisplay onRetry={() => ticket.refetch()} />;
  }

  const t = ticket.data;
  const machineName = agent.data?.displayName || agent.data?.hostname || null;
  const loggedUser = agent.data?.loggedUser || null;

  return (
    // Altura travada na viewport e SEM scroll no container: o cabeçalho fica
    // fixo no topo, a conversa rola e o campo de digitação fica ancorado no
    // rodapé (antes o compositor rolava junto e ficava cortado).
    <div className="flex h-screen flex-col gap-3 overflow-hidden p-4">
      <header className="shrink-0 border-b border-border pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground">Chat do chamado</h1>
            <p className="truncate text-xs text-muted">{t.title}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="truncate">
              <span className="text-muted">Máquina:</span>{' '}
              <span className="font-medium text-foreground">
                {machineName ?? (t.agentId ? 'carregando…' : 'sem máquina vinculada')}
              </span>
            </span>
            <span className="truncate">
              <span className="text-muted">Usuário:</span>{' '}
              <span className="font-medium text-foreground">{loggedUser ?? '—'}</span>
            </span>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <TicketChatPanel
          ticketId={id!}
          agentId={t.agentId}
          clientId={t.clientId}
          siteId={t.siteId}
          canManage={authz.hasAnyPermission(TICKET_CHAT_PERMISSIONS)}
        />
      </div>
    </div>
  );
}
