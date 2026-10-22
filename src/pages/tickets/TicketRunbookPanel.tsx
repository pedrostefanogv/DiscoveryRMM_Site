import { useMemo, useState } from "react";
import { Play, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button, Select } from "@/components/ui";
import { useExecuteRunbook } from "@/hooks/useRunbook";
import type { RunbookStepResultDto } from "@/api/runbook";
import type { TicketMacroDto } from "@/api/support-productivity";

/**
 * Painel de execução de runbook na área de macros do detalhe do chamado:
 * executa a macro escolhida (POST /api/v1/tickets/{id}/runbook/execute) e
 * mostra o resultado por passo (ok/falha, preview de saída e link do
 * comentário de evidência).
 */
export function TicketRunbookPanel({ ticketId, macros }: { ticketId: string; macros: TicketMacroDto[] }) {
  const runbookMacros = useMemo(
    () => macros.filter((m) => (m.runbookSteps ?? []).length > 0),
    [macros],
  );
  const [selectedMacroId, setSelectedMacroId] = useState("");
  const execute = useExecuteRunbook(ticketId);
  const [result, setResult] = useState<RunbookStepResultDto[] | null>(null);

  const selectedMacro = runbookMacros.find((m) => m.id === selectedMacroId) ?? null;

  const run = async () => {
    if (!selectedMacro) return;
    try {
      const executed = await execute.mutateAsync({ macroId: selectedMacro.id });
      setResult(executed.steps);
      toast.success("Runbook executado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao executar runbook");
    }
  };

  if (runbookMacros.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-3" data-testid="runbook-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Zap className="h-4 w-4 text-muted" />
        <span className="text-sm font-medium text-foreground">Runbook</span>
        <Select
          aria-label="Selecionar runbook"
          fullWidth={false}
          className="min-w-[220px]"
          value={selectedMacroId}
          onChange={(event) => {
            setSelectedMacroId(event.target.value);
            setResult(null);
          }}
          options={[
            { value: "", label: "Selecione um runbook..." },
            ...runbookMacros.map((m) => ({ value: m.id, label: m.name })),
          ]}
        />
        <Button
          size="sm"
          onClick={() => void run()}
          disabled={!selectedMacro || execute.isPending}
          loading={execute.isPending}
        >
          <Play className="h-4 w-4" />
          {execute.isPending ? "Executando..." : "Executar runbook"}
        </Button>
      </div>

      {result && result.length > 0 && (
        <ol className="mt-3 space-y-2">
          {result
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((step) => (
              <li
                key={step.order}
                className="rounded-md border border-border bg-surface-light p-2 text-xs"
                data-testid={`runbook-step-${step.order}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">Passo {step.order}</span>
                  <Badge color={step.ok ? "success" : "danger"}>
                    {step.ok ? "OK" : "FALHA"}
                  </Badge>
                  {step.exitCode !== null && (
                    <span className="text-muted">exit {step.exitCode}</span>
                  )}
                  <span className="text-muted">{step.durationMs} ms</span>
                  {step.commentId && (
                    <a
                      className="text-primary hover:underline"
                      href={`#comment-${step.commentId}`}
                    >
                      ver comentário
                    </a>
                  )}
                </div>
                {step.outputPreview && (
                  <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-surface p-2 text-[11px] text-muted">
                    {step.outputPreview}
                  </pre>
                )}
              </li>
            ))}
        </ol>
      )}
    </div>
  );
}

export default TicketRunbookPanel;
