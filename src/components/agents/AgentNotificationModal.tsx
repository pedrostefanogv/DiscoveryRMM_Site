import { useMemo, useState } from "react";
import { Bell, Loader2, MessageSquare, Send, Clock, AlertTriangle, Info, HelpCircle, XCircle } from "lucide-react";
import toast from "react-hot-toast";

export type NotificationMode = "wait" | "timeout" | "toast";
export type NotificationIcon = "info" | "warning" | "error" | "question";

export interface AgentNotificationPayload {
  title: string;
  message: string;
  /** 0 = Toast, 1 = Modal (prompt PSADT). */
  alertType: number;
  /** null/ausente + modal = aguarda o clique em OK. */
  timeoutSeconds: number | null;
  icon: NotificationIcon;
}

interface AgentNotificationModalProps {
  agent: { id: string; displayName?: string | null; hostname: string };
  onClose: () => void;
  onConfirm: (data: AgentNotificationPayload) => Promise<void>;
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

export default function AgentNotificationModal({
  agent,
  onClose,
  onConfirm,
  isLoading = false,
}: AgentNotificationModalProps) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<NotificationMode>("wait");
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [icon, setIcon] = useState<NotificationIcon>("info");

  const targetName = agent.displayName ?? agent.hostname;

  const effectiveTimeout = useMemo(() => {
    if (mode === "wait") return null;
    // O toast é não-bloqueante e o tempo de exibição é controlado pelo
    // Windows/balloon; enviamos apenas um valor padrão.
    if (mode === "toast") return 15;
    return Math.min(MAX_PROMPT_SECONDS, Math.max(5, timeoutSeconds || 60));
  }, [mode, timeoutSeconds]);

  const canSubmit = title.trim().length > 0 && message.trim().length > 0 && !isLoading;

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
      toast.success(`Notificação enviada para ${targetName}.`);
      onClose();
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Falha ao enviar a notificação para o agent.";
      toast.error(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-foreground">Enviar notificação</h3>
            <p className="truncate text-sm text-muted">{targetName}</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
            Título
          </label>
          <input
            type="text"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Manutenção programada"
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
            Mensagem
          </label>
          <textarea
            rows={4}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Texto exibido na tela do usuário..."
            className="w-full resize-y rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <p className="mt-1 text-right text-xs text-muted">{message.length}/2000</p>
        </div>

        <div className="mb-4">
          <span className="mb-1.5 block text-sm font-medium text-muted-foreground">Comportamento</span>
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
        </div>

        {mode === "timeout" && (
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
              Fechar automaticamente após (segundos)
            </label>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted" />
              <input
                type="number"
                min={5}
                max={MAX_PROMPT_SECONDS}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              { `O prompt fecha sozinho após ${effectiveTimeout}s se o usuário não responder (máx. ${MAX_PROMPT_SECONDS}s).` }
            </p>
          </div>
        )}

        <div className="mb-6">
          <span className="mb-1.5 block text-sm font-medium text-muted-foreground">Ícone</span>
          <div className="flex flex-wrap gap-2">
            {ICONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setIcon(value)}
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
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <MessageSquare className="h-3.5 w-3.5" />
            Exibido na sessão do usuário via PSADT
          </p>
          <div className="flex items-center gap-3">
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
