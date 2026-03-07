import { Bell, CheckCheck, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Badge, Card } from "@/components/ui";
import { useReportNotifications } from "@/hooks";

export function ReportNotificationBell() {
  const [open, setOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
  } = useReportNotifications();

  const list = useMemo(() => notifications.slice(0, 20), [notifications]);

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
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Notificações</h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                  <CheckCheck className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              {list.length === 0 && (
                <p className="text-sm text-slate-400">Sem notificações.</p>
              )}
              {list.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => markAsRead(item.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      item.read
                        ? "border-white/10 bg-white/5"
                        : "border-primary/30 bg-primary/10"
                    }`}
                  >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeNotification(item.id);
                      }}
                      className="text-slate-500 hover:text-white"
                      aria-label="Remover notificação"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{item.message}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {new Date(item.createdAt).toLocaleString("pt-BR")}
                  </p>
                  </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
