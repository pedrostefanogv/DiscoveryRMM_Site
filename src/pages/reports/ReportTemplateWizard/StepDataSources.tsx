import { useState } from "react";
import { Button } from "@/components/ui";
import type { DatasetCatalogItem } from "@/api/types";
import { useJoinSuggestions } from "./hooks/useJoinSuggestions";
import { getJoinFieldOptions, stripAlias } from "./hooks/joinKeys";

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

function fieldOptionValue(
  field: { reference?: string; field?: string },
  alias: string,
): string {
  const reference = stripAlias(field.reference ?? field.field);
  return reference ? `${alias}.${reference}` : "";
}

export function StepDataSources({ wizard, datasets, onNext }: Props) {
  const [search, setSearch] = useState("");
  const { suggestions, warnings, issues } = useJoinSuggestions(
    wizard.state.selectedDatasets,
    datasets,
  );

  const blockedAliases = new Set(issues.map((issue) => issue.alias));

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

  const hasProblems = warnings.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Escolha as fontes de dados
        </h2>
        <p className="text-sm text-muted">
          Selecione os datasets que irão compor o relatório. A primeira fonte é a
          principal; as demais se ligam a ela por uma chave de join.
        </p>
      </div>

      {/* Selected datasets chain */}
      {wizard.state.selectedDatasets.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            Fontes selecionadas
          </h3>
          <div className="flex flex-wrap items-start gap-3">
            {wizard.state.selectedDatasets.map((ds, i) => {
              const isPrimary = i === 0;
              const hasIssue = blockedAliases.has(ds.alias);
              const joinLabel =
                ds.joinSourceKey && ds.joinTargetKey
                  ? `ON ${stripAlias(ds.joinSourceKey)} → ${stripAlias(ds.joinTargetKey)}`
                  : null;

              return (
                <div key={ds.alias} className="flex items-start gap-2">
                  {i > 0 && (
                    <div className="flex items-center gap-1 pt-3 text-xs text-muted">
                      <div className="h-px w-6 bg-sky-500/50" />
                      <span
                        className={`rounded px-1.5 py-0.5 font-medium ${
                          joinLabel
                            ? "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
                            : "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                        }`}
                      >
                        {joinLabel ?? "sem join"}
                      </span>
                      <div className="h-px w-6 bg-sky-500/50" />
                    </div>
                  )}

                  <div
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                      isPrimary
                        ? "border-primary/50 bg-primary/10"
                        : hasIssue
                          ? "border-red-500/40 bg-red-500/5"
                          : "border-border bg-surface-light"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        aria-label={`Mover ${ds.catalogItem.name ?? ds.alias} para cima`}
                        title="Mover para cima"
                        disabled={i === 0}
                        onClick={() => wizard.moveDataset(ds.alias, "up")}
                        className="rounded px-1 text-[10px] leading-none text-muted hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        aria-label={`Mover ${ds.catalogItem.name ?? ds.alias} para baixo`}
                        title="Mover para baixo"
                        disabled={i === wizard.state.selectedDatasets.length - 1}
                        onClick={() => wizard.moveDataset(ds.alias, "down")}
                        className="rounded px-1 text-[10px] leading-none text-muted hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </div>

                    <span className="text-lg">
                      {DATASET_ICONS[ds.catalogItem.key ?? ""] ?? "📄"}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {ds.catalogItem.name ?? ds.catalogItem.key}
                      </div>
                      <div className="text-[10px] text-muted">
                        alias: {ds.alias}
                        {isPrimary ? " (principal)" : ""}
                      </div>
                    </div>
                    {wizard.state.selectedDatasets.length > 1 && (
                      <button
                        onClick={() => wizard.removeDataset(ds.alias)}
                        className="ml-1 rounded p-1 text-muted hover:bg-danger/10 hover:text-danger"
                        title="Remover"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Join configuration - uma linha por fonte secundaria */}
      {wizard.state.selectedDatasets.length > 1 && (
        <div className="rounded-xl border border-border bg-surface-light p-4">
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            🔗 Chaves de ligação (join)
          </h3>
          <p className="mb-3 text-xs text-muted">
            Cada fonte secundária precisa de uma chave em comum com a fonte com
            que se liga. As opções vêm do catálogo do backend.
          </p>

          <div className="space-y-3">
            {wizard.state.selectedDatasets.map((ds, index) => {
              if (index === 0) return null;

              const sourceFields = getJoinFieldOptions(ds.catalogItem);
              const targetDs = wizard.state.selectedDatasets.find(
                (candidate) => candidate.alias === ds.joinToAlias,
              );
              const targetFields = targetDs ? getJoinFieldOptions(targetDs.catalogItem) : [];

              const sourceValue = ds.joinSourceKey
                ? fieldOptionValue(
                    {
                      reference: stripAlias(ds.joinSourceKey),
                      field: stripAlias(ds.joinSourceKey),
                    },
                    ds.alias,
                  )
                : "";
              const targetValue =
                ds.joinTargetKey && targetDs
                  ? fieldOptionValue(
                      {
                        reference: stripAlias(ds.joinTargetKey),
                        field: stripAlias(ds.joinTargetKey),
                      },
                      targetDs.alias,
                    )
                  : "";

              const sourceValueMissing =
                sourceValue !== "" &&
                !sourceFields.some(
                  (field) => fieldOptionValue(field, ds.alias) === sourceValue,
                );
              const targetValueMissing =
                targetValue !== "" &&
                !targetFields.some(
                  (field) => fieldOptionValue(field, targetDs!.alias) === targetValue,
                );

              return (
                <div
                  key={ds.alias}
                  className="grid gap-3 rounded-lg border border-border bg-surface p-3 md:grid-cols-4"
                >
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Join com
                    </label>
                    <select
                      aria-label={`Join com (fonte ${index + 1})`}
                      title={`Join com (fonte ${index + 1})`}
                      value={ds.joinToAlias ?? ""}
                      onChange={(event) => {
                        const joinToAlias = event.target.value;
                        const nextTarget = wizard.state.selectedDatasets.find(
                          (candidate) => candidate.alias === joinToAlias,
                        );
                        const common = nextTarget
                          ? getJoinFieldOptions(ds.catalogItem).find((field) =>
                              getJoinFieldOptions(nextTarget.catalogItem).some(
                                (candidateField) =>
                                  stripAlias(candidateField.reference ?? candidateField.field) ===
                                  stripAlias(field.reference ?? field.field),
                              ),
                            )
                          : undefined;
                        const key = common
                          ? stripAlias(common.reference ?? common.field)
                          : "";
                        wizard.setJoin(ds.alias, {
                          joinToAlias,
                          joinSourceKey: key,
                          joinTargetKey: key,
                        });
                      }}
                      className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground"
                    >
                      <option value="" className="bg-surface">
                        Selecione
                      </option>
                      {wizard.state.selectedDatasets
                        // O backend exige joinToAlias para uma fonte ANTERIOR.
                        .filter((_, candidateIndex) => candidateIndex < index)
                        .map((candidate) => (
                          <option
                            key={candidate.alias}
                            value={candidate.alias}
                            className="bg-surface"
                          >
                            {candidate.alias} — {candidate.catalogItem.name ?? candidate.alias}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Source key ({ds.alias})
                    </label>
                    <select
                      aria-label={`Source key (fonte ${index + 1})`}
                      title={`Source key (fonte ${index + 1})`}
                      value={sourceValue}
                      disabled={!targetDs}
                      onChange={(event) => {
                        const raw = event.target.value;
                        wizard.setJoin(ds.alias, {
                          joinSourceKey: stripAlias(raw),
                        });
                      }}
                      className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground disabled:opacity-50"
                    >
                      <option value="" className="bg-surface">
                        Selecione
                      </option>
                      {sourceValueMissing && (
                        <option value={sourceValue} className="bg-surface">
                          {sourceValue} (atual)
                        </option>
                      )}
                      {sourceFields.map((field) => {
                        const value = fieldOptionValue(field, ds.alias);
                        if (!value) return null;
                        return (
                          <option key={value} value={value} className="bg-surface">
                            {field.label ?? stripAlias(field.reference ?? field.field)}
                            {field.isJoinKey ? " (join)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Target key ({targetDs?.alias ?? "—"})
                    </label>
                    <select
                      aria-label={`Target key (fonte ${index + 1})`}
                      title={`Target key (fonte ${index + 1})`}
                      value={targetValue}
                      disabled={!targetDs}
                      onChange={(event) => {
                        const raw = event.target.value;
                        wizard.setJoin(ds.alias, {
                          joinTargetKey: stripAlias(raw),
                        });
                      }}
                      className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground disabled:opacity-50"
                    >
                      <option value="" className="bg-surface">
                        Selecione
                      </option>
                      {targetValueMissing && targetDs && (
                        <option value={targetValue} className="bg-surface">
                          {targetValue} (atual)
                        </option>
                      )}
                      {targetDs &&
                        targetFields.map((field) => {
                          const value = fieldOptionValue(field, targetDs.alias);
                          if (!value) return null;
                          return (
                            <option key={value} value={value} className="bg-surface">
                              {field.label ??
                                stripAlias(field.reference ?? field.field)}
                              {field.isJoinKey ? " (join)" : ""}
                            </option>
                          );
                        })}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Join type
                    </label>
                    <select
                      aria-label={`Tipo de join (fonte ${index + 1})`}
                      title={`Tipo de join (fonte ${index + 1})`}
                      value={ds.joinType ?? "left"}
                      onChange={(event) =>
                        wizard.setJoin(ds.alias, {
                          joinType: event.target.value === "inner" ? "inner" : "left",
                        })
                      }
                      className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-sm text-foreground"
                    >
                      <option value="left" className="bg-surface">
                        left — mantém todas as linhas da origem
                      </option>
                      <option value="inner" className="bg-surface">
                        inner — só linhas que casam
                      </option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Join suggestions */}
      {suggestions.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
          <h3 className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            💡 Sugestões de combinação
          </h3>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 12).map((s) => {
              const ds = datasets.find(
                (d) => (d.key ?? d.type ?? "") === s.targetKey,
              );
              if (!ds || isDatasetSelected(ds)) return null;
              return (
                <button
                  key={`${s.sourceKey}-${s.targetKey}`}
                  onClick={() => wizard.addDataset(ds)}
                  className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-100 px-3 py-2 text-sm text-amber-900 transition-colors hover:bg-amber-200 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                >
                  <span>{DATASET_ICONS[s.targetKey] ?? "📄"}</span>
                  <span>{s.targetDatasetName}</span>
                  <span className="text-[10px] text-amber-700 dark:text-amber-400/70">
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
        <div className="rounded-xl border border-red-500/30 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/5">
          <h3 className="mb-2 text-sm font-medium text-red-800 dark:text-red-300">
            ⚠️ Problemas detectados
          </h3>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-red-700 dark:text-red-200/80">
                • {w}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-red-700/80 dark:text-red-200/60">
            Resolva os problemas acima para avançar.
          </p>
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
      <div className="flex items-center justify-end gap-3">
        {hasProblems && (
          <span className="text-xs text-red-600 dark:text-red-300">
            Configure as chaves de ligação para continuar.
          </span>
        )}
        <Button
          onClick={onNext}
          disabled={wizard.state.selectedDatasets.length === 0 || hasProblems}
          variant="primary"
          title={hasProblems ? "Resolva os problemas detectados antes de avançar" : undefined}
        >
          Próximo: Organização →
        </Button>
      </div>
    </div>
  );
}
