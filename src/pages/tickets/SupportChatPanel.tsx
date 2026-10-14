import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Paperclip, RefreshCw, Send, X } from "lucide-react";
import { apiFetchResponse } from "@/api/client";
import type { TicketChatAttachment, TicketChatMessage, TicketChatSession } from "@/api/ticket-chat";
import { Button } from "@/components/ui";
import {
  useEndSupportChat,
  useRetrySupportChatInvite,
  useSendSupportChatMessage,
  useStartSupportChat,
  useSupportChatCurrent,
  useSupportChatMessages,
  useSupportChatPresence,
  useSupportChatRealtime,
} from "@/hooks/useSupportChat";
import type { SupportChatClient } from "@/hooks/supportChatClient";
import { useRealtimeStatus } from "@/hooks/useRealtimeStatus";
import { isImageAttachment, triggerBlobDownload } from "@/utils/chatAttachment";
import { PopupBlockedError } from "./ticketChatLauncher";

// ─────────────────────────────────────────────────────────────────────────────
// Painel do chat de suporte (console web).
//
// Atende as DUAS entradas do recurso através de um SupportChatClient:
//   - conversa vinculada a CHAMADO (aba Chat do detalhe e janela do chamado);
//   - conversa AVULSA da MÁQUINA (janela aberta pela lista/detalhe do agent).
//
// - o chat é iniciado SOMENTE pelo atendente (botão "Iniciar chat");
// - o desktop do usuário final recebe um pedido de confirmação e, ao aceitar,
//   abre uma janela dedicada do agent;
// - o histórico fica no servidor e é consultável por este painel.
// ─────────────────────────────────────────────────────────────────────────────

interface SupportChatPanelProps {
  client: SupportChatClient;
  canManage: boolean;
  /** Abre a conversa automaticamente ao montar (janela aberta pela listagem). */
  autoStart?: boolean;
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

/**
 * Junta o texto amigável com a mensagem devolvida pela API.
 *
 * O servidor é quem sabe o motivo (ex.: object storage não configurado em
 * Configurações > Servidor). Antes o anexo falhava só com "Falha ao anexar X",
 * sem a causa — o operador não tinha como saber que era configuração do
 * servidor.
 */
function describeError(error: unknown, fallback: string): string {
  const candidate = error as { message?: unknown } | null;
  const raw = candidate && typeof candidate.message === "string" ? candidate.message.trim() : "";
  if (!raw) return fallback;
  const detail = raw.length > 220 ? raw.slice(0, 220) + "…" : raw;
  return fallback + " — " + detail;
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

export default function SupportChatPanel({ client, canManage, autoStart = false }: SupportChatPanelProps) {
  const [draft, setDraft] = useState("");
  // previewUrl: miniatura do arquivo local ANTES de enviar (imagens).
  const [pendingUploads, setPendingUploads] = useState<
    Array<{ key: string; fileName: string; attachmentId?: string; previewUrl?: string }>
  >([]);
  // Só IMAGEM abre no lightbox: um PDF dentro de <img> não renderiza e o
  // navegador mostra apenas o texto do alt no meio da tela.
  const [lightbox, setLightbox] = useState<{ url: string; fileName: string } | null>(null);
  // Dona do object URL do lightbox: revogado ao trocar de imagem, ao fechar e no
  // unmount (antes, abrir outra imagem ou fechar a janela com o lightbox aberto
  // deixava o blob vivo).
  const lightboxUrlRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Rede de segurança da conversa ao vivo.
  //
  // O caminho normal é o NATS: o servidor publica `TicketChatActivity` e o sinal
  // invalida as consultas. Isso falha em dois cenários:
  //   1. o NATS do navegador está fora (queda/reconexão);
  //   2. o NATS está CONECTADO mas o subject do chamado não está na allow-list do
  //      token — o `subscribe` é ignorado em silêncio e nenhum evento chega.
  // No (2) não há erro para detectar, então a única garantia é reconciliar por
  // REST. A conversa é o único lugar em que isso importa, então o intervalo é
  // curto quando o realtime está fora e LENTO quando está de pé (rede de
  // segurança, não polling de verdade).
  // Medição no servidor: o agent envia as mensagens uma a uma (created_at com
  // 2–3s de intervalo). Quando o operador via "duas ou três de uma vez", o que
  // atrasava era a ATUALIZAÇÃO da tela, não o envio — o sinal NATS
  // (`TicketChatActivity`) não estava chegando a tempo, e sem sinal o único
  // gatilho era o foco da janela.
  //
  // Com o intervalo abaixo a conversa converge em no máximo alguns segundos em
  // QUALQUER modo de falha (NATS fora, subject fora da allow-list do token,
  // reconexão). Com o realtime de pé o sinal continua sendo o caminho rápido —
  // isto é rede de segurança, não substituição.
  const realtime = useRealtimeStatus();
  const messagesIntervalMs = realtime.natsConnected ? 5_000 : 3_000;

  const current = useSupportChatCurrent(client, true, realtime.natsConnected ? 10_000 : 5_000);
  const activeSession = current.data?.session ?? null;

  // Quando a conversa termina a sessão sai da consulta (`hasSession` = false) e
  // a thread desaparecia da tela. Guardamos a última sessão para MANTER a
  // conversa visível em leitura: o operador continua lendo o histórico, vê quem
  // encerrou e a janela não "esvazia" sozinha.
  const [lastSession, setLastSession] = useState<TicketChatSession | null>(null);
  useEffect(() => {
    if (activeSession) setLastSession(activeSession);
  }, [activeSession]);

  const session = activeSession ?? lastSession;
  const sessionId = session?.id;
  // A consulta da sessão corrente devolve null quando a conversa termina, mas o
  // último snapshot (lastSession) ainda diz "Active". Normalizar aqui é o que
  // desabilita o compositor e esconde o "Encerrar" numa conversa já encerrada —
  // antes o campo de texto e o botão Enviar continuavam ativos.
  const sessionEnded = !activeSession && session?.status === "Active";
  const sessionForUi = sessionEnded && session ? { ...session, status: "Ended" as const } : session;

  const messagesQuery = useSupportChatMessages(
    client,
    sessionId,
    Boolean(sessionId),
    messagesIntervalMs,
  );

  const start = useStartSupportChat(client);
  const retry = useRetrySupportChatInvite(client);
  const send = useSendSupportChatMessage(client, sessionId);
  const end = useEndSupportChat(client);

  useSupportChatRealtime(client, sessionId, true);

  // Esta janela e a conversa AO VIVO: enquanto ela estiver aberta, visivel e em
  // foco, o servidor nao cria notificacao de mensagem para este atendente — a
  // mensagem esta na frente dele. Fechar, ocultar ou tirar o foco libera o aviso.
  useSupportChatPresence(client, sessionId, Boolean(sessionId));

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Unmount (janela do chat fechada): revoga o blob do lightbox que ainda
  // estiver aberto.
  useEffect(() => () => {
    if (lightboxUrlRef.current) {
      URL.revokeObjectURL(lightboxUrlRef.current);
      lightboxUrlRef.current = null;
    }
  }, []);

  const disabledReason = client.startBlockedReason ?? null;

  /**
   * A conversa vive em uma JANELA separada (como o acesso remoto): assim o
   * atendente pode sair do chamado que o chat continua funcionando.
   *
   * A janela é aberta ANTES de qualquer await — bloqueadores de popup barram
   * window.open depois de chamadas de rede.
   */
  function handleStart() {
    let popup: Window | null = null;
    if (client.openWindow) {
      try {
        popup = client.openWindow(sessionId ?? null);
      } catch (error) {
        toast.error(
          error instanceof PopupBlockedError
            ? error.message
            : "Não foi possível abrir a janela do chat.",
        );
        return;
      }
    }

    start.mutate(undefined, {
      onSuccess: () => toast.success(client.startSuccessMessage),
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
          setPendingUploads((prev) => {
            prev.forEach((item) => {
              if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            });
            return [];
          });
        },
        onError: (error: unknown) =>
          toast.error(describeError(error, "Não foi possível enviar a mensagem.")),
      },
    );
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length || !sessionId) return;

    for (const file of Array.from(files)) {
      const key = file.name + ":" + file.size + ":" + Date.now();
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      setPendingUploads((prev) => [...prev, { key, fileName: file.name, previewUrl }]);

      try {
        const prepared = await client.prepareUpload(sessionId, {
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

        const attachment = await client.completeUpload(sessionId, {
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
        setPendingUploads((prev) => {
          const item = prev.find((entry) => entry.key === key);
          if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
          return prev.filter((entry) => entry.key !== key);
        });
        console.error("[ticket-chat] falha no upload", error);
        toast.error(describeError(error, "Não foi possível anexar " + file.name));
      }
    }
  }

  /**
   * Clique no anexo: IMAGEM abre ampliada (lightbox); qualquer outro arquivo
   * (PDF, log, certificado…) é BAIXADO com o nome original.
   *
   * Antes todo anexo ia para o lightbox de `<img>`: no PDF o navegador não tem
   * o que renderizar e sobrava só o nome do arquivo no centro da tela escura.
   */
  async function openAttachment(attachment: TicketChatAttachment) {
    try {
      const response = await apiFetchResponse(client.attachmentUrl(sessionId!, attachment.id));
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

  const notice = statusMessage(sessionForUi);
  const canSend = sessionForUi?.status === "Active" && canManage;
  const canStart = canManage && !disabledReason && (!sessionForUi || sessionForUi.status === "Ended" || sessionForUi.status === "Declined" || sessionForUi.status === "Expired");

  // Auto-start: a janela aberta pela listagem/detalhe do agent chega com
  // ?start=1 — inicia a conversa uma única vez, sem exigir um clique extra.
  // (Depois que o atendente encerra, não reinicia sozinho.)
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStartedRef.current || disabledReason || !canManage) return;
    if (current.isLoading) return;

    autoStartedRef.current = true;
    if (activeSession) return;

    start.mutate(undefined, {
      onSuccess: () => toast.success(client.startSuccessMessage),
      onError: (error: unknown) =>
        toast.error(extractConflictMessage(error) ?? "Não foi possível iniciar o chat."),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, canManage, current.isLoading, activeSession, disabledReason]);

  return (
    // Coluna flex de altura cheia: cabeçalho/estado no topo, conversa rolando no
    // meio e o compositor ANCORADO no rodapé (antes ele rolava junto com as
    // mensagens e ficava cortado).
    <div className="flex min-h-0 flex-1 flex-col gap-4">
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
          {sessionForUi?.status === "Pending" && canManage && (
            <Button size="sm" variant="ghost" onClick={handleRetry} disabled={retry.isPending}>
              <RefreshCw className="h-4 w-4" /> Reenviar convite
            </Button>
          )}
          {sessionForUi?.status === "Active" && canManage && (
            // Botão de verdade (sólido, vermelho): antes era um Button ghost com
            // ícone de quadrado vazio e parecia um checkbox desmarcado.
            <Button size="sm" variant="danger" onClick={handleEnd} disabled={end.isPending}>
              <X className="h-4 w-4" /> Encerrar
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

      {sessionEnded && (
        <p className="rounded-lg border border-border bg-surface-light px-3 py-2 text-xs text-muted">
          {client.endedNotice}
        </p>
      )}
      {notice && <p className="text-sm text-muted">{notice}</p>}

      {/* Conversa ativa */}
      {sessionForUi && (
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messagesQuery.isLoading && <p className="text-sm text-muted">Carregando mensagens…</p>}
            {!messagesQuery.isLoading && messages.length === 0 && (
              <p className="text-sm text-muted">
                {sessionForUi.status === "Active"
                  ? "Nenhuma mensagem ainda. Envie a primeira."
                  : "Aguardando a confirmação na máquina do usuário."}
              </p>
            )}

            {messages.map((message) => {
              if (String(message.authorKind).toLowerCase() === "system") {
                return (
                  <p
                    key={message.id || String(message.sequenceNumber)}
                    className="self-center max-w-[85%] rounded-full border border-border bg-surface-light px-3 py-1 text-center text-[11px] text-muted"
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
                      <MessageAttachmentPreview
                        key={attachment.id}
                        client={client}
                        sessionId={sessionId}
                        attachment={attachment}
                        onOpen={openAttachment}
                      />
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
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-border p-3">
            {pendingUploads.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingUploads.map((item) => (
                  <span
                    key={item.key}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-light px-2 py-1 text-xs"
                  >
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.fileName}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <Paperclip className="h-3 w-3" />
                    )}
                    <span className="max-w-[180px] truncate">{item.fileName}</span>
                    {!item.attachmentId ? <span className="text-muted">enviando…</span> : null}
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
                className="min-h-[52px] flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                rows={2}
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
 * Anexo já enviado: miniatura para imagens, chip para os demais tipos.
 *
 * A imagem vem do endpoint autenticado do chat (o blob é baixado e vira object
 * URL) — é o que dá o preview ANTES de abrir o lightbox, inclusive para prints
 * enviados pelo usuário. O object URL é revogado no unmount.
 *
 * Nos demais tipos o clique BAIXA o arquivo (nome original), nunca abre o
 * lightbox — é o caso do PDF que só mostrava o nome no centro da tela.
 */
function MessageAttachmentPreview({
  client,
  sessionId,
  attachment,
  onOpen,
}: {
  client: SupportChatClient;
  sessionId: string | undefined;
  attachment: TicketChatAttachment;
  onOpen: (attachment: TicketChatAttachment) => void;
}) {
  const isImage = isImageAttachment(attachment.contentType, attachment.fileName);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isImage) return undefined;

    let disposed = false;

    void (async () => {
      try {
        const response = await apiFetchResponse(client.attachmentUrl(sessionId!, attachment.id));
        if (!response.ok) return;

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        if (!disposed) setPreviewUrl(url);
      } catch {
        // Sem miniatura o chip continua clicável — nunca quebra a conversa.
      }
    })();

    return () => {
      disposed = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [attachment.id, client, isImage, sessionId]);

  if (isImage && previewUrl) {
    return (
      <button
        type="button"
        onClick={() => onOpen(attachment)}
        title={attachment.fileName + " (clique para ampliar)"}
        className="overflow-hidden rounded-lg border border-border hover:border-primary/60"
      >
        <img src={previewUrl} alt={attachment.fileName} className="h-24 w-32 object-cover" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(attachment)}
      title={attachment.fileName + (isImage ? " (clique para ampliar)" : " (clique para baixar)")}
      className="flex items-center gap-1 rounded-lg border border-border bg-surface-light px-2 py-1 text-xs text-foreground hover:border-primary/60"
    >
      <Paperclip className="h-3 w-3" /> {attachment.fileName}
    </button>
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