import { api } from "./client";
import type {
  TicketAssignmentDecisionDto,
  TicketAssignmentResultDto,
} from "./types";

const BASE = "/api/v1/tickets/assignment";

/**
 * Triagem por IA da auto-atribuição de chamados. A rodada automática acontece
 * no background ao criar o chamado; estes endpoints servem para consultar a
 * decisão (com os candidatos avaliados) e para rodar a triagem sob demanda.
 */
export const ticketAssignmentApi = {
  /** Última decisão registrada para o chamado (404 quando não há nenhuma). */
  getDecision: (ticketId: string) =>
    api.get<TicketAssignmentDecisionDto>(BASE + "/" + ticketId + "/decision"),

  /** Executa a triagem e devolve a sugestão, sem alterar o chamado. */
  preview: (ticketId: string) =>
    api.post<TicketAssignmentResultDto>(BASE + "/" + ticketId + "/preview", {}),

  /** Executa a triagem e aplica o responsável escolhido. */
  apply: (ticketId: string) =>
    api.post<TicketAssignmentResultDto>(BASE + "/" + ticketId + "/apply", {}),

  /** Auditoria paginada das decisões (filtros opcionais). */
  listDecisions: (
    params: {
      departmentId?: string;
      ticketId?: string;
      chosenUserId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) =>
    api.get<TicketAssignmentDecisionDto[]>(
      BASE + "/decisions",
      params as Record<string, unknown>,
    ),
};
