import { api } from "./client";

const BASE = "/api/agent-updates";

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
    api.post<void>(`${BASE}/agents/${agentId}/force-check`),

  buildArtifact: (releaseId: string, data: unknown) =>
    api.post<unknown>(`${BASE}/releases/${releaseId}/build-artifact`, data),

  syncRepository: () =>
    api.post<unknown>(`${BASE}/repository/sync`),

  syncAndBuild: () =>
    api.post<unknown>(`${BASE}/repository/sync-and-build`),
};
