import { formatDateCompact } from '@/utils/format';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { apiFetchResponse } from "@/api/client";
import type { TicketChatAttachment, TicketChatMessage, TicketChatSession } from "@/api/ticket-chat";
import { Icon, Button, ConfirmDialog, ImageLightbox } from "@/components/ui";
import {
  useEndSupportChat,
  useLinkSupportChatToTicket,
  useLoadOlderSupportChatMessages,
  useRequestAssistedAction,
  useRetrySupportChatInvite,
  useSendSupportChatMessage,
  useStartSupportChat,
  useSupportChatCurrent,
  useSupportChatMessages,
  useSupportChatPresence,
  useSupportChatRealtime,
  useTransferSupportChat,
} from "@/hooks/useSupportChat";
import { useTicketMacros } from "@/hooks/useSupportProductivity";
import type { SupportChatClient } from "@/hooks/supportChatClient";
import { useRealtimeStatus } from "@/hooks/useRealtimeStatus";
import { useAuthorization } from "@/auth/authorization";
import { openRemoteSessionPopup } from "@/pages/agents/remoteSessionLauncher";
import { isImageAttachment, triggerBlobDownload } from "@/utils/chatAttachment";
import {
  notifyDesktopChatMessage,
  playChatNotificationSound,
} from "@/utils/chatNotificationSound";
import { exportChatTranscript } from "@/utils/chatTranscriptExport";
import { LinkTicketModal, TransferChatModal } from "./SupportChatModals";
import { PopupBlockedError } from "./ticketChatLauncher";
import {
  isLiveSupportChatStatus,
  shouldAdoptSupportChatSession,
} from "./supportChatSessionVisibility";

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
  /**
   * Agent (máquina) desta conversa. Quando informado — e o usuário tendo
   * permissão de execução no agent — o compositor mostra o ícone de CONTROLE
   * REMOTO, que abre a janela de acesso remoto da máquina.
   */
  remoteControlAgentId?: string | null;
}

/**
 * Mesmo gate do botão "Controle remoto" do detalhe/listagem do agent: o
 * backend exige Agents.Execute nas rotas de sessão remota.
 */
const REMOTE_CONTROL_PERMISSIONS = ['Agents.Execute', 'Agents.Edit', 'agents.*', 'admin.*'];

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

const formatDateTime = (raw?: string | null) => formatDateCompact(raw, "");

function formatDaySeparator(raw?: string | null): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Hoje";
  if (sameDay(date, yesterday)) return "Ontem";
  return date.toLocaleDateString("pt-BR");
}

function getDayKey(raw?: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isSameAuthorGroup(a: TicketChatMessage, b: TicketChatMessage): boolean {
  const kindA = String(a.authorKind).toLowerCase();
  const kindB = String(b.authorKind).toLowerCase();
  if (kindA === "system" || kindB === "system" || kindA !== kindB) return false;
  if ((a.authorName ?? "") !== (b.authorName ?? "")) return false;
  const timeA = new Date(a.createdAt).getTime();
  const timeB = new Date(b.createdAt).getTime();
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) return false;
  return Math.abs(timeB - timeA) <= 3 * 60 * 1000;
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

export function statusMessage(session: TicketChatSession | null | undefined): string | null {
  if (!session) return null;
  switch (session.status) {
    case "Declined":
      return session.declinedReason === "busy"
        ? "A máquina já está em outro chat de suporte."
        : session.declinedReason === "timeout"
          ? "O convite expirou sem resposta na máquina."
          : session.declinedReason === "replaced"
            ? "O convite foi substituído por uma conversa mais recente na mesma máquina."
            : session.declinedReason === "no_ui"
              ? "O agent não tinha interface na máquina para mostrar o convite."
              : session.declinedReason === "user_dismissed"
                ? "O aviso do convite ficou sem resposta na máquina do usuário."
                : session.declinedReason === "user_denied" || !session.declinedReason
                ? "O usuário recusou o chat (escolheu \"Agora não\" na máquina)."
                : "O usuário recusou o chat.";
    case "Expired":
      return "O convite expirou sem resposta na máquina. Inicie uma nova conversa.";
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

export default function SupportChatPanel({
  client,
  canManage,
  autoStart = false,
  remoteControlAgentId = null,
}: SupportChatPanelProps) {
  const authz = useAuthorization();
  // Independe do estado da conversa: o acesso remoto é da MÁQUINA, não do chat
  // (por isso continua clicável numa conversa encerrada).
  const canRemoteControl =
    Boolean(remoteControlAgentId) && authz.hasAnyPermission(REMOTE_CONTROL_PERMISSIONS);
  const [openingRemote, setOpeningRemote] = useState(false);
  const [draft, setDraft] = useState("");
  // previewUrl: miniatura do arquivo local ANTES de enviar (imagens).
  const [pendingUploads, setPendingUploads] = useState<
    Array<{ key: string; fileName: string; attachmentId?: string; previewUrl?: string }>
  >([]);
  const pendingUploadsRef = useRef(pendingUploads);
  pendingUploadsRef.current = pendingUploads;
  useEffect(() => {
    return () => {
      for (const item of pendingUploadsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);
  // Só IMAGEM abre no lightbox: um PDF dentro de <img> não renderiza e o
  // navegador mostra apenas o texto do alt no meio da tela.
  const [lightbox, setLightbox] = useState<{ url: string; fileName: string; blob: Blob } | null>(null);
  // Dona do object URL do lightbox: revogado ao trocar de imagem, ao fechar e no
  // unmount (antes, abrir outra imagem ou fechar a janela com o lightbox aberto
  // deixava o blob vivo).
  const lightboxUrlRef = useRef<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hasUnreadBelow, setHasUnreadBelow] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [typingAuthor, setTypingAuthor] = useState<string | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const localTypingTimerRef = useRef<number | null>(null);
  const [macrosOpen, setMacrosOpen] = useState(false);
  const [activeMacroIndex, setActiveMacroIndex] = useState(0);
  const composerBoxRef = useRef<HTMLDivElement | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [linkTicketModalOpen, setLinkTicketModalOpen] = useState(false);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actionsMenuOpen]);

  useEffect(() => {
    if (!macrosOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (composerBoxRef.current && !composerBoxRef.current.contains(event.target as Node)) {
        setMacrosOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [macrosOpen]);

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
  const messagesIntervalMs = realtime.natsConnected ? 30_000 : 3_000;

  const [pendingDecision, setPendingDecision] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const sessionPollMs = pendingDecision
    ? (realtime.natsConnected ? 5_000 : 2_000)
    : (realtime.natsConnected ? 30_000 : 5_000);

  const current = useSupportChatCurrent(client, true, sessionPollMs);
  const activeSession = current.data?.session ?? null;

  // Sessão visível DESTA janela.
  //
  // O servidor devolve o DESFECHO (Declined/Expired/Ended) de propósito — é o
  // que tira o painel de "Aguardando confirmação" quando o usuário clica em
  // "Agora não". Só que o mesmo dado, ao ABRIR a janela, ressuscitava a última
  // conversa da máquina: o atendente via o histórico anterior (de outro
  // atendente/turno, sobre outro usuário final) e o auto-start nem disparava.
  //
  // Agora só adotamos sessão TERMINAL se for a MESMA sessão que esta janela já
  // acompanhava ao vivo (ver supportChatSessionVisibility.ts). Abrir do zero
  // ignora o histórico antigo e oferece/inicia uma conversa nova.
  //
  // O estado é CHAVEADO pelo client (ticket:<id> | agent:<id>): a janela/rota
  // pode trocar de agent reutilizando o mesmo componente e, sem a chave, a
  // sessão do agent anterior continuaria na tela (histórico de OUTRA máquina).
  const [visible, setVisible] = useState<{ key: string; session: TicketChatSession } | null>(null);
  useEffect(() => {
    if (!activeSession) return;
    setVisible((previous) => {
      const known = previous?.key === client.key ? previous.session : null;
      return shouldAdoptSupportChatSession(activeSession, known)
        ? { key: client.key, session: activeSession }
        : previous;
    });
  }, [activeSession, client.key]);

  const visibleSession = visible?.key === client.key ? visible.session : null;

  // Antes do efeito rodar, uma sessão AO VIVO já pode ser exibida (evita
  // "Sem conversa" piscando numa conversa ativa).
  const session =
    visibleSession ??
    (activeSession && isLiveSupportChatStatus(activeSession.status) ? activeSession : null);

  // "Aguardando confirmação" NÃO pode depender só de activeSession — e agora
  // também não pode depender de uma sessão terminal antiga. O status da sessão
  // visível é o que mantém a verificação curta enquanto a resposta pode chegar.
  const knownStatus = session?.status ?? null;
  const waitingDecision = knownStatus === "Pending";

  useEffect(() => {
    setPendingDecision(waitingDecision);
  }, [waitingDecision]);

  useEffect(() => {
    if (!waitingDecision) return undefined;
    // Janela do agente (ou aba) voltando ao foco: confere na hora, sem esperar
    // o próximo tick.
    const onFocus = () => {
      void current.refetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingDecision]);

  const sessionId = session?.id;
  // A consulta da sessão corrente devolve null quando a conversa termina, mas a
  // última sessão visível ainda diz "Active". Normalizar aqui é o que desabilita
  // o compositor e esconde o "Encerrar" numa conversa já encerrada — antes o
  // campo de texto e o botão Enviar continuavam ativos.
  const sessionEnded = !activeSession && session?.status === "Active";
  const sessionForUi = sessionEnded && session ? { ...session, status: "Ended" as const } : session;

  const messagesQuery = useSupportChatMessages(
    client,
    sessionId,
    Boolean(sessionId),
    messagesIntervalMs,
  );
  const { loadOlder, isLoadingOlder, hasMoreOlder } = useLoadOlderSupportChatMessages(
    client,
    sessionId,
  );

  const start = useStartSupportChat(client);
  const retry = useRetrySupportChatInvite(client);
  const send = useSendSupportChatMessage(client, sessionId);
  const end = useEndSupportChat(client);
  const transfer = useTransferSupportChat(client);
  const linkTicket = useLinkSupportChatToTicket(client);
  const assistedAction = useRequestAssistedAction(client);
  const macrosQuery = useTicketMacros({
    clientId: client.realtimeScope.clientId ?? undefined,
    includeGlobal: true,
  });

  const filteredMacros = useMemo(() => {
    const q = draft.startsWith("/") ? draft.slice(1).trim().toLowerCase() : "";
    return (macrosQuery.data ?? [])
      .filter((m) => m.isActive)
      .filter((m) => {
        if (!q) return true;
        return m.name.toLowerCase().includes(q) || m.content.toLowerCase().includes(q);
      })
      .slice(0, 10);
  }, [macrosQuery.data, draft]);

  useEffect(() => {
    setActiveMacroIndex(0);
  }, [macrosOpen, draft]);

  function applyMacro(content: string) {
    setDraft((prev) =>
      prev.startsWith("/") ? content : prev ? `${prev}\n${content}` : content,
    );
    setMacrosOpen(false);
  }

  const handleTypingEvent = useCallback(
    (payload: { authorName?: string; isTyping: boolean }) => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (!payload.isTyping) {
        setTypingAuthor(null);
        return;
      }
      setTypingAuthor(payload.authorName?.trim() || "Usuário");
      typingTimerRef.current = window.setTimeout(() => {
        setTypingAuthor(null);
        typingTimerRef.current = null;
      }, 4500);
    },
    [],
  );

  useSupportChatRealtime(client, sessionId, true, handleTypingEvent);

  // Esta janela e a conversa AO VIVO: enquanto ela estiver aberta, visivel e em
  // foco, o servidor nao cria notificacao de mensagem para este atendente — a
  // mensagem esta na frente dele. Fechar, ocultar ou tirar o foco libera o aviso.
  useSupportChatPresence(client, sessionId, Boolean(sessionId));

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const prevLastMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    prevLastMsgIdRef.current = null;
    setTypingAuthor(null);
    setHasUnreadBelow(false);
    isNearBottomRef.current = true;
    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (localTypingTimerRef.current !== null) {
        window.clearTimeout(localTypingTimerRef.current);
        localTypingTimerRef.current = null;
      }
    };
  }, [client.key, sessionId]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    const prevId = prevLastMsgIdRef.current;
    prevLastMsgIdRef.current = last.id;

    // Quando prevId === last.id (ex.: carregar mensagens anteriores no topo),
    // preserva a posição de leitura atual em vez de puxar para o rodapé.
    const isInitialOrNewTail = prevId === null || prevId !== last.id;
    if (!isInitialOrNewTail) return;

    // Só auto-rola se o usuário já estava no rodapé ou se a mensagem é dele mesmo.
    if (isNearBottomRef.current || isOwnMessage(last)) {
      bottomRef.current?.scrollIntoView({ block: "end" });
      setHasUnreadBelow(false);
    } else if (prevId !== null) {
      setHasUnreadBelow(true);
    }

    // Som + notificação do navegador quando chega mensagem do usuário final fora de foco.
    if (
      prevId !== null &&
      String(last.authorKind).toLowerCase() === "enduser" &&
      (document.hidden || (typeof document.hasFocus === "function" && !document.hasFocus()))
    ) {
      if (!soundMuted) {
        playChatNotificationSound();
      }
      notifyDesktopChatMessage(last.authorName || "Usuário", last.body || "");
    }
  }, [messages, soundMuted]);

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

  const hasUploadingAttachments = pendingUploads.some((item) => !item.attachmentId);

  function createClientMessageId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function clearLocalTyping() {
    if (localTypingTimerRef.current !== null) {
      window.clearTimeout(localTypingTimerRef.current);
      localTypingTimerRef.current = null;
    }
    if (lastTypingSentAtRef.current > 0 && sessionId) {
      lastTypingSentAtRef.current = 0;
      void client.sendTyping(sessionId, false).catch(() => {});
    }
  }

  function notifyLocalTyping() {
    if (!sessionId || !canSend) return;
    const now = Date.now();
    if (now - lastTypingSentAtRef.current >= 2500) {
      lastTypingSentAtRef.current = now;
      void client.sendTyping(sessionId, true).catch(() => {});
    }
    if (localTypingTimerRef.current !== null) {
      window.clearTimeout(localTypingTimerRef.current);
    }
    localTypingTimerRef.current = window.setTimeout(() => {
      localTypingTimerRef.current = null;
      lastTypingSentAtRef.current = 0;
      void client.sendTyping(sessionId, false).catch(() => {});
    }, 3000);
  }

  function handleSend() {
    if (hasUploadingAttachments) {
      toast("Aguarde a conclusão do upload dos anexos antes de enviar.");
      return;
    }
    const body = draft.trim();
    const attachmentIds = pendingUploads.map((item) => item.attachmentId).filter(Boolean) as string[];
    if (!body && !attachmentIds.length) return;

    clearLocalTyping();
    const sentSet = new Set(attachmentIds);

    send.mutate(
      { body, attachmentIds, clientMessageId: createClientMessageId() },
      {
        onSuccess: () => {
          setDraft("");
          setMacrosOpen(false);
          setPendingUploads((prev) => {
            const remaining: typeof prev = [];
            for (const item of prev) {
              if (item.attachmentId && sentSet.has(item.attachmentId)) {
                if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
              } else {
                remaining.push(item);
              }
            }
            return remaining;
          });
        },
        onError: (error: unknown) =>
          toast.error(describeError(error, "Não foi possível enviar a mensagem.")),
      },
    );
  }

  /**
   * Abre a JANELA de controle remoto da máquina — o mesmo caminho do botão
   * "Controle remoto" do detalhe/listagem do agent.
   *
   * O window.open precisa nascer de um gesto do usuário: o launcher abre a
   * janela de forma síncrona no clique e só depois devolve a promise.
   */
  function handleOpenRemoteControl() {
    if (!remoteControlAgentId || openingRemote) return;
    setOpeningRemote(true);
    void openRemoteSessionPopup({ agentId: remoteControlAgentId, kind: 'screen', transport: 'nats' })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : "Falha ao abrir o controle remoto.",
        );
      })
      .finally(() => setOpeningRemote(false));
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
      // timeoutMs: 0 — ver TicketChatHistory.openAttachment: o timeout padrao de
      // 60s abortava anexos grandes e o catch mascarava a causa.
      const response = await apiFetchResponse(
        client.attachmentUrl(sessionId!, attachment.id),
        { timeoutMs: 0 },
      );
      if (!response.ok) throw new Error("HTTP " + response.status);
      const blob = await response.blob();

      if (!isImageAttachment(attachment.contentType, attachment.fileName)) {
        triggerBlobDownload(blob, attachment.fileName);
        return;
      }

      if (lightboxUrlRef.current) URL.revokeObjectURL(lightboxUrlRef.current);
      const url = URL.createObjectURL(blob);
      lightboxUrlRef.current = url;
      setLightbox({ url, fileName: attachment.fileName, blob });
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
  // Outro agent na MESMA janela/componente: o auto-start é por máquina, então
  // libera a trava (senão a segunda máquina nunca abriria a conversa).
  useEffect(() => {
    autoStartedRef.current = false;
  }, [client.key]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current || disabledReason || !canManage) return;
    if (current.isLoading) return;

    autoStartedRef.current = true;
    // Sessão TERMINAL antiga não conta: abrir a janela com ?start=1 precisa
    // iniciar uma conversa NOVA, não só reexibir a anterior.
    if (session) return;

    start.mutate(undefined, {
      onSuccess: () => toast.success(client.startSuccessMessage),
      onError: (error: unknown) =>
        toast.error(extractConflictMessage(error) ?? "Não foi possível iniciar o chat."),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, canManage, current.isLoading, session, disabledReason]);

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

        <div className="flex flex-wrap items-center gap-2">
          {sessionForUi?.status === "Pending" && canManage && (
            <Button size="sm" variant="ghost" onClick={handleRetry} disabled={retry.isPending}>
              <Icon name="refresh" className="h-4 w-4" /> Reenviar convite
            </Button>
          )}
          {sessionForUi?.status === "Active" && canManage && (
            <Button size="sm" variant="danger" onClick={() => setEndConfirmOpen(true)} disabled={end.isPending}>
              <Icon name="close" className="h-4 w-4" /> Encerrar
            </Button>
          )}
          {canStart && (
            <Button size="sm" onClick={handleStart} disabled={start.isPending}>
              {sessionForUi ? "Iniciar nova conversa" : "Iniciar chat"}
            </Button>
          )}
          <div ref={actionsMenuRef} className="relative">
            <Button
              size="sm"
              variant="ghost"
              aria-haspopup="menu"
              aria-expanded={actionsMenuOpen}
              aria-label="Mais ações do chat"
              title="Mais ações"
              onClick={() => setActionsMenuOpen((prev) => !prev)}
            >
              <Icon name="more_vert" className="h-4 w-4" />
            </Button>
            {actionsMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-1.5 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-xl"
              >
                {sessionForUi?.status === "Active" && canManage && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setTransferModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-foreground hover:bg-surface-hover"
                  >
                    <Icon name="swap_horiz" className="h-4 w-4 text-muted" />
                    Transferir atendimento
                  </button>
                )}
                {sessionForUi && !sessionForUi.ticketId && client.linkTicket && canManage && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setLinkTicketModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-foreground hover:bg-surface-hover"
                  >
                    <Icon name="confirmation_number" className="h-4 w-4 text-muted" />
                    Converter em chamado
                  </button>
                )}
                {sessionForUi && messages.length > 0 && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActionsMenuOpen(false);
                        exportChatTranscript(sessionForUi, messages, "md");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-foreground hover:bg-surface-hover"
                    >
                      <Icon name="download" className="h-4 w-4 text-muted" />
                      Exportar transcrição (.md)
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActionsMenuOpen(false);
                        exportChatTranscript(sessionForUi, messages, "txt");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-foreground hover:bg-surface-hover"
                    >
                      <Icon name="download" className="h-4 w-4 text-muted" />
                      Exportar transcrição (.txt)
                    </button>
                  </>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSoundMuted((prev) => !prev);
                    setActionsMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-foreground hover:bg-surface-hover"
                >
                  <Icon
                    name={soundMuted ? "notifications" : "notifications_off"}
                    className="h-4 w-4 text-muted"
                  />
                  {soundMuted ? "Ativar som de notificação" : "Silenciar som de notificação"}
                </button>
              </div>
            )}
          </div>
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
        <div className="relative flex min-h-0 flex-1 flex-col rounded-xl border border-border">
          <div
            ref={messagesContainerRef}
            onScroll={() => {
              const el = messagesContainerRef.current;
              if (!el) return;
              const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              isNearBottomRef.current = near;
              if (near) setHasUnreadBelow(false);
            }}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
          >
            {hasMoreOlder && messages.length >= 200 && (
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isLoadingOlder}
                  onClick={() => void loadOlder()}
                >
                  {isLoadingOlder ? "Carregando…" : "Carregar mensagens anteriores"}
                </Button>
              </div>
            )}
            {messagesQuery.isLoading && <p className="text-sm text-muted">Carregando mensagens…</p>}
            {!messagesQuery.isLoading && messages.length === 0 && (
              <p className="text-sm text-muted">
                {sessionForUi.status === "Active"
                  ? "Nenhuma mensagem ainda. Envie a primeira."
                  : sessionForUi.status === "Pending"
                    ? "Aguardando a confirmação na máquina do usuário."
                    : "Nenhuma mensagem nesta conversa."}
              </p>
            )}

            {messages.map((message, index) => {
              const prevMsg = index > 0 ? messages[index - 1] : null;
              const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
              const currentDay = getDayKey(message.createdAt);
              const prevDay = prevMsg ? getDayKey(prevMsg.createdAt) : null;
              const dayLabel =
                currentDay && currentDay !== prevDay ? formatDaySeparator(message.createdAt) : null;

              const isSystem = String(message.authorKind).toLowerCase() === "system";
              const groupedWithPrev = Boolean(prevMsg && !dayLabel && isSameAuthorGroup(prevMsg, message));
              const groupedWithNext = Boolean(
                nextMsg &&
                  currentDay === getDayKey(nextMsg.createdAt) &&
                  isSameAuthorGroup(message, nextMsg),
              );
              const isOptimistic = message.sequenceNumber === Number.MAX_SAFE_INTEGER;

              if (isSystem) {
                return (
                  <div key={message.id || String(message.sequenceNumber)} className="flex flex-col items-center gap-2">
                    {dayLabel && (
                      <span className="my-1 rounded-full bg-surface-light px-3 py-0.5 text-[10px] font-medium text-muted">
                        {dayLabel}
                      </span>
                    )}
                    <p className="max-w-[85%] rounded-full border border-border bg-surface-light px-3 py-1 text-center text-[11px] text-muted">
                      {message.body}
                    </p>
                  </div>
                );
              }
              return (
                <div
                  key={message.id || String(message.sequenceNumber)}
                  className={groupedWithPrev ? "!mt-1" : undefined}
                >
                  {dayLabel && (
                    <div className="my-2 flex justify-center">
                      <span className="rounded-full bg-surface-light px-3 py-0.5 text-[10px] font-medium text-muted">
                        {dayLabel}
                      </span>
                    </div>
                  )}
                  <div className={"flex flex-col " + (isOwnMessage(message) ? "items-end" : "items-start")}>
                    {message.body && message.body.trim().length > 0 && (
                      <div
                        className={
                          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm " +
                          (isOptimistic ? "opacity-75 " : "") +
                          (isOwnMessage(message)
                            ? "bg-primary text-white rounded-br-md"
                            : "border border-border bg-surface-light text-foreground rounded-bl-md")
                        }
                      >
                        {message.body}
                      </div>
                    )}
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
                    {(!groupedWithNext || isOptimistic) && (
                      <span className="mt-1 text-[11px] text-muted">
                        {(message.authorName || (isOwnMessage(message) ? "Suporte" : "Usuário")) +
                          (message.createdAt ? " · " + formatDateTime(message.createdAt) : "") +
                          (isOptimistic ? " · enviando…" : "")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {hasUnreadBelow && (
            <button
              type="button"
              onClick={() => {
                bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
                setHasUnreadBelow(false);
              }}
              className="mx-auto mb-2 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-medium text-primary shadow-sm hover:bg-primary/25"
            >
              Novas mensagens ↓
            </button>
          )}

          {typingAuthor && (
            <div className="px-4 pb-1 text-xs italic text-muted">
              {typingAuthor} está digitando…
            </div>
          )}

          {/* Composer — mesma linguagem do Chat IA e do comentário do agent:
              uma caixa única arredondada com o textarea como corpo e os
              ícones de ANEXAR e ENVIAR flutuando no canto inferior direito
              (antes o clipe ficava isolado à esquerda e o botão "Enviar" com
              rótulo ocupava uma linha própria). */}
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
                      <Icon name="attach_file" className="h-3 w-3" />
                    )}
                    <span className="max-w-[180px] truncate">{item.fileName}</span>
                    {!item.attachmentId ? <span className="text-muted">enviando…</span> : null}
                    <button
                      type="button"
                      aria-label={`Remover ${item.fileName}`}
                      onClick={() => {
                        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
                        setPendingUploads((prev) => prev.filter((p) => p.key !== item.key));
                      }}
                      className="rounded p-0.5 text-muted hover:bg-surface-hover hover:text-foreground"
                    >
                      <Icon name="close" className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

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

            {/* Caixa única (mesmo padrão do composer do agent): o textarea é o
                corpo do box e os ícones ficam sobrepostos no canto inferior
                direito. O padding direito do textarea reserva a faixa dos
                botões (controle remoto, anexar e enviar) para o texto nunca
                passar por baixo deles. O foco é indicado pela caixa
                (:focus-within), sem borda própria no campo. */}
            <div
              ref={composerBoxRef}
              className="relative rounded-xl border border-border bg-surface px-3 pt-2 pb-1.5 transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20"
            >
              {macrosOpen && canSend && (
                <div className="absolute right-0 bottom-full left-0 z-20 mb-2 max-h-52 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                  <div className="flex items-center justify-between px-2 py-1 text-[11px] font-medium text-muted">
                    <span>Respostas rápidas (↑↓ navega, Enter insere, Esc fecha)</span>
                    <button type="button" onClick={() => setMacrosOpen(false)} className="hover:text-foreground">
                      Fechar
                    </button>
                  </div>
                  {filteredMacros.map((macro, idx) => (
                    <button
                      key={macro.id}
                      type="button"
                      onMouseEnter={() => setActiveMacroIndex(idx)}
                      onClick={() => applyMacro(macro.content)}
                      className={
                        "flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left " +
                        (idx === activeMacroIndex ? "bg-primary/15" : "hover:bg-surface-hover")
                      }
                    >
                      <span className="text-xs font-medium text-foreground">{macro.name}</span>
                      <span className="line-clamp-1 text-[11px] text-muted">{macro.content}</span>
                    </button>
                  ))}
                  {filteredMacros.length === 0 && (
                    <p className="px-2.5 py-2 text-xs text-muted">Nenhuma macro encontrada.</p>
                  )}
                </div>
              )}
              <textarea
                className="block min-h-[52px] w-full resize-none border-0 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60"
                rows={2}
                placeholder={canSend ? "Escreva para o usuário… (/ para macros, Enter envia)" : "A conversa não está ativa."}
                value={draft}
                disabled={!canSend}
                onChange={(event) => {
                  const val = event.target.value;
                  const wasSlash = draft.startsWith("/");
                  setDraft(val);
                  if (val.startsWith("/")) {
                    setMacrosOpen(true);
                  } else if (wasSlash && macrosOpen) {
                    setMacrosOpen(false);
                  }
                  notifyLocalTyping();
                }}
                onPaste={(event) => {
                  const files = event.clipboardData?.files;
                  if (files && files.length > 0 && canSend) {
                    event.preventDefault();
                    void handleFiles(files);
                  }
                }}
                onKeyDown={(event) => {
                  if (macrosOpen && filteredMacros.length > 0) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveMacroIndex((prev) => (prev + 1) % filteredMacros.length);
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveMacroIndex((prev) => (prev - 1 + filteredMacros.length) % filteredMacros.length);
                      return;
                    }
                    if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
                      event.preventDefault();
                      const chosen = filteredMacros[activeMacroIndex] ?? filteredMacros[0];
                      if (chosen) applyMacro(chosen.content);
                      return;
                    }
                  }
                  if (macrosOpen && event.key === "Escape") {
                    event.preventDefault();
                    setMacrosOpen(false);
                    return;
                  }
                  if (macrosOpen && draft.startsWith("/") && filteredMacros.length === 0 && event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
              />

              <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/50 pt-1.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMacrosOpen((prev) => !prev)}
                    disabled={!canSend}
                    title="Inserir resposta rápida (macro)"
                    aria-label="Inserir resposta rápida"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Icon name="bolt" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!sessionId) return;
                      assistedAction.mutate(
                        { sessionId, actionType: "request_screenshot" },
                        {
                          onSuccess: () => toast.success("Solicitação de captura de tela enviada."),
                          onError: (err) => toast.error(describeError(err, "Falha ao solicitar captura.")),
                        },
                      );
                    }}
                    disabled={!canSend || assistedAction.isPending}
                    title="Solicitar print da tela ao usuário"
                    aria-label="Solicitar print da tela ao usuário"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Icon name="add_photo_alternate" className="h-4 w-4" />
                  </button>
                  {canRemoteControl && (
                    <button
                      type="button"
                      onClick={handleOpenRemoteControl}
                      disabled={openingRemote}
                      title="Abrir o controle remoto desta máquina"
                      aria-label="Abrir o controle remoto desta máquina"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Icon name="desktop_windows" className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!canSend || send.isPending}
                    title="Anexar arquivo ou print"
                    aria-label="Anexar arquivo ou print"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Icon name="attach_file" className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!canSend || send.isPending || hasUploadingAttachments}
                  title={hasUploadingAttachments ? "Aguarde o upload dos anexos…" : "Enviar (Enter)"}
                  aria-label="Enviar mensagem"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-all hover:bg-primary/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Icon name="send" className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      <ImageLightbox
        open={Boolean(lightbox)}
        src={lightbox?.url}
        alt={lightbox?.fileName}
        onClose={closeLightbox}
        onError={() => {
          if (!lightbox) return;
          const pending = lightbox;
          toast.error("Não foi possível exibir o anexo. Baixando o arquivo…");
          triggerBlobDownload(pending.blob, pending.fileName);
          closeLightbox();
        }}
      />
      <ConfirmDialog
        open={endConfirmOpen}
        title="Encerrar conversa"
        message="Tem certeza que deseja encerrar este atendimento ao vivo?"
        confirmLabel="Encerrar"
        tone="danger"
        isLoading={end.isPending}
        onConfirm={() => {
          setEndConfirmOpen(false);
          void handleEnd();
        }}
        onClose={() => setEndConfirmOpen(false)}
      />
      <TransferChatModal
        open={transferModalOpen}
        isLoading={transfer.isPending}
        onClose={() => setTransferModalOpen(false)}
        onConfirm={(targetUserId) => {
          if (!sessionId) return;
          transfer.mutate(
            { sessionId, targetUserId },
            {
              onSuccess: () => {
                setTransferModalOpen(false);
                toast.success("Atendimento transferido.");
              },
              onError: (err) => toast.error(describeError(err, "Falha ao transferir atendimento.")),
            },
          );
        }}
      />
      <LinkTicketModal
        open={linkTicketModalOpen}
        isLoading={linkTicket.isPending}
        onClose={() => setLinkTicketModalOpen(false)}
        onConfirm={(payload) => {
          if (!sessionId) return;
          linkTicket.mutate(
            { sessionId, data: payload },
            {
              onSuccess: (updated) => {
                setLinkTicketModalOpen(false);
                toast.success(
                  updated.ticketId
                    ? `Conversa vinculada ao chamado ${updated.ticketId.slice(0, 8)}.`
                    : "Conversa vinculada ao chamado.",
                );
              },
              onError: (err) => toast.error(describeError(err, "Falha ao vincular chamado.")),
            },
          );
        }}
      />
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
        // timeoutMs: 0 — mesma rota de anexo de openAttachment: a imagem chega
        // inteira para gerar o object URL; o timeout padrao de 60s abortava no
        // meio em anexo grande e o catch abaixo mascarava a causa.
        const response = await apiFetchResponse(
          client.attachmentUrl(sessionId!, attachment.id),
          { timeoutMs: 0 },
        );
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
      <Icon name="attach_file" className="h-3 w-3" /> {attachment.fileName}
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