import type { Dispatch, SetStateAction } from "react";
import { Eye, Plus, Save, Trash2, X } from "lucide-react";
import { Button, Card, Input, TextArea } from "@/components/ui";
import { ReportTemplateHistoryPanel } from "@/components/reports/ReportTemplateHistoryPanel";
import type { PreviewMode, ReportAutocompleteItem, ReportDatasetTypeValue, ResponseDisposition, ScopeTypeString } from "@/api/types";
import { ALIGN_OPTIONS, DATASET_SECTION_SOURCES } from "./data";
import {
  buildJoinSuggestions,
  getFirstFieldOption,
  getAutoJoinSuggestion,
  getSourceFieldOptions,
  getUniqueJoinFieldOptions,
  mapAutocompleteItemToFieldOption,
  parseJsonObject,
} from "./utils";
import type { FieldOption, LayoutEditorState, NormalizedDataset, SupportedFormat, TemplateDraft } from "./types";

type DraftSetter = Dispatch<SetStateAction<TemplateDraft>>;

const REPORT_FONT_OPTIONS = [
  { label: "Segoe UI (padrão)", value: "Segoe UI, sans-serif" },
  { label: "Inter", value: "Inter, system-ui, sans-serif" },
  { label: "Roboto", value: "Roboto, Arial, sans-serif" },
  { label: "Helvetica Neue", value: "Helvetica Neue, Helvetica, Arial, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Trebuchet MS", value: "Trebuchet MS, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "Times New Roman, Times, serif" },
  { label: "Courier New", value: "Courier New, monospace" },
];

type HeaderProps = {
  isEdit: boolean;
  onBack: () => void;
};

export function TemplateFormHeader({ isEdit, onBack }: HeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{isEdit ? "Editar Template" : "Novo Template"}</h1>
        <p className="text-sm text-muted">
          Builder dinamico de relatorios com preview em HTML e documento.
        </p>
      </div>
      <Button variant="ghost" onClick={onBack}>
        <X className="h-4 w-4" /> Voltar
      </Button>
    </div>
  );
}

type HistoryProps = {
  templateId: string;
  version: number;
};

export function TemplateHistoryCard({ templateId, version }: HistoryProps) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Histórico do Template</h2>
          <p className="text-xs text-muted">Versao atual v{version}</p>
        </div>
      </div>
      <ReportTemplateHistoryPanel templateId={templateId} limit={20} />
    </Card>
  );
}

type IdentificationProps = {
  draft: TemplateDraft;
  setDraft: DraftSetter;
};

export function IdentificationCard({ draft, setDraft }: IdentificationProps) {
  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-foreground">Identificação</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Nome do template"
          value={draft.name}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              name: event.target.value,
            }))
          }
          placeholder="Ex: Inventario de software por agent"
          required
          hint="Nome exibido na listagem de templates e no cabeçalho do relatório gerado."
        />
        <Input
          label="Usuario de auditoria"
          value={draft.auditUser}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              auditUser: event.target.value,
            }))
          }
          placeholder="usuario@empresa.local"
          hint="Registrado nos logs de criação e atualização. Não afeta permissões de acesso."
        />
      </div>
      <div className="mt-4">
        <TextArea
          label="Descrição"
           value={draft.description}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              description: event.target.value,
            }))
          }
          rows={3}
          placeholder="Descrição opcional do template"
          hint="Texto livre para descrever o objetivo do template. Visível apenas no formulário de edição."
        />
      </div>
    </Card>
  );
}

type DataSourceScopeProps = {
  draft: TemplateDraft;
  setDraft: DraftSetter;
  normalizedDatasets: NormalizedDataset[];
  selectedDataset: NormalizedDataset | null;
  defaultFormatOptions: SupportedFormat[];
  scopeOptions: ScopeTypeString[];
  onDatasetChange: (datasetKey: string) => void;
};

export function DataSourceScopeCard({
  draft,
  setDraft,
  normalizedDatasets,
  selectedDataset,
  defaultFormatOptions,
  scopeOptions,
  onDatasetChange,
}: DataSourceScopeProps) {
  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-foreground">Fonte de Dados e Escopo</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Dataset</label>
          <select
            aria-label="Dataset"
            title="Dataset"
            value={draft.datasetKey}
            onChange={(event) => onDatasetChange(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground"
          >
            {normalizedDatasets.map((dataset) => (
              <option key={dataset.key} value={dataset.key} className="bg-surface text-foreground">
                {dataset.name}
              </option>
            ))}
          </select>
          {selectedDataset?.description && (
            <p className="mt-1 text-xs text-muted">{selectedDataset.description}</p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Formato</label>
          <select
            aria-label="Formato do template"
            title="Formato do template"
            value={draft.format}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                format: event.target.value as SupportedFormat,
              }))
            }
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground"
          >
            {(selectedDataset?.supportedFormats ?? defaultFormatOptions).map((format) => (
              <option key={format} value={format} className="bg-surface text-foreground">
                {format.toUpperCase()}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Formato padrão do arquivo gerado. Pode ser sobrescrito na execução.</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Escopo do template</label>
          <select
            aria-label="Escopo do template"
            title="Escopo do template"
            value={draft.scopeType}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                scopeType: event.target.value as ScopeTypeString,
              }))
            }
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground"
          >
            {scopeOptions.map((scope) => (
              <option key={scope} value={scope} className="bg-surface text-foreground">
                {scope}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Define para qual nível o template pode ser executado: <strong className="text-muted">global</strong> (todos), <strong className="text-muted">client</strong>, <strong className="text-muted">site</strong> ou <strong className="text-muted">agent</strong>.</p>
        </div>
      </div>
    </Card>
  );
}

type LayoutBuilderTopSectionProps = {
  layoutEditor: LayoutEditorState;
  setLayoutEditor: Dispatch<SetStateAction<LayoutEditorState>>;
  selectedDataset: NormalizedDataset | null;
  normalizedDatasets: NormalizedDataset[];
  supportedOrientations: string[];
  multiSourceEnabled: boolean;
  multiSourceSchema?: {
    joinTypes?: string[];
    joinRules?: Array<{
      sourceDatasetType?: ReportDatasetTypeValue;
      targetDatasetType?: ReportDatasetTypeValue;
      sourceKey: string;
      targetKey: string;
      joinType?: string;
      description?: string;
    }>;
  };
  fieldOptions: FieldOption[];
  autocompleteAlias: string;
  setAutocompleteAlias: Dispatch<SetStateAction<string>>;
  autocompleteTerm: string;
  setAutocompleteTerm: Dispatch<SetStateAction<string>>;
  autocompleteQuery: {
    isLoading: boolean;
    data?: {
      total?: number;
      items?: ReportAutocompleteItem[];
    };
  };
  handleAddColumn: () => void;
  handleAddSection: (preset?: { source: string; label: string; columns: { field: string; label: string; format: string }[] }) => void;
};

export function LayoutBuilderTopSection({
  layoutEditor,
  setLayoutEditor,
  selectedDataset,
  normalizedDatasets,
  supportedOrientations,
  multiSourceEnabled,
  multiSourceSchema,
  fieldOptions,
  autocompleteAlias,
  setAutocompleteAlias,
  autocompleteTerm,
  setAutocompleteTerm,
  autocompleteQuery,
  handleAddColumn,
  handleAddSection,
}: LayoutBuilderTopSectionProps) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Layout Builder</h2>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleAddColumn}>
            <Plus className="h-4 w-4" /> Coluna
          </Button>
          <select
            aria-label="Adicionar seção"
            title="Adicionar seção"
            className="cursor-pointer rounded-lg border border-border bg-surface-light px-3 py-1.5 text-sm text-foreground hover:bg-surface-hover"
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              if (val === "__blank") {
                handleAddSection();
              } else {
                const key = selectedDataset?.key.toLowerCase() ?? "";
                const preset = (DATASET_SECTION_SOURCES[key] ?? []).find((s) => s.source === val);
                handleAddSection(preset);
              }
            }}
          >
            <option value="" className="bg-surface">+ Seção...</option>
            <option value="__blank" className="bg-surface">Em branco</option>
            {(DATASET_SECTION_SOURCES[selectedDataset?.key.toLowerCase() ?? ""] ?? []).length > 0 && (
              <>
                {(DATASET_SECTION_SOURCES[selectedDataset?.key.toLowerCase() ?? ""] ?? []).map((s) => (
                  <option key={s.source} value={s.source} className="bg-surface">
                    {s.label} ({s.source})
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Título"
          value={layoutEditor.title}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              title: event.target.value,
            }))
          }
          hint="Título principal exibido no cabeçalho do relatório."
        />
        <Input
          label="Subtítulo"
          value={layoutEditor.subtitle}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              subtitle: event.target.value,
            }))
          }
          hint="Linha secundária abaixo do título. Deixe vazio para omitir."
        />
        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Orientação</label>
           <select
             aria-label="Orientação do layout"
             title="Orientação do layout"
            value={layoutEditor.orientation}
            onChange={(event) =>
              setLayoutEditor((prev) => ({
                ...prev,
                orientation: event.target.value,
              }))
            }
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground"
          >
            {supportedOrientations.map((orientation) => (
              <option key={orientation} value={orientation} className="bg-surface text-foreground">
                {orientation}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Retrato (A4 vertical) ou Paisagem (A4 horizontal). Aplicado ao PDF.</p>
        </div>
        <Input
          label="GroupBy"
          value={layoutEditor.groupBy}
          list="report-field-options"
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              groupBy: event.target.value,
            }))
          }
          placeholder="campo do dataset para agrupamento"
          hint="Campo do dataset para agrupar linhas no relatório. Ex.: siteId agrupa os dados por site."
        />
        <Input
          label="Group title template"
          value={layoutEditor.groupTitleTemplate}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              groupTitleTemplate: event.target.value,
            }))
          }
          placeholder="Agent: {{agentName}}"
          hint="Modelo do título de cada grupo. Use {{campo}} para interpolar valores do dataset."
        />
        <Input
          label="Group title prefix"
          value={layoutEditor.groupTitlePrefix}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              groupTitlePrefix: event.target.value,
            }))
          }
          placeholder="Agent"
          hint="Prefixo fixo antes do valor de grupo. Alternativa simples ao template acima."
        />
      </div>
      <datalist id="report-field-options">
        {fieldOptions.map((field) => (
          <option key={field.value} value={field.value}>
            {field.label}
          </option>
        ))}
      </datalist>

      <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
        <input
          aria-label="Ocultar coluna de agrupamento"
          title="Ocultar coluna de agrupamento"
          type="checkbox"
          className="mt-0.5 shrink-0"
          checked={layoutEditor.hideGroupColumn}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              hideGroupColumn: event.target.checked,
            }))
          }
        />
        <span>
          Ocultar coluna de agrupamento
          <span className="ml-1 text-xs text-muted">Quando ativo, a coluna usada no GroupBy não aparece nas linhas da tabela.</span>
        </span>
      </div>

      {multiSourceEnabled && selectedDataset && (
        <div className="mt-5 space-y-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-sky-100">Data sources e joins</h3>
              <p className="text-xs text-sky-200/80">
                Quando houver mais de uma fonte, o layout passa a usar referencias no formato alias.field.
              </p>
            </div>
            <div className="flex gap-2">
              {layoutEditor.dataSources.length === 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const fallbackSecondary =
                      normalizedDatasets.find((dataset) => dataset.key !== selectedDataset.key) ?? selectedDataset;
                    setLayoutEditor((prev) => ({
                      ...prev,
                      dataSources: [
                        {
                          datasetType: selectedDataset.apiDatasetType,
                          alias: selectedDataset.defaultAlias,
                        },
                        {
                          datasetType: fallbackSecondary.apiDatasetType,
                          alias: fallbackSecondary.defaultAlias === selectedDataset.defaultAlias ? `${fallbackSecondary.defaultAlias}2` : fallbackSecondary.defaultAlias,
                          join: {
                            joinToAlias: selectedDataset.defaultAlias,
                            sourceKey: "",
                            targetKey: "",
                            joinType: multiSourceSchema?.joinTypes?.[0] ?? "left",
                          },
                        },
                      ],
                    }));
                    setAutocompleteAlias(selectedDataset.defaultAlias);
                  }}
                >
                  <Plus className="h-4 w-4" /> Ativar multi-source
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const fallbackDataset =
                        normalizedDatasets.find((dataset) => dataset.key !== selectedDataset.key) ?? selectedDataset;
                      setLayoutEditor((prev) => ({
                        ...prev,
                        dataSources: [
                          ...prev.dataSources,
                          {
                            datasetType: fallbackDataset.apiDatasetType,
                            alias: `${fallbackDataset.defaultAlias}${prev.dataSources.length + 1}`,
                            join: {
                              joinToAlias: prev.dataSources[0]?.alias ?? selectedDataset.defaultAlias,
                              sourceKey: "",
                              targetKey: "",
                              joinType: multiSourceSchema?.joinTypes?.[0] ?? "left",
                            },
                          },
                        ],
                      }));
                    }}
                  >
                    <Plus className="h-4 w-4" /> Fonte adicional
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setLayoutEditor((prev) => ({ ...prev, dataSources: [] }));
                      setAutocompleteAlias(selectedDataset.defaultAlias);
                    }}
                  >
                    Limpar
                  </Button>
                </>
              )}
            </div>
          </div>

          {layoutEditor.dataSources.length > 0 && (
            <div className="space-y-3">
              {layoutEditor.dataSources.map((source, index) => {
                const sourceDataset =
                  normalizedDatasets.find((dataset) => String(dataset.apiDatasetType) === String(source.datasetType)) ?? selectedDataset;
                const joinCapabilities = Array.isArray(sourceDataset.joinCapabilities)
                  ? sourceDataset.joinCapabilities
                  : [];

                const targetAliasSource = layoutEditor.dataSources.find((ds) => ds.alias === (source.join?.joinToAlias ?? ""));
                const targetDataset = targetAliasSource
                  ? (normalizedDatasets.find((ds) => String(ds.apiDatasetType) === String(targetAliasSource.datasetType)) ?? selectedDataset)
                  : selectedDataset;

                const sourceKeyFields = getUniqueJoinFieldOptions(sourceDataset.fieldMetadata);
                const targetKeyFields = getUniqueJoinFieldOptions(targetDataset.fieldMetadata);
                const joinSuggestions = buildJoinSuggestions({
                  sourceDatasetType: source.datasetType,
                  targetDatasetType: targetAliasSource?.datasetType,
                  sourceJoinCapabilities: joinCapabilities,
                  schemaJoinRules: multiSourceSchema?.joinRules,
                });

                return (
                  <div key={`${source.alias}-${index}`} className="grid gap-3 rounded-lg border border-border bg-surface-light p-3 md:grid-cols-6">
                    <div>
                      <label className="mb-2 block text-xs font-medium text-muted-foreground">Dataset</label>
                      <select
                        aria-label={`Dataset da fonte ${index + 1}`}
                        title={`Dataset da fonte ${index + 1}`}
                        value={String(source.datasetType)}
                        onChange={(event) =>
                          setLayoutEditor((prev) => ({
                            ...prev,
                            dataSources: prev.dataSources.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, datasetType: event.target.value }
                                : item,
                            ),
                          }))
                        }
                        className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground"
                      >
                        {normalizedDatasets.map((dataset) => (
                          <option key={dataset.key} value={String(dataset.apiDatasetType)} className="bg-surface text-foreground">
                            {dataset.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Input
                        label="Alias"
                        value={source.alias}
                        onChange={(event) =>
                          setLayoutEditor((prev) => ({
                            ...prev,
                            dataSources: prev.dataSources.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, alias: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }
                                : item,
                            ),
                          }))
                        }
                        placeholder={sourceDataset.defaultAlias}
                        hint={index === 0 ? "Fonte principal" : "Prefixo usado no alias.field"}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-medium text-muted-foreground">Join com</label>
                      <select
                        aria-label={`Join da fonte ${index + 1}`}
                        title={`Join da fonte ${index + 1}`}
                        value={source.join?.joinToAlias ?? ""}
                        disabled={index === 0}
                        onChange={(event) => {
                          const joinToAlias = event.target.value;
                          setLayoutEditor((prev) => ({
                            ...prev,
                            dataSources: prev.dataSources.map((item, itemIndex) =>
                              itemIndex === index
                                ? (() => {
                                    const sourceDs =
                                      normalizedDatasets.find((dataset) => String(dataset.apiDatasetType) === String(item.datasetType)) ?? selectedDataset;
                                    const targetAlias = prev.dataSources.find((candidate) => candidate.alias === joinToAlias);
                                    const targetDs = targetAlias
                                      ? (normalizedDatasets.find((dataset) => String(dataset.apiDatasetType) === String(targetAlias.datasetType)) ?? selectedDataset)
                                      : selectedDataset;

                                    const suggestions = buildJoinSuggestions({
                                      sourceDatasetType: item.datasetType,
                                      targetDatasetType: targetAlias?.datasetType,
                                      sourceJoinCapabilities: sourceDs.joinCapabilities,
                                      schemaJoinRules: multiSourceSchema?.joinRules,
                                    });

                                    const autoSuggestion = getAutoJoinSuggestion({
                                      joinSuggestions: suggestions,
                                      sourceKeyOptions: getUniqueJoinFieldOptions(sourceDs.fieldMetadata),
                                      targetKeyOptions: getUniqueJoinFieldOptions(targetDs.fieldMetadata),
                                    });

                                    return {
                                      ...item,
                                      join: {
                                        joinToAlias,
                                        sourceKey: item.join?.sourceKey || autoSuggestion?.sourceKey || "",
                                        targetKey: item.join?.targetKey || autoSuggestion?.targetKey || "",
                                        joinType:
                                          item.join?.joinType ||
                                          autoSuggestion?.joinType ||
                                          multiSourceSchema?.joinTypes?.[0] ||
                                          "left",
                                      },
                                    };
                                  })()
                                : item,
                            ),
                          }));
                        }}
                        className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground disabled:opacity-50"
                      >
                        <option value="" className="bg-surface text-foreground">{index === 0 ? "Principal" : "Selecione"}</option>
                        {layoutEditor.dataSources
                          .filter((_, candidateIndex) => candidateIndex !== index)
                          .map((candidate) => (
                            <option key={candidate.alias} value={candidate.alias} className="bg-surface text-foreground">
                              {candidate.alias}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-medium text-muted-foreground">Source key</label>
                      <select
                        aria-label={`Source key da fonte ${index + 1}`}
                        title={`Source key da fonte ${index + 1}`}
                        value={source.join?.sourceKey ?? ""}
                        disabled={index === 0}
                        onChange={(event) =>
                          setLayoutEditor((prev) => ({
                            ...prev,
                            dataSources: prev.dataSources.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    join: {
                                      joinToAlias: item.join?.joinToAlias ?? prev.dataSources[0]?.alias ?? selectedDataset.defaultAlias,
                                      sourceKey: event.target.value,
                                      targetKey: item.join?.targetKey ?? "",
                                      joinType: item.join?.joinType ?? multiSourceSchema?.joinTypes?.[0] ?? "left",
                                    },
                                  }
                                : item,
                            ),
                          }))
                        }
                        className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground disabled:opacity-50"
                      >
                        <option value="" className="bg-surface text-foreground">Selecione</option>
                        {(source.join?.sourceKey && !sourceKeyFields.some((field) => (field.reference ?? field.field) === source.join?.sourceKey)) && (
                          <option value={source.join.sourceKey} className="bg-surface text-foreground">
                            {source.join.sourceKey} (atual)
                          </option>
                        )}
                        {sourceKeyFields.map((field) => {
                          const val = field.reference ?? field.field ?? "";
                          return (
                            <option key={val} value={val} className="bg-surface text-foreground">
                              {field.label ?? val}{field.isJoinKey ? " (join)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-medium text-muted-foreground">Target key</label>
                      <select
                        aria-label={`Target key da fonte ${index + 1}`}
                        title={`Target key da fonte ${index + 1}`}
                        value={source.join?.targetKey ?? ""}
                        disabled={index === 0}
                        onChange={(event) =>
                          setLayoutEditor((prev) => ({
                            ...prev,
                            dataSources: prev.dataSources.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    join: {
                                      joinToAlias: item.join?.joinToAlias ?? prev.dataSources[0]?.alias ?? selectedDataset.defaultAlias,
                                      sourceKey: item.join?.sourceKey ?? "",
                                      targetKey: event.target.value,
                                      joinType: item.join?.joinType ?? multiSourceSchema?.joinTypes?.[0] ?? "left",
                                    },
                                  }
                                : item,
                            ),
                          }))
                        }
                        className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground disabled:opacity-50"
                      >
                        <option value="" className="bg-surface text-foreground">Selecione</option>
                        {(source.join?.targetKey && !targetKeyFields.some((field) => (field.reference ?? field.field) === source.join?.targetKey)) && (
                          <option value={source.join.targetKey} className="bg-surface text-foreground">
                            {source.join.targetKey} (atual)
                          </option>
                        )}
                        {targetKeyFields.map((field) => {
                          const val = field.reference ?? field.field ?? "";
                          return (
                            <option key={val} value={val} className="bg-surface text-foreground">
                              {field.label ?? val}{field.isJoinKey ? " (join)" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="mb-2 block text-xs font-medium text-muted-foreground">Join type</label>
                        <select
                          aria-label={`Tipo de join da fonte ${index + 1}`}
                          title={`Tipo de join da fonte ${index + 1}`}
                          value={source.join?.joinType ?? multiSourceSchema?.joinTypes?.[0] ?? "left"}
                          disabled={index === 0}
                          onChange={(event) =>
                            setLayoutEditor((prev) => ({
                              ...prev,
                              dataSources: prev.dataSources.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      join: {
                                        joinToAlias: item.join?.joinToAlias ?? prev.dataSources[0]?.alias ?? selectedDataset.defaultAlias,
                                        sourceKey: item.join?.sourceKey ?? "",
                                        targetKey: item.join?.targetKey ?? "",
                                        joinType: event.target.value,
                                      },
                                    }
                                  : item,
                              ),
                            }))
                          }
                          className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground disabled:opacity-50"
                        >
                          {(multiSourceSchema?.joinTypes ?? ["left", "inner"]).map((joinType) => (
                            <option key={joinType} value={joinType} className="bg-surface text-foreground">
                              {joinType}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={index === 0}
                        onClick={() =>
                          setLayoutEditor((prev) => ({
                            ...prev,
                            dataSources: prev.dataSources.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                    {joinSuggestions.length > 0 && index > 0 && (
                      <div className="md:col-span-6 rounded-lg border border-border bg-black/10 px-3 py-2 text-xs text-muted-foreground">
                        Sugestões de join: {joinSuggestions.map((join) => `${join.sourceKey} -> ${join.targetKey}`).join(" | ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid gap-3 rounded-lg border border-border bg-black/10 p-3 md:grid-cols-[180px_1fr]">
            <div>
              <label className="mb-2 block text-xs font-medium text-muted-foreground">Alias para busca</label>
              <select
                aria-label="Alias para autocomplete"
                title="Alias para autocomplete"
                value={autocompleteAlias}
                onChange={(event) => setAutocompleteAlias(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground"
              >
                {layoutEditor.dataSources.length > 0
                  ? layoutEditor.dataSources.map((source) => (
                      <option key={source.alias} value={source.alias} className="bg-surface text-foreground">
                        {source.alias}
                      </option>
                    ))
                  : (
                    <option value={selectedDataset.defaultAlias} className="bg-surface text-foreground">
                      {selectedDataset.defaultAlias}
                    </option>
                  )}
              </select>
            </div>
            <Input
              label="Autocomplete de campos"
              value={autocompleteTerm}
              onChange={(event) => setAutocompleteTerm(event.target.value)}
              placeholder="Digite parte do campo, ex.: agent"
              hint="Consulta GET /api/reports/autocomplete para sugerir referencias alias.field."
            />
          </div>

          {autocompleteTerm.trim() && (
            <div className="rounded-lg border border-border bg-black/10 p-3">
              <div className="mb-2 text-xs text-muted">
                {autocompleteQuery.isLoading
                  ? "Buscando sugestões..."
                  : `${autocompleteQuery.data?.total ?? 0} sugestão(ões) retornadas`}
              </div>
              <div className="flex flex-wrap gap-2">
                {(autocompleteQuery.data?.items ?? []).map((item) => {
                  const option = mapAutocompleteItemToFieldOption(item);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className="rounded-full border border-border bg-surface-light px-3 py-1 text-xs text-foreground hover:bg-surface-hover"
                      onClick={() => {
                        const exists = layoutEditor.columns.some((column) => column.field === option.value);
                        if (exists) return;
                        setLayoutEditor((prev) => ({
                          ...prev,
                          columns: [
                            ...prev.columns,
                            {
                              field: option.value,
                              label: item.field ?? option.value,
                              format: item.dataType === "number" ? "number" : "text",
                              align: "left",
                              width: "",
                            },
                          ],
                        }));
                      }}
                    >
                      {option.value}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

type LayoutBuilderDetailsSectionProps = {
  layoutEditor: LayoutEditorState;
  setLayoutEditor: Dispatch<SetStateAction<LayoutEditorState>>;
  fieldOptions: FieldOption[];
  selectedDataset: NormalizedDataset | null;
  supportedColumnFormats: string[];
  supportedAggregates: string[];
  handleAddSectionColumn: (sectionIndex: number) => void;
};

export function LayoutBuilderDetailsSection({
  layoutEditor,
  setLayoutEditor,
  fieldOptions,
  selectedDataset,
  supportedColumnFormats,
  supportedAggregates,
  handleAddSectionColumn,
}: LayoutBuilderDetailsSectionProps) {
  return (
    <>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-xs text-muted-foreground">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="px-2 py-2">Campo</th>
              <th className="px-2 py-2">Label</th>
              <th className="px-2 py-2">Formato</th>
              <th className="px-2 py-2">Alinhamento</th>
              <th className="px-2 py-2">Largura</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {layoutEditor.columns.map((column, index) => (
              <tr key={`${column.field}-${index}`} className="border-b border-border">
                <td className="px-2 py-2">
                  {fieldOptions.length > 0 ? (
                    <select
                      aria-label={`Campo da coluna ${index + 1}`}
                      title={`Campo da coluna ${index + 1}`}
                      value={column.field}
                      onChange={(event) =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          columns: prev.columns.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, field: event.target.value } : item,
                          ),
                        }))
                      }
                      className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                    >
                      <option value="" className="bg-surface text-muted">- selecione o campo -</option>
                      {fieldOptions.map((field) => (
                        <option key={field.value} value={field.value} className="bg-surface text-foreground">
                          {field.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      aria-label={`Campo da coluna ${index + 1}`}
                      title={`Campo da coluna ${index + 1}`}
                      placeholder="ex: agentName"
                      value={column.field}
                      list="report-field-options"
                      onChange={(event) =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          columns: prev.columns.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, field: event.target.value } : item,
                          ),
                        }))
                      }
                      className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                    />
                  )}
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`Label da coluna ${index + 1}`}
                    title={`Label da coluna ${index + 1}`}
                    placeholder="Label da coluna"
                    value={column.label}
                    onChange={(event) =>
                      setLayoutEditor((prev) => ({
                        ...prev,
                        columns: prev.columns.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value } : item,
                        ),
                      }))
                    }
                    className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                  />
                </td>
                <td className="px-2 py-2">
                  <select
                    aria-label={`Formato da coluna ${index + 1}`}
                    title={`Formato da coluna ${index + 1}`}
                    value={column.format ?? "text"}
                    onChange={(event) =>
                      setLayoutEditor((prev) => ({
                        ...prev,
                        columns: prev.columns.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, format: event.target.value } : item,
                        ),
                      }))
                    }
                    className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                  >
                    {supportedColumnFormats.map((format) => (
                      <option key={format} value={format} className="bg-surface text-foreground">
                        {format}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select
                    aria-label={`Alinhamento da coluna ${index + 1}`}
                    title={`Alinhamento da coluna ${index + 1}`}
                    value={column.align ?? "left"}
                    onChange={(event) =>
                      setLayoutEditor((prev) => ({
                        ...prev,
                        columns: prev.columns.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, align: event.target.value } : item,
                        ),
                      }))
                    }
                    className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                  >
                    {ALIGN_OPTIONS.map((align) => (
                      <option key={align} value={align} className="bg-surface text-foreground">
                        {align}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label={`Largura da coluna ${index + 1}`}
                    title={`Largura da coluna ${index + 1}`}
                    value={column.width ?? ""}
                    onChange={(event) =>
                      setLayoutEditor((prev) => ({
                        ...prev,
                        columns: prev.columns.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, width: event.target.value } : item,
                        ),
                      }))
                    }
                    placeholder="40%"
                    className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setLayoutEditor((prev) => ({
                        ...prev,
                        columns: prev.columns.filter((_, itemIndex) => itemIndex !== index),
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-5">
        <summary className="flex cursor-pointer select-none items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/10">
          <span>&#9654;</span> Opções avançadas &mdash; Group details, Summaries e Group summaries
        </summary>
        <div className="mt-3 rounded-lg border border-border bg-surface-light p-3">
          <p className="mb-3 text-xs text-muted">
            Campos para personalização avançada do layout via editor visual.
          </p>
          <div className="grid gap-4 md:grid-cols-1">
            <div className="rounded-lg border border-border bg-surface-light p-3">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">Group details</h4>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setLayoutEditor((prev) => ({
                      ...prev,
                      groupDetails: [...prev.groupDetails, { field: getFirstFieldOption(fieldOptions), label: "" }],
                    }))
                  }
                >
                  <Plus className="h-4 w-4" /> Item
                </Button>
              </div>
              <p className="mb-3 text-xs text-muted">Lista de campos exibidos no detalhe de cada grupo.</p>
              <div className="space-y-2">
                {layoutEditor.groupDetails.map((detail, index) => (
                  <div key={`group-detail-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                    <select
                      aria-label={`Campo do group detail ${index + 1}`}
                      title={`Campo do group detail ${index + 1}`}
                      value={detail.field}
                      onChange={(event) =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          groupDetails: prev.groupDetails.map((item, idx) =>
                            idx === index ? { ...item, field: event.target.value } : item,
                          ),
                        }))
                      }
                      className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                    >
                      <option value="" className="bg-surface text-foreground">Sem campo</option>
                      {fieldOptions.map((field) => (
                        <option key={field.value} value={field.value} className="bg-surface text-foreground">
                          {field.label}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Label do group detail ${index + 1}`}
                      title={`Label do group detail ${index + 1}`}
                      value={detail.label}
                      onChange={(event) =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          groupDetails: prev.groupDetails.map((item, idx) =>
                            idx === index ? { ...item, label: event.target.value } : item,
                          ),
                        }))
                      }
                      placeholder="Label"
                      className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          groupDetails: prev.groupDetails.filter((_, idx) => idx !== index),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                ))}
                {layoutEditor.groupDetails.length === 0 && (
                  <p className="text-xs text-muted">Nenhum item de group detail.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface-light p-3">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">Summaries</h4>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setLayoutEditor((prev) => ({
                      ...prev,
                      summaries: [
                        ...prev.summaries,
                        {
                          field: getFirstFieldOption(fieldOptions),
                          label: "",
                          aggregate: supportedAggregates[0] ?? "count",
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="h-4 w-4" /> Item
                </Button>
              </div>
              <p className="mb-3 text-xs text-muted">Totalizadores gerais no rodapé do relatório.</p>
              <div className="space-y-2">
                {layoutEditor.summaries.map((summary, index) => (
                  <div key={`summary-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                    <select
                      aria-label={`Campo do summary ${index + 1}`}
                      title={`Campo do summary ${index + 1}`}
                      value={summary.field}
                      onChange={(event) =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          summaries: prev.summaries.map((item, idx) =>
                            idx === index ? { ...item, field: event.target.value } : item,
                          ),
                        }))
                      }
                      className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                    >
                      <option value="" className="bg-surface text-foreground">Sem campo</option>
                      {fieldOptions.map((field) => (
                        <option key={field.value} value={field.value} className="bg-surface text-foreground">
                          {field.label}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Label do summary ${index + 1}`}
                      title={`Label do summary ${index + 1}`}
                      value={summary.label}
                      onChange={(event) =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          summaries: prev.summaries.map((item, idx) =>
                            idx === index ? { ...item, label: event.target.value } : item,
                          ),
                        }))
                      }
                      placeholder="Label"
                      className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                    />
                    <select
                      aria-label={`Aggregate do summary ${index + 1}`}
                      title={`Aggregate do summary ${index + 1}`}
                      value={summary.aggregate}
                      onChange={(event) =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          summaries: prev.summaries.map((item, idx) =>
                            idx === index ? { ...item, aggregate: event.target.value } : item,
                          ),
                        }))
                      }
                      className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                    >
                      {supportedAggregates.map((aggregate) => (
                        <option key={aggregate} value={aggregate} className="bg-surface text-foreground">
                          {aggregate}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          summaries: prev.summaries.filter((_, idx) => idx !== index),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                ))}
                {layoutEditor.summaries.length === 0 && (
                  <p className="text-xs text-muted">Nenhum summary configurado.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface-light p-3">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">Group summaries</h4>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setLayoutEditor((prev) => ({
                      ...prev,
                      groupSummaries: [
                        ...prev.groupSummaries,
                        {
                          field: getFirstFieldOption(fieldOptions),
                          label: "",
                          aggregate: supportedAggregates[0] ?? "count",
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="h-4 w-4" /> Item
                </Button>
              </div>
              <p className="mb-3 text-xs text-muted">Totalizadores exibidos ao final de cada grupo.</p>
              <div className="space-y-2">
                {layoutEditor.groupSummaries.map((summary, index) => (
                  <div key={`group-summary-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                    <select
                      aria-label={`Campo do group summary ${index + 1}`}
                      title={`Campo do group summary ${index + 1}`}
                      value={summary.field}
                      onChange={(event) =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          groupSummaries: prev.groupSummaries.map((item, idx) =>
                            idx === index ? { ...item, field: event.target.value } : item,
                          ),
                        }))
                      }
                      className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                    >
                      {fieldOptions.map((field) => (
                        <option key={field.value} value={field.value} className="bg-surface text-foreground">
                          {field.label}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Label do group summary ${index + 1}`}
                      title={`Label do group summary ${index + 1}`}
                      value={summary.label}
                      onChange={(event) =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          groupSummaries: prev.groupSummaries.map((item, idx) =>
                            idx === index ? { ...item, label: event.target.value } : item,
                          ),
                        }))
                      }
                      placeholder="Label"
                      className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                    />
                    <select
                      aria-label={`Aggregate do group summary ${index + 1}`}
                      title={`Aggregate do group summary ${index + 1}`}
                      value={summary.aggregate}
                      onChange={(event) =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          groupSummaries: prev.groupSummaries.map((item, idx) =>
                            idx === index ? { ...item, aggregate: event.target.value } : item,
                          ),
                        }))
                      }
                      className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                    >
                      {supportedAggregates.map((aggregate) => (
                        <option key={aggregate} value={aggregate} className="bg-surface text-foreground">
                          {aggregate}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setLayoutEditor((prev) => ({
                          ...prev,
                          groupSummaries: prev.groupSummaries.filter((_, idx) => idx !== index),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                ))}
                {layoutEditor.groupSummaries.length === 0 && (
                  <p className="text-xs text-muted">Nenhum group summary configurado.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </details>

      {layoutEditor.sections.length > 0 && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-foreground">Seções adicionais</h3>
            {selectedDataset && (DATASET_SECTION_SOURCES[selectedDataset.key.toLowerCase()] ?? []).length > 0 && (
              <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300">
                Fontes disponíveis para <strong>{selectedDataset.name}</strong>: {" "}
                {(DATASET_SECTION_SOURCES[selectedDataset.key.toLowerCase()] ?? []).map((s) => s.source).join(", ")}
              </span>
            )}
          </div>
          {layoutEditor.sections.map((section, sectionIndex) => (
            <div key={`section-${sectionIndex}`} className="rounded-lg border border-border bg-surface-light p-3">
              <div className="mb-3 grid gap-3 md:grid-cols-3">
                <Input
                  label={`Título da seção ${sectionIndex + 1}`}
                  value={section.title}
                  onChange={(event) =>
                    setLayoutEditor((prev) => ({
                      ...prev,
                      sections: prev.sections.map((item, idx) =>
                        idx === sectionIndex ? { ...item, title: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <Input
                  label={`Source da seção ${sectionIndex + 1}`}
                  value={section.source ?? ""}
                  onChange={(event) =>
                    setLayoutEditor((prev) => ({
                      ...prev,
                      sections: prev.sections.map((item, idx) =>
                        idx === sectionIndex ? { ...item, source: event.target.value } : item,
                      ),
                    }))
                  }
                  placeholder="ex.: softwareItems"
                  hint={`Sub-array retornado no response para esta seção. Fontes: ${(DATASET_SECTION_SOURCES[selectedDataset?.key.toLowerCase() ?? ""] ?? []).map((s) => s.source).join(", ") || "nenhuma mapeada"}`}
                  list={`sources-datalist-${sectionIndex}`}
                />
                <datalist id={`sources-datalist-${sectionIndex}`}>
                  {(DATASET_SECTION_SOURCES[selectedDataset?.key.toLowerCase() ?? ""] ?? []).map((s) => (
                    <option key={s.source} value={s.source}>{s.label}</option>
                  ))}
                </datalist>
                <div className="flex items-end justify-end gap-2 pb-1">
                  <Button type="button" size="sm" variant="secondary" onClick={() => handleAddSectionColumn(sectionIndex)}>
                    <Plus className="h-4 w-4" /> Coluna
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setLayoutEditor((prev) => ({
                        ...prev,
                        sections: prev.sections.filter((_, idx) => idx !== sectionIndex),
                      }))
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs text-muted-foreground">
                  <thead>
                    <tr className="border-b border-border text-muted">
                      <th className="px-2 py-2">Campo</th>
                      <th className="px-2 py-2">Label</th>
                      <th className="px-2 py-2">Formato</th>
                      <th className="px-2 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.columns.map((column, columnIndex) => (
                      <tr key={`section-${sectionIndex}-col-${columnIndex}`} className="border-b border-border">
                        <td className="px-2 py-2">
                          <select
                            aria-label={`Campo da seção ${sectionIndex + 1} coluna ${columnIndex + 1}`}
                            title={`Campo da seção ${sectionIndex + 1} coluna ${columnIndex + 1}`}
                            value={column.field}
                            onChange={(event) =>
                              setLayoutEditor((prev) => ({
                                ...prev,
                                sections: prev.sections.map((item, idx) =>
                                  idx === sectionIndex
                                    ? {
                                        ...item,
                                        columns: item.columns.map((col, cIdx) =>
                                          cIdx === columnIndex ? { ...col, field: event.target.value } : col,
                                        ),
                                      }
                                    : item,
                                ),
                              }))
                            }
                            className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                          >
                            {getSourceFieldOptions(
                              selectedDataset?.key,
                              section.source,
                              fieldOptions,
                              section.columns.map((c) => c.field),
                            ).map((field) => (
                              <option key={field} value={field} className="bg-surface text-foreground">
                                {field}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            aria-label={`Label da seção ${sectionIndex + 1} coluna ${columnIndex + 1}`}
                            title={`Label da seção ${sectionIndex + 1} coluna ${columnIndex + 1}`}
                            placeholder="Label"
                            value={column.label}
                            onChange={(event) =>
                              setLayoutEditor((prev) => ({
                                ...prev,
                                sections: prev.sections.map((item, idx) =>
                                  idx === sectionIndex
                                    ? {
                                        ...item,
                                        columns: item.columns.map((col, cIdx) =>
                                          cIdx === columnIndex ? { ...col, label: event.target.value } : col,
                                        ),
                                      }
                                    : item,
                                ),
                              }))
                            }
                            className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            aria-label={`Formato da seção ${sectionIndex + 1} coluna ${columnIndex + 1}`}
                            title={`Formato da seção ${sectionIndex + 1} coluna ${columnIndex + 1}`}
                            value={column.format ?? "text"}
                            onChange={(event) =>
                              setLayoutEditor((prev) => ({
                                ...prev,
                                sections: prev.sections.map((item, idx) =>
                                  idx === sectionIndex
                                    ? {
                                        ...item,
                                        columns: item.columns.map((col, cIdx) =>
                                          cIdx === columnIndex ? { ...col, format: event.target.value } : col,
                                        ),
                                      }
                                    : item,
                                ),
                              }))
                            }
                            className="w-full rounded border border-border bg-surface-light px-2 py-1 text-foreground"
                          >
                            {supportedColumnFormats.map((format) => (
                              <option key={format} value={format} className="bg-surface text-foreground">
                                {format}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setLayoutEditor((prev) => ({
                                ...prev,
                                sections: prev.sections.map((item, idx) =>
                                  idx === sectionIndex
                                    ? {
                                        ...item,
                                        columns: item.columns.filter((_, cIdx) => cIdx !== columnIndex),
                                      }
                                    : item,
                                ),
                              }))
                            }
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="mt-5">
        <summary className="flex cursor-pointer select-none items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/10">
          <span>&#9654;</span> Opções avançadas &mdash; Seções adicionais (JSON)
        </summary>
        <div className="mt-3 rounded-lg border border-border bg-surface-light p-3">
          <p className="mb-3 text-xs text-muted">
            Seções extras que aparecem após a tabela principal, como listas de softwares ou detalhes de hardware. Edite via visual acima ou diretamente no JSON abaixo.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <TextArea
              label="Sections (JSON)"
              rows={8}
              value={JSON.stringify(layoutEditor.sections, null, 2)}
              onChange={(event) =>
                setLayoutEditor((prev) => ({
                  ...prev,
                  sections: parseJsonObject<LayoutEditorState["sections"]>(event.target.value, prev.sections),
                }))
              }
              placeholder='[{"title":"Seção","source":"items","columns":[{"field":"name","label":"Nome"}]}]'
              hint="Cada seção possui title, source (chave de dados) e columns. Use o editor visual acima para não precisar editar JSON."
            />
          </div>
        </div>
      </details>
    </>
  );
}

type LayoutBrandingSectionProps = {
  layoutEditor: LayoutEditorState;
  setLayoutEditor: Dispatch<SetStateAction<LayoutEditorState>>;
  supportedAggregates: string[];
};

export function LayoutBrandingSection({
  layoutEditor,
  setLayoutEditor,
  supportedAggregates,
}: LayoutBrandingSectionProps) {
  const selectedFontFamily = layoutEditor.style.fontFamily || "Segoe UI, sans-serif";
  const fontOptions = REPORT_FONT_OPTIONS.some(
    (option) => option.value === selectedFontFamily,
  )
    ? REPORT_FONT_OPTIONS
    : [
        { label: `Atual (${selectedFontFamily})`, value: selectedFontFamily },
        ...REPORT_FONT_OPTIONS,
      ];

  return (
    <>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Input
          label="Logo URL"
          value={layoutEditor.logoUrl}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              logoUrl: event.target.value,
            }))
          }
          placeholder="https://cdn.empresa.local/logo.png"
          hint="URL opcional da marca é exibida no cabeçalho do relatório."
        />
        <Input
          label="Altura máxima da logo"
          type="number"
          min={0}
          value={layoutEditor.logoMaxHeightPx}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              logoMaxHeightPx: event.target.value,
            }))
          }
          hint="Valor em pixels para limitar a altura do logo."
        />
        <Input
          label="Cor primaria"
          type="color"
          value={layoutEditor.style.primaryColor}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              style: { ...prev.style, primaryColor: event.target.value },
            }))
          }
          hint="Aplicada no título principal, linhas de destaque e elementos visuais de maior evidência."
        />
        <Input
          label="Cor secundaria"
          type="color"
          value={layoutEditor.style.secondaryColor}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              style: { ...prev.style, secondaryColor: event.target.value },
            }))
          }
          hint="Cor de apoio usada em blocos secundários e fundos auxiliares do relatório."
        />
        <Input
          label="Cor de destaque"
          type="color"
          value={layoutEditor.style.accentColor}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              style: { ...prev.style, accentColor: event.target.value },
            }))
          }
          hint="Usada em totais, indicadores de ênfase e pontos de chamada de atenção no documento."
        />
        <Input
          label="Cor texto cabecalho"
          type="color"
          value={layoutEditor.style.headerTextColor}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              style: { ...prev.style, headerTextColor: event.target.value },
            }))
          }
          hint="Cor do texto dos cabeçalhos das tabelas. Mantenha contraste com o fundo do cabeçalho."
        />
        <Input
          label="Fundo do cabecalho"
          type="color"
          value={layoutEditor.style.headerBackgroundColor}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              style: { ...prev.style, headerBackgroundColor: event.target.value },
            }))
          }
          hint="Cor de fundo das células de cabeçalho em todas as tabelas do relatório."
        />
        <Input
          label="Cor alternada das linhas"
          type="color"
          value={layoutEditor.style.alternateRowColor}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              style: { ...prev.style, alternateRowColor: event.target.value },
            }))
          }
          hint="Cor aplicada nas linhas alternadas quando a opção de listras zebradas estiver habilitada."
        />
        <Input
          label="Cor da borda"
          type="color"
          value={layoutEditor.style.borderColor}
          onChange={(event) =>
            setLayoutEditor((prev) => ({
              ...prev,
              style: { ...prev.style, borderColor: event.target.value },
            }))
          }
          hint="Define a cor das bordas de tabelas, cards de detalhe e divisores de seção."
        />
        <div className="space-y-1">
          <label className="block text-sm font-medium text-muted-foreground">Fonte</label>
          <select
            value={selectedFontFamily}
            onChange={(event) =>
              setLayoutEditor((prev) => ({
                ...prev,
                style: { ...prev.style, fontFamily: event.target.value },
              }))
            }
            className="w-full rounded-xl border border-border bg-surface-light px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {fontOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-surface text-foreground">
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            Selecione uma fonte validada para evitar erros de preenchimento e manter consistência visual.
          </p>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={layoutEditor.style.showRowStripes}
              onChange={(event) =>
                setLayoutEditor((prev) => ({
                  ...prev,
                  style: { ...prev.style, showRowStripes: event.target.checked },
                }))
              }
            />
            Exibir listras nas linhas
          </label>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
        Aggregates suportados: {supportedAggregates.join(", ")}
      </div>
    </>
  );
}

type PreviewCardProps = {
  draft: TemplateDraft;
  setDraft: DraftSetter;
  previewModes: string[];
  responseDispositions: string[];
  selectedDataset: NormalizedDataset | null;
  defaultFormatOptions: SupportedFormat[];
  previewMeta: { title?: string; rowCount?: number; format?: string };
  previewUnexpectedHeaders: string[];
  previewHtml: string;
  previewBlobUrl: string | null;
  loadingPreview: boolean;
  onPreview: () => void;
  onDownloadPreview: () => void;
};

export function PreviewCard({
  draft,
  setDraft,
  previewModes,
  responseDispositions,
  selectedDataset,
  defaultFormatOptions,
  previewMeta,
  previewUnexpectedHeaders,
  previewHtml,
  previewBlobUrl,
  loadingPreview,
  onPreview,
  onDownloadPreview,
}: PreviewCardProps) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Preview</h2>
        <Button type="button" onClick={onPreview} loading={loadingPreview}>
          <Eye className="h-4 w-4" /> Gerar preview
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Input
          label="Nome do arquivo"
          value={draft.fileName}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              fileName: event.target.value,
            }))
          }
          hint="Nome sugerido para o arquivo ao fazer download. Sem extensão."
        />
        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Modo</label>
          <select
            aria-label="Modo de preview"
            title="Modo de preview"
            value={draft.previewMode}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                previewMode: event.target.value as PreviewMode,
              }))
            }
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground"
          >
            {previewModes.map((mode) => (
              <option key={mode} value={mode} className="bg-surface text-foreground">
                {mode}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted"><strong className="text-muted">html</strong>: renderiza inline na página. <strong className="text-muted">document</strong>: gera o arquivo binário (PDF/XLSX/CSV).</p>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Disposition</label>
          <select
            aria-label="Disposition de resposta"
            title="Disposition de resposta"
            value={draft.responseDisposition}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                responseDisposition: event.target.value as ResponseDisposition,
              }))
            }
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground"
          >
            {responseDispositions.map((mode) => (
              <option key={mode} value={mode} className="bg-surface text-foreground">
                {mode}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted"><strong className="text-muted">inline</strong>: exibe no navegador. <strong className="text-muted">attachment</strong>: força download do arquivo.</p>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">Formato para preview</label>
          <select
            aria-label="Formato do preview"
            title="Formato do preview"
            value={draft.format}
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                format: event.target.value as SupportedFormat,
              }))
            }
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground"
          >
            {(selectedDataset?.supportedFormats ?? defaultFormatOptions).map((format) => (
              <option key={format} value={format} className="bg-surface text-foreground">
                {format.toUpperCase()}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Formato do arquivo gerado neste preview. Independente do formato salvo no template.</p>
        </div>
      </div>

      {(previewMeta.title || previewMeta.rowCount !== undefined || previewMeta.format) && (
        <div className="mt-4 rounded-lg border border-border bg-surface-light p-3 text-xs text-muted-foreground">
          <p>Título: {previewMeta.title || "-"}</p>
          <p>Linhas: {previewMeta.rowCount ?? "-"}</p>
          <p>Formato retornado: {previewMeta.format || "-"}</p>
        </div>
      )}

      {previewUnexpectedHeaders.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <p className="font-medium">Colunas extras detectadas no preview da API</p>
          <p className="mt-1">
            Foi aplicada filtragem visual para manter apenas o layout solicitado. Colunas recebidas fora do layout: {previewUnexpectedHeaders.join(", ")}.
          </p>
        </div>
      )}

      {draft.previewMode === "html" && previewHtml && (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <iframe title="Preview HTML" className="h-[560px] w-full bg-white" srcDoc={previewHtml} />
        </div>
      )}

      {draft.previewMode === "document" && previewBlobUrl && (
        <div className="mt-4 space-y-3">
          {draft.format === "pdf" && draft.responseDisposition === "inline" ? (
            <iframe title="Preview PDF" src={previewBlobUrl} className="h-[560px] w-full rounded-lg border border-border bg-white" />
          ) : (
            <div className="rounded-lg border border-border bg-surface-light p-3 text-sm text-muted-foreground">
              Preview gerado. Use o botao para baixar novamente.
            </div>
          )}
          <Button type="button" variant="secondary" onClick={onDownloadPreview}>
            Baixar preview
          </Button>
        </div>
      )}
    </Card>
  );
}

type PreviewFiltersCardProps = {
  selectedDataset: NormalizedDataset | null;
  previewFilters: Record<string, unknown>;
  setPreviewFilters: Dispatch<SetStateAction<Record<string, unknown>>>;
  filterClientId: string;
  setFilterClientId: Dispatch<SetStateAction<string>>;
  setFilterSiteId: Dispatch<SetStateAction<string>>;
  clients: Array<{ id: string; name: string }>;
  sites: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; displayName?: string; hostname?: string }>;
  fieldOptions: FieldOption[];
  formatFilterInputType: (filterType: string) => string;
};

export function PreviewFiltersCard({
  selectedDataset,
  previewFilters,
  setPreviewFilters,
  filterClientId,
  setFilterClientId,
  setFilterSiteId,
  clients,
  sites,
  agents,
  fieldOptions,
  formatFilterInputType,
}: PreviewFiltersCardProps) {
  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-foreground">Filtros de Preview</h2>
      {selectedDataset?.filters.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {selectedDataset.filters.map((filter) => {
            const currentValue = previewFilters[filter.name] ?? "";
            const label = filter.label || filter.name;
            const n = filter.name.toLowerCase();
            const selectClass = "w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground";
            const inputClass = "w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground";
            const labelEl = (
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                {label}{filter.required ? " *" : ""}
              </label>
            );

            if (n === "clientid" || n === "client_id" || n === "client") {
              return (
                <div key={filter.name}>
                  {labelEl}
                  <select
                    aria-label={`Filtro ${label}`}
                    title={`Filtro ${label}`}
                    value={String(currentValue)}
                    onChange={(e) => {
                      setFilterClientId(e.target.value);
                      setFilterSiteId("");
                      setPreviewFilters((prev) => ({ ...prev, [filter.name]: e.target.value }));
                    }}
                    className={selectClass}
                  >
                    <option value="" className="bg-surface text-foreground">Selecione um cliente...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id} className="bg-surface text-foreground">{c.name}</option>
                    ))}
                  </select>
                </div>
              );
            }

            if (n === "siteid" || n === "site_id" || n === "site") {
              return (
                <div key={filter.name}>
                  {labelEl}
                  <select
                    aria-label={`Filtro ${label}`}
                    title={`Filtro ${label}`}
                    value={String(currentValue)}
                    disabled={!filterClientId}
                    onChange={(e) => {
                      setFilterSiteId(e.target.value);
                      setPreviewFilters((prev) => ({ ...prev, [filter.name]: e.target.value }));
                    }}
                    className={selectClass}
                  >
                    <option value="" className="bg-surface text-foreground">
                      {filterClientId ? "Selecione um site..." : "Selecione um cliente primeiro"}
                    </option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id} className="bg-surface text-foreground">{s.name}</option>
                    ))}
                  </select>
                </div>
              );
            }

            if (n === "agentid" || n === "agent_id" || n === "agent") {
              return (
                <div key={filter.name}>
                  {labelEl}
                  <select
                    aria-label={`Filtro ${label}`}
                    title={`Filtro ${label}`}
                    value={String(currentValue)}
                    disabled={!filterClientId}
                    onChange={(e) =>
                      setPreviewFilters((prev) => ({ ...prev, [filter.name]: e.target.value }))
                    }
                    className={selectClass}
                  >
                    <option value="" className="bg-surface text-foreground">
                      {filterClientId ? "Selecione um agente..." : "Selecione um cliente primeiro"}
                    </option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id} className="bg-surface text-foreground">
                        {a.displayName ?? a.hostname}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            if (n === "direction" || n === "sortdirection" || n === "sort_direction") {
              return (
                <div key={filter.name}>
                  {labelEl}
                  <select
                    aria-label={`Filtro ${label}`}
                    title={`Filtro ${label}`}
                    value={String(currentValue)}
                    onChange={(e) =>
                      setPreviewFilters((prev) => ({ ...prev, [filter.name]: e.target.value }))
                    }
                    className={selectClass}
                  >
                    <option value="" className="bg-surface text-foreground">Padrão</option>
                    <option value="asc" className="bg-surface text-foreground">Crescente (asc)</option>
                    <option value="desc" className="bg-surface text-foreground">Decrescente (desc)</option>
                  </select>
                </div>
              );
            }

            if (n === "orientation" || n === "orientação") {
              return (
                <div key={filter.name}>
                  {labelEl}
                  <select
                    aria-label={`Filtro ${label}`}
                    title={`Filtro ${label}`}
                    value={String(currentValue)}
                    onChange={(e) =>
                      setPreviewFilters((prev) => ({ ...prev, [filter.name]: e.target.value }))
                    }
                    className={selectClass}
                  >
                    <option value="" className="bg-surface text-foreground">Padrão</option>
                    <option value="portrait" className="bg-surface text-foreground">Retrato (portrait)</option>
                    <option value="landscape" className="bg-surface text-foreground">Paisagem (landscape)</option>
                  </select>
                </div>
              );
            }

            if (n === "sortby" || n === "sort_by" || n === "orderby" || n === "order_by") {
              return (
                <div key={filter.name}>
                  {labelEl}
                  <select
                    aria-label={`Filtro ${label}`}
                    title={`Filtro ${label}`}
                    value={String(currentValue)}
                    onChange={(e) =>
                      setPreviewFilters((prev) => ({ ...prev, [filter.name]: e.target.value }))
                    }
                    className={selectClass}
                  >
                    <option value="" className="bg-surface text-foreground">Padrão</option>
                    {fieldOptions.map((field) => (
                      <option key={field.value} value={field.value} className="bg-surface text-foreground">{field.label}</option>
                    ))}
                  </select>
                </div>
              );
            }

            const inputType = formatFilterInputType(filter.type);
            if (inputType === "boolean") {
              return (
                <div key={filter.name}>
                  {labelEl}
                  <select
                    aria-label={`Filtro booleano ${label}`}
                    title={`Filtro booleano ${label}`}
                    value={String(currentValue)}
                    onChange={(e) =>
                      setPreviewFilters((prev) => ({
                        ...prev,
                        [filter.name]: e.target.value === "" ? "" : e.target.value === "true",
                      }))
                    }
                    className={selectClass}
                  >
                    <option value="" className="bg-surface text-foreground">Não definido</option>
                    <option value="true" className="bg-surface text-foreground">Sim (true)</option>
                    <option value="false" className="bg-surface text-foreground">Não (false)</option>
                  </select>
                </div>
              );
            }

            return (
              <div key={filter.name}>
                {labelEl}
                <input
                  aria-label={`Filtro ${label}`}
                  title={`Filtro ${label}`}
                  placeholder={label}
                  value={String(currentValue)}
                  onChange={(e) =>
                    setPreviewFilters((prev) => ({ ...prev, [filter.name]: e.target.value }))
                  }
                  type={inputType}
                  className={inputClass}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">Dataset sem filtros dinâmicos declarados pela API.</p>
      )}
    </Card>
  );
}

type ValidationErrorsCardProps = {
  errors: string[];
};

export function ValidationErrorsCard({ errors }: ValidationErrorsCardProps) {
  if (errors.length === 0) return null;

  return (
    <Card>
      <h2 className="text-sm font-semibold text-red-300">Erros de validação</h2>
      <ul className="mt-2 list-disc pl-5 text-xs text-red-200">
        {errors.map((error, index) => (
          <li key={`${error}-${index}`}>{error}</li>
        ))}
      </ul>
    </Card>
  );
}

type TemplateFormActionBarProps = {
  isEdit: boolean;
  loading: boolean;
  onCancel: () => void;
};

export function TemplateFormActionBar({ isEdit, loading, onCancel }: TemplateFormActionBarProps) {
  return (
    <div className="flex justify-end gap-3">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" loading={loading} disabled={loading}>
        <Save className="h-4 w-4" /> {isEdit ? "Atualizar template" : "Criar template"}
      </Button>
    </div>
  );
}
