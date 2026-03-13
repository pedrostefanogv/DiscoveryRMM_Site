import { ApiError } from "@/api/client";
import {
  ReportDatasetType,
  ReportFormat,
  type DatasetCatalogItem,
  type ReportAutocompleteItem,
  type ReportDatasetFieldMetadata,
  type ReportDatasetJoinCapability,
  type ReportDatasetTypeValue,
  type ReportLayoutDefinition,
  type ReportTemplate,
  type ScopeTypeString,
} from "@/api/types";
import { DATASET_SECTION_SOURCES, FORMAT_OPTIONS } from "./data";
import type {
  FieldOption,
  LayoutEditorState,
  NormalizedDataset,
  SupportedFormat,
} from "./types";

function normalizeHeaderText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getLayoutExpectedHeaders(layout: ReportLayoutDefinition): Set<string> {
  const expected = new Set<string>();

  for (const column of layout.columns ?? []) {
    if (column.field) expected.add(normalizeHeaderText(column.field));
    if (column.label) expected.add(normalizeHeaderText(column.label));
  }

  for (const section of layout.sections ?? []) {
    if (section.source) expected.add(normalizeHeaderText(section.source));
    if (section.title) expected.add(normalizeHeaderText(section.title));

    for (const column of section.columns ?? []) {
      if (column.field) expected.add(normalizeHeaderText(column.field));
      if (column.label) expected.add(normalizeHeaderText(column.label));
    }
  }

  return expected;
}

export function sanitizePreviewHtmlByLayout(
  html: string,
  layout: ReportLayoutDefinition,
): { html: string; unexpectedHeaders: string[] } {
  if (!html.trim()) return { html, unexpectedHeaders: [] };

  const expectedHeaders = getLayoutExpectedHeaders(layout);
  if (expectedHeaders.size === 0) return { html, unexpectedHeaders: [] };

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  const unexpected = new Set<string>();

  for (const table of tables) {
    const headerRow =
      table.querySelector("thead tr") ?? table.querySelector("tr");
    if (!headerRow) continue;

    const headerCells = Array.from(headerRow.querySelectorAll("th,td"));
    if (headerCells.length === 0) continue;

    const allowedIndexes = new Set<number>();
    headerCells.forEach((cell, idx) => {
      const text = normalizeHeaderText(cell.textContent ?? "");
      if (expectedHeaders.has(text)) {
        allowedIndexes.add(idx);
      } else {
        unexpected.add((cell.textContent ?? "").trim());
      }
    });

    if (allowedIndexes.size === 0) {
      continue;
    }

    for (const row of Array.from(table.querySelectorAll("tr"))) {
      const cells = Array.from(row.querySelectorAll("th,td"));
      cells.forEach((cell, idx) => {
        if (!allowedIndexes.has(idx)) {
          cell.remove();
        }
      });
    }
  }

  return {
    html: doc.documentElement.outerHTML,
    unexpectedHeaders: Array.from(unexpected).filter(Boolean),
  };
}

export function normalizeApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.message || fallback;
  }
  if (err instanceof Error) {
    return err.message || fallback;
  }
  return fallback;
}

export function getFirstFieldOption(fieldOptions: FieldOption[]): string {
  return fieldOptions[0]?.value ?? "";
}

export function normalizeFormat(value: unknown): SupportedFormat {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "pdf" || lower === "xlsx" || lower === "csv") {
      return lower;
    }
  }

  if (value === ReportFormat.Pdf || value === 1) return "pdf";
  if (value === ReportFormat.Csv || value === 2) return "csv";
  return "xlsx";
}

export function toApiFormat(format: SupportedFormat): "Pdf" | "Xlsx" | "Csv" {
  if (format === "pdf") return "Pdf";
  if (format === "csv") return "Csv";
  return "Xlsx";
}

export function parseJsonObject<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function inferFilterType(typeValue: unknown): string {
  if (typeof typeValue === "string") {
    return typeValue.toLowerCase();
  }

  switch (typeValue) {
    case 3:
      return "uuid";
    case 4:
    case 5:
      return "number";
    case 6:
      return "date";
    case 7:
      return "datetime";
    case 8:
      return "boolean";
    default:
      return "text";
  }
}

function deriveDatasetAlias(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (cleaned) return cleaned.toLowerCase();
  }

  const slug = fallback
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return slug.slice(0, 3) || "src";
}

function normalizeFieldMetadata(
  item: DatasetCatalogItem,
): ReportDatasetFieldMetadata[] {
  if (item.fieldMetadata && item.fieldMetadata.length > 0) {
    return item.fieldMetadata.reduce<ReportDatasetFieldMetadata[]>(
      (acc, field) => {
        const resolvedField =
          (typeof field.field === "string" && field.field.trim()) ||
          (typeof field.reference === "string" && field.reference.trim()) ||
          (typeof field.label === "string" && field.label.trim()) ||
          "";

        if (!resolvedField) {
          return acc;
        }

        const resolvedReference =
          (typeof field.reference === "string" && field.reference.trim()) ||
          resolvedField;

        acc.push({
          ...field,
          field: resolvedField,
          reference: resolvedReference,
          label:
            (typeof field.label === "string" && field.label.trim()) ||
            resolvedField,
        });

        return acc;
      },
      [],
    );
  }

  return (item.fields ?? []).map((field) => ({
    field,
    label: field,
    reference: field,
  }));
}

function getFieldLabel(metadata: ReportDatasetFieldMetadata): string {
  return metadata.reference ?? metadata.label ?? metadata.field ?? "Campo";
}

export function mapAutocompleteItemToFieldOption(
  item: ReportAutocompleteItem,
): FieldOption {
  const value = item.reference || item.field || item.datasetName || "campo";
  return {
    value,
    label: `${value}${item.datasetName ? ` • ${item.datasetName}` : ""}`,
    datasetName: item.datasetName,
    dataType: item.dataType,
    isJoinKey: item.isJoinKey,
  };
}

function getDatasetDisplayType(datasetType: ReportDatasetTypeValue): string {
  if (typeof datasetType === "string") {
    return datasetType;
  }

  return String(datasetType);
}

function normalizeJoinCapabilities(
  item: DatasetCatalogItem,
): ReportDatasetJoinCapability[] {
  if (!Array.isArray(item.joinCapabilities)) {
    return [];
  }

  return item.joinCapabilities.reduce<ReportDatasetJoinCapability[]>(
    (acc, capability) => {
      const sourceKey =
        typeof capability?.sourceKey === "string"
          ? capability.sourceKey.trim()
          : "";
      const targetKey =
        typeof capability?.targetKey === "string"
          ? capability.targetKey.trim()
          : "";

      if (!sourceKey || !targetKey) {
        return acc;
      }

      acc.push({
        ...capability,
        sourceKey,
        targetKey,
        joinTypes: Array.isArray(capability.joinTypes)
          ? capability.joinTypes.filter(
              (joinType): joinType is string =>
                typeof joinType === "string" && joinType.trim().length > 0,
            )
          : undefined,
      });

      return acc;
    },
    [],
  );
}

export function normalizeDataset(item: DatasetCatalogItem): NormalizedDataset {
  const apiDatasetType = item.datasetType ?? item.key ?? item.type ?? "dataset";
  const key = String(item.key ?? apiDatasetType ?? item.type ?? "dataset");
  const name = item.name ?? getDatasetDisplayType(apiDatasetType) ?? "Dataset";
  const description = item.description ?? "";
  const fieldMetadata = normalizeFieldMetadata(item);

  const executionFilters =
    item.executionSchema?.filters?.map((filter) => ({
      name: filter.name,
      label: filter.label,
      type: inferFilterType(filter.type),
      required: filter.required,
    })) ?? [];

  const filters = (item.filters ?? executionFilters).map((filter) => ({
    ...filter,
    type: inferFilterType(filter.type),
  }));

  const fields =
    fieldMetadata.length > 0
      ? fieldMetadata
          .map((field) => field.reference ?? field.field)
          .filter(
            (field): field is string =>
              typeof field === "string" && field.trim().length > 0,
          )
      : (item.executionSchema?.filters?.map((filter) => filter.name) ?? []);

  const supportedFormats =
    item.supportedFormats && item.supportedFormats.length > 0
      ? item.supportedFormats.map((f) => normalizeFormat(f))
      : item.formats && item.formats.length > 0
        ? item.formats.map((f) => normalizeFormat(f))
        : FORMAT_OPTIONS;

  const defaultFormat = item.defaultFormat
    ? normalizeFormat(item.defaultFormat)
    : (supportedFormats[0] ?? "pdf");

  const numericType = Number(item.datasetType ?? item.type);
  const legacyDatasetType: ReportDatasetType | undefined = (() => {
    if (
      (item.datasetType ?? item.type) &&
      Number.isFinite(numericType) &&
      numericType >= 0
    ) {
      return numericType as ReportDatasetType;
    }
    const keyMap: Record<string, ReportDatasetType> = {
      "software-inventory": ReportDatasetType.SoftwareInventory,
      software_inventory: ReportDatasetType.SoftwareInventory,
      softwareinventory: ReportDatasetType.SoftwareInventory,
      logs: ReportDatasetType.Logs,
      "configuration-audit": ReportDatasetType.ConfigurationAudit,
      configuration_audit: ReportDatasetType.ConfigurationAudit,
      configurationaudit: ReportDatasetType.ConfigurationAudit,
      tickets: ReportDatasetType.Tickets,
      "agent-hardware": ReportDatasetType.AgentHardware,
      agent_hardware: ReportDatasetType.AgentHardware,
      agenthardware: ReportDatasetType.AgentHardware,
      hardware: ReportDatasetType.AgentHardware,
      "agent-labels": ReportDatasetType.AgentLabels,
      agent_labels: ReportDatasetType.AgentLabels,
      agentlabels: ReportDatasetType.AgentLabels,
      labels: ReportDatasetType.AgentLabels,
      "knowledge-base": ReportDatasetType.KnowledgeBase,
      knowledge_base: ReportDatasetType.KnowledgeBase,
      knowledgebase: ReportDatasetType.KnowledgeBase,
      knowledge: ReportDatasetType.KnowledgeBase,
    };
    const lookup = String(
      item.datasetType ?? item.key ?? item.type ?? "",
    ).toLowerCase();
    return keyMap[lookup];
  })();

  const defaultAlias =
    fieldMetadata.find((field) => field.defaultAlias)?.defaultAlias ??
    deriveDatasetAlias(apiDatasetType, key);
  const joinCapabilities = normalizeJoinCapabilities(item);

  return {
    key,
    apiDatasetType,
    name,
    description,
    fields,
    fieldMetadata,
    filters,
    supportedFormats,
    defaultFormat,
    defaultAlias,
    joinCapabilities,
    legacyDatasetType,
  };
}

export function defaultLayout(
  fields: string[],
  orientation: string,
): LayoutEditorState {
  const initialColumns = fields.slice(0, 5).map((field) => ({
    field,
    label: field,
    format: "text",
    align: "left",
    width: "",
  }));

  return {
    title: "Novo relatorio",
    subtitle: "",
    orientation,
    logoUrl: "",
    logoMaxHeightPx: "",
    dataSources: [],
    groupBy: "",
    groupTitleTemplate: "",
    groupTitlePrefix: "",
    hideGroupColumn: false,
    columns: initialColumns,
    groupDetails: [],
    summaries: [],
    groupSummaries: [],
    style: {
      primaryColor: "#16324F",
      secondaryColor: "#EEF4F7",
      accentColor: "#3A7D44",
      headerBackgroundColor: "#16324F",
      headerTextColor: "#FFFFFF",
      alternateRowColor: "#EEF4F7",
      borderColor: "#D7E0E8",
      fontFamily: "Segoe UI, sans-serif",
      showRowStripes: true,
    },
    sections: [],
  };
}

export function normalizeScopeType(value: unknown): ScopeTypeString {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (
      lower === "global" ||
      lower === "client" ||
      lower === "site" ||
      lower === "agent"
    ) {
      return lower;
    }
  }

  if (value === 1) return "client";
  if (value === 2) return "site";
  if (value === 3) return "agent";
  return "global";
}

export function toScopePayload(scopeType: ScopeTypeString): ScopeTypeString {
  return scopeType;
}

export function getTemplateDatasetKey(template: ReportTemplate): string {
  if (template.datasetKey) return template.datasetKey;
  return String(template.datasetType ?? "");
}

export function buildFieldOptions(
  datasets: NormalizedDataset[],
  selectedDataset: NormalizedDataset | null,
  dataSources: Array<{ datasetType: ReportDatasetTypeValue; alias: string }>,
): FieldOption[] {
  if (!selectedDataset) return [];

  if (dataSources.length === 0) {
    return selectedDataset.fieldMetadata.reduce<FieldOption[]>((acc, field) => {
      const value = field.reference ?? field.field;
      if (!value) return acc;

      acc.push({
        value,
        label: getFieldLabel(field),
        datasetName: field.datasetName ?? selectedDataset.name,
        dataType: field.dataType,
        isJoinKey: field.isJoinKey,
      });

      return acc;
    }, []);
  }

  return dataSources.flatMap((source) => {
    const sourceDataset =
      datasets.find(
        (dataset) =>
          String(dataset.apiDatasetType) === String(source.datasetType),
      ) ?? selectedDataset;

    return sourceDataset.fieldMetadata.reduce<FieldOption[]>((acc, field) => {
      const rawReference = field.reference ?? field.field;
      const fieldName = field.field ?? rawReference;

      if (!rawReference || !fieldName) {
        return acc;
      }

      const value = rawReference.includes(".")
        ? rawReference
        : `${source.alias}.${fieldName}`;
      acc.push({
        value,
        label: `${value}${sourceDataset.name ? ` • ${sourceDataset.name}` : ""}`,
        datasetName: sourceDataset.name,
        dataType: field.dataType,
        isJoinKey: field.isJoinKey,
      });

      return acc;
    }, []);
  });
}

export function getUniqueJoinFieldOptions(
  fieldMetadata: ReportDatasetFieldMetadata[],
): ReportDatasetFieldMetadata[] {
  const prioritized = [
    ...fieldMetadata.filter(
      (field) => field.isJoinKey && (field.reference ?? field.field),
    ),
    ...fieldMetadata.filter(
      (field) => !field.isJoinKey && (field.reference ?? field.field),
    ),
  ];

  const seen = new Set<string>();
  const unique: ReportDatasetFieldMetadata[] = [];

  for (const field of prioritized) {
    const key = field.reference ?? field.field ?? "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(field);
  }

  return unique;
}

function normalizeJoinRuleCandidate(
  sourceKey: unknown,
  targetKey: unknown,
  joinType: unknown,
  description: unknown,
): {
  sourceKey: string;
  targetKey: string;
  joinType?: string;
  description?: string;
} | null {
  const normalizedSourceKey =
    typeof sourceKey === "string" ? sourceKey.trim() : "";
  const normalizedTargetKey =
    typeof targetKey === "string" ? targetKey.trim() : "";

  if (!normalizedSourceKey || !normalizedTargetKey) {
    return null;
  }

  const normalizedJoinType =
    typeof joinType === "string" ? joinType.trim() : "";
  const normalizedDescription =
    typeof description === "string" ? description.trim() : "";

  return {
    sourceKey: normalizedSourceKey,
    targetKey: normalizedTargetKey,
    joinType: normalizedJoinType || undefined,
    description: normalizedDescription || undefined,
  };
}

export function buildJoinSuggestions(params: {
  sourceDatasetType: ReportDatasetTypeValue;
  targetDatasetType?: ReportDatasetTypeValue;
  sourceJoinCapabilities: ReportDatasetJoinCapability[];
  schemaJoinRules?: Array<{
    sourceDatasetType?: ReportDatasetTypeValue;
    targetDatasetType?: ReportDatasetTypeValue;
    sourceKey: string;
    targetKey: string;
    joinType?: string;
    description?: string;
  }>;
}) {
  const {
    sourceDatasetType,
    targetDatasetType,
    sourceJoinCapabilities,
    schemaJoinRules,
  } = params;
  const matchesDatasetType = (
    ruleDatasetType?: ReportDatasetTypeValue,
    expected?: ReportDatasetTypeValue,
  ) => {
    if (!ruleDatasetType || !expected) return true;
    return String(ruleDatasetType) === String(expected);
  };

  const result: Array<{
    sourceKey: string;
    targetKey: string;
    joinType?: string;
    description?: string;
  }> = [];

  for (const capability of sourceJoinCapabilities) {
    if (!matchesDatasetType(capability.sourceDatasetType, sourceDatasetType))
      continue;
    if (!matchesDatasetType(capability.targetDatasetType, targetDatasetType))
      continue;

    const normalized = normalizeJoinRuleCandidate(
      capability.sourceKey,
      capability.targetKey,
      capability.joinTypes?.[0],
      capability.description,
    );
    if (!normalized) continue;
    result.push(normalized);
  }

  for (const joinRule of schemaJoinRules ?? []) {
    if (!matchesDatasetType(joinRule.sourceDatasetType, sourceDatasetType))
      continue;
    if (!matchesDatasetType(joinRule.targetDatasetType, targetDatasetType))
      continue;

    const normalized = normalizeJoinRuleCandidate(
      joinRule.sourceKey,
      joinRule.targetKey,
      joinRule.joinType,
      joinRule.description,
    );
    if (!normalized) continue;
    result.push(normalized);
  }

  const deduped: Array<{
    sourceKey: string;
    targetKey: string;
    joinType?: string;
    description?: string;
  }> = [];
  const seen = new Set<string>();
  for (const item of result) {
    const key = `${item.sourceKey}|${item.targetKey}|${item.joinType ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function getAutoJoinSuggestion(params: {
  joinSuggestions: Array<{
    sourceKey: string;
    targetKey: string;
    joinType?: string;
  }>;
  sourceKeyOptions: ReportDatasetFieldMetadata[];
  targetKeyOptions: ReportDatasetFieldMetadata[];
}) {
  const { joinSuggestions, sourceKeyOptions, targetKeyOptions } = params;
  if (joinSuggestions.length > 0) {
    return joinSuggestions[0];
  }

  const sourceJoinKeys = sourceKeyOptions
    .filter((field) => field.isJoinKey)
    .map((field) => field.reference ?? field.field ?? "")
    .filter(Boolean);
  const targetJoinKeys = new Set(
    targetKeyOptions
      .filter((field) => field.isJoinKey)
      .map((field) => field.reference ?? field.field ?? "")
      .filter(Boolean),
  );

  const common = sourceJoinKeys.find((key) => targetJoinKeys.has(key));
  if (common) {
    return {
      sourceKey: common,
      targetKey: common,
    };
  }

  const firstSource =
    sourceJoinKeys[0] ??
    sourceKeyOptions[0]?.reference ??
    sourceKeyOptions[0]?.field ??
    "";
  const firstTarget =
    targetKeyOptions
      .filter((field) => field.isJoinKey)
      .map((field) => field.reference ?? field.field ?? "")
      .find(Boolean) ??
    targetKeyOptions[0]?.reference ??
    targetKeyOptions[0]?.field ??
    "";

  if (!firstSource || !firstTarget) {
    return null;
  }

  return {
    sourceKey: firstSource,
    targetKey: firstTarget,
  };
}

export function normalizeColumnEditor(column: {
  field?: string;
  header?: string;
  label?: string;
  format?: string;
  width?: string;
  align?: string;
}) {
  return {
    field: column.field ?? "",
    label: column.header ?? column.label ?? column.field ?? "",
    format: column.format,
    width: column.width,
    align: column.align ?? "left",
  };
}

export function buildLayoutJson(state: LayoutEditorState): {
  layout: ReportLayoutDefinition;
  errors: string[];
} {
  const errors: string[] = [];
  const hasSections = state.sections.length > 0;

  const layout: ReportLayoutDefinition = {
    title: state.title.trim(),
    subtitle: state.subtitle.trim() || undefined,
    orientation: state.orientation || undefined,
    logoUrl: state.logoUrl.trim() || undefined,
    dataSources: state.dataSources.length > 0 ? state.dataSources : undefined,
    groupBy: state.groupBy.trim() || undefined,
    groupTitleTemplate: state.groupTitleTemplate.trim() || undefined,
    groupTitlePrefix: state.groupTitlePrefix.trim() || undefined,
    hideGroupColumn: state.hideGroupColumn || undefined,
    columns: hasSections
      ? undefined
      : state.columns
          .filter((col) => col.field.trim() && col.label.trim())
          .map((col) => ({
            field: col.field,
            header: col.label,
            format: col.format,
            width: col.width,
            align: col.align,
          })),
    groupDetails: state.groupDetails.filter(
      (detail) => detail.field.trim() && detail.label.trim(),
    ),
    summaries: state.summaries.filter(
      (summary) =>
        summary.label.trim() &&
        summary.aggregate.trim() &&
        (summary.aggregate === "count" || !!summary.field?.trim()),
    ),
    groupSummaries: state.groupSummaries.filter(
      (summary) =>
        summary.label.trim() &&
        summary.aggregate.trim() &&
        (summary.aggregate === "count" || !!summary.field?.trim()),
    ),
    style: {
      primaryColor: state.style.primaryColor || undefined,
      secondaryColor: state.style.secondaryColor || undefined,
      accentColor: state.style.accentColor || undefined,
      headerBackgroundColor: state.style.headerBackgroundColor || undefined,
      headerTextColor: state.style.headerTextColor || undefined,
      alternateRowColor: state.style.alternateRowColor || undefined,
      borderColor: state.style.borderColor || undefined,
      fontFamily: state.style.fontFamily || undefined,
      logoUrl: state.logoUrl.trim() || undefined,
      logoMaxHeightPx: state.logoMaxHeightPx
        ? Number(state.logoMaxHeightPx)
        : undefined,
      showRowStripes: state.style.showRowStripes,
    },
    sections: hasSections
      ? state.sections.map((section) => ({
          title: section.title,
          source: section.source,
          columns: section.columns
            .filter((column) => column.field.trim() && column.label.trim())
            .map((column) => ({
              field: column.field,
              header: column.label,
              format: column.format,
              width: column.width,
              align: column.align,
            })),
        }))
      : undefined,
  };

  if (state.dataSources.length === 1) {
    errors.push("Use dataSources apenas quando houver duas ou mais fontes.");
  }

  if (state.dataSources.length > 1) {
    const aliases = state.dataSources
      .map((source) => source.alias.trim())
      .filter(Boolean);
    if (aliases.length !== new Set(aliases).size) {
      errors.push("Cada dataSource precisa usar um alias unico.");
    }
  }

  return { layout, errors };
}

export function getDatasetSourcePresets(datasetKey?: string | null) {
  const key = (datasetKey ?? "").toLowerCase();
  return DATASET_SECTION_SOURCES[key] ?? [];
}

export function getSourceFieldOptions(
  datasetKey: string | undefined,
  source: string | undefined,
  fallbackFields: FieldOption[],
  currentSectionFields: string[] = [],
) {
  const presetFields =
    getDatasetSourcePresets(datasetKey)
      .find((preset) => preset.source === (source ?? ""))
      ?.columns.map((c) => c.field) ?? [];

  return Array.from(
    new Set([
      ...fallbackFields.map((field) => field.value),
      ...presetFields,
      ...currentSectionFields.filter((field) => !!field),
    ]),
  );
}

export function formatFilterInputType(filterType: string): string {
  const t = filterType.toLowerCase();
  if (t.includes("bool")) return "boolean";
  if (t.includes("date") && t.includes("time")) return "datetime-local";
  if (t.includes("date")) return "date";
  if (t.includes("int") || t.includes("decimal") || t.includes("number"))
    return "number";
  return "text";
}

export function parseContentDispositionFileName(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(header);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
