import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui";

export interface RemoteConsentNoticeProps {
  /** Mensagem enviada pelo servidor (já com o nome do operador). */
  message?: string | null;
  /** Segundos restantes até a ação automática. */
  remainingSeconds: number;
  /** Motivo/origem da política (ex.: "Site"). */
  policySource?: string | null;
  onCancel: () => void;
  cancelling?: boolean;
}

/**
 * Overlay exibido no console enquanto o usuário do computador acessado decide
 * se autoriza a sessão de desktop. O viewer NÃO conecta antes do "granted".
 */
export default function RemoteConsentNotice({
  message,
  remainingSeconds,
  policySource,
  onCancel,
  cancelling,
}: RemoteConsentNoticeProps) {
  const safeSeconds = Math.max(0, Math.floor(remainingSeconds));
  return (
    <div
      data-testid="remote-consent-notice"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/20 text-warning">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Aguardando autorização</p>
            <p className="text-xs text-muted">
              O usuário do computador precisa permitir o acesso remoto.
            </p>
          </div>
        </div>

        <p className="mb-3 whitespace-pre-line text-sm text-foreground">
          {message || "Solicitação de acesso remoto enviada ao usuário do computador."}
        </p>

        <div className="mb-4 rounded-lg bg-surface-hover px-3 py-2 text-xs text-muted">
          <p>
            Ação automática em <strong className="text-foreground">{safeSeconds}s</strong> se o
            usuário não responder.
          </p>
          {policySource ? <p className="mt-1">Política: {policySource}</p> : null}
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={cancelling}>
            {cancelling ? "Cancelando..." : "Cancelar solicitação"}
          </Button>
        </div>
      </div>
    </div>
  );
}
