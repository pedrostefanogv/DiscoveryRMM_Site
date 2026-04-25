import { api } from "./client";
import type {
  Department,
  CreateDepartmentRequest,
  UpdateDepartmentRequest,
} from "./types";

const BASE = "/api/departments";

export const departmentsApi = {
  listGlobal: () => api.get<Department[]>(`${BASE}/global`),

  list: (
    params: {
      clientId?: string;
      includeGlobal?: boolean;
      activeOnly?: boolean;
    } = {},
  ) => api.get<Department[]>(BASE, params as Record<string, unknown>),

  get: (id: string) => api.get<Department>(`${BASE}/${id}`),

  create: (data: CreateDepartmentRequest) => api.post<Department>(BASE, data),

  update: (id: string, data: UpdateDepartmentRequest) =>
    api.put<Department>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),
};
