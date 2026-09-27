import { useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button } from "@/components/ui";
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

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <Bot className="h-4 w-4" />
        <p className="text-sm font-medium">Triagem por IA</p>
      </div>

      {decision.isLoading && (
        <p className="text-xs text-muted">Carregando decisão da IA...</p>
      )}

      {!decision.isLoading && !data && (
        <p className="text-xs text-muted">
          Nenhuma decisão registrada. Use "Sugerir com IA" para avaliar a equipe deste chamado.
        </p>
      )}

      {data && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge color={data.strategySource === "ai" ? "accent" : "slate"}>
              {SOURCE_LABELS[data.strategySource] ?? data.strategySource}
            </Badge>
            <span className="text-foreground">
              {data.chosenUserName ?? data.chosenUserId ?? "sem responsável"}
            </span>
            {data.confidence > 0 && (
              <span className="text-xs text-muted">confiança {pct(data.confidence)}</span>
            )}
            <span className="text-xs text-muted">dificuldade {data.difficulty}/5</span>
            {data.maxOutputTokens > 0 && (
              <span className="text-xs text-muted">orçamento {data.maxOutputTokens} tokens</span>
            )}
            <Badge color={data.applied ? "success" : "warning"}>
              {data.applied ? "aplicada" : "não aplicada"}
            </Badge>
          </div>

          {data.rationale && <p className="text-xs text-muted">{data.rationale}</p>}

          {candidates.length > 0 && (
            <>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "Ocultar candidatos" : "Ver " + candidates.length + " candidato(s)"}
              </button>
              {expanded && (
                <ul className="space-y-1">
                  {candidates.map((candidate) => (
                    <li
                      key={candidate.userId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-light px-2 py-1 text-xs"
                    >
                      <span className="text-foreground">
                        {candidate.userName ?? candidate.userId}
                      </span>
                      <span className="text-muted">
                        score {candidate.score.toFixed(2)} · skill {candidate.skillScore.toFixed(2)} ·
                        afinidade {candidate.affinityScore.toFixed(2)} · {candidate.openNow} abertos
                      </span>
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
          onClick={() =>
            preview.mutate(ticketId, {
              onSuccess: () => toast.success("Triagem executada. Sugestão registrada."),
              onError: () => toast.error("Não foi possível executar a triagem por IA."),
            })
          }
        >
          <Sparkles className="mr-1.5 inline h-3.5 w-3.5" />
          Sugerir com IA
        </Button>
        <Button
          size="sm"
          loading={apply.isPending}
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
