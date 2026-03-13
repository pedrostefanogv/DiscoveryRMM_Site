import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Eye, Plus, Save, Trash2 } from "lucide-react";
import {
  useAgentsByClient,
  useClients,
  useCreateReportTemplate,
  useReportAutocomplete,
  useReportDatasets,
  useReportLayoutSchema,
  useReportPreview,
  useReportTemplate,
  useSites,
  useUpdateReportTemplate,
} from "@/hooks";
import { Button, Card, Input, Loading, TextArea } from "@/components/ui";
import {
  type PreviewMode,
  type ReportLayoutDefinition,
  type ResponseDisposition,
} from "@/api/types";
import { ALIGN_OPTIONS, DATASET_SECTION_SOURCES, FORMAT_OPTIONS, SCOPE_OPTIONS } from "./report-template-form/data";
import {
  DataSourceScopeCard,
  IdentificationCard,
  TemplateFormHeader,
  TemplateHistoryCard,
} from "./report-template-form/sections";
import {
  buildFieldOptions,
  buildJoinSuggestions,
  buildLayoutJson,
  defaultLayout,
  formatFilterInputType,
  getAutoJoinSuggestion,
  getDatasetSourcePresets,
  getFirstFieldOption,
  getSourceFieldOptions,
  getTemplateDatasetKey,
  getUniqueJoinFieldOptions,
  mapAutocompleteItemToFieldOption,
  normalizeApiError,
  normalizeColumnEditor,
  normalizeDataset,
  normalizeFormat,
  normalizeScopeType,
  parseContentDispositionFileName,
  parseJsonObject,
  sanitizePreviewHtmlByLayout,
  toApiFormat,
  toScopePayload,
} from "./report-template-form/utils";
import type {
  LayoutEditorState,
  SupportedFormat,
  TemplateDraft,
} from "./report-template-form/types";
import toast from "react-hot-toast";

export default function ReportTemplateForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") || undefined;
  const isEdit = !!id && id !== "new";

  const templateQuery = useReportTemplate(id || "", clientId);
  const datasetsQuery = useReportDatasets();
  const layoutSchemaQuery = useReportLayoutSchema();
  const createMutation = useCreateReportTemplate();
  const updateMutation = useUpdateReportTemplate();
  const previewMutation = useReportPreview();

  const [draft, setDraft] = useState<TemplateDraft>({
    name: "",
    description: "",
    auditUser: "",
    datasetKey: "",
    format: "pdf",
    scopeType: "global",
    responseDisposition: "inline",
    previewMode: "html",
    fileName: "preview-relatorio",
  });

  const [layoutEditor, setLayoutEditor] = useState<LayoutEditorState>(() => defaultLayout([], "portrait"));
  const [previewFilters, setPreviewFilters] = useState<Record<string, unknown>>({});
  const [filterClientId, setFilterClientId] = useState<string>("");
  const [filterSiteId, setFilterSiteId] = useState<string>("");

  const filterClientsQuery = useClients();
  const filterSitesQuery = useSites(filterClientId);
  const filterAgentsQuery = useAgentsByClient(filterSiteId || filterClientId);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{ title?: string; rowCount?: number; format?: string }>({});
  const [previewUnexpectedHeaders, setPreviewUnexpectedHeaders] = useState<string[]>([]);
  const [autocompleteTerm, setAutocompleteTerm] = useState<string>("");
  const [autocompleteAlias, setAutocompleteAlias] = useState<string>("");
  const autosaveKey = useMemo(
    () => `report-template-builder:${isEdit ? `edit:${id}` : "new"}`,
    [id, isEdit],
  );

  const normalizedDatasets = useMemo(
    () => (datasetsQuery.data ?? []).map(normalizeDataset),
    [datasetsQuery.data],
  );

  const selectedDataset = useMemo(
    () => normalizedDatasets.find((dataset) => dataset.key === draft.datasetKey) ?? null,
    [normalizedDatasets, draft.datasetKey],
  );

  const fieldOptions = useMemo(
    () => buildFieldOptions(normalizedDatasets, selectedDataset, layoutEditor.dataSources),
    [layoutEditor.dataSources, normalizedDatasets, selectedDataset],
  );

  const autocompleteQuery = useReportAutocomplete({
    term: autocompleteTerm,
    datasetType:
      layoutEditor.dataSources.find((source) => source.alias === autocompleteAlias)?.datasetType ??
      selectedDataset?.apiDatasetType,
    alias: autocompleteAlias || selectedDataset?.defaultAlias,
    enabled: !!selectedDataset,
  });

  const supportedOrientations = layoutSchemaQuery.data?.supportedOrientations ?? ["portrait", "landscape"];
  const supportedColumnFormats = layoutSchemaQuery.data?.supportedColumnFormats ?? ["text", "number", "date"];
  const supportedAggregates = layoutSchemaQuery.data?.supportedSummaryAggregates ?? ["count", "countDistinct", "sum"];
  const multiSourceSchema = layoutSchemaQuery.data?.multiSource;
  const multiSourceEnabled = !!multiSourceSchema?.enabled;

  useEffect(() => {
    if (previewBlobUrl) {
      return () => URL.revokeObjectURL(previewBlobUrl);
    }
    return undefined;
  }, [previewBlobUrl]);

  useEffect(() => {
    if (isEdit) return;
    try {
      const saved = localStorage.getItem(autosaveKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as {
        draft?: TemplateDraft;
        layoutEditor?: LayoutEditorState;
        previewFilters?: Record<string, unknown>;
      };

      if (parsed.draft) {
        setDraft(parsed.draft);
      }
      if (parsed.layoutEditor) {
        setLayoutEditor(parsed.layoutEditor);
      }
      if (parsed.previewFilters) {
        setPreviewFilters(parsed.previewFilters);
      }
    } catch {
      // Ignore local draft parse issues
    }
  }, [autosaveKey, isEdit]);

  useEffect(() => {
    try {
      localStorage.setItem(
        autosaveKey,
        JSON.stringify({
          draft,
          layoutEditor,
          previewFilters,
        }),
      );
    } catch {
      // Ignore localStorage failures
    }
  }, [autosaveKey, draft, layoutEditor, previewFilters]);

  useEffect(() => {
    if (normalizedDatasets.length === 0) return;
    setDraft((prev) => {
      if (prev.datasetKey) return prev;
      const first = normalizedDatasets[0];
      return {
        ...prev,
        datasetKey: first.key,
        format: first.defaultFormat,
      };
    });
  }, [normalizedDatasets]);

  useEffect(() => {
    if (!selectedDataset) return;

    setAutocompleteAlias((prev) => prev || selectedDataset.defaultAlias);

    setLayoutEditor((prev) => {
      if (prev.columns.length > 0) return prev;
      return defaultLayout(selectedDataset.fields, supportedOrientations[0] ?? "portrait");
    });

    setPreviewFilters((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const next: Record<string, unknown> = {};
      for (const filter of selectedDataset.filters) {
        next[filter.name] = "";
      }
      return next;
    });

    setDraft((prev) => {
      if (selectedDataset.supportedFormats.includes(prev.format)) return prev;
      return {
        ...prev,
        format: selectedDataset.defaultFormat,
      };
    });
  }, [selectedDataset, supportedOrientations]);

  useEffect(() => {
    if (!isEdit || !templateQuery.data || normalizedDatasets.length === 0) return;

    const template = templateQuery.data;
    const datasetKey = getTemplateDatasetKey(template);
    const currentDataset =
      normalizedDatasets.find((dataset) => dataset.key === datasetKey) ?? normalizedDatasets[0];

    const parsedLayout = parseJsonObject<Partial<ReportLayoutDefinition>>(template.layoutJson, {});
    const parsedFilters = parseJsonObject<Record<string, unknown>>(template.filtersJson, {});

    setDraft({
      name: template.name,
      description: template.description ?? "",
      auditUser: template.updatedBy ?? template.createdBy ?? "",
      datasetKey: currentDataset.key,
      format: normalizeFormat(template.format ?? template.defaultFormat),
      scopeType: normalizeScopeType(template.scopeType),
      responseDisposition: "inline",
      previewMode: "html",
      fileName: `${template.name.toLowerCase().replace(/\s+/g, "-")}-preview`,
    });

    setLayoutEditor({
      title: parsedLayout.title ?? template.name,
      subtitle: parsedLayout.subtitle ?? "",
      orientation: parsedLayout.orientation ?? (supportedOrientations[0] ?? "portrait"),
      logoUrl: parsedLayout.logoUrl ?? parsedLayout.style?.logoUrl ?? "",
      logoMaxHeightPx:
        parsedLayout.style?.logoMaxHeightPx !== undefined && parsedLayout.style?.logoMaxHeightPx !== null
          ? String(parsedLayout.style.logoMaxHeightPx)
          : "",
      dataSources: Array.isArray(parsedLayout.dataSources) ? parsedLayout.dataSources : [],
      groupBy: parsedLayout.groupBy ?? "",
      groupTitleTemplate: parsedLayout.groupTitleTemplate ?? "",
      groupTitlePrefix: parsedLayout.groupTitlePrefix ?? "",
      hideGroupColumn: !!parsedLayout.hideGroupColumn,
      columns: Array.isArray(parsedLayout.columns) && parsedLayout.columns.length > 0
        ? parsedLayout.columns.map(normalizeColumnEditor)
        : defaultLayout(currentDataset.fields, supportedOrientations[0] ?? "portrait").columns,
      groupDetails: Array.isArray(parsedLayout.groupDetails) ? parsedLayout.groupDetails : [],
      summaries: Array.isArray(parsedLayout.summaries) ? parsedLayout.summaries : [],
      groupSummaries: Array.isArray(parsedLayout.groupSummaries) ? parsedLayout.groupSummaries : [],
      style: {
        primaryColor: parsedLayout.style?.primaryColor ?? "#16324F",
        secondaryColor: parsedLayout.style?.secondaryColor ?? "#EEF4F7",
        accentColor: parsedLayout.style?.accentColor ?? "#3A7D44",
        headerBackgroundColor: parsedLayout.style?.headerBackgroundColor ?? parsedLayout.style?.primaryColor ?? "#16324F",
        headerTextColor: parsedLayout.style?.headerTextColor ?? "#FFFFFF",
        alternateRowColor: parsedLayout.style?.alternateRowColor ?? parsedLayout.style?.secondaryColor ?? "#EEF4F7",
        borderColor: parsedLayout.style?.borderColor ?? "#D7E0E8",
        fontFamily: parsedLayout.style?.fontFamily ?? "Segoe UI, sans-serif",
        showRowStripes: parsedLayout.style?.showRowStripes ?? true,
      },
      sections: Array.isArray(parsedLayout.sections)
        ? parsedLayout.sections.map((section) => ({
            title: section.title,
            source: section.source,
            columns: (section.columns ?? []).map(normalizeColumnEditor),
          }))
        : [],
    });

    setPreviewFilters(parsedFilters);
    setAutocompleteAlias(
      Array.isArray(parsedLayout.dataSources) && parsedLayout.dataSources.length > 0
        ? parsedLayout.dataSources[0].alias
        : currentDataset.defaultAlias,
    );
  }, [
    isEdit,
    templateQuery.data,
    normalizedDatasets,
    supportedOrientations,
  ]);

  const validateLocal = (): { valid: boolean; layoutJson: string; filtersJson: string } => {
    const errors: string[] = [];

    if (!draft.name.trim()) {
      errors.push("Nome do template e obrigatorio.");
    }

    if (!selectedDataset) {
      errors.push("Selecione um dataset valido.");
    }

    const { layout, errors: layoutErrors } = buildLayoutJson(layoutEditor);
    errors.push(...layoutErrors);

    if (!layout.title || !layout.title.trim()) {
      errors.push("Layout precisa de um titulo.");
    }

    if ((layout.columns?.length ?? 0) === 0 && (layout.sections?.length ?? 0) === 0) {
      errors.push("Layout precisa de colunas ou secoes.");
    }

    if (layout.groupDetails && layout.groupDetails.length > 0 && !layout.groupBy) {
      errors.push("groupDetails exige groupBy preenchido.");
    }

    if ((layout.columns?.length ?? 0) > 0 && (layout.sections?.length ?? 0) > 0) {
      errors.push("columns e sections nao podem coexistir na raiz do layout.");
    }

    if (selectedDataset) {
      const availableFields = new Set(fieldOptions.map((option) => option.value));
      const requireQualifiedReference = (layout.dataSources?.length ?? 0) > 1;

      const invalidColumns = (layout.columns ?? []).filter((col) => !availableFields.has(col.field));
      if (invalidColumns.length > 0) {
        errors.push(`Campos invalidos em columns: ${invalidColumns.map((col) => col.field).join(", ")}.`);
      }

      if (requireQualifiedReference) {
        const unqualified = (layout.columns ?? [])
          .map((column) => column.field)
          .concat(layout.groupBy ? [layout.groupBy] : [])
          .concat((layout.groupDetails ?? []).map((detail) => detail.field))
          .concat((layout.summaries ?? []).map((summary) => summary.field ?? ""))
          .concat((layout.groupSummaries ?? []).map((summary) => summary.field ?? ""))
          .filter((field) => field && !field.includes("."));

        if (unqualified.length > 0) {
          errors.push(`Com dataSources configurado, use referencias no formato alias.field. Campos invalidos: ${unqualified.join(", ")}.`);
        }
      }

      if (layout.groupBy && !availableFields.has(layout.groupBy)) {
        errors.push(`groupBy invalido: '${layout.groupBy}' nao existe no dataset.`);
      }

      const invalidGroupDetails = (layout.groupDetails ?? []).filter((detail) => !availableFields.has(detail.field));
      if (invalidGroupDetails.length > 0) {
        errors.push(
          `Campos invalidos em groupDetails: ${invalidGroupDetails.map((detail) => detail.field).join(", ")}.`,
        );
      }

      const invalidSummaries = (layout.summaries ?? []).filter(
        (summary) => summary.field && !availableFields.has(summary.field),
      );
      if (invalidSummaries.length > 0) {
        errors.push(`Campos invalidos em summaries: ${invalidSummaries.map((summary) => summary.field).join(", ")}.`);
      }

      const missingSummaryFields = (layout.summaries ?? []).filter(
        (summary) => summary.aggregate !== "count" && !summary.field,
      );
      if (missingSummaryFields.length > 0) {
        errors.push("Summaries com aggregate diferente de count exigem field.");
      }

      const invalidGroupSummaries = (layout.groupSummaries ?? []).filter(
        (summary) => summary.field && !availableFields.has(summary.field),
      );
      if (invalidGroupSummaries.length > 0) {
        errors.push(
          `Campos invalidos em groupSummaries: ${invalidGroupSummaries.map((summary) => summary.field).join(", ")}.`,
        );
      }

      const missingGroupSummaryFields = (layout.groupSummaries ?? []).filter(
        (summary) => summary.aggregate !== "count" && !summary.field,
      );
      if (missingGroupSummaryFields.length > 0) {
        errors.push("Group summaries com aggregate diferente de count exigem field.");
      }

      const invalidSectionColumns = (layout.sections ?? []).flatMap((section) => {
        const allowed = new Set<string>(fieldOptions.map((option) => option.value));
        const sourcePreset = getDatasetSourcePresets(selectedDataset.key).find(
          (preset) => preset.source === (section.source ?? ""),
        );
        for (const column of sourcePreset?.columns ?? []) {
          allowed.add(column.field);
        }

        return (section.columns ?? []).filter((column) => !allowed.has(column.field));
      });
      if (invalidSectionColumns.length > 0) {
        errors.push(
          `Campos invalidos em sections.columns: ${invalidSectionColumns.map((column) => column.field).join(", ")}.`,
        );
      }
    }

    const limits = layoutSchemaQuery.data?.limits;
    if (limits?.maxColumns && (layout.columns?.length ?? 0) > limits.maxColumns) {
      errors.push(`Limite de colunas excedido: maximo ${limits.maxColumns}.`);
    }
    if (limits?.maxSummaries && (layout.summaries?.length ?? 0) > limits.maxSummaries) {
      errors.push(`Limite de summaries excedido: maximo ${limits.maxSummaries}.`);
    }
    if (limits?.maxGroupDetails && (layout.groupDetails?.length ?? 0) > limits.maxGroupDetails) {
      errors.push(`Limite de groupDetails excedido: maximo ${limits.maxGroupDetails}.`);
    }
    if (limits?.maxSections && (layout.sections?.length ?? 0) > limits.maxSections) {
      errors.push(`Limite de sections excedido: maximo ${limits.maxSections}.`);
    }
    if (limits?.maxSectionColumns) {
      const sectionExceed = (layout.sections ?? []).find(
        (section) => (section.columns?.length ?? 0) > limits.maxSectionColumns!,
      );
      if (sectionExceed) {
        errors.push(`Uma secao excede o limite de colunas (${limits.maxSectionColumns}).`);
      }
    }

    const activeFilters = Object.fromEntries(
      Object.entries(previewFilters).filter(([_, value]) => value !== "" && value !== null && value !== undefined),
    );

    const layoutJson = JSON.stringify(layout);
    if (limits?.maxLayoutJsonLength && layoutJson.length > limits.maxLayoutJsonLength) {
      errors.push(`layoutJson excede limite de ${limits.maxLayoutJsonLength} caracteres.`);
    }

    if ((layout.dataSources?.length ?? 0) === 1) {
      errors.push("dataSources deve conter a fonte principal e ao menos uma fonte adicional.");
    }

    setValidationErrors(errors);

    return {
      valid: errors.length === 0,
      layoutJson,
      filtersJson: JSON.stringify(activeFilters),
    };
  };

  const handleAddColumn = () => {
    const firstField = getFirstFieldOption(fieldOptions);
    setLayoutEditor((prev) => ({
      ...prev,
      columns: [
        ...prev.columns,
        {
          field: firstField,
          label: firstField || "Nova coluna",
          format: supportedColumnFormats[0] ?? "text",
          align: "left",
          width: "",
        },
      ],
    }));
  };

  const handleAddSection = (preset?: { source: string; label: string; columns: { field: string; label: string; format: string }[] }) => {
    const firstField = getFirstFieldOption(fieldOptions);
    setLayoutEditor((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          title: preset?.label ?? `Secao ${prev.sections.length + 1}`,
          source: preset?.source ?? "",
          columns: preset && preset.columns.length > 0
            ? preset.columns.map((c) => ({ ...c, align: "left", width: "" }))
            : [
                {
                  field: firstField,
                  label: firstField || "Campo",
                  format: supportedColumnFormats[0] ?? "text",
                  align: "left",
                  width: "",
                },
              ],
        },
      ],
    }));
  };

  const handleAddSectionColumn = (sectionIndex: number) => {
    const sectionSource = layoutEditor.sections[sectionIndex]?.source ?? "";
    const sourcePreset = getDatasetSourcePresets(selectedDataset?.key).find(
      (preset) => preset.source === sectionSource,
    );
    const firstField = sourcePreset?.columns[0]?.field ?? getFirstFieldOption(fieldOptions);
    setLayoutEditor((prev) => ({
      ...prev,
      sections: prev.sections.map((section, idx) =>
        idx === sectionIndex
          ? {
              ...section,
              columns: [
                ...section.columns,
                {
                  field: firstField,
                  label: firstField || "Campo",
                  format: supportedColumnFormats[0] ?? "text",
                  align: "left",
                  width: "",
                },
              ],
            }
          : section,
      ),
    }));
  };

  const handlePreview = () => {
    if (!selectedDataset) {
      toast.error("Selecione um dataset antes do preview.");
      return;
    }

    const { valid, layoutJson, filtersJson } = validateLocal();
    if (!valid) {
      toast.error("Corrija os erros de validacao antes do preview.");
      return;
    }

    previewMutation.mutate(
      {
        templateId: isEdit ? id : undefined,
        template: {
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          datasetKey: selectedDataset.key,
          datasetType: selectedDataset.apiDatasetType,
          defaultFormat: toApiFormat(draft.format),
          scopeType: toScopePayload(draft.scopeType),
          filtersJson,
          layoutJson,
        },
        format: toApiFormat(draft.format),
        filtersJson,
        fileName: draft.fileName.trim() || "report-preview",
        responseDisposition: draft.responseDisposition,
        previewMode: draft.previewMode,
      },
      {
        onSuccess: (response) => {
          setPreviewMeta({
            rowCount: response.headers.rowCount,
            title: response.headers.title,
            format: response.headers.format,
          });

          if (previewBlobUrl) {
            URL.revokeObjectURL(previewBlobUrl);
            setPreviewBlobUrl(null);
          }

          if (response.mode === "html") {
            const { layout } = buildLayoutJson(layoutEditor);
            const sanitized = sanitizePreviewHtmlByLayout(response.html ?? "", layout);
            setPreviewUnexpectedHeaders(sanitized.unexpectedHeaders);
            setPreviewHtml(sanitized.html);

            if (sanitized.unexpectedHeaders.length > 0) {
              toast.error("Preview retornou colunas extras. Exibicao filtrada para respeitar o layout.");
            }

            toast.success("Preview HTML atualizado.");
            return;
          }

          setPreviewUnexpectedHeaders([]);
          setPreviewHtml("");
          if (!response.blob) {
            toast.error("A API nao retornou arquivo para preview document.");
            return;
          }

          const nextUrl = URL.createObjectURL(response.blob);
          setPreviewBlobUrl(nextUrl);

          const safeContentType = response.contentType.toLowerCase();
          if (draft.responseDisposition === "attachment" || (!safeContentType.includes("pdf") && !safeContentType.includes("text/csv"))) {
            const link = document.createElement("a");
            link.href = nextUrl;
            const fileNameFromHeader = parseContentDispositionFileName(response.headers.disposition);
            link.download = fileNameFromHeader ?? `${draft.fileName || "preview"}.${draft.format}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success("Download de preview iniciado.");
          } else {
            toast.success("Preview de documento atualizado.");
          }
        },
        onError: (error) => {
          toast.error(normalizeApiError(error, "Erro ao gerar preview."));
        },
      },
    );
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedDataset) {
      toast.error("Selecione um dataset valido.");
      return;
    }

    const { valid, layoutJson, filtersJson } = validateLocal();
    if (!valid) {
      toast.error("Corrija os erros de validacao antes de salvar.");
      return;
    }

    const payload: any = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      datasetKey: selectedDataset.key,
      datasetType: selectedDataset.apiDatasetType,
      scopeType: toScopePayload(draft.scopeType),
      layoutJson,
      filtersJson,
      defaultFormat: toApiFormat(draft.format),
      createdBy: draft.auditUser.trim() || null,
      updatedBy: draft.auditUser.trim() || null,
      isActive: true,
    };

    if (isEdit && id) {
      updateMutation.mutate(
        { id, data: payload },
        {
          onSuccess: () => {
            toast.success("Template atualizado com sucesso.");
            localStorage.removeItem(autosaveKey);
            navigate("/reports/templates");
          },
          onError: (error) => toast.error(normalizeApiError(error, "Erro ao atualizar template.")),
        },
      );
      return;
    }

    createMutation.mutate(payload, {
      onSuccess: () => {
        toast.success("Template criado com sucesso.");
        localStorage.removeItem(autosaveKey);
        navigate("/reports/templates");
      },
      onError: (error) => toast.error(normalizeApiError(error, "Erro ao criar template.")),
    });
  };

  const isLoadingInitial =
    datasetsQuery.isLoading || layoutSchemaQuery.isLoading || (isEdit && templateQuery.isLoading);

  if (isLoadingInitial) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      <TemplateFormHeader isEdit={isEdit} onBack={() => navigate(-1)} />

      {isEdit && id && templateQuery.data && (
        <TemplateHistoryCard templateId={id} version={templateQuery.data.version} />
      )}

      <form className="space-y-6" onSubmit={handleSave}>
        <IdentificationCard draft={draft} setDraft={setDraft} />

        <DataSourceScopeCard
          draft={draft}
          setDraft={setDraft}
          normalizedDatasets={normalizedDatasets}
          selectedDataset={selectedDataset}
          defaultFormatOptions={FORMAT_OPTIONS}
          scopeOptions={SCOPE_OPTIONS}
          onDatasetChange={(nextDatasetKey) => {
            const nextDataset = normalizedDatasets.find((dataset) => dataset.key === nextDatasetKey);
            setDraft((prev) => ({
              ...prev,
              datasetKey: nextDatasetKey,
              format: nextDataset?.defaultFormat ?? prev.format,
            }));
            setAutocompleteAlias(nextDataset?.defaultAlias ?? "");
            setLayoutEditor(defaultLayout(nextDataset?.fields ?? [], supportedOrientations[0] ?? "portrait"));
            setPreviewFilters({});
          }}
        />

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Layout Builder</h2>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={handleAddColumn}>
                <Plus className="h-4 w-4" /> Coluna
              </Button>
              <select
                aria-label="Adicionar secao"
                title="Adicionar secao"
                className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10"
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
                <option value="" className="bg-slate-900">+ Secao...</option>
                <option value="__blank" className="bg-slate-900">Em branco</option>
                {(DATASET_SECTION_SOURCES[selectedDataset?.key.toLowerCase() ?? ""] ?? []).length > 0 && (
                  <>
                    {(DATASET_SECTION_SOURCES[selectedDataset?.key.toLowerCase() ?? ""] ?? []).map((s) => (
                      <option key={s.source} value={s.source} className="bg-slate-900">
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
              label="Titulo"
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
              label="Subtitulo"
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
              <label className="mb-2 block text-sm font-medium text-slate-300">Orientacao</label>
              <select
                aria-label="Orientacao do layout"
                title="Orientacao do layout"
                value={layoutEditor.orientation}
                onChange={(event) =>
                  setLayoutEditor((prev) => ({
                    ...prev,
                    orientation: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
              >
                {supportedOrientations.map((orientation) => (
                  <option key={orientation} value={orientation} className="bg-slate-900 text-slate-100">
                    {orientation}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Retrato (A4 vertical) ou Paisagem (A4 horizontal). Aplicado ao PDF.</p>
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

          <div className="mt-3 flex items-start gap-2 text-sm text-slate-300">
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
              <span className="ml-1 text-xs text-slate-500">Quando ativo, a coluna usada no GroupBy não aparece nas linhas da tabela.</span>
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
                      <div key={`${source.alias}-${index}`} className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-3 md:grid-cols-6">
                        <div>
                          <label className="mb-2 block text-xs font-medium text-slate-300">Dataset</label>
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
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                          >
                            {normalizedDatasets.map((dataset) => (
                              <option key={dataset.key} value={String(dataset.apiDatasetType)} className="bg-slate-900 text-slate-100">
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
                          <label className="mb-2 block text-xs font-medium text-slate-300">Join com</label>
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
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white disabled:opacity-50"
                          >
                            <option value="" className="bg-slate-900 text-slate-100">{index === 0 ? "Principal" : "Selecione"}</option>
                            {layoutEditor.dataSources
                              .filter((_, candidateIndex) => candidateIndex !== index)
                              .map((candidate) => (
                                <option key={candidate.alias} value={candidate.alias} className="bg-slate-900 text-slate-100">
                                  {candidate.alias}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-medium text-slate-300">Source key</label>
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
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white disabled:opacity-50"
                          >
                            <option value="" className="bg-slate-900 text-slate-100">Selecione</option>
                            {(source.join?.sourceKey && !sourceKeyFields.some((field) => (field.reference ?? field.field) === source.join?.sourceKey)) && (
                              <option value={source.join.sourceKey} className="bg-slate-900 text-slate-100">
                                {source.join.sourceKey} (atual)
                              </option>
                            )}
                            {sourceKeyFields.map((field) => {
                              const val = field.reference ?? field.field ?? "";
                              return (
                                <option key={val} value={val} className="bg-slate-900 text-slate-100">
                                  {field.label ?? val}{field.isJoinKey ? " (join)" : ""}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-medium text-slate-300">Target key</label>
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
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white disabled:opacity-50"
                          >
                            <option value="" className="bg-slate-900 text-slate-100">Selecione</option>
                            {(source.join?.targetKey && !targetKeyFields.some((field) => (field.reference ?? field.field) === source.join?.targetKey)) && (
                              <option value={source.join.targetKey} className="bg-slate-900 text-slate-100">
                                {source.join.targetKey} (atual)
                              </option>
                            )}
                            {targetKeyFields.map((field) => {
                              const val = field.reference ?? field.field ?? "";
                              return (
                                <option key={val} value={val} className="bg-slate-900 text-slate-100">
                                  {field.label ?? val}{field.isJoinKey ? " (join)" : ""}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <label className="mb-2 block text-xs font-medium text-slate-300">Join type</label>
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
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white disabled:opacity-50"
                            >
                              {(multiSourceSchema?.joinTypes ?? ["left", "inner"]).map((joinType) => (
                                <option key={joinType} value={joinType} className="bg-slate-900 text-slate-100">
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
                          <div className="md:col-span-6 rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs text-slate-300">
                            Sugestoes de join: {joinSuggestions.map((join) => `${join.sourceKey} -> ${join.targetKey}`).join(" | ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid gap-3 rounded-lg border border-white/10 bg-black/10 p-3 md:grid-cols-[180px_1fr]">
                <div>
                  <label className="mb-2 block text-xs font-medium text-slate-300">Alias para busca</label>
                  <select
                    aria-label="Alias para autocomplete"
                    title="Alias para autocomplete"
                    value={autocompleteAlias}
                    onChange={(event) => setAutocompleteAlias(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                  >
                    {layoutEditor.dataSources.length > 0
                      ? layoutEditor.dataSources.map((source) => (
                          <option key={source.alias} value={source.alias} className="bg-slate-900 text-slate-100">
                            {source.alias}
                          </option>
                        ))
                      : (
                        <option value={selectedDataset.defaultAlias} className="bg-slate-900 text-slate-100">
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
                <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                  <div className="mb-2 text-xs text-slate-400">
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
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10"
                          onClick={() => {
                            const exists = layoutEditor.columns.some((column) => column.field === option.value);
                            if (exists) return;
                            setLayoutEditor((prev) => ({
                              ...prev,
                              columns: [
                                ...prev.columns,
                                {
                                  field: option.value,
                                  label: item.field,
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

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-300">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
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
                  <tr key={`${column.field}-${index}`} className="border-b border-white/5">
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
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                        >
                          <option value="" className="bg-slate-900 text-slate-400">— selecione o campo —</option>
                          {fieldOptions.map((field) => (
                            <option key={field.value} value={field.value} className="bg-slate-900 text-slate-100">
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
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
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
                        className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
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
                        className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                      >
                        {supportedColumnFormats.map((format) => (
                          <option key={format} value={format} className="bg-slate-900 text-slate-100">
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
                        className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                      >
                        {ALIGN_OPTIONS.map((align) => (
                          <option key={align} value={align} className="bg-slate-900 text-slate-100">
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
                        className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
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
            <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <p className="mb-3 text-xs text-slate-500">
                Campos para personalização avançada do layout via editor visual.
              </p>
              <div className="grid gap-4 md:grid-cols-1">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-200">Group details</h4>
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
                  <p className="mb-3 text-xs text-slate-500">Lista de campos exibidos no detalhe de cada grupo.</p>
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
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                        >
                          <option value="" className="bg-slate-900 text-slate-100">Sem campo</option>
                          {fieldOptions.map((field) => (
                            <option key={field.value} value={field.value} className="bg-slate-900 text-slate-100">
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
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
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
                      <p className="text-xs text-slate-500">Nenhum item de group detail.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-200">Summaries</h4>
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
                  <p className="mb-3 text-xs text-slate-500">Totalizadores gerais no rodapé do relatório.</p>
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
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                        >
                          <option value="" className="bg-slate-900 text-slate-100">Sem campo</option>
                          {fieldOptions.map((field) => (
                            <option key={field.value} value={field.value} className="bg-slate-900 text-slate-100">
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
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
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
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                        >
                          {supportedAggregates.map((aggregate) => (
                            <option key={aggregate} value={aggregate} className="bg-slate-900 text-slate-100">
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
                      <p className="text-xs text-slate-500">Nenhum summary configurado.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-200">Group summaries</h4>
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
                  <p className="mb-3 text-xs text-slate-500">Totalizadores exibidos ao final de cada grupo.</p>
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
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                        >
                          {fieldOptions.map((field) => (
                            <option key={field.value} value={field.value} className="bg-slate-900 text-slate-100">
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
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
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
                          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                        >
                          {supportedAggregates.map((aggregate) => (
                            <option key={aggregate} value={aggregate} className="bg-slate-900 text-slate-100">
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
                      <p className="text-xs text-slate-500">Nenhum group summary configurado.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </details>

          {layoutEditor.sections.length > 0 && (
            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-200">Secoes adicionais</h3>
                {selectedDataset && (DATASET_SECTION_SOURCES[selectedDataset.key.toLowerCase()] ?? []).length > 0 && (
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300">
                    Fontes disponíveis para <strong>{selectedDataset.name}</strong>:{" "}
                    {(DATASET_SECTION_SOURCES[selectedDataset.key.toLowerCase()] ?? []).map((s) => s.source).join(", ")}
                  </span>
                )}
              </div>
              {layoutEditor.sections.map((section, sectionIndex) => (
                <div key={`section-${sectionIndex}`} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="mb-3 grid gap-3 md:grid-cols-3">
                    <Input
                      label={`Titulo da secao ${sectionIndex + 1}`}
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
                      label={`Source da secao ${sectionIndex + 1}`}
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
                      hint={`Sub-array retornado no response para esta secao. Fontes: ${(DATASET_SECTION_SOURCES[selectedDataset?.key.toLowerCase() ?? ""] ?? []).map((s) => s.source).join(", ") || "nenhuma mapeada"}`}
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
                    <table className="min-w-full text-left text-xs text-slate-300">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400">
                          <th className="px-2 py-2">Campo</th>
                          <th className="px-2 py-2">Label</th>
                          <th className="px-2 py-2">Formato</th>
                          <th className="px-2 py-2">Acoes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.columns.map((column, columnIndex) => (
                          <tr key={`section-${sectionIndex}-col-${columnIndex}`} className="border-b border-white/5">
                            <td className="px-2 py-2">
                              <select
                                aria-label={`Campo da secao ${sectionIndex + 1} coluna ${columnIndex + 1}`}
                                title={`Campo da secao ${sectionIndex + 1} coluna ${columnIndex + 1}`}
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
                                className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                              >
                                {getSourceFieldOptions(
                                  selectedDataset?.key,
                                  section.source,
                                  fieldOptions,
                                  section.columns.map((c) => c.field),
                                ).map((field) => (
                                  <option key={field} value={field} className="bg-slate-900 text-slate-100">
                                    {field}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-2">
                              <input
                                aria-label={`Label da secao ${sectionIndex + 1} coluna ${columnIndex + 1}`}
                                title={`Label da secao ${sectionIndex + 1} coluna ${columnIndex + 1}`}
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
                                className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <select
                                aria-label={`Formato da secao ${sectionIndex + 1} coluna ${columnIndex + 1}`}
                                title={`Formato da secao ${sectionIndex + 1} coluna ${columnIndex + 1}`}
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
                                className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200"
                              >
                                {supportedColumnFormats.map((format) => (
                                  <option key={format} value={format} className="bg-slate-900 text-slate-100">
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
            <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <p className="mb-3 text-xs text-slate-500">
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
                  placeholder='[{"title":"Secao","source":"items","columns":[{"field":"name","label":"Nome"}]}]'
                  hint="Cada seção possui title, source (chave de dados) e columns. Use o editor visual acima para não precisar editar JSON."
                />
              </div>
            </div>
          </details>

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
              hint="URL opcional da marca exibida no cabeçalho do relatório."
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
              hint="Cor de fundo do cabeçalho da tabela e elementos principais."
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
              hint="Cor de fundo alternado nas linhas (listras pares)."
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
              hint="Usada em totais, bordas de destaque e rodapé."
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
              hint="Cor do texto nas células de cabeçalho."
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
              hint="Cor de fundo específica do cabeçalho da tabela."
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
              hint="Usada no zebra striping quando showRowStripes estiver ativo."
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
              hint="Cor usada em bordas e divisores principais."
            />
            <Input
              label="Fonte"
              value={layoutEditor.style.fontFamily}
              onChange={(event) =>
                setLayoutEditor((prev) => ({
                  ...prev,
                  style: { ...prev.style, fontFamily: event.target.value },
                }))
              }
              hint="Família tipográfica CSS válida. Ex.: Arial, Segoe UI, sans-serif."
            />
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-slate-300">
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
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-white">Filtros de Preview</h2>
          {selectedDataset?.filters.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {selectedDataset.filters.map((filter) => {
                const currentValue = previewFilters[filter.name] ?? "";
                const label = filter.label || filter.name;
                const n = filter.name.toLowerCase();
                const selectClass = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white";
                const inputClass = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-200";
                const labelEl = (
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    {label}{filter.required ? " *" : ""}
                  </label>
                );

                // clientId — select de clientes da base
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
                        <option value="" className="bg-slate-900 text-slate-100">Selecione um cliente...</option>
                        {(filterClientsQuery.data ?? []).map((c) => (
                          <option key={c.id} value={c.id} className="bg-slate-900 text-slate-100">{c.name}</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                // siteId — select de sites cascateado ao cliente
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
                        <option value="" className="bg-slate-900 text-slate-100">
                          {filterClientId ? "Selecione um site..." : "Selecione um cliente primeiro"}
                        </option>
                        {(filterSitesQuery.data ?? []).map((s) => (
                          <option key={s.id} value={s.id} className="bg-slate-900 text-slate-100">{s.name}</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                // agentId — select de agentes cascateado ao cliente/site
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
                        <option value="" className="bg-slate-900 text-slate-100">
                          {filterClientId ? "Selecione um agente..." : "Selecione um cliente primeiro"}
                        </option>
                        {(filterAgentsQuery.data ?? []).map((a) => (
                          <option key={a.id} value={a.id} className="bg-slate-900 text-slate-100">
                            {a.displayName ?? a.hostname}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                // direction / sortDirection — select asc/desc
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
                        <option value="" className="bg-slate-900 text-slate-100">Padrão</option>
                        <option value="asc" className="bg-slate-900 text-slate-100">Crescente (asc)</option>
                        <option value="desc" className="bg-slate-900 text-slate-100">Decrescente (desc)</option>
                      </select>
                    </div>
                  );
                }

                // orientation — select portrait/landscape
                if (n === "orientation" || n === "orientacao") {
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
                        <option value="" className="bg-slate-900 text-slate-100">Padrão</option>
                        <option value="portrait" className="bg-slate-900 text-slate-100">Retrato (portrait)</option>
                        <option value="landscape" className="bg-slate-900 text-slate-100">Paisagem (landscape)</option>
                      </select>
                    </div>
                  );
                }

                // sortBy / orderBy — select dos campos do dataset
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
                        <option value="" className="bg-slate-900 text-slate-100">Padrão</option>
                        {fieldOptions.map((field) => (
                          <option key={field.value} value={field.value} className="bg-slate-900 text-slate-100">{field.label}</option>
                        ))}
                      </select>
                    </div>
                  );
                }

                // boolean
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
                        <option value="" className="bg-slate-900 text-slate-100">Não definido</option>
                        <option value="true" className="bg-slate-900 text-slate-100">Sim (true)</option>
                        <option value="false" className="bg-slate-900 text-slate-100">Não (false)</option>
                      </select>
                    </div>
                  );
                }

                // default: input tipado
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
            <p className="text-sm text-slate-400">Dataset sem filtros dinâmicos declarados pela API.</p>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Preview</h2>
            <Button type="button" onClick={handlePreview} loading={previewMutation.isPending}>
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
              <label className="mb-2 block text-sm font-medium text-slate-300">Modo</label>
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
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
              >
                {(layoutSchemaQuery.data?.previewModes ?? ["document", "html"]).map((mode) => (
                  <option key={mode} value={mode} className="bg-slate-900 text-slate-100">
                    {mode}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500"><strong className="text-slate-400">html</strong>: renderiza inline na página. <strong className="text-slate-400">document</strong>: gera o arquivo binário (PDF/XLSX/CSV).</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Disposition</label>
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
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
              >
                {(layoutSchemaQuery.data?.responseDispositions ?? ["inline", "attachment"]).map((mode) => (
                  <option key={mode} value={mode} className="bg-slate-900 text-slate-100">
                    {mode}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500"><strong className="text-slate-400">inline</strong>: exibe no navegador. <strong className="text-slate-400">attachment</strong>: força download do arquivo.</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Formato para preview</label>
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
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
              >
                {(selectedDataset?.supportedFormats ?? FORMAT_OPTIONS).map((format) => (
                  <option key={format} value={format} className="bg-slate-900 text-slate-100">
                    {format.toUpperCase()}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Formato do arquivo gerado neste preview. Independente do formato salvo no template.</p>
            </div>
          </div>

          {(previewMeta.title || previewMeta.rowCount !== undefined || previewMeta.format) && (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <p>Titulo: {previewMeta.title || "-"}</p>
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
            <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
              <iframe title="Preview HTML" className="h-[560px] w-full bg-white" srcDoc={previewHtml} />
            </div>
          )}

          {draft.previewMode === "document" && previewBlobUrl && (
            <div className="mt-4 space-y-3">
              {draft.format === "pdf" && draft.responseDisposition === "inline" ? (
                <iframe title="Preview PDF" src={previewBlobUrl} className="h-[560px] w-full rounded-lg border border-white/10 bg-white" />
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                  Preview gerado. Use o botao para baixar novamente.
                </div>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const link = document.createElement("a");
                  link.href = previewBlobUrl;
                  link.download = `${draft.fileName || "preview"}.${draft.format}`;
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                }}
              >
                Baixar preview
              </Button>
            </div>
          )}
        </Card>

        {validationErrors.length > 0 && (
          <Card>
            <h2 className="text-sm font-semibold text-red-300">Erros de validacao</h2>
            <ul className="mt-2 list-disc pl-5 text-xs text-red-200">
              {validationErrors.map((error, index) => (
                <li key={`${error}-${index}`}>{error}</li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={createMutation.isPending || updateMutation.isPending}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            <Save className="h-4 w-4" /> {isEdit ? "Atualizar template" : "Criar template"}
          </Button>
        </div>
      </form>
    </div>
  );
}
