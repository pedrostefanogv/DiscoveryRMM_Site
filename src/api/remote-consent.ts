import { api } from "./client";

export type RemoteConsentSubjectType = "User" | "UserGroup";
export type RemoteConsentMode = "Off" | "NotifyOnly" | "Prompt";
export type RemoteConsentTimeoutAction = "Deny" | "Approve";

export interface RemoteConsentSourceDto {
  source: string;
  scopeId?: string | null;
  subjectName?: string | null;
}

export interface RemoteConsentEffective {
  agentId: string;
  userId?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  mode: RemoteConsentMode;
  timeoutSeconds: number;
  timeoutAction: RemoteConsentTimeoutAction;
  showBanner: boolean;
  message: string;
  bannerText: string;
  topSource: string;
  sources: Record<string, RemoteConsentSourceDto>;
}

export interface RemoteConsentOverride {
  id: string;
  subjectType: RemoteConsentSubjectType;
  subjectId: string;
  clientId?: string | null;
  siteId?: string | null;
  mode?: RemoteConsentMode | null;
  timeoutSeconds?: number | null;
  timeoutAction?: RemoteConsentTimeoutAction | null;
  showBanner?: boolean | null;
  message?: string | null;
  bannerText?: string | null;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface RemoteConsentOverrideRequest {
  subjectType: RemoteConsentSubjectType;
  subjectId: string;
  clientId?: string | null;
  siteId?: string | null;
  mode?: RemoteConsentMode | null;
  timeoutSeconds?: number | null;
  timeoutAction?: RemoteConsentTimeoutAction | null;
  showBanner?: boolean | null;
  message?: string | null;
  bannerText?: string | null;
}

const BASE = "/api/v1/remote-consent";

export const remoteConsentApi = {
  getEffective: (agentId: string, userId?: string): Promise<RemoteConsentEffective> =>
    api.get<RemoteConsentEffective>(`${BASE}/effective?agentId=${agentId}${userId ? `&userId=${userId}` : ""}`),

  listOverrides: (params?: { subjectType?: RemoteConsentSubjectType; subjectId?: string }): Promise<RemoteConsentOverride[]> => {
    const query = new URLSearchParams();
    if (params?.subjectType) query.set("subjectType", params.subjectType);
    if (params?.subjectId) query.set("subjectId", params.subjectId);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return api.get<RemoteConsentOverride[]>(`${BASE}/overrides${suffix}`);
  },

  createOverride: (request: RemoteConsentOverrideRequest): Promise<RemoteConsentOverride> =>
    api.post<RemoteConsentOverride>(`${BASE}/overrides`, request),

  updateOverride: (id: string, request: RemoteConsentOverrideRequest): Promise<RemoteConsentOverride> =>
    api.put<RemoteConsentOverride>(`${BASE}/overrides/${id}`, request),

  deleteOverride: (id: string): Promise<void> =>
    api.del<void>(`${BASE}/overrides/${id}`),
};
