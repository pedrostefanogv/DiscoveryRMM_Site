import { useState, useCallback, useMemo } from "react";
import type {
  ReportLayoutDataSourceDefinition,
  ReportLayoutStyleDefinition,
  ReportLayoutSummaryDefinition,
  ReportLayoutDetailDefinition,
  DatasetCatalogItem,
} from "@/api/types";

// ── Types ─────────────────────────────────────────────────

export interface SelectedDataset {
  catalogItem: DatasetCatalogItem;
  alias: string;
  joinToAlias?: string;
  joinSourceKey?: string;
  joinTargetKey?: string;
  joinType?: "left" | "inner";
  isPrimary: boolean;
}

export interface LayoutColumn {
  field: string;
  header: string;
  format: "text" | "number" | "date" | "datetime";
  align: "left" | "center" | "right";
  width?: string;
  sourceAlias?: string;
}

export interface SubTable {
  id: string;
  title: string;
  sourceAlias: string;
  columns: LayoutColumn[];
}

export interface WizardState {
  // Step 1 - Data Sources
  selectedDatasets: SelectedDataset[];
  selectedFields: string[];

  // Step 2 - Layout
  groupBy: string;
  groupTitleTemplate: string;
  hideGroupColumn: boolean;
  columns: LayoutColumn[];
  subTables: SubTable[];
  groupDetails: ReportLayoutDetailDefinition[];
  summaries: ReportLayoutSummaryDefinition[];
  groupSummaries: ReportLayoutSummaryDefinition[];
  orientation: "portrait" | "landscape";

  // Step 3 - Metadata
  name: string;
  subtitle: string;
  description: string;
  defaultFormat: "xlsx" | "pdf" | "csv" | "markdown";
  scopeType: "global" | "client" | "site" | "agent";
  style: ReportLayoutStyleDefinition;
  logoUrl: string;
  createdBy: string;
}

// ── Join compatibility matrix ─────────────────────────────

const JOIN_KEYS: Record<string, string[]> = {
  softwareInventory: ["agentId", "clientId", "siteId", "softwareName"],
  agentHardware: ["agentId", "clientId", "siteId"],
  agentLabels: ["agentId", "clientId", "siteId", "labelName"],
  automaticLabelRules: ["labelName", "ruleId"],
  logs: ["agentId", "clientId", "siteId"],
  tickets: ["agentId", "clientId", "siteId"],
  configurationAudit: ["agentId", "clientId", "siteId"],
  automationExecutions: ["agentId"],
  agentInventoryComposite: ["agentId", "clientId", "siteId"],
};

const DATASET_ALIASES: Record<string, string> = {
  softwareInventory: "sw",
  agentHardware: "hw",
  agentLabels: "lbl",
  automaticLabelRules: "rule",
  logs: "log",
  tickets: "tk",
  configurationAudit: "audit",
  automationExecutions: "auto",
  agentInventoryComposite: "inv",
};

// ── Helpers ───────────────────────────────────────────────

function getDatasetKey(item: DatasetCatalogItem): string {
  return item.key ?? item.type ?? "";
}

function getDefaultAlias(key: string): string {
  return DATASET_ALIASES[key] ?? key.substring(0, 3);
}

function normalizeFieldReference(field: string, sourceAlias?: string): string {
  if (!sourceAlias) return field;
  return field.startsWith(`${sourceAlias}.`)
    ? field.slice(sourceAlias.length + 1)
    : field;
}

export function findJoinKeys(sourceKey: string, targetKey: string): string[] {
  const source = JOIN_KEYS[sourceKey] ?? [];
  const target = JOIN_KEYS[targetKey] ?? [];
  return source.filter((k) => target.includes(k));
}

function suggestJoinKey(
  sourceKey: string,
  targetKey: string,
): string | undefined {
  const common = findJoinKeys(sourceKey, targetKey);
  if (common.includes("agentId")) return "agentId";
  if (common.includes("clientId")) return "clientId";
  if (common.includes("siteId")) return "siteId";
  return common[0];
}

// ── Default layout per dataset ───────────────────────────

const DEFAULT_COLUMNS: Record<string, LayoutColumn[]> = {
  softwareInventory: [
    { field: "softwareName", header: "Software", format: "text", align: "left" },
    { field: "publisher", header: "Fabricante", format: "text", align: "left" },
    { field: "version", header: "Versão", format: "text", align: "left" },
  ],
  agentHardware: [
    { field: "agentHostname", header: "Hostname", format: "text", align: "left" },
    { field: "totalMemoryGB", header: "RAM (GB)", format: "number", align: "right" },
    { field: "osName", header: "SO", format: "text", align: "left" },
    { field: "processor", header: "Processador", format: "text", align: "left" },
  ],
  agentLabels: [
    { field: "labelName", header: "Label", format: "text", align: "left" },
    { field: "labelSource", header: "Origem", format: "text", align: "left" },
  ],
  automaticLabelRules: [
    { field: "ruleName", header: "Regra", format: "text", align: "left" },
    { field: "labelName", header: "Label", format: "text", align: "left" },
    { field: "matchCount", header: "Agents", format: "number", align: "right" },
  ],
  logs: [
    { field: "level", header: "Nível", format: "text", align: "center" },
    { field: "message", header: "Mensagem", format: "text", align: "left" },
    { field: "createdAt", header: "Data", format: "datetime", align: "left" },
  ],
  tickets: [
    { field: "title", header: "Título", format: "text", align: "left" },
    { field: "priority", header: "Prioridade", format: "text", align: "center" },
    { field: "createdAt", header: "Aberto em", format: "datetime", align: "left" },
  ],
  configurationAudit: [
    { field: "entityType", header: "Entidade", format: "text", align: "left" },
    { field: "fieldName", header: "Campo", format: "text", align: "left" },
    { field: "changedBy", header: "Alterado por", format: "text", align: "left" },
  ],
  automationExecutions: [
    { field: "agentHostname", header: "Hostname", format: "text", align: "left" },
    { field: "status", header: "Status", format: "text", align: "center" },
    { field: "exitCode", header: "Exit Code", format: "number", align: "right" },
  ],
  agentInventoryComposite: [
    { field: "agentHostname", header: "Hostname", format: "text", align: "left" },
    { field: "softwareName", header: "Software", format: "text", align: "left" },
    { field: "osName", header: "SO", format: "text", align: "left" },
  ],
};

// ── Hook ──────────────────────────────────────────────────

export function useWizardState(initialState?: Partial<WizardState>) {
  const [state, setState] = useState<WizardState>(() => ({
    selectedDatasets: [],
    selectedFields: [],
    groupBy: "",
    groupTitleTemplate: "",
    hideGroupColumn: true,
    columns: [],
    subTables: [],
    groupDetails: [],
    summaries: [],
    groupSummaries: [],
    orientation: "landscape",
    name: initialState?.name ?? "",
    subtitle: "",
    description: initialState?.description ?? "",
    defaultFormat: initialState?.defaultFormat ?? "xlsx",
    scopeType: initialState?.scopeType ?? "global",
    style: initialState?.style ?? {
      primaryColor: "#16324F",
      headerBackgroundColor: "#16324F",
      headerTextColor: "#FFFFFF",
      alternateRowColor: "#EEF4F7",
      fontFamily: "Segoe UI, sans-serif",
      showRowStripes: true,
    },
    logoUrl: initialState?.logoUrl ?? "",
    createdBy: initialState?.createdBy ?? "",
  }));

  // ── Dataset actions ───────────────────────────────────

  const addDataset = useCallback((item: DatasetCatalogItem) => {
    setState((prev) => {
      const key = getDatasetKey(item);
      const isPrimary = prev.selectedDatasets.length === 0;
      const alias = getDefaultAlias(key);

      // If not primary, auto-suggest join
      let joinToAlias: string | undefined;
      let joinSourceKey: string | undefined;
      let joinTargetKey: string | undefined;
      if (!isPrimary && prev.selectedDatasets.length > 0) {
        const primary = prev.selectedDatasets[0];
        const primaryKey = getDatasetKey(primary.catalogItem);
        const suggestedKey = suggestJoinKey(key, primaryKey);
        if (suggestedKey) {
          joinToAlias = primary.alias;
          joinSourceKey = suggestedKey;
          joinTargetKey = suggestedKey;
        }
      }

      const dataset: SelectedDataset = {
        catalogItem: item,
        alias,
        joinToAlias,
        joinSourceKey,
        joinTargetKey,
        joinType: "left",
        isPrimary,
      };

      const newDatasets = [...prev.selectedDatasets, dataset];

      // Auto-add default columns for this dataset
      const defaults = DEFAULT_COLUMNS[key];
      let newColumns = prev.columns;
      let newSubTables = prev.subTables;

      if (isPrimary && defaults) {
        newColumns = defaults.map((c) => ({
          ...c,
          sourceAlias: alias,
        }));
      } else if (defaults) {
        // Add as sub-table
        const subTable: SubTable = {
          id: `sub-${Date.now()}`,
          title: item.name ?? key,
          sourceAlias: alias,
          columns: defaults.map((c) => ({
            ...c,
            sourceAlias: alias,
          })),
        };
        newSubTables = [...prev.subTables, subTable];
      }

      return {
        ...prev,
        selectedDatasets: newDatasets,
        columns: newColumns,
        subTables: newSubTables,
      };
    });
  }, []);

  const removeDataset = useCallback((alias: string) => {
    setState((prev) => {
      const newDatasets = prev.selectedDatasets.filter((d) => d.alias !== alias);
      const newSubTables = prev.subTables.filter((st) => st.sourceAlias !== alias);
      return {
        ...prev,
        selectedDatasets: newDatasets,
        subTables: newSubTables,
      };
    });
  }, []);

  // ── Column actions ─────────────────────────────────────

  const setColumns = useCallback((columns: LayoutColumn[]) => {
    setState((prev) => ({ ...prev, columns }));
  }, []);

  const addColumn = useCallback((field: string, sourceAlias?: string) => {
    setState((prev) => ({
      ...prev,
      columns: [
        ...prev.columns,
        {
          field,
          header: field,
          format: "text",
          align: "left",
          sourceAlias,
        },
      ],
    }));
  }, []);

  const removeColumn = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      columns: prev.columns.filter((_, i) => i !== index),
    }));
  }, []);

  const updateColumn = useCallback((index: number, updates: Partial<LayoutColumn>) => {
    setState((prev) => ({
      ...prev,
      columns: prev.columns.map((c, i) =>
        i === index ? { ...c, ...updates } : c,
      ),
    }));
  }, []);

  // ── Sub-table actions ─────────────────────────────────

  const addSubTable = useCallback((sourceAlias: string, title: string) => {
    setState((prev) => {
      if (prev.subTables.some((st) => st.sourceAlias === sourceAlias)) {
        return prev;
      }

      return {
        ...prev,
        subTables: [
          ...prev.subTables,
          { id: `sub-${Date.now()}`, title, sourceAlias, columns: [] },
        ],
      };
    });
  }, []);

  const removeSubTable = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      subTables: prev.subTables.filter((st) => st.id !== id),
    }));
  }, []);

  const updateSubTableColumns = useCallback(
    (id: string, columns: LayoutColumn[]) => {
      setState((prev) => ({
        ...prev,
        subTables: prev.subTables.map((st) =>
          st.id === id ? { ...st, columns } : st,
        ),
      }));
    },
    [],
  );

  // ── Bulk setters ───────────────────────────────────────

  const setField = useCallback(
    <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // ── Available fields from all selected datasets ───────

  const allFields = useMemo(() => {
    return state.selectedDatasets.flatMap((ds) => {
      const fields = ds.catalogItem.fields ?? [];
      return fields.map((f) => ({
        name: f,
        reference: `${ds.alias}.${f}`,
        datasetName: ds.catalogItem.name ?? getDatasetKey(ds.catalogItem),
        alias: ds.alias,
      }));
    });
  }, [state.selectedDatasets]);

  // ── Build layout JSON ─────────────────────────────────

  const buildLayoutJson = useCallback((): string => {
    const dataSources: ReportLayoutDataSourceDefinition[] =
      state.selectedDatasets.map((ds) => {
        const dsType = ds.catalogItem.datasetType ?? ds.catalogItem.type;
        const def: ReportLayoutDataSourceDefinition = {
          datasetType: dsType ?? "",
          alias: ds.alias,
        };
        if (ds.joinToAlias) {
          def.join = {
            joinToAlias: ds.joinToAlias,
            sourceKey: ds.joinSourceKey ?? "",
            targetKey: ds.joinTargetKey ?? "",
            joinType: ds.joinType,
          };
        }
        return def;
      });

    const layout: Record<string, unknown> = {
      title: state.name || "Novo Relatório",
      orientation: state.orientation,
      groupBy: state.groupBy || undefined,
      groupTitleTemplate: state.groupTitleTemplate || undefined,
      hideGroupColumn: state.hideGroupColumn,
      columns: state.columns.map((c) => ({
        field: c.sourceAlias
          ? `${c.sourceAlias}.${normalizeFieldReference(c.field, c.sourceAlias)}`
          : c.field,
        header: c.header,
        format: c.format,
        align: c.align,
        width: c.width || undefined,
      })),
      style: {
        primaryColor: state.style.primaryColor,
        headerBackgroundColor: state.style.headerBackgroundColor,
        headerTextColor: state.style.headerTextColor,
        alternateRowColor: state.style.alternateRowColor,
        fontFamily: state.style.fontFamily,
      },
    };

    if (state.subtitle) layout.subtitle = state.subtitle;
    if (dataSources.length > 1) layout.dataSources = dataSources;
    if (state.groupDetails.length > 0) layout.groupDetails = state.groupDetails;
    if (state.summaries.length > 0) layout.summaries = state.summaries;
    if (state.groupSummaries.length > 0) layout.groupSummaries = state.groupSummaries;

    if (state.subTables.length > 0) {
      layout.sections = state.subTables.map((st) => ({
        title: st.title,
        source: st.sourceAlias,
        columns: st.columns.map((c) => ({
          field: c.sourceAlias
            ? `${c.sourceAlias}.${normalizeFieldReference(c.field, c.sourceAlias)}`
            : normalizeFieldReference(c.field, st.sourceAlias),
          header: c.header,
          format: c.format,
          align: c.align,
        })),
      }));
    }

    return JSON.stringify(layout);
  }, [state]);

  // ── Build request payload ─────────────────────────────

  const buildRequest = useCallback(
    (
      overrides?: Partial<{
        format: string;
        filtersJson: string;
      }>,
    ) => {
      const primaryDs = state.selectedDatasets[0];
      const dsType = primaryDs?.catalogItem.datasetType ?? primaryDs?.catalogItem.type;
      return {
        name: state.name || "Novo Template",
        description: state.description || null,
        datasetType: dsType ?? "",
        defaultFormat: overrides?.format ?? state.defaultFormat,
        scopeType: state.scopeType,
        layoutJson: buildLayoutJson(),
        filtersJson: overrides?.filtersJson ?? null,
        createdBy: state.createdBy || undefined,
      };
    },
    [state, buildLayoutJson],
  );

  return {
    state,
    // Dataset
    addDataset,
    removeDataset,
    // Columns
    columns: state.columns,
    setColumns,
    addColumn,
    removeColumn,
    updateColumn,
    // Sub-tables
    subTables: state.subTables,
    addSubTable,
    removeSubTable,
    updateSubTableColumns,
    // Fields
    allFields,
    setField,
    // Build
    buildLayoutJson,
    buildRequest,
  };
}
