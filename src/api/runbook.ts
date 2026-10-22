import { api } from "./client";

// ── Runbook de chamado (POST /api/v1/tickets/{ticketId}/runbook/execute) ──

export interface TicketMacroRunbookStep {
  order: number;
  automationScriptId: string;
  argsJson?: string | null;
  evidenceLabel?: string | null;
}

export interface RunbookExecuteRequest {
  macroId: string;
}

export interface RunbookStepResultDto {
  order: number;
  scriptId: string;
  ok: boolean;
  exitCode: number | null;
  outputPreview: string | null;
  /** Id do comentário de evidência criado no chamado (quando houver). */
  commentId: string | null;
  durationMs: number;
}

export interface RunbookExecuteResultDto {
  ticketId: string;
  steps: RunbookStepResultDto[];
}

export const runbookApi = {
  execute: (ticketId: string, body: RunbookExecuteRequest) =>
    api.post<RunbookExecuteResultDto>(
      `/api/v1/tickets/${encodeURIComponent(ticketId)}/runbook/execute`,
      body,
    ),
};
