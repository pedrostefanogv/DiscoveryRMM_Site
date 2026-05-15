import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, RefreshCw, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button, Card, Loading } from "@/components/ui";
import { useNotifications } from "@/hooks/useNotifications";
import type { AppNotification } from "@/api/notifications";

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

interface NavigationTarget {
  path: string;
  label: string;
}

function parseNavigationTarget(payloadJson: string | null | undefined): NavigationTarget | null {
  if (!payloadJson) return null;

  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    const ticketId = String(parsed.ticketId ?? parsed.ticket_id ?? "");
    const agentId = String(parsed.agentId ?? parsed.agent_id ?? "");
    const clientId = String(parsed.clientId ?? parsed.client_id ?? "");

    if (ticketId) return { path: `/tickets/${ticketId}`, label: "chamado" };
    if (agentId) return { path: `/agents/${agentId}`, label: "agente" };
    if (clientId) return { path: `/clients/${clientId}`, label: "cliente" };

    return null;
  } catch {
    return null;
  }
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const {
    notifications,
    unreadCount,
    isLoading,
    isFetching,
    markAsRead,
    markAllAsRead,
    refetch,
  } = useNotifications({ limit: 50 });

  const visibleList = useMemo(
    () => notifications
      .filter(item => !dismissedIds.has(item.id))
      .slice(0, 20),
    [notifications, dismissedIds],
  );

  const handleNotificationClick = async (item: AppNotification) => {
    try {
      await markAsRead(item.id);
    } catch {
      toast.error("Não foi possível marcar a notificação como lida.");
    }

    const target = parseNavigationTarget(item.payloadJson);
    if (target) {
      setOpen(false);
      navigate(target.path);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      toast.success("Todas marcadas como lidas.");
    } catch {
      toast.error("Não foi possível marcar todas as notificações como lidas.");
    }
  };

  const handleDismissReadAll = () => {
    const readIds = notifications
      .filter(item => item.isRead)
      .map(item => item.id);

    if (readIds.length === 0) {
      toast("Nenhuma notificação lida para limpar.");
      return;
    }

    setDismissedIds(prev => {
      const next = new Set(prev);
      readIds.forEach(id => next.add(id));
      return next;
    });
    toast.success(`${readIds.length} notificação(ns) lida(s) removida(s).`);
  };

  const handleDismissNotification = (notificationId: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(notificationId);
      return next;
    });
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
                  {isFetching ? "Sincronizando..." : `${visibleList.length} item(ns)`}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => void refetch()}>
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void handleMarkAllAsRead()}>
                  <CheckCheck className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDismissReadAll}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              {isLoading && visibleList.length === 0 && <Loading />}

              {!isLoading && visibleList.length === 0 && (
                <p className="text-sm text-slate-400">Sem notificações.</p>
              )}

              {visibleList.map((item) => {
                const target = parseNavigationTarget(item.payloadJson);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void handleNotificationClick(item)}
                    className={`group relative w-full rounded-lg border p-3 text-left transition ${
                      item.isRead
                        ? "border-white/10 bg-white/5"
                        : "border-primary/30 bg-primary/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">{item.title}</p>
                      <div className="flex items-center gap-2">
                        <Badge color={getSeverityColor(item.severity)}>
                          {getSeverityLabel(item.severity)}
                        </Badge>
                        {item.isRead ? (
                          <span
                            className="inline-flex items-center justify-center rounded p-0.5 text-slate-600 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                            onClick={event => {
                              event.stopPropagation();
                              handleDismissNotification(item.id);
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <p className="mt-1 text-xs text-slate-400">{item.message}</p>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        {item.topic || item.eventType}
                        {target ? (
                          <span className="ml-1.5 text-primary/70">Abrir {target.label} &rarr;</span>
                        ) : null}
                      </span>
                      <span>{new Date(item.createdAt).toLocaleString("pt-BR")}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
