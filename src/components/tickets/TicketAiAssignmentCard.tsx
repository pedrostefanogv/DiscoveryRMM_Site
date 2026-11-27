import { useState } from "react";
import toast from "react-hot-toast";
import { Icon, Badge, Button } from "@/components/ui";
import {
  useApplyTicketAssignment,
  usePreviewTicketAssignment,
  useTicketAssignmentDecision,
} from "@/hooks/useTicketAi";

const SOURCE_LABELS: Record<string, string> = {
  ai: "Escolha da IA",
  fallback_score: "Maior score",
  fallback_strategy: "Fallback determinístico",
  ai_unavailable: "IA indisponível",
  ai_budget_exceeded: "Limite de uso de IA",
  no_candidates: "Sem candidatos",
  error: "Erro",
};

function pct(value: number): string {
  return (value * 100).toFixed(0) + "%";
}

function parseRationale(raw: string): { summary: string; notes: string[] } {
  const parts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return { summary: "", notes: [] };

  const [summary, ...rest] = parts;
  const notes = rest.filter(
    (part) =>
      !/^origem do candidato:/i.test(part) &&
      !/^score\s+[0-9.,]+/i.test(part),
  );

  return { summary, notes };
}

/**
 * Decisão da triagem por IA para o chamado: quem foi escolhido, com que
 * confiança, por qual motivo e quais candidatos foram avaliados. Permite rodar
 * a triagem sob demanda (sugerir) ou reavaliar e atribuir.
 */
export function TicketAiAssignmentCard({ ticketId }: { ticketId: string }) {
  const decision = useTicketAssignmentDecision(ticketId);
  const preview = usePreviewTicketAssignment();
  const apply = useApplyTicketAssignment();
  const [expanded, setExpanded] = useState(false);

  const data = decision.data;
  const candidates = data?.candidates ?? [];
  const parsedRationale = data?.rationale ? parseRationale(data.rationale) : null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <Icon name="smart_toy" className="h-4 w-4" />
        <p className="text-sm font-medium">Triagem por IA</p>
      </div>

      {decision.isLoading && (
        <p className="text-xs text-muted">Carregando decisão da IA...</p>
      )}

      {!decision.isLoading && decision.isError && (
        <p className="text-xs text-danger">
          Não foi possível carregar a decisão da triagem por IA.
        </p>
      )}

      {!decision.isLoading && !decision.isError && !data && (
        <p className="text-xs text-muted">
          Nenhuma decisão registrada. Use "Sugerir com IA" para avaliar a equipe deste chamado.
        </p>
      )}

      {data && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {data.chosenUserName ?? data.chosenUserId ?? "sem responsável"}
              </span>
              <Badge color={data.strategySource === "ai" ? "accent" : "slate"}>
                {SOURCE_LABELS[data.strategySource] ?? data.strategySource}
              </Badge>
            </div>
            <Badge color={data.applied ? "success" : "warning"}>
              {data.applied ? "aplicada" : "não aplicada"}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {data.confidence > 0 && (
                <span>Confiança {pct(data.confidence)}</span>
              )}
              <span>Dificuldade {data.difficulty}/5</span>
              {data.model && <span>Modelo {data.model}</span>}
              {data.tokensUsed > 0 && <span>{data.tokensUsed} tokens</span>}
            </div>
            {data.confidence > 0 && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-light">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, data.confidence * 100))}%` }}
                />
              </div>
            )}
          </div>

          {!data.applied && data.notAppliedReason && (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning">
              Motivo de não aplicação: {data.notAppliedReason}
            </p>
          )}

          {parsedRationale && parsedRationale.summary && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {parsedRationale.summary}
            </p>
          )}

          {parsedRationale && parsedRationale.notes.length > 0 && (
            <p className="rounded-lg bg-surface-light px-2.5 py-1.5 text-[11px] leading-snug text-muted">
              {parsedRationale.notes.join(" · ")}
            </p>
          )}

          {candidates.length > 0 && (
            <>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "Ocultar candidatos" : "Ver " + candidates.length + " candidato(s)"}
              </button>
              {expanded && (
                <ul className="space-y-1">
                  {candidates.map((candidate) => (
                    <li
                      key={candidate.userId}
                      className="flex flex-col gap-0.5 rounded-lg bg-surface-light px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {candidate.userName ?? candidate.userId}
                        </span>
                        <span className="text-muted">
                          score {candidate.score.toFixed(2)} · skill {candidate.skillScore.toFixed(2)} ·
                          afinidade {candidate.affinityScore.toFixed(2)} · {candidate.openNow} abertos
                        </span>
                      </div>
                      {candidate.bestAffinityTicketTitle && (
                        <span className="text-[11px] text-muted">
                          Referência: {candidate.bestAffinityTicketTitle}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          loading={preview.isPending}
          disabled={preview.isPending || apply.isPending}
          onClick={() =>
            preview.mutate(ticketId, {
              onSuccess: () => toast.success("Triagem executada. Sugestão registrada."),
              onError: () => toast.error("Não foi possível executar a triagem por IA."),
            })
          }
        >
          <Icon name="bolt" className="h-3.5 w-3.5" />
          Sugerir com IA
        </Button>
        <Button
          size="sm"
          loading={apply.isPending}
          disabled={preview.isPending || apply.isPending}
          onClick={() =>
            apply.mutate(ticketId, {
              onSuccess: (result) => {
                if (result.applied) toast.success("Chamado atribuído pela IA.");
                else toast.error("A IA não aplicou a atribuição (" + result.result + ").");
              },
              onError: () => toast.error("Não foi possível aplicar a triagem por IA."),
            })
          }
        >
          Reavaliar e atribuir com IA
        </Button>
      </div>
    </div>
  );
}
