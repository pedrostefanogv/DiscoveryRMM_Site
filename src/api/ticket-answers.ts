import { api } from "./client";

export interface TicketAnswerItem {
  questionKey: string;
  questionLabel: string;
  valueText: string | null;
  valueJson: string;
  createdAt: string | null;
}

function normalizeAnswer(raw: Record<string, unknown>): TicketAnswerItem {
  return {
    questionKey: String(raw.questionKey ?? raw.QuestionKey ?? ""),
    questionLabel: String(raw.questionLabel ?? raw.QuestionLabel ?? raw.questionKey ?? ""),
    valueText:
      raw.valueText === null || raw.valueText === undefined
        ? null
        : String(raw.valueText ?? raw.ValueText),
    valueJson: String(raw.valueJson ?? raw.ValueJson ?? "null"),
    createdAt:
      raw.createdAt === null || raw.createdAt === undefined
        ? null
        : String(raw.createdAt ?? raw.CreatedAt),
  };
}

export const ticketAnswersApi = {
  async list(ticketId: string): Promise<TicketAnswerItem[]> {
    const raw = await api.get<unknown>(`/api/v1/tickets/${ticketId}/answers`);
    if (Array.isArray(raw)) {
      return (raw as Array<Record<string, unknown>>).map(normalizeAnswer);
    }
    const record = raw as Record<string, unknown> | null;
    if (record && Array.isArray(record.items)) {
      return (record.items as Array<Record<string, unknown>>).map(normalizeAnswer);
    }
    return [];
  },
};
