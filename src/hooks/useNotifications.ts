import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as signalR from "@microsoft/signalr";
import { notificationsApi, type AppNotification } from "@/api/notifications";
import { API_BASE_URL } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { getUserIdFromJwt } from "@/auth/jwt";

const NOTIFICATION_KEYS = {
  list: (recipientUserId: string | null, topic: string | undefined, limit: number) =>
    ["notifications", recipientUserId ?? "anonymous", topic ?? "all", limit] as const,
};

function resolveHubUrl(hubPath: string) {
  if (hubPath.startsWith("http://") || hubPath.startsWith("https://")) {
    return hubPath;
  }

  return `${API_BASE_URL}${hubPath}`;
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
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
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

export function useNotifications(options?: {
  topic?: string;
  limit?: number;
  enabled?: boolean;
}) {
  const { isAuthenticated, refreshSession, session } = useAuth();
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

  const query = useQuery({
    queryKey,
    queryFn: () =>
      notificationsApi.listRecent({
        recipientUserId: recipientUserId ?? undefined,
        topic,
        limit,
      }),
    enabled: canQuery,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!canQuery || !recipientUserId) return;

    let disposed = false;
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(resolveHubUrl("/hubs/notifications"), {
        accessTokenFactory: async () => {
          if (session.accessToken) return session.accessToken;
          const refreshed = await refreshSession();
          return refreshed ?? "";
        },
      })
      .withAutomaticReconnect([0, 2_000, 5_000, 10_000, 30_000])
      .withKeepAliveInterval(15_000)
      .withServerTimeout(60_000)
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    const subscribeGroups = async () => {
      await connection.invoke("SubscribeUser", recipientUserId);

      if (topic) {
        await connection.invoke("SubscribeTopic", topic);
      }
    };

    const onNotificationReceived = (notification: AppNotification) => {
      if (disposed) return;

      if (notification.recipientUserId && notification.recipientUserId !== recipientUserId) {
        return;
      }

      if (topic && notification.topic !== topic) {
        return;
      }

      queryClient.setQueryData<AppNotification[]>(queryKey, (current) =>
        upsertNotification(current, notification, limit),
      );
    };

    connection.on("NotificationReceived", onNotificationReceived);
    connection.onreconnected(() => subscribeGroups().catch(() => {}));

    const startPromise = connection
      .start()
      .then(async () => {
        if (disposed) return;
        await subscribeGroups();
      })
      .catch((error: unknown) => {
        if (disposed) return;

        if (
          error instanceof Error &&
          error.message.includes("before stop() was called")
        ) {
          return;
        }
      });

    return () => {
      disposed = true;
      connection.off("NotificationReceived", onNotificationReceived);

      void startPromise.finally(async () => {
        if (connection.state !== signalR.HubConnectionState.Disconnected) {
          await connection.stop();
        }
      });
    };
  }, [
    canQuery,
    limit,
    queryClient,
    queryKey,
    recipientUserId,
    refreshSession,
    session.accessToken,
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
        await notificationsApi.markAsRead(notificationId, { recipientUserId });
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
          notificationsApi.markAsRead(item.id, { recipientUserId }),
        ),
      );
    } catch (error) {
      queryClient.setQueryData(queryKey, previous);
      throw error;
    }
  }, [notifications, queryClient, queryKey, recipientUserId]);

  return {
    ...query,
    notifications,
    unreadCount,
    recipientUserId,
    markAsRead,
    markAllAsRead,
  };
}