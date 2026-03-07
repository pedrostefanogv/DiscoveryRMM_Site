import { useEffect, useMemo, useState } from "react";

const NOTIFICATIONS_KEY = "meduza_report_notifications";
const MAX_NOTIFICATIONS = 120;

export type ReportNotificationType = "info" | "success" | "warning" | "error";

export interface ReportNotification {
  id: string;
  title: string;
  message: string;
  type: ReportNotificationType;
  createdAt: string;
  read: boolean;
}

export function useReportNotifications() {
  const [notifications, setNotifications] = useState<ReportNotification[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as ReportNotification[];
      setNotifications(parsed);
    } catch {
      setNotifications([]);
    }
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const persist = (items: ReportNotification[]) => {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(items));
    setNotifications(items);
  };

  const addNotification = (item: {
    title: string;
    message: string;
    type?: ReportNotificationType;
    browserNotify?: boolean;
  }) => {
    const next: ReportNotification = {
      id: crypto.randomUUID(),
      title: item.title,
      message: item.message,
      type: item.type ?? "info",
      createdAt: new Date().toISOString(),
      read: false,
    };

    const merged = [next, ...notifications].slice(0, MAX_NOTIFICATIONS);
    persist(merged);

    if (item.browserNotify && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(item.title, { body: item.message });
      } else if (Notification.permission === "default") {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            new Notification(item.title, { body: item.message });
          }
        });
      }
    }
  };

  const markAsRead = (id: string) => {
    persist(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = () => {
    persist(notifications.map((n) => ({ ...n, read: true })));
  };

  const removeNotification = (id: string) => {
    persist(notifications.filter((n) => n.id !== id));
  };

  const clearAll = () => {
    localStorage.removeItem(NOTIFICATIONS_KEY);
    setNotifications([]);
  };

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
  };
}
