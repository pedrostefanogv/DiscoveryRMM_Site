import { History, Trash2 } from "lucide-react";
import { Button, Card, Badge } from "@/components/ui";
import { useReportTemplateHistory } from "@/hooks";

const ACTION_LABELS = {
  created: "Criado",
  updated: "Atualizado",
  deleted: "Excluído",
  imported: "Importado",
  exported: "Exportado",
  favorited: "Favoritado",
  unfavorited: "Desfavoritado",
} as const;

const ACTION_COLORS = {
  created: "success" as const,
  updated: "primary" as const,
  deleted: "danger" as const,
  imported: "success" as const,
  exported: "slate" as const,
  favorited: "warning" as const,
  unfavorited: "slate" as const,
};

export function ReportTemplateHistoryPanel() {
  const { history, clearHistory } = useReportTemplateHistory();

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-300" />
          <h3 className="text-sm font-semibold text-white">Histórico</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={clearHistory}>
          <Trash2 className="h-4 w-4" />
          Limpar
        </Button>
      </div>

      <div className="max-h-72 space-y-2 overflow-auto pr-1">
        {history.length === 0 && (
          <p className="text-sm text-slate-400">Sem alterações registradas.</p>
        )}

        {history.map((entry) => (
          <div
            key={entry.id}
            className="rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">{entry.templateName}</p>
              <Badge color={ACTION_COLORS[entry.action]}>
                {ACTION_LABELS[entry.action]}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {entry.details || "Sem detalhes"}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {new Date(entry.timestamp).toLocaleString("pt-BR")} por {entry.actor}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
