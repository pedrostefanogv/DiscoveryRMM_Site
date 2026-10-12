import { useMemo } from "react";
import { createTicketChatClient } from "@/hooks/supportChatClient";
import SupportChatPanel from "./SupportChatPanel";

interface TicketChatPanelProps {
  ticketId: string;
  agentId?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  canManage: boolean;
}

/**
 * Chat de suporte VINCULADO AO CHAMADO (aba do detalhe e janela dedicada).
 *
 * É só o adaptador do painel compartilhado: a conversa avulsa da máquina usa o
 * mesmo SupportChatPanel com um cliente escopado pelo agent.
 */
export default function TicketChatPanel({ ticketId, agentId, clientId, siteId, canManage }: TicketChatPanelProps) {
  const client = useMemo(
    () => createTicketChatClient({ ticketId, agentId, clientId, siteId }),
    [ticketId, agentId, clientId, siteId],
  );

  return <SupportChatPanel client={client} canManage={canManage} />;
}
