import { useState } from "react";
import { Power, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import type { Agent } from "@/api";

export interface PowerActionModalProps {
  agent: Agent & { clientName?: string; clientId?: string };
  action: "restart" | "shutdown";
  onClose: () => void;
  onConfirm: (data: { delaySeconds: number; force: boolean; message: string }) => Promise<void>;
  isLoading?: boolean;
}

export default function PowerActionModal({
  agent,
  action,
  onClose,
  onConfirm,
  isLoading = false,
}: PowerActionModalProps) {
  const isRestart = action === "restart";
  const title = isRestart ? "Reiniciar agente" : "Desligar agente";
  const defaultDelay = isRestart ? 15 : 30;
  const Icon = isRestart ? RotateCcw : Power;

  const [delaySeconds, setDelaySeconds] = useState(defaultDelay);
  const [force, setForce] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    try {
      await onConfirm({ delaySeconds, force, message });
      toast.success(
        `Comando de ${isRestart ? "reinicialização" : "desligamento"} enviado para ${agent.displayName ?? agent.hostname}.`,
      );
      onClose();
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : `Falha ao enviar comando de ${isRestart ? "reinicialização" : "desligamento"}.`;
      toast.error(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              isRestart ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="truncate text-sm text-muted">
              {agent.displayName ?? agent.hostname}
            </p>
          </div>
        </div>

        {/* Warning */}
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {isRestart
              ? "O agente será reiniciado após o tempo configurado. Certifique-se de que não há tarefas críticas em execução."
              : "O agente será desligado após o tempo configurado. Você precisará de acesso físico ou Wake-on-LAN para religá-lo."}
          </p>
        </div>

        {/* Delay */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
            Tempo de espera (segundos)
          </label>
          <input
            type="number"
            min={1}
            max={3600}
            value={delaySeconds}
            onChange={(e) => setDelaySeconds(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <p className="mt-1 text-xs text-muted">
            O agente será {isRestart ? "reiniciado" : "desligado"} em {delaySeconds} segundo{delaySeconds !== 1 ? "s" : ""}.
          </p>
        </div>

        {/* Force */}
        <label className="mb-4 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="h-4 w-4 rounded border-border-strong bg-surface-light text-primary focus:ring-primary/30"
          />
          <div>
            <span className="text-sm text-muted-foreground">Forçar</span>
            <p className="text-xs text-muted">
              Não aguardar o fechamento de aplicativos abertos.
            </p>
          </div>
        </label>

        {/* Message */}
        <div className="mb-6">
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
            Mensagem (opcional)
          </label>
          <input
            type="text"
            maxLength={512}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Mensagem exibida ao usuário antes da ação..."
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>

        {/* Actions */}
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
            disabled={isLoading || delaySeconds < 1}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isRestart
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-red-600 hover:bg-red-500"
            }`}
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLoading
              ? "Enviando..."
              : `${isRestart ? "Reiniciar" : "Desligar"} em ${delaySeconds}s`}
          </button>
        </div>
      </div>
    </div>
  );
}
