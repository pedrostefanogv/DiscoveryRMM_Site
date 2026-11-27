import { api } from "./client";

const BASE = "/api/v1/agent-updates";

export const agentUpdatesApi = {
  listReleases: () => api.get<unknown[]>(`${BASE}/releases`),

  getRelease: (releaseId: string) =>
    api.get<unknown>(`${BASE}/releases/${releaseId}`),

  createRelease: (data: unknown) =>
    api.post<unknown>(`${BASE}/releases`, data),

  updateRelease: (releaseId: string, data: unknown) =>
    api.put<unknown>(`${BASE}/releases/${releaseId}`, data),

  deleteRelease: (releaseId: string) =>
    api.del<void>(`${BASE}/releases/${releaseId}`),

  promoteRelease: (releaseId: string) =>
    api.post<unknown>(`${BASE}/releases/${releaseId}/promote`),

  uploadArtifacts: (releaseId: string, formData: FormData) =>
    api.post<unknown>(`${BASE}/releases/${releaseId}/artifacts`, formData),

  deleteArtifact: (artifactId: string) =>
    api.del<void>(`${BASE}/artifacts/${artifactId}`),

  getAgentUpdateEvents: (agentId: string) =>
    api.get<unknown[]>(`${BASE}/agents/${agentId}/events`),

  getRolloutDashboard: () =>
    api.get<unknown>(`${BASE}/dashboard/rollout`),

  forceAgentCheck: (agentId: string) =>
    api.post<void>(`${BASE}/agents/${agentId}/force-update`),

  buildArtifact: (releaseId: string, data: unknown) =>
    api.post<unknown>(`${BASE}/releases/${releaseId}/build-artifact`, data),

  syncRepository: () =>
    api.post<unknown>(`${BASE}/repository/sync`),

  // ?wait=true preserva o contrato síncrono antigo (a UI espera o build publicado).
  // Sem o parâmetro o endpoint responde 202 e o build roda em background —
  // acompanhe por getRebuildStatus().
  syncAndBuild: () =>
    api.post<unknown>(`${BASE}/build/rebuild?wait=true`),

  refreshBuild: () =>
    api.post<unknown>(`${BASE}/build/rebuild?wait=true`),

  getRebuildStatus: () =>
    api.get<unknown>(`${BASE}/build/rebuild/status`),
};
