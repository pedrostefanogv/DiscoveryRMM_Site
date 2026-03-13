import type {
  DatasetFilterDefinition,
  PreviewMode,
  ReportDatasetFieldMetadata,
  ReportDatasetJoinCapability,
  ReportDatasetType,
  ReportDatasetTypeValue,
  ReportFormatString,
  ReportLayoutDataSourceDefinition,
  ReportLayoutDetailDefinition,
  ReportLayoutSummaryDefinition,
  ResponseDisposition,
  ScopeTypeString,
} from "@/api/types";

export type SupportedFormat = ReportFormatString;

export type NormalizedDataset = {
  key: string;
  apiDatasetType: ReportDatasetTypeValue;
  name: string;
  description: string;
  fields: string[];
  fieldMetadata: ReportDatasetFieldMetadata[];
  filters: DatasetFilterDefinition[];
  supportedFormats: SupportedFormat[];
  defaultFormat: SupportedFormat;
  defaultAlias: string;
  joinCapabilities: ReportDatasetJoinCapability[];
  legacyDatasetType?: ReportDatasetType;
};

export type TemplateDraft = {
  name: string;
  description: string;
  auditUser: string;
  datasetKey: string;
  format: SupportedFormat;
  scopeType: ScopeTypeString;
  responseDisposition: ResponseDisposition;
  previewMode: PreviewMode;
  fileName: string;
};

export type LayoutColumnEditor = {
  field: string;
  label: string;
  format?: string;
  width?: string;
  align?: "left" | "center" | "right" | string;
};

export type LayoutEditorState = {
  title: string;
  subtitle: string;
  orientation: string;
  logoUrl: string;
  logoMaxHeightPx: string;
  dataSources: ReportLayoutDataSourceDefinition[];
  groupBy: string;
  groupTitleTemplate: string;
  groupTitlePrefix: string;
  hideGroupColumn: boolean;
  columns: LayoutColumnEditor[];
  groupDetails: ReportLayoutDetailDefinition[];
  summaries: ReportLayoutSummaryDefinition[];
  groupSummaries: ReportLayoutSummaryDefinition[];
  style: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    headerBackgroundColor: string;
    headerTextColor: string;
    alternateRowColor: string;
    borderColor: string;
    fontFamily: string;
    showRowStripes: boolean;
  };
  sections: Array<{
    title: string;
    source?: string;
    columns: LayoutColumnEditor[];
  }>;
};

export type FieldOption = {
  value: string;
  label: string;
  datasetName?: string;
  dataType?: string;
  isJoinKey?: boolean;
};

export type DatasetSectionSourcePreset = {
  source: string;
  label: string;
  columns: Array<{ field: string; label: string; format: string }>;
};
