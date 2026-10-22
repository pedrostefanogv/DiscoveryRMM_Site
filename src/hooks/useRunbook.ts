import { useMutation } from "@tanstack/react-query";
import { runbookApi, type RunbookExecuteRequest, type RunbookExecuteResultDto } from "@/api/runbook";

export function useExecuteRunbook(ticketId: string) {
  return useMutation({
    mutationFn: (body: RunbookExecuteRequest): Promise<RunbookExecuteResultDto> =>
      runbookApi.execute(ticketId, body),
  });
}
