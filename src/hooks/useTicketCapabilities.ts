import { useQuery } from "@tanstack/react-query";
import { ticketsApi } from "@/api";
import type { TicketCapabilities } from "@/api/tickets";

const KEYS = {
  capabilities: (id: string) => ["tickets", "capabilities", id] as const,
  myDepartments: () => ["tickets", "my-departments"] as const,
};

/**
 * Capacidades do usuário autenticado sobre um chamado.
 *
 * FONTE ÚNICA: a decisão vem do backend (GET /tickets/{id}/capabilities). O
 * console NÃO reimplementa a regra — antes não havia nenhum gate por
 * departamento nem por autoria, e o botão "Alterar estado" (que fecha o
 * chamado) era renderizado para qualquer pessoa.
 *
 * Enquanto a consulta carrega, o padrão é NEGAR (fail-closed): é melhor um
 * botão aparecer um instante depois do que uma ação proibida ficar disponível
 * para quem não pode executá-la.
 */
export function useTicketCapabilities(ticketId: string | undefined) {
  const query = useQuery({
    queryKey: KEYS.capabilities(ticketId ?? ""),
    queryFn: () => ticketsApi.getCapabilities(ticketId!),
    enabled: !!ticketId,
    staleTime: 30_000,
  });

  const denied: TicketCapabilities = {
    canView: false,
    canTreat: false,
    canEdit: false,
    canAssign: false,
    canMerge: false,
    canDelete: false,
    canExecuteRunbook: false,
    canSeeInternalNotes: false,
    canClose: false,
    closableStateIds: [],
    isRequester: false,
    isDepartmentTeamMember: false,
    shadowMode: false,
    reason: null,
    code: null,
  };

  return {
    capabilities: query.data ?? denied,
    isLoading: query.isLoading,
    /** true quando as capacidades reais já chegaram (evita piscar a UI). */
    isResolved: query.isSuccess,
    refetch: query.refetch,
  };
}

/**
 * Departamentos em que o usuário é membro ativo do time.
 * Usado pela fila "Meu time". Lista vazia = sem vínculo (não é erro).
 */
export function useMyDepartments() {
  return useQuery({
    queryKey: KEYS.myDepartments(),
    queryFn: () => ticketsApi.getMyDepartments(),
    staleTime: 5 * 60_000,
  });
}
