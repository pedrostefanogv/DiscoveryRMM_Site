import { api } from "./client";
import type {
  BackgroundBackfillStateDto,
  BackgroundProcessingSettings,
  BackgroundScheduleSnapshot,
  ProcessingScopeStateDto,
} from "./types";

const BASE = "/api/v1/configurations/background-processing";

function scopeQuery(clientId?: string | null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (clientId) params.set("clientId", clientId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Ciclos de processamento em segundo plano: configuração efetiva (global +
 * override do cliente), estado por escopo, tick aplicado no scheduler e
 * backfill de snapshots.
 */
export const backgroundProcessingApi = {
  effective: (clientId?: string | null) =>
    api.get<BackgroundProcessingSettings>(`${BASE}/effective`, clientId ? { clientId } : {}),

  status: (clientId?: string | null) =>
    api.get<ProcessingScopeStateDto[]>(`${BASE}/status`, clientId ? { clientId } : {}),

  schedule: () => api.get<BackgroundScheduleSnapshot>(`${BASE}/schedule`),

  requestBackfill: (clientId?: string | null, purgeOrphans = false) =>
    api.post<BackgroundBackfillStateDto>(
      `${BASE}/backfill${scopeQuery(clientId, purgeOrphans ? { purgeOrphans: "true" } : {})}`,
      {},
    ),

  cancelBackfill: (clientId?: string | null) =>
    api.post<void>(`${BASE}/backfill/cancel${scopeQuery(clientId)}`, {}),
};
