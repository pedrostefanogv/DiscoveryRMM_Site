import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { Card, Loading } from "@/components/ui";
import {
  type ReportLayoutDefinition,
} from "@/api/types";
import { FORMAT_OPTIONS, SCOPE_OPTIONS } from "./report-template-form/data";
import {
  DataSourceScopeCard,
  IdentificationCard,
  LayoutBrandingSection,
  LayoutBuilderDetailsSection,
  LayoutBuilderTopSection,
  PreviewCard,
  PreviewFiltersCard,
  TemplateFormActionBar,
  TemplateFormHeader,
  TemplateHistoryCard,
  ValidationErrorsCard,
} from "./report-template-form/sections";
import {
  buildFieldOptions,
  buildLayoutJson,
  defaultLayout,
  formatFilterInputType,
  getDatasetSourcePresets,
  getFirstFieldOption,
  getTemplateDatasetKey,
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
      errors.push("Layout precisa de um título.");
    }

    if ((layout.columns?.length ?? 0) === 0 && (layout.sections?.length ?? 0) === 0) {
      errors.push("Layout precisa de colunas ou seções.");
    }

    if (layout.groupDetails && layout.groupDetails.length > 0 && !layout.groupBy) {
      errors.push("groupDetails exige groupBy preenchido.");
    }

    if ((layout.columns?.length ?? 0) > 0 && (layout.sections?.length ?? 0) > 0) {
      errors.push("columns e sections não podem coexistir na raiz do layout.");
    }

    if (selectedDataset) {
      const availableFields = new Set(fieldOptions.map((option) => option.value));
      const requireQualifiedReference = (layout.dataSources?.length ?? 0) > 1;

      const invalidColumns = (layout.columns ?? []).filter((col) => !availableFields.has(col.field));
      if (invalidColumns.length > 0) {
        errors.push(`Campos inválidos em columns: ${invalidColumns.map((col) => col.field).join(", ")}.`);
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
          errors.push(`Com dataSources configurado, use referências no formato alias.field. Campos inválidos: ${unqualified.join(", ")}.`);
        }
      }

      if (layout.groupBy && !availableFields.has(layout.groupBy)) {
        errors.push(`groupBy inválido: '${layout.groupBy}' não existe no dataset.`);
      }

      const invalidGroupDetails = (layout.groupDetails ?? []).filter((detail) => !availableFields.has(detail.field));
      if (invalidGroupDetails.length > 0) {
        errors.push(
          `Campos inválidos em groupDetails: ${invalidGroupDetails.map((detail) => detail.field).join(", ")}.`,
        );
      }

      const invalidSummaries = (layout.summaries ?? []).filter(
        (summary) => summary.field && !availableFields.has(summary.field),
      );
      if (invalidSummaries.length > 0) {
        errors.push(`Campos inválidos em summaries: ${invalidSummaries.map((summary) => summary.field).join(", ")}.`);
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
          `Campos inválidos em groupSummaries: ${invalidGroupSummaries.map((summary) => summary.field).join(", ")}.`,
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
          `Campos inválidos em sections.columns: ${invalidSectionColumns.map((column) => column.field).join(", ")}.`,
        );
      }
    }

    const limits = layoutSchemaQuery.data?.limits;
    if (limits?.maxColumns && (layout.columns?.length ?? 0) > limits.maxColumns) {
      errors.push(`Limite de colunas excedido: máximo ${limits.maxColumns}.`);
    }
    if (limits?.maxSummaries && (layout.summaries?.length ?? 0) > limits.maxSummaries) {
      errors.push(`Limite de summaries excedido: máximo ${limits.maxSummaries}.`);
    }
    if (limits?.maxGroupDetails && (layout.groupDetails?.length ?? 0) > limits.maxGroupDetails) {
      errors.push(`Limite de groupDetails excedido: máximo ${limits.maxGroupDetails}.`);
    }
    if (limits?.maxSections && (layout.sections?.length ?? 0) > limits.maxSections) {
      errors.push(`Limite de sections excedido: máximo ${limits.maxSections}.`);
    }
    if (limits?.maxSectionColumns) {
      const sectionExceed = (layout.sections ?? []).find(
        (section) => (section.columns?.length ?? 0) > limits.maxSectionColumns!,
      );
      if (sectionExceed) {
        errors.push(`Uma seção excede o limite de colunas (${limits.maxSectionColumns}).`);
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
          title: preset?.label ?? `Seção ${prev.sections.length + 1}`,
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
      toast.error("Corrija os erros de validação antes do preview.");
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
              toast.error("Preview retornou colunas extras. Exibição filtrada para respeitar o layout.");
            }

            toast.success("Preview HTML atualizado.");
            return;
          }

          setPreviewUnexpectedHeaders([]);
          setPreviewHtml("");
          if (!response.blob) {
            toast.error("A API não retornou arquivo para preview document.");
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
      toast.error("Corrija os erros de validação antes de salvar.");
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
          <LayoutBuilderTopSection
            layoutEditor={layoutEditor}
            setLayoutEditor={setLayoutEditor}
            selectedDataset={selectedDataset}
            normalizedDatasets={normalizedDatasets}
            supportedOrientations={supportedOrientations}
            multiSourceEnabled={multiSourceEnabled}
            multiSourceSchema={multiSourceSchema}
            fieldOptions={fieldOptions}
            autocompleteAlias={autocompleteAlias}
            setAutocompleteAlias={setAutocompleteAlias}
            autocompleteTerm={autocompleteTerm}
            setAutocompleteTerm={setAutocompleteTerm}
            autocompleteQuery={{
              isLoading: autocompleteQuery.isLoading,
              data: autocompleteQuery.data
                ? { total: autocompleteQuery.data.total, items: autocompleteQuery.data.items }
                : undefined,
            }}
            handleAddColumn={handleAddColumn}
            handleAddSection={handleAddSection}
          />

          <LayoutBuilderDetailsSection
            layoutEditor={layoutEditor}
            setLayoutEditor={setLayoutEditor}
            fieldOptions={fieldOptions}
            selectedDataset={selectedDataset}
            supportedColumnFormats={supportedColumnFormats}
            supportedAggregates={supportedAggregates}
            handleAddSectionColumn={handleAddSectionColumn}
          />

          <LayoutBrandingSection
            layoutEditor={layoutEditor}
            setLayoutEditor={setLayoutEditor}
            supportedAggregates={supportedAggregates}
          />
        </Card>

        <PreviewFiltersCard
          selectedDataset={selectedDataset}
          previewFilters={previewFilters}
          setPreviewFilters={setPreviewFilters}
          filterClientId={filterClientId}
          setFilterClientId={setFilterClientId}
          setFilterSiteId={setFilterSiteId}
          clients={(filterClientsQuery.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
          sites={(filterSitesQuery.data ?? []).map((s) => ({ id: s.id, name: s.name }))}
          agents={(filterAgentsQuery.data ?? []).map((a) => ({
            id: a.id,
            displayName: a.displayName ?? undefined,
            hostname: a.hostname,
          }))}
          fieldOptions={fieldOptions}
          formatFilterInputType={formatFilterInputType}
        />

        <PreviewCard
          draft={draft}
          setDraft={setDraft}
          previewModes={layoutSchemaQuery.data?.previewModes ?? ["document", "html"]}
          responseDispositions={layoutSchemaQuery.data?.responseDispositions ?? ["inline", "attachment"]}
          selectedDataset={selectedDataset}
          defaultFormatOptions={FORMAT_OPTIONS}
          previewMeta={previewMeta}
          previewUnexpectedHeaders={previewUnexpectedHeaders}
          previewHtml={previewHtml}
          previewBlobUrl={previewBlobUrl}
          loadingPreview={previewMutation.isPending}
          onPreview={handlePreview}
          onDownloadPreview={() => {
            if (!previewBlobUrl) return;
            const link = document.createElement("a");
            link.href = previewBlobUrl;
            link.download = `${draft.fileName || "preview"}.${draft.format}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
          }}
        />

        <ValidationErrorsCard errors={validationErrors} />

        <TemplateFormActionBar
          isEdit={isEdit}
          loading={createMutation.isPending || updateMutation.isPending}
          onCancel={() => navigate(-1)}
        />
      </form>
    </div>
  );
}

