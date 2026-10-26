import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import toast from "react-hot-toast";
import { Icon, Badge, Button, Card, Loading } from "@/components/ui";
import { useNotifications } from "@/hooks/useNotifications";
import type { AppNotification } from "@/api/notifications";
import { BrowserPushToggle } from "@/components/notifications/BrowserPushToggle";
import { openTicketChatWindow, ticketChatPopupUrl } from "@/pages/tickets/ticketChatLauncher";
import { agentSupportChatPopupUrl, openAgentSupportChatWindow } from "@/pages/agents/agentSupportChatLauncher";
import {
  formatNotificationMessage,
  parseNavigationTarget,
  shortTicketRef,
} from "@/components/notifications/notificationNavigation";

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
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const {
    notifications,
    unreadCount,
    isLoading,
    isFetching,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refetch,
  } = useNotifications({ limit: 50 });

  const visibleList = useMemo(
    () => notifications.slice(0, 20),
    [notifications],
  );

  // Fecha o card ao clicar fora dele ou pressionar Escape.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleNotificationClick = async (item: AppNotification) => {
    // window.open é SÍNCRONO no clique: precisa acontecer antes de qualquer
    // await, senão bloqueadores de popup barram a abertura. Chat de suporte
    // (do chamado ou avulso da máquina) abre em JANELA SEPARADA — o mesmo
    // padrão dos lançadores do console — em vez de redirecionar esta aba.
    const target = parseNavigationTarget(item.payloadJson);
    const isChatTarget = Boolean(target?.ticketId || (target?.agentId && target?.sessionId));
    let popupOpened = false;
    let fallbackPath: string | null = null;
    if (target) {
      try {
        if (target.ticketId) {
          // Mesma conversa de dentro do chamado: a sessão vai na query para a
          // janela retomar o chat exato apontado pela notificação.
          openTicketChatWindow(target.ticketId, target.sessionId ?? null);
          popupOpened = true;
        } else if (target.agentId && target.sessionId) {
          // Mesma abertura do menu do agente (AgentContextMenu): autoStart
          // para a janela retomar/iniciar a conversa.
          openAgentSupportChatWindow(target.agentId, true);
          popupOpened = true;
        }
      } catch {
        // Popup bloqueada: abre o MESMO chat na própria aba — as rotas
        // dedicadas das janelas funcionam como página cheia — em vez de
        // redirecionar para o detalhe do chamado/agente.
        if (target.ticketId) {
          fallbackPath = ticketChatPopupUrl(target.ticketId, target.sessionId ?? null);
        } else if (target.agentId && target.sessionId) {
          fallbackPath = agentSupportChatPopupUrl(target.agentId, true);
        }
      }
    }

    try {
      await markAsRead(item.id);
    } catch {
      toast.error("Não foi possível marcar a notificação como lida.");
    }

    if (target) {
      setOpen(false);
      // Chat: só navega se a janela não abriu (popup bloqueada). Destinos de
      // agente/cliente seguem navegando na própria aba, como antes.
      if (fallbackPath || (!isChatTarget && !popupOpened)) navigate(fallbackPath ?? target.path);
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

  const handleDismissReadAll = async () => {
    const readIds = notifications
      .filter(item => item.isRead)
      .map(item => item.id);

    if (readIds.length === 0) {
      toast("Nenhuma notificação lida para limpar.");
      return;
    }

    try {
      await Promise.all(readIds.map(id => deleteNotification(id)));
      toast.success(`${readIds.length} notificação(ns) excluída(s).`);
    } catch {
      toast.error("Erro ao excluir notificações.");
    }
  };

  const handleDismissNotification = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId);
    } catch {
      toast.error("Erro ao excluir notificação.");
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Abrir notificações"
        aria-expanded={open}
      >
        <Icon name="notifications" className="h-4 w-4" />
        {unreadCount > 0 && (
          <Badge color="danger">{unreadCount > 99 ? "99+" : unreadCount}</Badge>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[28rem] max-w-[90vw]">
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Notificações</h3>
                <p className="text-xs text-muted">
                  {isFetching ? "Sincronizando..." : `${visibleList.length} item(ns)`}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => void refetch()}>
                  <Icon name="refresh" className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void handleMarkAllAsRead()}>
                  <Icon name="done_all" className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDismissReadAll}>
                  <Icon name="delete" className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  <Icon name="close" className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <BrowserPushToggle />
            </div>

            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              {isLoading && visibleList.length === 0 && <Loading />}

              {!isLoading && visibleList.length === 0 && (
                <p className="text-sm text-muted">Sem notificações.</p>
              )}

              {visibleList.map((item) => {
                const target = parseNavigationTarget(item.payloadJson);
                const reference = shortTicketRef(target?.ticketId);
                const displayMessage = formatNotificationMessage(item);

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => void handleNotificationClick(item)}
                    onKeyDown={event => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      void handleNotificationClick(item);
                    }}
                    aria-label={target ? `Abrir ${target.label}: ${item.title}` : item.title}
                    className={`group relative w-full rounded-lg border p-3 text-left transition ${
                      item.isRead
                        ? "border-border bg-surface-light"
                        : "border-primary/30 bg-primary/10"
                    } ${target ? "cursor-pointer hover:border-primary/50 hover:bg-primary/5" : "cursor-default"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <div className="flex items-center gap-2">
                        <Badge color={getSeverityColor(item.severity)}>
                          {getSeverityLabel(item.severity)}
                        </Badge>
                        {item.isRead ? (
                          <button
                            type="button"
                            aria-label="Excluir notificação"
                            className="inline-flex items-center justify-center rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
                            onClick={event => {
                              event.stopPropagation();
                              void handleDismissNotification(item.id);
                            }}
                          >
                            <Icon name="close" className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <p className="mt-1 text-xs text-muted">{displayMessage}</p>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
                      <span className="truncate">
                        {item.topic || item.eventType}
                        {reference ? (
                          <span className="ml-1.5 font-mono">{reference}</span>
                        ) : null}
                        {target ? (
                          <span className="ml-1.5 text-primary/70">Abrir {target.label} &rarr;</span>
                        ) : null}
                      </span>
                      <span className="shrink-0">
                        {new Date(item.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
