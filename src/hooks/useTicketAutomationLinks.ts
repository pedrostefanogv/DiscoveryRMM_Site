import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ticketAutomationLinksApi } from "@/api/ticket-automation-links";
import type {
  CreateTicketAutomationLinkRequest,
  ReviewTicketAutomationLinkRequest,
} from "@/api";

const KEYS = {
  all: ["ticket-automation-links"] as const,
  list: (ticketId: string) => [...KEYS.all, ticketId] as const,
};

export function useTicketAutomationLinks(ticketId: string) {
  return useQuery({
    queryKey: KEYS.list(ticketId),
    queryFn: () => ticketAutomationLinksApi.list(ticketId),
    enabled: !!ticketId,
  });
}

export function useCreateTicketAutomationLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      data,
    }: {
      ticketId: string;
      data: CreateTicketAutomationLinkRequest;
    }) => ticketAutomationLinksApi.create(ticketId, data),
    onSuccess: (_result, vars) => {
      void queryClient.invalidateQueries({ queryKey: KEYS.list(vars.ticketId) });
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export function useApproveTicketAutomationLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      linkId,
      data,
    }: {
      ticketId: string;
      linkId: string;
      data: ReviewTicketAutomationLinkRequest;
    }) => ticketAutomationLinksApi.approve(ticketId, linkId, data),
    onSuccess: (_result, vars) => {
      void queryClient.invalidateQueries({ queryKey: KEYS.list(vars.ticketId) });
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}

export function useRejectTicketAutomationLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      linkId,
      data,
    }: {
      ticketId: string;
      linkId: string;
      data: ReviewTicketAutomationLinkRequest;
    }) => ticketAutomationLinksApi.reject(ticketId, linkId, data),
    onSuccess: (_result, vars) => {
      void queryClient.invalidateQueries({ queryKey: KEYS.list(vars.ticketId) });
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}