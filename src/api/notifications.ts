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
  recipientKey?: string;
  topic?: string;
  severity?: AppNotificationSeverity | number;
  isRead?: boolean;
  limit?: number;
}

export interface MarkNotificationAsReadParams {
  recipientUserId?: string;
  recipientAgentId?: string;
  recipientKey?: string;
}

function buildQueryString(params: object) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function buildMarkAsReadPath(
  id: string,
  params: MarkNotificationAsReadParams = {},
) {
  return `/api/v1/notifications/${id}/read${buildQueryString(params)}`;
}

export const notificationsApi = {
  listRecent: (params: ListNotificationsParams = {}) =>
    api.get<AppNotification[]>(
      "/api/v1/notifications",
      params as unknown as Record<string, unknown>,
    ),

  markAsRead: (id: string, params: MarkNotificationAsReadParams = {}) =>
    api.patch<void>(buildMarkAsReadPath(id, params), {}),
};