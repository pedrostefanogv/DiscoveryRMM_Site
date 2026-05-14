import { useMemo, useState } from "react";
import { Bell, CheckCheck, RefreshCw, X } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button, Card, Loading } from "@/components/ui";
import { useNotifications } from "@/hooks/useNotifications";

function getSeverityColor(severity: string): "slate" | "warning" | "danger" | "primary" {
  const normalized = severity.trim().toLowerCase();

  if (normalized === "critical") return "danger";
  if (normalized === "warning") return "warning";
  if (normalized === "informational") return "primary";
  return "slate";
}

function getSeverityLabel(severity: string) {
  const normalized = severity.trim().toLowerCase();

  if (normalized === "critical") return "Critico";
  if (normalized === "warning") return "Aviso";
  if (normalized === "informational") return "Info";
  return severity;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    isLoading,
    isFetching,
    markAsRead,
    markAllAsRead,
    refetch,
  } = useNotifications({ limit: 50 });

  const list = useMemo(() => notifications.slice(0, 20), [notifications]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await markAsRead(notificationId);
    } catch {
      toast.error("Não foi possível marcar a notificação como lida.");
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
    } catch {
      toast.error("Não foi possível marcar todas as notificações como lidas.");
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Abrir notificações"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <Badge color="danger">{unreadCount > 99 ? "99+" : unreadCount}</Badge>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[28rem] max-w-[90vw]">
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Notificacoes</h3>
                <p className="text-xs text-slate-400">
                  {isFetching ? "Sincronizando..." : `${notifications.length} item(ns)`}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => void refetch()}>
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void handleMarkAllAsRead()}>
                  <CheckCheck className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              {isLoading && list.length === 0 && <Loading />}

              {!isLoading && list.length === 0 && (
                <p className="text-sm text-slate-400">Sem notificações.</p>
              )}

              {list.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleMarkAsRead(item.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    item.isRead
                      ? "border-white/10 bg-white/5"
                      : "border-primary/30 bg-primary/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <Badge color={getSeverityColor(item.severity)}>
                      {getSeverityLabel(item.severity)}
                    </Badge>
                  </div>

                  <p className="mt-1 text-xs text-slate-400">{item.message}</p>

                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>{item.topic || item.eventType}</span>
                    <span>{new Date(item.createdAt).toLocaleString("pt-BR")}</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}