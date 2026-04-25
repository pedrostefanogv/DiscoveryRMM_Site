import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ticketCustomFieldsApi } from "@/api";

const KEYS = {
  all: ["ticket-custom-fields"] as const,
  values: (ticketId: string) => [...KEYS.all, ticketId] as const,
};

export function useTicketCustomFields(ticketId: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.values(ticketId),
    queryFn: () => ticketCustomFieldsApi.list(ticketId),
    enabled: enabled && !!ticketId,
  });
}

export function useUpsertTicketCustomFieldValue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      definitionId,
      value,
    }: {
      ticketId: string;
      definitionId: string;
      value: unknown;
    }) => ticketCustomFieldsApi.upsert(ticketId, definitionId, value),
    onSuccess: (_result, vars) => {
      void queryClient.invalidateQueries({ queryKey: KEYS.values(vars.ticketId) });
      void queryClient.invalidateQueries({
        queryKey: ["tickets", "timeline", vars.ticketId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["tickets", "detail", vars.ticketId],
      });
    },
  });
}