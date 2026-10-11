import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Paperclip, RefreshCw, Send, Square, X } from "lucide-react";
import { apiFetchResponse } from "@/api/client";
import { ticketChatApi, type TicketChatAttachment, type TicketChatMessage, type TicketChatSession } from "@/api/ticket-chat";
import { Button } from "@/components/ui";
import {
  useCurrentTicketChat,
  useEndTicketChat,
  useRetryTicketChatInvite,
  useSendTicketChatMessage,
  useStartTicketChat,
  useTicketChatHistory,
  useTicketChatMessages,
} from "@/hooks/useTicketChat";
import { useTicketChatRealtime } from "@/hooks/useTicketChatRealtime";
import { openTicketChatWindow, PopupBlockedError } from "./ticketChatLauncher";

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Chat" do detalhe do chamado.
//
// - o chat é iniciado SOMENTE pelo atendente (botão "Iniciar chat");
// - o desktop do usuário final recebe um pedido de confirmação e, ao aceitar,
//   abre uma janela dedicada do agent;
// - o histórico fica vinculado ao chamado e só é consultável aqui no site.
// ─────────────────────────────────────────────────────────────────────────────

interface TicketChatPanelProps {
  ticketId: string;
  agentId?: string | null;
  clientId?: string | null;
  siteId?: string | null;
  canManage: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  Pending: "Aguardando confirmação",
  Active: "Ativo",
  Declined: "Recusado",
  Expired: "Expirado",
  Ended: "Encerrado",
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

function statusMessage(session: TicketChatSession | null | undefined): string | null {
  if (!session) return null;
  switch (session.status) {
    case "Declined":
      return session.declinedReason === "busy"
        ? "A máquina já está em outro chat de suporte."
        : session.declinedReason === "timeout"
          ? "O convite expirou sem resposta na máquina."
          : "O usuário recusou o chat.";
    case "Expired":
      return "O convite expirou. Inicie uma nova conversa.";
    case "Ended":
      return session.endReason === "inactivity"
        ? "Conversa encerrada por inatividade."
        : session.endReason === "ticket_closed"
          ? "Conversa encerrada porque o chamado foi fechado."
          : session.endedBy === "user"
            ? "Conversa encerrada pelo usuário."
            : "Conversa encerrada.";
    default:
      return null;
  }
}

export default function TicketChatPanel({ ticketId, agentId, clientId, siteId, canManage }: TicketChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [pendingUploads, setPendingUploads] = useState<Array<{ key: string; fileName: string; attachmentId?: string }>>([]);
  const [lightbox, setLightbox] = useState<{ url: string; fileName: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const current = useCurrentTicketChat(ticketId);
  const activeSession = current.data?.session ?? null;
  const sessionId = activeSession?.id;

  const messagesQuery = useTicketChatMessages(ticketId, sessionId, Boolean(sessionId));
  const history = useTicketChatHistory(ticketId, historyOpen);

  const start = useStartTicketChat(ticketId);
  const retry = useRetryTicketChatInvite(ticketId);
  const send = useSendTicketChatMessage(ticketId, sessionId);
  const end = useEndTicketChat(ticketId);

  useTicketChatRealtime(ticketId, { clientId: clientId ?? undefined, siteId: siteId ?? undefined }, Boolean(ticketId));

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const disabledReason = !agentId
    ? "O chamado não está vinculado a uma máquina."
    : null;

  /**
   * A conversa vive em uma JANELA separada (como o acesso remoto): assim o
   * atendente pode sair do chamado que o chat continua funcionando.
   *
   * A janela é aberta ANTES de qualquer await — bloqueadores de popup barram
   * window.open depois de chamadas de rede.
   */
  function handleStart() {
    let popup: Window | null = null;
    try {
      popup = openTicketChatWindow(ticketId, sessionId ?? null);
    } catch (error) {
      toast.error(
        error instanceof PopupBlockedError
          ? error.message
          : "Não foi possível abrir a janela do chat.",
      );
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
        toast.error(extractConflictMessage(error) ?? "Não foi possível iniciar o chat.");
      },
    });
  }

  function handleOpenWindow() {
    try {
      openTicketChatWindow(ticketId, sessionId ?? null);
    } catch (error) {
      toast.error(
        error instanceof PopupBlockedError
          ? error.message
          : "Não foi possível abrir a janela do chat.",
      );
    }
  }

  function handleRetry() {
    if (!sessionId) return;
    retry.mutate(sessionId, {
      onSuccess: () => toast.success("Convite reenviado."),
      onError: (error: unknown) => toast.error(extractConflictMessage(error) ?? "Não foi possível reenviar o convite."),
    });
  }

  function handleEnd() {
    if (!sessionId) return;
    end.mutate(sessionId, {
      onSuccess: () => toast.success("Chat encerrado."),
      onError: () => toast.error("Não foi possível encerrar o chat."),
    });
  }

  function handleSend() {
    const body = draft.trim();
    const attachmentIds = pendingUploads.map((item) => item.attachmentId).filter(Boolean) as string[];
    if (!body && !attachmentIds.length) return;

    send.mutate(
      { body, attachmentIds },
      {
        onSuccess: () => {
          setDraft("");
          setPendingUploads([]);
        },
        onError: () => toast.error("Falha ao enviar a mensagem."),
      },
    );
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length || !sessionId) return;

    for (const file of Array.from(files)) {
      const key = file.name + ":" + file.size + ":" + Date.now();
      setPendingUploads((prev) => [...prev, { key, fileName: file.name }]);

      try {
        const prepared = await ticketChatApi.prepareUpload(ticketId, sessionId, {
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });

        const upload = await fetch(prepared.uploadUrl, {
          method: prepared.httpMethod || "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!upload.ok) throw new Error("upload HTTP " + upload.status);

        const attachment = await ticketChatApi.completeUpload(ticketId, sessionId, {
          attachmentId: prepared.attachmentId,
          objectKey: prepared.objectKey,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        });

        setPendingUploads((prev) =>
          prev.map((item) => (item.key === key ? { ...item, attachmentId: attachment.id } : item)),
        );
      } catch (error) {
        setPendingUploads((prev) => prev.filter((item) => item.key !== key));
        console.error("[ticket-chat] falha no upload", error);
        toast.error("Falha ao anexar " + file.name);
      }
    }
  }

  async function openAttachment(attachment: TicketChatAttachment) {
    try {
      const response = await apiFetchResponse(ticketChatApi.attachmentUrl(ticketId, attachment.id));
      if (!response.ok) throw new Error("HTTP " + response.status);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setLightbox({ url, fileName: attachment.fileName });
    } catch {
      toast.error("Não foi possível abrir o anexo.");
    }
  }

  function closeLightbox() {
    if (lightbox) URL.revokeObjectURL(lightbox.url);
    setLightbox(null);
  }

  const sessionForUi = activeSession;
  const notice = statusMessage(sessionForUi);
  const canSend = sessionForUi?.status === "Active" && canManage;
  const canStart = canManage && !disabledReason && (!sessionForUi || sessionForUi.status === "Ended" || sessionForUi.status === "Declined" || sessionForUi.status === "Expired");

  return (
    <div className="space-y-4">
      {/* Barra de estado e ações */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={
              "rounded-full border px-2.5 py-0.5 text-xs font-medium " +
              (STATUS_CLASS[sessionForUi?.status ?? ""] ?? "border-border bg-surface-light text-muted")
            }
          >
            {sessionForUi ? STATUS_LABEL[sessionForUi.status] ?? sessionForUi.status : "Sem conversa"}
          </span>
          {sessionForUi?.startedByName && (
            <span className="text-xs text-muted">Iniciado por {sessionForUi.startedByName}</span>
          )}
          {sessionForUi?.messageCount ? (
            <span className="text-xs text-muted">{sessionForUi.messageCount} mensagem(ns)</span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setHistoryOpen((open) => !open)}>
            Conversas anteriores
          </Button>
          {sessionForUi && canManage && (
            <Button size="sm" onClick={handleOpenWindow} title="Mantém o chat aberto mesmo saindo do chamado">
              Abrir janela do chat
            </Button>
          )}
          {sessionForUi?.status === "Pending" && canManage && (
            <Button size="sm" variant="ghost" onClick={handleRetry} disabled={retry.isPending}>
              <RefreshCw className="h-4 w-4" /> Reenviar convite
            </Button>
          )}
          {sessionForUi?.status === "Active" && canManage && (
            <Button size="sm" variant="ghost" onClick={handleEnd} disabled={end.isPending}>
              <Square className="h-4 w-4" /> Encerrar
            </Button>
          )}
          {canStart && (
            <Button size="sm" onClick={handleStart} disabled={start.isPending}>
              {sessionForUi ? "Iniciar nova conversa" : "Iniciar chat"}
            </Button>
          )}
        </div>
      </div>

      {disabledReason && !sessionForUi && <p className="text-sm text-muted">{disabledReason}</p>}
      {notice && <p className="text-sm text-muted">{notice}</p>}

      {/* Conversa ativa */}
      {sessionForUi && (
        <div className="rounded-xl border border-border">
          <div className="max-h-96 space-y-3 overflow-y-auto p-4">
            {messagesQuery.isLoading && <p className="text-sm text-muted">Carregando mensagens…</p>}
            {!messagesQuery.isLoading && messages.length === 0 && (
              <p className="text-sm text-muted">
                {sessionForUi.status === "Active"
                  ? "Nenhuma mensagem ainda. Envie a primeira."
                  : "Aguardando a confirmação na máquina do usuário."}
              </p>
            )}

            {messages.map((message) => (
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
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="border-t border-border p-3">
            {pendingUploads.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingUploads.map((item) => (
                  <span key={item.key} className="rounded-lg border border-border bg-surface-light px-2 py-1 text-xs">
                    {item.fileName}
                    {!item.attachmentId ? " (enviando…)" : ""}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  void handleFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canSend || send.isPending}
                title="Anexar arquivo ou print"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <textarea
                className="min-h-[38px] flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                rows={1}
                placeholder={canSend ? "Escreva para o usuário… (Enter envia, Shift+Enter quebra linha)" : "A conversa não está ativa."}
                value={draft}
                disabled={!canSend}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
              />
              <Button size="sm" onClick={handleSend} disabled={!canSend || send.isPending}>
                <Send className="h-4 w-4" /> Enviar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Conversas anteriores (somente leitura) */}
      {historyOpen && (
        <div className="rounded-xl border border-border p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">Conversas anteriores do chamado</h4>
            <button type="button" onClick={() => setHistoryOpen(false)} className="text-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {history.isLoading && <p className="text-sm text-muted">Carregando histórico…</p>}
          {!history.isLoading && (history.data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted">Nenhuma conversa encerrada para este chamado.</p>
          )}

          <ul className="space-y-2">
            {(history.data ?? []).map((item) => (
              <li key={item.id} className="rounded-lg border border-border bg-surface-light px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">
                    {STATUS_LABEL[item.status] ?? item.status}
                    {item.startedByName ? " · " + item.startedByName : ""}
                  </span>
                  <span className="text-xs text-muted">{formatDateTime(item.startedAt)}</span>
                </div>
                <div className="text-xs text-muted">
                  {item.messageCount} mensagem(ns)
                  {item.endedAt ? " · encerrada em " + formatDateTime(item.endedAt) : ""}
                  {item.endReason ? " · " + item.endReason : ""}
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-muted">
            O conteúdo das conversas anteriores fica registrado no chamado e é consultável apenas aqui no console.
          </p>
        </div>
      )}

      {/* Lightbox de imagem */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={closeLightbox}
          role="presentation"
        >
          <img
            src={lightbox.url}
            alt={lightbox.fileName}
            className="max-h-[85vh] max-w-[90vw] rounded-lg border border-border bg-surface"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Mensagem amigável do 409 devolvido pelo start/retry.
 *
 * O backend responde `{ code, error }` e o `parseErrorMessage` do client já
 * converte `error` na mensagem do ApiError — não há `body` no erro tipado.
 */
function extractConflictMessage(error: unknown): string | null {
  const candidate = error as { message?: string } | null;
  if (candidate && typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message;
  }
  return null;
}
