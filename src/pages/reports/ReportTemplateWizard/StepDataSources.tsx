import { useState } from "react";
import { Button } from "@/components/ui";
import type { DatasetCatalogItem } from "@/api/types";
import { useJoinSuggestions } from "./hooks/useJoinSuggestions";

interface Props {
  wizard: ReturnType<typeof import("./hooks/useWizardState").useWizardState>;
  datasets: DatasetCatalogItem[];
  onNext: () => void;
}

const DATASET_ICONS: Record<string, string> = {
  softwareInventory: "💿",
  agentHardware: "💻",
  agentLabels: "🏷️",
  automaticLabelRules: "⚙️",
  logs: "📋",
  tickets: "🎫",
  configurationAudit: "🔍",
  automationExecutions: "⚡",
  agentInventoryComposite: "📊",
  agentMonitoringEvents: "📈",
  agentAlerts: "🚨",
  p2pTelemetry: "🔄",
  agentDisks: "💾",
  networkAdapters: "🌐",
  listeningPorts: "🔌",
  printers: "🖨️",
  softwareCatalog: "📚",
  automationScripts: "🧩",
  appPackages: "📦",
  ticketActivity: "📝",
  ticketEscalations: "⏫",
  customFields: "🏷️",
  knowledgeBase: "📖",
};

export function StepDataSources({ wizard, datasets, onNext }: Props) {
  const [search, setSearch] = useState("");
  const { suggestions, warnings } = useJoinSuggestions(wizard.state.selectedDatasets, datasets);

  const filteredDatasets = datasets.filter((ds) => {
    const name = (ds.name ?? ds.key ?? "").toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const isDatasetSelected = (ds: DatasetCatalogItem) => {
    const key = ds.key ?? ds.type ?? "";
    return wizard.state.selectedDatasets.some(
      (s) => (s.catalogItem.key ?? s.catalogItem.type ?? "") === key,
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Escolha as fontes de dados
        </h2>
        <p className="text-sm text-muted">
          Selecione os datasets que irão compor o relatório. O primeiro será o
          principal.
        </p>
      </div>

      {/* Selected datasets chain */}
      {wizard.state.selectedDatasets.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            Fontes selecionadas
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            {wizard.state.selectedDatasets.map((ds, i) => (
              <div key={ds.alias} className="flex items-center gap-2">
                {i > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <div className="h-px w-6 bg-sky-500/50" />
                    <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-300">
                      ON {ds.joinSourceKey}
                    </span>
                    <div className="h-px w-6 bg-sky-500/50" />
                  </div>
                )}
                <div
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                    ds.isPrimary
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-surface-light"
                  }`}
                >
                  <span className="text-lg">
                    {DATASET_ICONS[ds.catalogItem.key ?? ""] ?? "📄"}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {ds.catalogItem.name ?? ds.catalogItem.key}
                    </div>
                    <div className="text-[10px] text-muted">
                      alias: {ds.alias}
                      {ds.isPrimary ? " (principal)" : ""}
                    </div>
                  </div>
                  {wizard.state.selectedDatasets.length > 1 && (
                    <button
                      onClick={() => wizard.removeDataset(ds.alias)}
                      className="ml-1 rounded p-1 text-muted hover:bg-red-500/10 hover:text-red-400"
                      title="Remover"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join suggestions */}
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <h3 className="mb-2 text-sm font-medium text-amber-300">
            💡 Sugestões de combinação
          </h3>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 4).map((s) => {
              const ds = datasets.find(
                (d) => (d.key ?? d.type ?? "") === s.targetKey,
              );
              if (!ds || isDatasetSelected(ds)) return null;
              return (
                <button
                  key={s.targetKey}
                  onClick={() => wizard.addDataset(ds)}
                  className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 transition-colors hover:bg-amber-500/20"
                >
                  <span>{DATASET_ICONS[s.targetKey] ?? "📄"}</span>
                  <span>{s.targetDatasetName}</span>
                  <span className="text-[10px] text-amber-400/70">
                    via {s.preferredKey}
                  </span>
                  <span className="text-xs">+</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Validation warnings */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <h3 className="mb-2 text-sm font-medium text-red-300">
            ⚠️ Problemas detectados
          </h3>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-red-200/80">
                • {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dataset grid */}
      <div>
        <div className="mb-3">
          <input
            type="text"
            placeholder="Buscar datasets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-foreground placeholder-muted outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDatasets.map((ds) => {
            const key = ds.key ?? ds.type ?? "";
            const isSelected = isDatasetSelected(ds);
            return (
              <button
                key={key}
                onClick={() => !isSelected && wizard.addDataset(ds)}
                disabled={isSelected}
                className={`rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? "cursor-default border-primary/30 bg-primary/10 opacity-60"
                    : "border-border bg-surface-light hover:border-primary/30 hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">
                    {DATASET_ICONS[key] ?? "📄"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {ds.name ?? key}
                    </div>
                    <div className="text-xs text-muted">
                      {ds.description ?? `${(ds.fields ?? []).length} campos`}
                    </div>
                    <div className="mt-1 text-[10px] text-muted">
                      {(ds.fields ?? []).length} campos disponíveis
                    </div>
                    {isSelected && (
                      <div className="mt-1 text-xs text-primary">✓ Selecionado</div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={wizard.state.selectedDatasets.length === 0}
          variant="primary"
        >
          Próximo: Organização →
        </Button>
      </div>
    </div>
  );
}
