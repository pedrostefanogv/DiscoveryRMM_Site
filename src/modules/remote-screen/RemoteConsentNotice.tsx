import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui";

export interface RemoteConsentNoticeProps {
  /** Nome do operador que solicitou o acesso (resolvido no servidor). */
  operator?: string | null;
  /** Timestamp (ms) do deadline da decisão — usado só pela animação. */
  deadlineAt?: number | null;
  /** Ação padrão quando o tempo expira: approve | deny. */
  timeoutAction?: string | null;
  /** Motivo/origem da política (ex.: "Site"). */
  policySource?: string | null;
  onCancel: () => void;
  cancelling?: boolean;
}

const RING_RADIUS = 17;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Overlay exibido no console enquanto o usuário do computador acessado decide
 * se autoriza a sessão de desktop. O viewer NÃO conecta antes do "granted".
 *
 * O aviso é orientado ao SOLICITANTE (operador): mostra quem pediu, qual ação a
 * política aplicará se ninguém responder e um contador VISUAL (anel drenando) —
 * sem número de segundos na tela.
 */
export default function RemoteConsentNotice({
  operator,
  deadlineAt,
  timeoutAction,
  policySource,
  onCancel,
  cancelling,
}: RemoteConsentNoticeProps) {
  const action = (timeoutAction ?? "").trim().toLowerCase();
  const approves = action === "approve";
  const denies = action === "deny";

  // Duração do anel: diferença entre agora e o deadline no momento da montagem.
  // Depois disso o overlay não re-renderiza por segundo — a animação é CSS.
  const durationSeconds = useMemo(() => {
    if (!deadlineAt) return 0;
    return Math.max(1, Math.ceil((deadlineAt - Date.now()) / 1000));
  }, [deadlineAt]);

  const [draining, setDraining] = useState(false);
  // Evita múltiplos cliques no cancelamento enquanto o overlay ainda está na tela.
  const [cancelRequested, setCancelRequested] = useState(false);
  useEffect(() => {
    if (durationSeconds <= 0) return;
    // 60ms dão ao navegador um frame para pintar o anel cheio antes da transição.
    const id = window.setTimeout(() => setDraining(true), 60);
    return () => window.clearTimeout(id);
  }, [durationSeconds]);

  const countdown =
    durationSeconds > 0 ? (
      <svg
        viewBox="0 0 40 40"
        className="h-10 w-10 shrink-0 -rotate-90"
        aria-hidden="true"
        data-testid="remote-consent-countdown"
      >
        <circle cx="20" cy="20" r={RING_RADIUS} fill="none" strokeWidth="4" className="stroke-warning/20" />
        <circle
          cx="20"
          cy="20"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className={approves ? "stroke-success" : "stroke-warning"}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={draining ? RING_CIRCUMFERENCE : 0}
          style={{ transition: `stroke-dashoffset ${durationSeconds}s linear` }}
        />
      </svg>
    ) : (
      <span
        className="h-10 w-10 shrink-0 animate-spin rounded-full border-2 border-warning/20 border-t-warning"
        aria-hidden="true"
        data-testid="remote-consent-countdown"
      />
    );

  const defaultAction = approves ? (
    <>
      Se o usuário não responder, o acesso será{" "}
      <strong className="font-semibold text-success">PERMITIDO</strong> automaticamente.
    </>
  ) : denies ? (
    <>
      Se o usuário não responder, o acesso será{" "}
      <strong className="font-semibold text-danger">NEGADO</strong> automaticamente.
    </>
  ) : (
    <>Se o usuário não responder, a ação padrão da política será aplicada automaticamente.</>
  );

  return (
    <div
      data-testid="remote-consent-notice"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remote-consent-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
        <div className="mb-3 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/20 text-warning">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p
              id="remote-consent-title"
              role="status"
              aria-live="polite"
              className="text-sm font-semibold text-foreground"
            >
              Aguardando o usuário remoto autorizar o acesso
            </p>
            <p className="mt-0.5 text-xs text-muted">
              O acesso remoto só inicia após a autorização no computador acessado.
            </p>
          </div>
        </div>

        <p className="mb-3 whitespace-pre-line text-sm text-foreground">
          {operator
            ? `${operator} solicitou acesso remoto a este computador.`
            : "Solicitação de acesso remoto enviada ao computador."}
        </p>

        <div className="mb-4 flex items-start gap-3 rounded-lg border border-border bg-surface-hover px-3 py-2.5 text-xs text-muted">
          {countdown}
          <div className="min-w-0">
            <p className="text-sm text-foreground">{defaultAction}</p>
            {policySource ? <p className="mt-1">Política: {policySource}</p> : null}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCancelRequested(true);
              onCancel();
            }}
            disabled={cancelling || cancelRequested}
          >
            {cancelling || cancelRequested ? "Cancelando..." : "Cancelar solicitação"}
          </Button>
        </div>
      </div>
    </div>
  );
}
