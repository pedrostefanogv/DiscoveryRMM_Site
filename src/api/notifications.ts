import { api } from "./client";

export type AppNotificationSeverity =
  | "Informational"
  | "Warning"
  | "Critical"
  | string;

export interface AppNotification {
  id: string;
  eventType: string;
  topic: string;
  severity: AppNotificationSeverity;
  recipientUserId?: string | null;
  recipientAgentId?: string | null;
  recipientKey?: string | null;
  title: string;
  message: string;
  payloadJson?: string | null;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
  createdBy?: string | null;
}

export interface ListNotificationsParams {
  recipientUserId?: string;
  recipientAgentId?: string;
  topic?: string;
  isRead?: boolean;
  limit?: number;
}

export interface MarkNotificationAsReadParams {
  userId?: string;
  agentId?: string;
}

export interface DeleteNotificationParams {
  userId?: string;
  agentId?: string;
}

function buildQueryString(params: Record<string, unknown>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export const notificationsApi = {
  list: (params: ListNotificationsParams = {}) =>
    api.get<AppNotification[]>(
      `/api/v1/notifications${buildQueryString(params as Record<string, unknown>)}`,
    ),

  markAsRead: (id: string, params: MarkNotificationAsReadParams = {}) =>
    api.put<void>(
      `/api/v1/notifications/${id}/read${buildQueryString(params as Record<string, unknown>)}`,
      {},
    ),

  delete: (id: string, params: DeleteNotificationParams = {}) =>
    api.del<void>(
      `/api/v1/notifications/${id}${buildQueryString(params as Record<string, unknown>)}`,
    ),
};
