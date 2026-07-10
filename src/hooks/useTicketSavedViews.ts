import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ticketSavedViewsApi } from "@/api/ticket-saved-views";
import type {
  CreateTicketSavedViewRequest,
  CursorPageDto,
  TicketSavedView,
  UpdateTicketSavedViewRequest,
} from "@/api";

const KEYS = {
  all: ["ticket-saved-views"] as const,
  list: (userId?: string | null) =>
    [...KEYS.all, "list", userId ?? "shared"] as const,
};

function normalizeArray<T>(data: CursorPageDto<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return (data as CursorPageDto<T>).items ?? [];
}

export function useTicketSavedViews(userId?: string | null, enabled = true) {
  return useQuery({
    queryKey: KEYS.list(userId),
    queryFn: () => ticketSavedViewsApi.list(userId ?? undefined),
    enabled,
    select: (data) =>
      normalizeArray(
        data as CursorPageDto<TicketSavedView> | TicketSavedView[],
      ),
  });
}

export function useCreateTicketSavedView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTicketSavedViewRequest) =>
      ticketSavedViewsApi.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useUpdateTicketSavedView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateTicketSavedViewRequest;
    }) => ticketSavedViewsApi.update(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useDeleteTicketSavedView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketSavedViewsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}
