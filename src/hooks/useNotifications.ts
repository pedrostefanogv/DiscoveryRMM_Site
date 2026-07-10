import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, type AppNotification } from "@/api/notifications";
import { getNatsService, type DashboardEvent } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";
import { useAuth } from "@/auth/AuthContext";
import { getUserIdFromJwt } from "@/auth/jwt";

const NOTIFICATION_KEYS = {
  list: (
    recipientUserId: string | null,
    topic: string | undefined,
    limit: number,
  ) =>
    [
      "notifications",
      recipientUserId ?? "anonymous",
      topic ?? "all",
      limit,
    ] as const,
};

const NATS_ENABLED = realtimeConfig.useNats && realtimeConfig.natsEnabled;
const NATS_NOTIFICATIONS_SUBJECT_TEMPLATE =
  import.meta.env.VITE_NATS_NOTIFICATIONS_SUBJECT_TEMPLATE ?? "";

function resolveNatsNotificationsSubject(
  recipientUserId: string,
  topic: string | undefined,
): string | null {
  const template = NATS_NOTIFICATIONS_SUBJECT_TEMPLATE.trim();
  if (!template) return null;

  let subject = template.replaceAll("{userId}", recipientUserId);
  if (topic) {
    subject = subject.replaceAll("{topic}", topic);
  }

  if (subject.includes("{userId}") || subject.includes("{topic}")) {
    return null;
  }

  const normalized = subject.trim();
  return normalized.length > 0 ? normalized : null;
}

function upsertNotification(
  current: AppNotification[] | undefined,
  incoming: AppNotification,
  limit: number,
) {
  const items = current ?? [];
  const existingIndex = items.findIndex((item) => item.id === incoming.id);

  if (existingIndex >= 0) {
    const next = [...items];
    next[existingIndex] = {
      ...next[existingIndex],
      ...incoming,
    };
    return next;
  }

  return [incoming, ...items]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )
    .slice(0, limit);
}

function markNotificationAsRead(
  current: AppNotification[] | undefined,
  notificationId: string,
) {
  if (!current) return current;

  return current.map((item) =>
    item.id === notificationId
      ? {
          ...item,
          isRead: true,
          readAt: item.readAt ?? new Date().toISOString(),
        }
      : item,
  );
}

function markAllNotificationsAsRead(current: AppNotification[] | undefined) {
  if (!current) return current;

  const readAt = new Date().toISOString();
  return current.map((item) => ({
    ...item,
    isRead: true,
    readAt: item.readAt ?? readAt,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOptionalString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readOptionalBoolean(
  source: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = source[key];
  if (typeof value === "boolean") return value;
  return undefined;
}

function safeStringify(value: unknown): string | null {
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? json : null;
  } catch {
    return null;
  }
}

function toNotificationPayload(
  message: DashboardEvent | Record<string, unknown>,
  fallbackTopic: string | undefined,
): AppNotification | null {
  if (!isRecord(message)) return null;

  const payload = isRecord(message.data) ? message.data : message;
  const id = readOptionalString(payload, "id");
  if (!id) return null;

  const payloadJson =
    readOptionalString(payload, "payloadJson") ??
    ("payload" in payload ? safeStringify(payload.payload) : null);

  return {
    id,
    eventType:
      readOptionalString(payload, "eventType") ?? "NotificationReceived",
    topic: readOptionalString(payload, "topic") ?? fallbackTopic ?? "general",
    severity: readOptionalString(payload, "severity") ?? "Informational",
    recipientUserId: readOptionalString(payload, "recipientUserId") ?? null,
    recipientAgentId: readOptionalString(payload, "recipientAgentId") ?? null,
    recipientKey: readOptionalString(payload, "recipientKey") ?? null,
    title: readOptionalString(payload, "title") ?? "Notificação",
    message: readOptionalString(payload, "message") ?? "",
    payloadJson,
    isRead: readOptionalBoolean(payload, "isRead") ?? false,
    createdAt:
      readOptionalString(payload, "createdAt") ?? new Date().toISOString(),
    readAt: readOptionalString(payload, "readAt") ?? null,
    createdBy: readOptionalString(payload, "createdBy") ?? null,
  };
}

export function useNotifications(options?: {
  topic?: string;
  limit?: number;
  enabled?: boolean;
}) {
  const { isAuthenticated, session } = useAuth();
  const queryClient = useQueryClient();
  const topic = options?.topic;
  const limit = options?.limit ?? 50;
  const enabled = options?.enabled ?? true;

  const recipientUserId = useMemo(
    () => getUserIdFromJwt(session.accessToken),
    [session.accessToken],
  );
  const queryKey = useMemo(
    () => NOTIFICATION_KEYS.list(recipientUserId, topic, limit),
    [limit, recipientUserId, topic],
  );
  const canQuery = enabled && isAuthenticated && !!recipientUserId;

  const notificationSubject = useMemo(() => {
    if (!recipientUserId) return null;
    return resolveNatsNotificationsSubject(recipientUserId, topic);
  }, [recipientUserId, topic]);

  const query = useQuery({
    queryKey,
    queryFn: () =>
      notificationsApi.list({
        recipientUserId: recipientUserId ?? undefined,
        topic,
        limit,
      }),
    enabled: canQuery,
    staleTime: 15_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    const canUseNats =
      canQuery &&
      NATS_ENABLED &&
      !!realtimeConfig.natsUrl &&
      !!recipientUserId &&
      !!notificationSubject;

    if (!canUseNats || !recipientUserId || !notificationSubject) {
      return;
    }

    let disposed = false;

    const natsService = getNatsService({
      url: realtimeConfig.natsUrl,
      enabled: true,
      authMode: realtimeConfig.natsAuthMode,
      scopeMode: "preserve",
    });

    const onNotificationMessage = (
      message: DashboardEvent | Record<string, unknown>,
    ) => {
      if (disposed) return;

      const notification = toNotificationPayload(message, topic);
      if (!notification) return;

      if (
        notification.recipientUserId &&
        notification.recipientUserId !== recipientUserId
      ) {
        return;
      }

      if (topic && notification.topic !== topic) {
        return;
      }

      queryClient.setQueryData<AppNotification[]>(queryKey, (current) =>
        upsertNotification(current, notification, limit),
      );
    };

    void (async () => {
      const connected = await natsService.connect();
      if (disposed || !connected) {
        // Polling keeps notifications functional even if NATS is unavailable.
        return;
      }

      void natsService.subscribe(notificationSubject, onNotificationMessage, {
        connectIfNeeded: false,
      });
    })();

    return () => {
      disposed = true;
      natsService.unsubscribe(notificationSubject, onNotificationMessage);
    };
  }, [
    canQuery,
    limit,
    notificationSubject,
    queryClient,
    queryKey,
    recipientUserId,
    topic,
  ]);

  const notifications = query.data ?? [];
  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications],
  );

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!recipientUserId) return;

      const previous = queryClient.getQueryData<AppNotification[]>(queryKey);
      queryClient.setQueryData<AppNotification[]>(queryKey, (current) =>
        markNotificationAsRead(current, notificationId),
      );

      try {
        await notificationsApi.markAsRead(notificationId, {
          userId: recipientUserId,
        });
      } catch (error) {
        queryClient.setQueryData(queryKey, previous);
        throw error;
      }
    },
    [queryClient, queryKey, recipientUserId],
  );

  const markAllAsRead = useCallback(async () => {
    if (!recipientUserId) return;

    const unread = notifications.filter((item) => !item.isRead);
    if (unread.length === 0) return;

    const previous = queryClient.getQueryData<AppNotification[]>(queryKey);
    queryClient.setQueryData<AppNotification[]>(queryKey, (current) =>
      markAllNotificationsAsRead(current),
    );

    try {
      await Promise.all(
        unread.map((item) =>
          notificationsApi.markAsRead(item.id, { userId: recipientUserId }),
        ),
      );
    } catch (error) {
      queryClient.setQueryData(queryKey, previous);
      throw error;
    }
  }, [notifications, queryClient, queryKey, recipientUserId]);

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (!recipientUserId) return;

      const previous = queryClient.getQueryData<AppNotification[]>(queryKey);
      queryClient.setQueryData<AppNotification[]>(queryKey, (current) =>
        (current ?? []).filter((item) => item.id !== notificationId),
      );

      try {
        await notificationsApi.delete(notificationId, {
          userId: recipientUserId,
        });
      } catch (error) {
        queryClient.setQueryData(queryKey, previous);
        throw error;
      }
    },
    [queryClient, queryKey, recipientUserId],
  );

  return {
    ...query,
    notifications,
    unreadCount,
    recipientUserId,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}
