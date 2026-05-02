import { api } from "./client";
import type {
  WorkflowProfile,
  CreateWorkflowProfileRequest,
  UpdateWorkflowProfileRequest,
} from "./types";

const BASE = "/api/v1/workflowprofiles";

export const workflowProfilesApi = {
  listGlobal: () => api.get<WorkflowProfile[]>(`${BASE}/global`),

  list: (params: { clientId?: string; includeGlobal?: boolean } = {}) =>
    api.get<WorkflowProfile[]>(BASE, params as Record<string, unknown>),

  listByDepartment: (departmentId: string) =>
    api.get<WorkflowProfile[]>(`${BASE}/by-department/${departmentId}`),

  get: (id: string) => api.get<WorkflowProfile>(`${BASE}/${id}`),

  create: (data: CreateWorkflowProfileRequest) =>
    api.post<WorkflowProfile>(BASE, data),

  update: (id: string, data: UpdateWorkflowProfileRequest) =>
    api.put<WorkflowProfile>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),
};
