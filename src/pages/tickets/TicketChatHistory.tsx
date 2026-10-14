import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { ExternalLink, Paperclip, RefreshCw, X } from "lucide-react";
import { apiFetchResponse } from "@/api/client";
import { ticketChatApi, type TicketChatAttachment, type TicketChatMessage, type TicketChatSession } from "@/api/ticket-chat";
import { Button } from "@/components/ui";
import {
  useCurrentTicketChat,
  useEndTicketChat,
  useRetryTicketChatInvite,
  useStartTicketChat,
  useTicketChatHistory,
  useTicketChatMessages,
} from "@/hooks/useTicketChat";
import { useTicketChatRealtime } from "@/hooks/useTicketChatRealtime";
import { isImageAttachment, triggerBlobDownload } from "@/utils/chatAttachment";
import { openTicketChatWindow, PopupBlockedError } from "./ticketChatLauncher";

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Chat" do chamado — LISTA + HISTÓRICO (somente leitura).
//
// A conversa ao vivo NÃO acontece aqui: ao iniciar, ela abre em uma JANELA
// separada (como o acesso remoto), para continuar funcionando mesmo que o
// atendente saia do chamado. Esta aba serve para:
//   - iniciar/reabrir o chat e acompanhar o estado da sessão;
//   - consultar o histórico de qualquer conversa do chamado.
// ─────────────────────────────────────────────────────────────────────────────

interface TicketChatHistoryProps {
  ticketId: string;
  agentId?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  canManage: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  Pending: "Aguardando confirmação",
  Active: "Ativa",
  Declined: "Recusada",
  Expired: "Expirada",
  Ended: "Encerrada",
};

const STATUS_CLASS: Record<string, string> = {
  Pending: "border-warning/40 bg-warning/10 text-warning",
  Active: "border-success/40 bg-success/10 text-success",
  Declined: "border-danger/40 bg-danger/10 text-danger",
  Expired: "border-border bg-surface-light text-muted",
  Ended: "border-border bg-surface-light text-muted",
};

function formatDateTime(raw?: string | null): string {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function isOwnMessage(message: TicketChatMessage): boolean {
  return String(message.authorKind).toLowerCase() === "support";
}

/** Une a sessão corrente (pendente/ativa) com o histórico, sem duplicar. */
function buildSessionList(
  current: TicketChatSession | null | undefined,
  history: TicketChatSession[] | undefined,
): TicketChatSession[] {
  const byId = new Map<string, TicketChatSession>();

  if (current) byId.set(current.id, current);
  (history ?? []).forEach((session) => {
    if (!byId.has(session.id)) byId.set(session.id, session);
  });

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export default function TicketChatHistory({ ticketId, agentId, clientId, siteId, canManage }: TicketChatHistoryProps) {
  const [historyTake, setHistoryTake] = useState(20);

  const current = useCurrentTicketChat(ticketId);
  const history = useTicketChatHistory(ticketId, true, historyTake);
  const start = useStartTicketChat(ticketId);
  const retry = useRetryTicketChatInvite(ticketId);
  const end = useEndTicketChat(ticketId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; fileName: string } | null>(null);
  // Dona do object URL do lightbox: revogado ao trocar de imagem, ao fechar e no
  // unmount — antes o blob ficava vivo ao abrir outra imagem ou sair da aba.
  const lightboxUrlRef = useRef<string | null>(null);

  const currentSession = current.data?.session ?? null;
  const sessions = useMemo(
    () => buildSessionList(currentSession, history.data),
    [currentSession, history.data],
  );

  // Seleção padrão: a conversa corrente (se houver); senão a mais recente.
  useEffect(() => {
    if (selectedId && sessions.some((session) => session.id === selectedId)) return;
    setSelectedId(currentSession?.id ?? sessions[0]?.id ?? null);
  }, [currentSession?.id, sessions, selectedId]);

  // Unmount (saiu da aba/janela): revoga o blob do lightbox que ainda estiver
  // aberto.
  useEffect(() => () => {
    if (lightboxUrlRef.current) {
      URL.revokeObjectURL(lightboxUrlRef.current);
      lightboxUrlRef.current = null;
    }
  }, []);

  const selected = sessions.find((session) => session.id === selectedId) ?? null;

  // O histórico é buscado sob demanda; o sinal NATS da aba só atualiza a LISTA
  // (estado das sessões) — não há conversa em tempo real nesta tela.
  const messages = useTicketChatMessages(ticketId, selected?.id, Boolean(selected?.id));

  useTicketChatRealtime(ticketId, { clientId: clientId ?? undefined, siteId: siteId ?? undefined }, Boolean(ticketId));

  function openWindow(sessionId?: string | null) {
    try {
      openTicketChatWindow(ticketId, sessionId ?? null);
    } catch (error) {
      toast.error(
        error instanceof PopupBlockedError ? error.message : "Não foi possível abrir a janela do chat.",
      );
    }
  }

  function handleStart() {
    // A janela é aberta ANTES de qualquer await (bloqueadores de popup barram
    // window.open depois de chamadas de rede).
    let popup: Window | null = null;
    try {
      popup = openTicketChatWindow(ticketId, null);
    } catch (error) {
      toast.error(error instanceof PopupBlockedError ? error.message : "Não foi possível abrir a janela do chat.");
      return;
    }

    start.mutate(undefined, {
      onSuccess: () => toast.success("Convite de chat enviado. A conversa está na janela do chat."),
      onError: (error: unknown) => {
        try {
          popup?.close();
        } catch {
          // janela já fechada
        }
        toast.error(extractMessage(error) ?? "Não foi possível iniciar o chat.");
      },
    });
  }

  function handleRetry(sessionId: string) {
    retry.mutate(sessionId, {
      onSuccess: () => toast.success("Convite reenviado."),
      onError: (error: unknown) => toast.error(extractMessage(error) ?? "Não foi possível reenviar o convite."),
    });
  }

  function handleEnd(sessionId: string) {
    end.mutate(sessionId, {
      onSuccess: () => toast.success("Chat encerrado."),
      onError: () => toast.error("Não foi possível encerrar o chat."),
    });
  }

  /**
   * No histórico somente leitura: IMAGEM abre ampliada (lightbox); qualquer
   * outro arquivo (PDF, log, certificado…) é BAIXADO com o nome original. Antes
   * todo anexo ia para o lightbox de `<img>` e o PDF não renderizava — sobrava
   * só o nome do arquivo no centro da tela escura.
   */
  async function openAttachment(attachment: TicketChatAttachment) {
    try {
      const response = await apiFetchResponse(ticketChatApi.attachmentUrl(ticketId, attachment.id));
      if (!response.ok) throw new Error("HTTP " + response.status);
      const blob = await response.blob();

      if (!isImageAttachment(attachment.contentType, attachment.fileName)) {
        triggerBlobDownload(blob, attachment.fileName);
        return;
      }

      if (lightboxUrlRef.current) URL.revokeObjectURL(lightboxUrlRef.current);
      const url = URL.createObjectURL(blob);
      lightboxUrlRef.current = url;
      setLightbox({ url, fileName: attachment.fileName });
    } catch {
      toast.error("Não foi possível abrir o anexo.");
    }
  }

  function closeLightbox() {
    if (lightboxUrlRef.current) {
      URL.revokeObjectURL(lightboxUrlRef.current);
      lightboxUrlRef.current = null;
    }
    setLightbox(null);
  }

  const agentMissing = !agentId;
  const currentStatus = currentSession?.status;
  const canStart =
    canManage &&
    !agentMissing &&
    (!currentSession || currentStatus === "Ended" || currentStatus === "Declined" || currentStatus === "Expired");

  return (
    <div className="space-y-4">
      {/* Estado + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={
              "rounded-full border px-2.5 py-0.5 text-xs font-medium " +
              (STATUS_CLASS[currentStatus ?? ""] ?? "border-border bg-surface-light text-muted")
            }
          >
            {currentSession ? STATUS_LABEL[currentSession.status] ?? currentSession.status : "Sem conversa"}
          </span>
          <span className="text-xs text-muted">
            A conversa acontece em uma janela separada — ela continua aberta mesmo saindo do chamado.
          </span>
        </div>

        <div className="flex items-center gap-2">
          {currentSession?.status === "Pending" && canManage && (
            <Button size="sm" variant="ghost" onClick={() => handleRetry(currentSession.id)} disabled={retry.isPending}>
              <RefreshCw className="h-4 w-4" /> Reenviar convite
            </Button>
          )}
          {currentSession && (
            <Button size="sm" variant="ghost" onClick={() => openWindow(currentSession.id)}>
              <ExternalLink className="h-4 w-4" /> Abrir janela do chat
            </Button>
          )}
          {currentSession?.status === "Active" && canManage && (
            // Botão de verdade (sólido, vermelho): o Button ghost com ícone de
            // quadrado vazio parecia um checkbox desmarcado.
            <Button size="sm" variant="danger" onClick={() => handleEnd(currentSession.id)} disabled={end.isPending}>
              <X className="h-4 w-4" /> Encerrar
            </Button>
          )}
          {canStart && (
            <Button size="sm" onClick={handleStart} disabled={start.isPending}>
              {currentSession ? "Iniciar nova conversa" : "Iniciar chat"}
            </Button>
          )}
        </div>
      </div>

      {agentMissing && !currentSession && (
        <p className="text-sm text-muted">O chamado não está vinculado a uma máquina.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Lista de conversas */}
        <div className="rounded-xl border border-border">
          <div className="border-b border-border px-4 py-2">
            <h4 className="text-sm font-medium text-foreground">Conversas do chamado</h4>
            <p className="text-xs text-muted">{sessions.length} no total</p>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {sessions.length === 0 && (
              <p className="p-4 text-sm text-muted">Nenhuma conversa registrada ainda.</p>
            )}

            {sessions.map((session) => {
              const active = session.id === selectedId;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedId(session.id)}
                  className={
                    "flex w-full flex-col items-start gap-1 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 " +
                    (active ? "bg-surface-light" : "hover:bg-surface-light/60")
                  }
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span
                      className={
                        "rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                        (STATUS_CLASS[session.status] ?? "border-border bg-surface-light text-muted")
                      }
                    >
                      {STATUS_LABEL[session.status] ?? session.status}
                    </span>
                    <span className="text-[11px] text-muted">{formatDateTime(session.startedAt)}</span>
                  </span>
                  <span className="text-xs text-muted">
                    {session.startedByName ? session.startedByName + " · " : ""}
                    {session.messageCount} mensagem(ns)
                  </span>
                </button>
              );
            })}

            {(history.data?.length ?? 0) >= historyTake && (
              <div className="border-t border-border p-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setHistoryTake((value) => value + 20)}
                  disabled={history.isFetching}
                >
                  {history.isFetching ? "Carregando…" : "Carregar mais conversas"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Histórico da conversa selecionada (somente leitura) */}
        <div className="rounded-xl border border-border">
          {!selected ? (
            <p className="p-4 text-sm text-muted">
              Selecione uma conversa para ver o histórico, ou inicie um novo chat.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-medium text-foreground">
                    Histórico · {STATUS_LABEL[selected.status] ?? selected.status}
                  </h4>
                  <p className="text-xs text-muted">
                    Iniciada em {formatDateTime(selected.startedAt)}
                    {selected.endedAt ? " · encerrada em " + formatDateTime(selected.endedAt) : ""}
                    {selected.endReason ? " · " + selected.endReason : ""}
                    {selected.declinedReason ? " · " + selected.declinedReason : ""}
                  </p>
                </div>
                {selected.status === "Active" && (
                  <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] text-success">
                    ao vivo na janela do chat
                  </span>
                )}
              </div>

              <div className="max-h-[380px] space-y-3 overflow-y-auto p-4">
                {messages.isLoading && <p className="text-sm text-muted">Carregando mensagens…</p>}
                {!messages.isLoading && (messages.data?.length ?? 0) === 0 && (
                  <p className="text-sm text-muted">Nenhuma mensagem nesta conversa.</p>
                )}

                {(messages.data ?? []).map((message) => {
                  if (String(message.authorKind).toLowerCase() === "system") {
                    return (
                      <p
                        key={message.id || String(message.sequenceNumber)}
                        className="mx-auto max-w-[85%] rounded-full border border-border bg-surface-light px-3 py-1 text-center text-[11px] text-muted"
                      >
                        {message.body}
                      </p>
                    );
                  }
                  return (
                  <div
                    key={message.id || String(message.sequenceNumber)}
                    className={"flex flex-col " + (isOwnMessage(message) ? "items-end" : "items-start")}
                  >
                    <div
                      className={
                        "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm " +
                        (isOwnMessage(message)
                          ? "bg-primary text-white rounded-br-md"
                          : "border border-border bg-surface-light text-foreground rounded-bl-md")
                      }
                    >
                      {message.body}
                    </div>
                    {message.attachments?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {message.attachments.map((attachment) => (
                          <button
                            key={attachment.id}
                            type="button"
                            onClick={() => openAttachment(attachment)}
                            title={
                              attachment.fileName +
                              (isImageAttachment(attachment.contentType, attachment.fileName)
                                ? " (clique para ampliar)"
                                : " (clique para baixar)")
                            }
                            className="flex items-center gap-1 rounded-lg border border-border bg-surface-light px-2 py-1 text-xs text-foreground hover:border-primary/60"
                          >
                            <Paperclip className="h-3 w-3" /> {attachment.fileName}
                          </button>
                        ))}
                      </div>
                    )}
                    <span className="mt-1 text-[11px] text-muted">
                      {(message.authorName || (isOwnMessage(message) ? "Suporte" : "Usuário")) +
                        (message.createdAt ? " · " + formatDateTime(message.createdAt) : "")}
                    </span>
                  </div>
                  );
                })}
              </div>

              <p className="border-t border-border px-4 py-2 text-xs text-muted">
                Visualização somente leitura. Para responder, use a janela do chat.
              </p>
            </>
          )}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={closeLightbox}
          role="presentation"
        >
          <div className="relative">
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute -right-2 -top-2 rounded-full bg-surface p-1 text-foreground shadow"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={lightbox.url}
              alt={lightbox.fileName}
              className="max-h-[85vh] max-w-[90vw] rounded-lg border border-border bg-surface"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function extractMessage(error: unknown): string | null {
  const candidate = error as { message?: string } | null;
  if (candidate && typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message;
  }
  return null;
}
