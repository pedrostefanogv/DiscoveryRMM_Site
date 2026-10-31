import type { TicketChatSession } from "@/api/ticket-chat";

// ─────────────────────────────────────────────────────────────────────────────
// Regra de EXIBIÇÃO da sessão devolvida por `sessions/current` no painel de
// chat de suporte (máquina e chamado).
//
// O servidor devolve o DESFECHO (Declined/Expired/Ended) de propósito: sem ele
// o painel ficava congelado em "Aguardando confirmação" depois do "Agora não"
// na máquina. O problema é que a mesma regra, ao ABRIR a janela, ressuscitava a
// última conversa da máquina — exibindo o histórico anterior (de outro
// atendente/turno, sobre outro usuário final).
//
// Regra: sessão ao VIVO entra sempre; sessão TERMINAL só entra se for a MESMA
// sessão que ESTA janela já acompanhou (o desfecho chega na janela que estava
// aberta). Ao abrir do zero, terminal é ignorado e o painel oferece/inicia uma
// conversa nova.
// ─────────────────────────────────────────────────────────────────────────────

/** Sessão em andamento (convite aguardando resposta ou conversa aceita). */
export function isLiveSupportChatStatus(status?: string | null): boolean {
  return status === "Pending" || status === "Active";
}

/**
 * A sessão recebida deve ser adotada como a conversa visível desta janela?
 *
 * @param incoming sessão devolvida agora por `sessions/current`
 * @param known sessão que esta janela já estava exibindo/acompanhando
 */
export function shouldAdoptSupportChatSession(
  incoming: TicketChatSession | null | undefined,
  known: TicketChatSession | null | undefined,
): boolean {
  if (!incoming) return false;
  if (known && known.id === incoming.id) return true;
  return isLiveSupportChatStatus(incoming.status);
}
