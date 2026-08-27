import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal, Button, Input } from "@/components/ui";

export type SitePowerAction = "restart" | "shutdown";

interface SitePowerConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  siteName: string;
  action: SitePowerAction;
  onlineCount: number;
  offlineCount: number;
  totalCount: number;
  onConfirm: (data: {
    delaySeconds: number;
    force: boolean;
    message: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

export default function SitePowerConfirmationModal({
  open,
  onClose,
  siteName,
  action,
  onlineCount,
  offlineCount,
  totalCount,
  onConfirm,
  isLoading = false,
}: SitePowerConfirmationModalProps) {
  const isRestart = action === "restart";
  const title = isRestart ? "Reiniciar todos os agentes do site" : "Desligar todos os agentes do site";
  const defaultDelay = isRestart ? 15 : 30;

  const [delaySeconds, setDelaySeconds] = useState(defaultDelay);
  const [force, setForce] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const confirmed = confirmation.trim() === siteName;
  const canSubmit = confirmed && delaySeconds >= 1 && onlineCount > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await onConfirm({ delaySeconds, force, message });
      onClose();
    } catch {
      // onConfirm já trata erro com toast.
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Aviso */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" />
            <div>
              <p className="font-semibold text-amber-400">
                Esta ação afetará TODOS os agentes do site
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                O comando de {isRestart ? "reinicialização" : "desligamento"} será
                enviado para <strong className="text-foreground">{onlineCount} agente(s) online</strong> do site{" "}
                <strong className="text-foreground">"{siteName}"</strong>.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {offlineCount > 0
                  ? `Os ${offlineCount} agente(s) offline não receberão o comando.`
                  : "Não há agentes offline no site."}
              </p>
              <p className="mt-1 text-xs text-muted">
                Total de agentes no site: {totalCount}
              </p>
            </div>
          </div>
        </div>

        {onlineCount === 0 && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            Nenhum agente online para receber o comando. A ação foi desabilitada.
          </div>
        )}

        {/* Delay */}
        <div>
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
        </div>

        {/* Force */}
        <label className="flex cursor-pointer items-center gap-3">
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
        <Input
          label="Mensagem (opcional)"
          placeholder="Mensagem exibida ao usuário antes da ação..."
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 512))}
        />

        {/* Confirmation */}
        <div className="rounded-lg border border-border bg-surface-light p-3">
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
            Digite o nome do site para confirmar
          </label>
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={siteName}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder-muted transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {confirmation.length > 0 && !confirmed && (
            <p className="mt-1 text-xs text-red-500">
              O texto digitado não corresponde ao nome do site.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            variant={isRestart ? "secondary" : "danger"}
            onClick={() => { void handleSubmit(); }}
            disabled={!canSubmit}
            loading={isLoading}
          >
            {isLoading ? "Enviando..." : `${isRestart ? "Reiniciar" : "Desligar"} ${onlineCount} agente(s)`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}