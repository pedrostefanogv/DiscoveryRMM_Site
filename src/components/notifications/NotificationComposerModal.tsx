import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Loader2,
  MessageSquare,
  Send,
  Clock,
  AlertTriangle,
  Info,
  HelpCircle,
  XCircle,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

export type NotificationMode = "wait" | "timeout" | "toast";
export type NotificationIcon = "info" | "warning" | "error" | "question";

export interface NotificationPayload {
  title: string;
  message: string;
  /** 0 = Toast, 1 = Modal (prompt PSADT). */
  alertType: number;
  /** null/ausente + modal = aguarda o clique em OK. */
  timeoutSeconds: number | null;
  icon: NotificationIcon;
}

interface NotificationComposerModalProps {
  /** Rótulo do alvo: nome do agent, do site ou do cliente. */
  targetLabel: string;
  /** Linha de apoio exibida sob o nome (ex.: "8 agentes serão notificados"). */
  targetHint?: string;
  /** Quando informado, exibe o banner de alcance do broadcast. */
  recipientCount?: number;
  /** Nome do escopo para o banner (ex.: "este site"). */
  recipientScopeLabel?: string;
  /** Título do modal. */
  heading?: string;
  /** Mensagem exibida no toast de sucesso. */
  successMessage?: string;
  /** Permite ao chamador suprimir o toast (ex.: quando já dá feedback próprio). */
  showSuccessToast?: boolean;
  onClose: () => void;
  onConfirm: (data: NotificationPayload) => Promise<void>;
  isLoading?: boolean;
}

/**
 * Maior timeout aceito pelo Show-ADTDialogBox com o config.psd1 padrão do
 * PSADT (UI.DefaultTimeout = 3300s). Valores acima são rejeitados pelo cmdlet.
 */
const MAX_PROMPT_SECONDS = 3300;

const MODES: { value: NotificationMode; label: string; description: string }[] = [
  {
    value: "wait",
    label: "Prompt até clicar em OK",
    description:
      "A janela permanece aberta até o usuário confirmar (respeitando o limite de segurança do PSADT). Ideal para avisos importantes.",
  },
  {
    value: "timeout",
    label: "Prompt com fechamento automático",
    description: "A janela fecha sozinha após o tempo definido, caso o usuário não interaja.",
  },
  {
    value: "toast",
    label: "Notificação rápida (toast)",
    description: "Aviso não-bloqueante que desaparece sozinho. Não exige interação.",
  },
];

const ICONS: { value: NotificationIcon; label: string; Icon: typeof Info }[] = [
  { value: "info", label: "Informação", Icon: Info },
  { value: "warning", label: "Aviso", Icon: AlertTriangle },
  { value: "error", label: "Erro", Icon: XCircle },
  { value: "question", label: "Pergunta", Icon: HelpCircle },
];

const inputClass =
  "w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";

/**
 * Compositor reutilizável de notificação PSADT (modal/toast). Usado para um
 * agent único e para broadcasts por cliente/site/label.
 */
export default function NotificationComposerModal({
  targetLabel,
  targetHint,
  recipientCount,
  recipientScopeLabel = "este escopo",
  heading = "Enviar notificação",
  successMessage,
  showSuccessToast = true,
  onClose,
  onConfirm,
  isLoading = false,
}: NotificationComposerModalProps) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<NotificationMode>("wait");
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [icon, setIcon] = useState<NotificationIcon>("info");

  // Escape fecha o modal e o scroll do body fica travado enquanto aberto —
  // mesmo comportamento do Modal compartilhado.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const effectiveTimeout = useMemo(() => {
    if (mode === "wait") return null;
    // O toast é não-bloqueante e o tempo de exibição é controlado pelo
    // Windows/balloon; enviamos apenas um valor padrão.
    if (mode === "toast") return 15;
    return Math.min(MAX_PROMPT_SECONDS, Math.max(5, timeoutSeconds || 60));
  }, [mode, timeoutSeconds]);

  const canSubmit =
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    !isLoading &&
    (recipientCount === undefined || recipientCount > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await onConfirm({
        title: title.trim(),
        message: message.trim(),
        alertType: mode === "toast" ? 0 : 1,
        timeoutSeconds: effectiveTimeout,
        icon,
      });
      if (showSuccessToast) {
        toast.success(successMessage ?? `Notificação enviada para ${targetLabel}.`);
      }
      onClose();
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Falha ao enviar a notificação.";
      toast.error(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="relative z-10 w-full max-w-lg overflow-y-auto max-h-[90vh] rounded-xl border border-border bg-surface p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-foreground">{heading}</h3>
            <p className="truncate text-sm text-muted">{targetLabel}</p>
            {targetHint && <p className="truncate text-xs text-muted">{targetHint}</p>}
          </div>
        </div>

        {recipientCount !== undefined && (
          <div
            className={`mb-4 flex items-start gap-2 rounded-lg border p-3 text-xs ${
              recipientCount > 0
                ? "border-primary/30 bg-primary/5 text-muted-foreground"
                : "border-warning/40 bg-warning/10 text-foreground"
            }`}
          >
            {recipientCount > 0 ? (
              <>
                <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  A notificação será enviada para <strong className="text-foreground">{recipientCount}</strong>{" "}
                  agente{recipientCount === 1 ? "" : "s"} de {recipientScopeLabel}.
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                <span>Nenhum agente encontrado em {recipientScopeLabel}. Cadastre/instale um agente antes de notificar.</span>
              </>
            )}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground" htmlFor="notif-title">
            Título
          </label>
          <input
            id="notif-title"
            type="text"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Manutenção programada"
            className={inputClass}
          />
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground" htmlFor="notif-message">
            Mensagem
          </label>
          <textarea
            id="notif-message"
            rows={4}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Texto exibido na tela do usuário..."
            className={`${inputClass} resize-y`}
          />
          <p className="mt-1 text-right text-xs text-muted">{message.length}/2000</p>
        </div>

        <fieldset className="mb-4">
          <legend className="mb-1.5 block text-sm font-medium text-muted-foreground">Comportamento</legend>
          <div className="space-y-2">
            {MODES.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  mode === option.value
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:bg-surface-hover"
                }`}
              >
                <input
                  type="radio"
                  name="notification-mode"
                  className="mt-0.5 h-4 w-4 text-primary focus:ring-primary/30"
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                />
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">{option.label}</span>
                  <span className="block text-xs text-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode === "timeout" && (
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground" htmlFor="notif-timeout">
              Fechar automaticamente após (segundos)
            </label>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted" />
              <input
                id="notif-timeout"
                type="number"
                min={5}
                max={MAX_PROMPT_SECONDS}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              { `O prompt fecha sozinho após ${effectiveTimeout}s se o usuário não responder (máx. ${MAX_PROMPT_SECONDS}s).` }
            </p>
          </div>
        )}

        <fieldset className="mb-6">
          <legend className="mb-1.5 block text-sm font-medium text-muted-foreground">Ícone</legend>
          <div className="flex flex-wrap gap-2">
            {ICONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setIcon(value)}
                aria-pressed={icon === value}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  icon === value
                    ? "border-primary/50 bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:bg-surface-hover"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <MessageSquare className="h-3.5 w-3.5" />
            Exibido na sessão do usuário via PSADT
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isLoading ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
