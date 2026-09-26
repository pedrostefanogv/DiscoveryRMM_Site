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

export type TicketAnswerSearchMode = "semantic" | "keyword" | "disabled";

export interface TicketAnswerSearchHitItem {
  ticketId: string;
  ticketTitle: string;
  clientId: string | null;
  siteId: string | null;
  questionKey: string;
  questionLabel: string;
  valueText: string;
  /** 1 - distância cosine (quanto maior, mais similar). */
  score: number;
  ticketCreatedAt: string | null;
}

export interface TicketAnswerSearchResponse {
  mode: TicketAnswerSearchMode;
  hits: TicketAnswerSearchHitItem[];
  elapsedMs: number;
}

function normalizeSearchHit(raw: Record<string, unknown>): TicketAnswerSearchHitItem {
  const distance = Number(raw.distance ?? raw.Distance ?? 1);
  return {
    ticketId: String(raw.ticketId ?? raw.TicketId ?? ""),
    ticketTitle: String(raw.ticketTitle ?? raw.TicketTitle ?? ""),
    clientId:
      raw.clientId === null || raw.clientId === undefined
        ? null
        : String(raw.clientId ?? raw.ClientId) || null,
    siteId:
      raw.siteId === null || raw.siteId === undefined
        ? null
        : String(raw.siteId ?? raw.SiteId) || null,
    questionKey: String(raw.questionKey ?? raw.QuestionKey ?? ""),
    questionLabel: String(raw.questionLabel ?? raw.QuestionLabel ?? ""),
    valueText: String(raw.valueText ?? raw.ValueText ?? ""),
    score: Number.isFinite(distance) ? Math.max(0, 1 - distance) : 0,
    ticketCreatedAt:
      raw.ticketCreatedAt === null || raw.ticketCreatedAt === undefined
        ? null
        : String(raw.ticketCreatedAt ?? raw.TicketCreatedAt) || null,
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

  /** Busca chamados pela resposta do questionário (semântica com fallback por texto). */
  async search(params: {
    q: string;
    limit?: number;
    templateId?: string;
    questionKey?: string;
    minSimilarity?: number;
    signal?: AbortSignal;
  }): Promise<TicketAnswerSearchResponse> {
    const raw = await api.get<Record<string, unknown>>(
      "/api/v1/tickets/search/answers",
      {
        q: params.q,
        limit: params.limit,
        templateId: params.templateId,
        questionKey: params.questionKey,
        minSimilarity: params.minSimilarity,
      } as Record<string, unknown>,
      params.signal ? { signal: params.signal } : undefined,
    );

    const mode = String(raw.mode ?? raw.Mode ?? "keyword") as TicketAnswerSearchMode;
    const hitsRaw = (raw.hits ?? raw.Hits ?? []) as Array<Record<string, unknown>>;

    return {
      mode,
      hits: Array.isArray(hitsRaw) ? hitsRaw.map(normalizeSearchHit) : [],
      elapsedMs: Number(raw.elapsedMs ?? raw.ElapsedMs ?? 0) || 0,
    };
  },
};
