import { useParams } from 'react-router-dom';
import { useAuthorization } from '@/auth/authorization';
import { ErrorDisplay, Loading } from '@/components/ui';
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
 */
export default function TicketChatWindow() {
  const { id } = useParams<{ id: string }>();
  const ticket = useTicket(id!);
  const authz = useAuthorization();

  if (ticket.isLoading) return <Loading />;
  if (ticket.isError || !ticket.data) {
    return <ErrorDisplay onRetry={() => ticket.refetch()} />;
  }

  const t = ticket.data;

  return (
    <div className="mx-auto flex h-screen max-w-4xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground">Chat do chamado</h1>
          <p className="truncate text-xs text-muted">{t.title}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
