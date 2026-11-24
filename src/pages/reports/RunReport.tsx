import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

import {
  useReportTemplate,
  useReportDatasets,
  useReportPreview,
  useRunReport,
  useReportExecution,
  useClients,
  useSites,
  useAgentsBySite,
} from "@/hooks";
import { Icon, Button, Card, Loading, Badge, Input,
PageHeader,
} from "@/components/ui";
import {
  ReportFormat,
  ReportExecutionStatus,
  ReportScopeType,
  ReportDateMode,
  ReportFilterFieldType,
  ReportFilterUiComponent,
  type RunReportRequest,
  type ReportExecutionSchema,
  type ReportFilterField,
  type ReportFilterPreset,
} from "@/api/types";
import { downloadReportFile } from "@/api/reports";
import { printHtmlAsPdf } from "@/utils/reportPrint";
import DOMPurify from "dompurify";
import toast from "react-hot-toast";

const SELECT_CLASSNAME =
  "w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary";
const SELECT_OPTION_CLASSNAME = "bg-surface text-foreground";

function normalizeParamId(value: string | null): string {
  if (!value || value === "undefined" || value === "null") {
    return "";
  }
  return value;
}

function normalizeExecutionStatus(status: ReportExecutionStatus | string | number) {
  if (typeof status === "number") return status;
  const normalized = String(status).toLowerCase();
  if (normalized === "pending") return ReportExecutionStatus.Pending;
  if (normalized === "running" || normalized === "processing") {
    return ReportExecutionStatus.Running;
  }
  if (normalized === "completed") return ReportExecutionStatus.Completed;
  if (normalized === "failed") return ReportExecutionStatus.Failed;
  return undefined;
}

// Converte qualquer representação de data/datetime para ISO UTC,
// interpretando YYYY-MM-DD no fuso local do navegador (início ou fim do dia).
function normalizeDateFilterValue(value: unknown, fieldName?: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Formato de só data (YYYY-MM-DD) → início ou fim do dia no fuso local
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    const localDate = fieldName === "to"
      ? new Date(year, month, day, 23, 59, 59, 999)
      : new Date(year, month, day, 0, 0, 0, 0);
    if (Number.isNaN(localDate.getTime())) return undefined;
    return localDate.toISOString();
  }

  // datetime-local sem segundos (YYYY-MM-DDTHH:mm)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}:00`);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }

  // datetime com segundos ou ISO completo
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

const FORMAT_LABELS: Record<ReportFormat, string> = {
  [ReportFormat.Xlsx]: "Excel (.xlsx)",
  [ReportFormat.Csv]: "CSV (.csv)",
  [ReportFormat.Markdown]: "Markdown (.md)",
};

/**
 * Fallback de schema quando a API nao devolve executionSchema. O DTO de
 * template nao inclui esse campo, e o handler de execucao acessava
 * template.data.executionSchema.filters direto — TypeError ao rodar um
 * relatorio sem filtros avancados.
 */
const EMPTY_EXECUTION_SCHEMA = {
  scopeType: ReportScopeType.Global,
  dateMode: ReportDateMode.None,
  filters: [] as ReportExecutionSchema["filters"],
  allowedOrientations: ["portrait"],
  defaultOrientation: "portrait",
  allowedSortFields: [] as string[],
  defaultSortField: "",
  allowedSortDirections: ["asc", "desc"],
  defaultSortDirection: "asc",
  sampleFilterPresets: [],
};

const STATUS_CONFIG = {
  [ReportExecutionStatus.Pending]: {
    label: "Pendente",
    color: "slate" as const,
    icon: "schedule",
  },
  [ReportExecutionStatus.Running]: {
    label: "Processando",
    color: "primary" as const,
    icon: "schedule",
  },
  [ReportExecutionStatus.Completed]: {
    label: "Concluído",
    color: "success" as const,
    icon: "check_circle",
  },
  [ReportExecutionStatus.Failed]: {
    label: "Falhou",
    color: "danger" as const,
    icon: "cancel",
  },
};

export default function RunReport() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const templateId = searchParams.get("templateId") || "";
  const clientIdParam = normalizeParamId(searchParams.get("clientId"));

  const [format, setFormat] = useState<ReportFormat | null>(null);
  const [orientation, setOrientation] = useState<string>("");
  const [orderBy, setOrderBy] = useState<string>("");
  const [orderDirection, setOrderDirection] = useState<string>("");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [filtersJson, setFiltersJson] = useState("");
  const [dynamicFilters, setDynamicFilters] = useState<Record<string, any>>({});
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [autoDownload, setAutoDownload] = useState(true);
  const [lastAutoDownloadedExecutionId, setLastAutoDownloadedExecutionId] =
    useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Rastrear se o preset padrão já foi aplicado
  const presetAppliedRef = useRef(false);
  // Presets enriquecidos (com from/to) vindos do executionSchemaJson
  const [enrichedPresets, setEnrichedPresets] = useState<ReportFilterPreset[]>([]);

  const template = useReportTemplate(templateId, clientIdParam);
  const datasets = useReportDatasets();
  const previewMutation = useReportPreview();
  const runMutation = useRunReport();
  const execution = useReportExecution(executionId || "", clientIdParam);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewRowCount, setPreviewRowCount] = useState<number | null>(null);

  const clients = useClients(false);
  const sites = useSites(dynamicFilters.clientId || "", false);
  const agents = useAgentsBySite(dynamicFilters.siteId || "");

  // Auto-download quando completar
  useEffect(() => {
    if (!executionId || !execution.data || !autoDownload || isDownloading) return;

    const normalizedStatus = normalizeExecutionStatus(
      execution.data.status as ReportExecutionStatus | string | number,
    );

    if (
      normalizedStatus === ReportExecutionStatus.Completed &&
      lastAutoDownloadedExecutionId !== executionId
    ) {
      setIsDownloading(true);
      downloadReportFile(
        executionId,
        undefined,
        dynamicFilters.clientId || clientIdParam || undefined,
      )
        .then(() => {
          setLastAutoDownloadedExecutionId(executionId);
          toast.success("Relatório pronto! Download iniciado automaticamente.");
        })
        .catch((error) => {
          toast.error(
            `Erro ao fazer download: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
          );
        })
        .finally(() => {
          setIsDownloading(false);
        });
    }
  }, [
    autoDownload,
    clientIdParam,
    execution.data,
    executionId,
    lastAutoDownloadedExecutionId,
    dynamicFilters.clientId,
    isDownloading,
  ]);

  // Resetar estado quando o template mudar
  useEffect(() => {
    presetAppliedRef.current = false;
    setFormat(null);
    setOrientation("");
    setOrderBy("");
    setOrderDirection("");
    setDynamicFilters(clientIdParam ? { clientId: clientIdParam } : {});
    setEnrichedPresets([]);
    setExecutionId(null);
    setLastAutoDownloadedExecutionId(null);
    setPreviewHtml(null);
    setPreviewRowCount(null);
  }, [templateId, clientIdParam]);

  // Inicializar orientação, orderBy, orderDirection e presets quando o template carrega
  useEffect(() => {
    if (!template.data?.executionSchema) return;

    const schema = template.data.executionSchema;

    if (!orientation && schema.allowedOrientations?.length > 0) {
      setOrientation(schema.allowedOrientations[0]);
    }
    if (!orderBy && schema.allowedSortFields?.length > 0) {
      setOrderBy(schema.allowedSortFields[0]);
    }
    if (!orderDirection && schema.allowedSortDirections?.length > 0) {
      setOrderDirection(schema.allowedSortDirections[0]);
    }

    // Tentar obter presets completos do executionSchemaJson (campo raw)
    let richPresets: ReportFilterPreset[] | undefined;
    const rawJson = (template.data as any).executionSchemaJson;
    if (rawJson) {
      try {
        const parsed = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
        if (Array.isArray(parsed?.sampleFilterPresets)) {
          richPresets = parsed.sampleFilterPresets;
        }
      } catch {
        // fallback para os presets do schema
      }
    }

    const presets = richPresets ?? schema.sampleFilterPresets;
    if (presets && presets.length > 0) {
      setEnrichedPresets(presets);
    }

    const hasRequiredFields = schema.filters.some((f) => f.required);
    if (!hasRequiredFields || presetAppliedRef.current) return;
    if (!presets || presets.length === 0) return;

    const firstPreset = presets[0] as any;
    let filterValues: Record<string, any> = {};
    let presetOrderBy: string | undefined;
    let presetOrderDir: string | undefined;

    if (typeof firstPreset?.filtersJson === "string") {
      try {
        const parsedFilters = JSON.parse(firstPreset.filtersJson);
        filterValues = parsedFilters ?? {};
        presetOrderBy = parsedFilters?.orderBy;
        presetOrderDir = parsedFilters?.orderDirection;
      } catch {
        filterValues = {};
      }
    } else {
      const { name: _name, orderBy, orderDirection, ...legacyValues } = firstPreset;
      void _name;
      presetOrderBy = orderBy;
      presetOrderDir = orderDirection;
      filterValues = legacyValues;
    }

    // Aplicar orderBy/orderDirection do preset se disponíveis
    if (presetOrderBy) setOrderBy(presetOrderBy);
    if (presetOrderDir) setOrderDirection(presetOrderDir);

    // Normalizar datas do preset para formato de data (YYYY-MM-DD) para uso nos inputs type="date"
    const normalizedFilters: Record<string, any> = {};
    for (const [key, val] of Object.entries(filterValues)) {
      if (val === undefined || val === null) continue;
      const filterDef = schema.filters.find((f) => f.name === key);
      if (
        (filterDef?.type === ReportFilterFieldType.DateTime ||
          filterDef?.type === ReportFilterFieldType.Date) &&
        typeof val === "string"
      ) {
        normalizedFilters[key] = isoToDateInput(val);
      } else {
        normalizedFilters[key] = val;
      }
    }

    if (Object.keys(normalizedFilters).length > 0) {
      setDynamicFilters(normalizedFilters);
    }
    presetAppliedRef.current = true;
  }, [template.data?.id]);


  const applyPreset = (preset: ReportFilterPreset) => {
    const presetData = preset as any;
    let filterValues: Record<string, any> = {};
    let presetOrderBy: string | undefined;
    let presetOrderDir: string | undefined;

    if (typeof presetData?.filtersJson === "string") {
      try {
        const parsedFilters = JSON.parse(presetData.filtersJson);
        filterValues = parsedFilters ?? {};
        presetOrderBy = parsedFilters?.orderBy;
        presetOrderDir = parsedFilters?.orderDirection;
      } catch {
        toast.error("Preset inválido");
        return;
      }
    } else {
      const { name: _name, orderBy, orderDirection, ...legacyValues } = presetData;
      void _name;
      presetOrderBy = orderBy;
      presetOrderDir = orderDirection;
      filterValues = legacyValues;
    }

    if (presetOrderBy) setOrderBy(presetOrderBy);
    if (presetOrderDir) setOrderDirection(presetOrderDir);

    // Normalizar datas para YYYY-MM-DD (tipo date input)
    const normalized: Record<string, any> = {};
    for (const [key, val] of Object.entries(filterValues)) {
      if (val === undefined || val === null) continue;
      const filterDef = (template.data?.executionSchema ?? EMPTY_EXECUTION_SCHEMA).filters.find((f) => f.name === key);
      if (
        (filterDef?.type === ReportFilterFieldType.DateTime ||
          filterDef?.type === ReportFilterFieldType.Date) &&
        typeof val === "string"
      ) {
        normalized[key] = isoToDateInput(val);
      } else {
        normalized[key] = val;
      }
    }
    setDynamicFilters(normalized);
    toast.success(`Preset "${preset.name}" aplicado`);
  };

  // Converte qualquer valor armazenado (ISO ou date-only) para YYYY-MM-DD (usado no input type="date")
  const isoToDateInput = (value: string): string => {
    if (!value) return "";
    // Já é YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    // ISO com Z ou timezone → extrair a parte da data em UTC
    if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) {
      const d = new Date(value);
      if (isNaN(d.getTime())) return "";
      // Usar getUTC* para não distorcer por fuso
      const yr = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dy = String(d.getUTCDate()).padStart(2, "0");
      return `${yr}-${mo}-${dy}`;
    }
    // Datetime local sem timezone (YYYY-MM-DDTHH:mm...) → pegar só a parte da data
    const datePart = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
    return "";
  };

  const handleDynamicFilterChange = (filterName: string, value: any) => {
    const normalizedValue =
      value === undefined || value === null || value === "" ? undefined : value;

    setDynamicFilters((prev) => {
      const next: Record<string, any> = {
        ...prev,
        [filterName]: normalizedValue,
      };
      if (filterName === "clientId") {
        delete next.siteId;
        delete next.agentId;
      } else if (filterName === "siteId") {
        delete next.agentId;
      }
      return next;
    });
  };

  const applyQuickDateRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setDynamicFilters((prev) => ({
      ...prev,
      from: fmt(start),
      to: fmt(end),
    }));
  };

  const buildEffectiveFilters = (effectiveFilterDefs: ReportFilterField[]): Record<string, any> | null => {
    if (advancedMode) {
      try {
        const parsed = filtersJson.trim() ? JSON.parse(filtersJson) : {};
        if (orderBy) parsed.orderBy = orderBy;
        if (orderDirection) parsed.orderDirection = orderDirection;
        if (orientation) parsed.orientation = orientation;
        return parsed;
      } catch {
        toast.error("JSON de filtros inválido");
        return null;
      }
    }

    const filters = Object.fromEntries(
      Object.entries(dynamicFilters).filter(
        ([_, v]) => v !== undefined && v !== null && v !== "",
      ),
    );

    for (const filterDef of effectiveFilterDefs) {
      if (
        filterDef.type !== ReportFilterFieldType.DateTime &&
        filterDef.type !== ReportFilterFieldType.Date
      ) {
        continue;
      }
      const normalizedDate = normalizeDateFilterValue(filters[filterDef.name], filterDef.name);
      if (normalizedDate !== undefined) {
        filters[filterDef.name] = normalizedDate;
      } else {
        delete filters[filterDef.name];
      }
    }

    if (orderBy) filters.orderBy = orderBy;
    if (orderDirection) filters.orderDirection = orderDirection;
    if (orientation) filters.orientation = orientation;
    return filters;
  };

  const effectiveFilterDefs = useMemo<ReportFilterField[]>(() => {
    const schemaFilters = template.data?.executionSchema?.filters;
    if (schemaFilters && schemaFilters.length > 0) return schemaFilters;

    const dsItem = datasets.data?.find(
      (d) =>
        String(d.datasetType) === String(template.data?.datasetType) ||
        d.key?.toLowerCase() === String(template.data?.datasetType ?? "").toLowerCase(),
    );
    const derived: ReportFilterField[] = [
      {
        name: "clientId",
        label: "Cliente",
        type: ReportFilterFieldType.Guid,
        uiComponent: ReportFilterUiComponent.GuidInput,
        group: "scope",
        required: false,
      },
      {
        name: "siteId",
        label: "Site",
        type: ReportFilterFieldType.Guid,
        uiComponent: ReportFilterUiComponent.GuidInput,
        group: "scope",
        required: false,
      },
      {
        name: "agentId",
        label: "Agente",
        type: ReportFilterFieldType.Guid,
        uiComponent: ReportFilterUiComponent.GuidInput,
        group: "scope",
        required: false,
      },
    ];

    for (const f of dsItem?.filters ?? []) {
      if (derived.some((d) => d.name.toLowerCase() === f.name.toLowerCase())) continue;
      const lowerType = f.type.toLowerCase();
      const fieldType =
        lowerType.includes("date")
          ? ReportFilterFieldType.DateTime
          : lowerType.includes("bool")
            ? ReportFilterFieldType.Boolean
            : lowerType.includes("int") || lowerType.includes("number")
              ? ReportFilterFieldType.Integer
              : ReportFilterFieldType.Text;
      derived.push({
        name: f.name,
        label: f.label || f.name,
        type: fieldType,
        uiComponent:
          fieldType === ReportFilterFieldType.DateTime
            ? ReportFilterUiComponent.DateTimePicker
            : fieldType === ReportFilterFieldType.Boolean
              ? ReportFilterUiComponent.Toggle
              : fieldType === ReportFilterFieldType.Integer
                ? ReportFilterUiComponent.NumberInput
                : ReportFilterUiComponent.TextInput,
        group: "filters",
        required: Boolean(f.required),
      });
    }
    return derived;
  }, [template.data?.executionSchema?.filters, template.data?.datasetType, datasets.data]);

  const handlePreviewHtml = () => {
    if (!template.data) return;
    const filters = buildEffectiveFilters(effectiveFilterDefs);
    if (!filters) return;

    const effectiveClient = (filters.clientId as string | undefined) || clientIdParam || undefined;
    const effectiveSite = (filters.siteId as string | undefined) || undefined;

    previewMutation.mutate(
      {
        templateId,
        previewMode: "html",
        clientId: effectiveClient,
        siteId: effectiveSite,
        filtersJson: Object.keys(filters).length > 0 ? JSON.stringify(filters) : undefined,
      },
      {
        onSuccess: (res) => {
          if (res.html) {
            setPreviewHtml(res.html);
            setPreviewRowCount(res.headers.rowCount ?? null);
          } else {
            toast.error("Preview HTML vazio retornado pelo servidor.");
          }
        },
        onError: (error: unknown) => {
          const msg = error instanceof Error && error.message ? error.message : "Erro ao gerar preview";
          toast.error(msg);
        },
      },
    );
  };

  const handleRun = () => {
    if (!template.data) return;

    const filters = buildEffectiveFilters(effectiveFilterDefs);
    if (!filters) return;

    // Validar campos obrigatórios
    const schema = template.data.executionSchema ?? EMPTY_EXECUTION_SCHEMA;
    const requiredFields = (schema.filters ?? []).filter((f) => f.required);
    const missingFields = requiredFields.filter(f => {
      const fieldValue = filters[f.name];
      // Campo está faltando se for undefined, null ou string vazia (false é válido)
      return fieldValue === undefined || fieldValue === null || fieldValue === "";
    });
    
    if (missingFields.length > 0) {
      toast.error(`Campos obrigatórios faltando: ${missingFields.map(f => f.label).join(", ")}`);
      return;
    }

    // RunReportNowCommand.Format e int nao-nulo: enviar undefined fazia o
    // backend assumir 0 (Xlsx) e ignorar o formato padrao do template.
    const templateDefaultFormat = template.data?.defaultFormat;
    const resolvedFormat =
      format ??
      (typeof templateDefaultFormat === "number"
        ? templateDefaultFormat
        : templateDefaultFormat === "Csv" || templateDefaultFormat === "csv"
          ? 2
          : templateDefaultFormat === "Markdown" || templateDefaultFormat === "markdown"
            ? 3
            : 0);

    const effectiveClient = (filters.clientId as string | undefined) || clientIdParam || undefined;
    const effectiveSite = (filters.siteId as string | undefined) || undefined;

    const request: RunReportRequest = {
      templateId,
      format: resolvedFormat,
      clientId: effectiveClient,
      siteId: effectiveSite,
      filtersJson:
        Object.keys(filters).length > 0 ? JSON.stringify(filters) : undefined,
    };

    runMutation.mutate(request, {
      onSuccess: (response) => {
        setExecutionId(response.executionId);
        setLastAutoDownloadedExecutionId(null);
        toast.success("Relatório enfileirado para processamento.");
      },
      onError: (error: unknown) => {
        // O cliente HTTP lanca ApiError (Error com .message) — nao existe
        // error.response.data, entao a mensagem do backend era sempre descartada.
        const errorMsg =
          error instanceof Error && error.message
            ? error.message
            : "Erro ao executar relatório";
        toast.error(errorMsg);
      },
    });
  };

  const renderFilterInput = (filter: ReportFilterField) => {
    const value = dynamicFilters[filter.name] ?? "";
    // Para campos DateTime, converter ISO de volta para formato datetime-local para exibição
    const displayValue =
      (filter.type === ReportFilterFieldType.DateTime ||
        filter.type === ReportFilterFieldType.Date) &&
      value
      ? isoToDateInput(value)
      : value;

    switch (filter.type) {
      case ReportFilterFieldType.DateTime:
      case ReportFilterFieldType.Date:
        return (
          <div key={filter.name}>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              {filter.label}
              {filter.required && <span className="text-danger ml-1">*</span>}
            </label>
            <Input
              type="date"
              value={displayValue}
              onChange={(e) => handleDynamicFilterChange(filter.name, e.target.value)}
              className="w-full"
            />
            {filter.description && (
              <p className="mt-1 text-xs text-muted">{filter.description}</p>
            )}
            {filter.name === "to" && (
              <p className="mt-1 text-xs text-muted">A data final será considerada até 23:59:59</p>
            )}
          </div>
        );

      case ReportFilterFieldType.Guid:
        // Casos especiais para selects dropdown
        if (filter.name === "clientId") {
          return (
            <div key={filter.name}>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                {filter.label}
                {filter.required && <span className="text-danger ml-1">*</span>}
              </label>
              <select
                value={value}
                onChange={(e) => handleDynamicFilterChange(filter.name, e.target.value)}
                className={SELECT_CLASSNAME}
                aria-label={filter.label}
              >
                <option className={SELECT_OPTION_CLASSNAME} value="">
                  {filter.required ? "Selecione..." : "Todos"}
                </option>
                {clients.data?.map((client) => (
                  <option className={SELECT_OPTION_CLASSNAME} key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              {filter.description && (
                <p className="mt-1 text-xs text-muted">{filter.description}</p>
              )}
            </div>
          );
        }
        
        if (filter.name === "siteId") {
          return (
            <div key={filter.name}>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                {filter.label}
                {filter.required && <span className="text-danger ml-1">*</span>}
              </label>
              <select
                value={value}
                onChange={(e) => handleDynamicFilterChange(filter.name, e.target.value)}
                disabled={!dynamicFilters.clientId}
                className={`${SELECT_CLASSNAME} disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label={filter.label}
              >
                <option className={SELECT_OPTION_CLASSNAME} value="">
                  {filter.required ? "Selecione..." : "Todos"}
                </option>
                {sites.data?.map((site) => (
                  <option className={SELECT_OPTION_CLASSNAME} key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
              {!dynamicFilters.clientId && (
                <p className="mt-1 text-xs text-muted">Selecione um cliente primeiro</p>
              )}
              {filter.description && (
                <p className="mt-1 text-xs text-muted">{filter.description}</p>
              )}
            </div>
          );
        }
        
        if (filter.name === "agentId") {
          return (
            <div key={filter.name}>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                {filter.label}
                {filter.required && <span className="text-danger ml-1">*</span>}
              </label>
              <select
                value={value}
                onChange={(e) => handleDynamicFilterChange(filter.name, e.target.value)}
                disabled={!dynamicFilters.siteId}
                className={`${SELECT_CLASSNAME} disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label={filter.label}
              >
                <option className={SELECT_OPTION_CLASSNAME} value="">
                  {filter.required ? "Selecione..." : "Todos"}
                </option>
                {agents.data?.map((agent) => (
                  <option className={SELECT_OPTION_CLASSNAME} key={agent.id} value={agent.id}>
                    {agent.hostname}
                  </option>
                ))}
              </select>
              {!dynamicFilters.siteId && (
                <p className="mt-1 text-xs text-muted">Selecione um site primeiro</p>
              )}
              {filter.description && (
                <p className="mt-1 text-xs text-muted">{filter.description}</p>
              )}
            </div>
          );
        }

        // Campo GUID genérico
        return (
          <div key={filter.name}>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              {filter.label}
              {filter.required && <span className="text-danger ml-1">*</span>}
            </label>
            <Input
              type="text"
              value={value}
              onChange={(e) => handleDynamicFilterChange(filter.name, e.target.value)}
              placeholder={filter.placeholder || "Informe um GUID"}
              className="w-full"
            />
            {filter.description && (
              <p className="mt-1 text-xs text-muted">{filter.description}</p>
            )}
          </div>
        );

      case ReportFilterFieldType.Integer:
      case ReportFilterFieldType.Decimal:
        return (
          <div key={filter.name}>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              {filter.label}
              {filter.required && <span className="text-danger ml-1">*</span>}
            </label>
            <Input
              type="number"
              value={value}
              onChange={(e) => handleDynamicFilterChange(filter.name, e.target.value)}
              className="w-full"
            />
            {filter.description && (
              <p className="mt-1 text-xs text-muted">{filter.description}</p>
            )}
          </div>
        );

      case ReportFilterFieldType.Enum:
        if (filter.allowedValues && filter.allowedValues.length > 0) {
          return (
            <div key={filter.name}>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                {filter.label}
                {filter.required && <span className="text-danger ml-1">*</span>}
              </label>
              <select
                value={value}
                onChange={(e) => handleDynamicFilterChange(filter.name, e.target.value)}
                className={SELECT_CLASSNAME}
                aria-label={filter.label}
              >
                <option className={SELECT_OPTION_CLASSNAME} value="">
                  {filter.required ? "Selecione..." : "Todos"}
                </option>
                {filter.allowedValues.map((option) => (
                  <option className={SELECT_OPTION_CLASSNAME} key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {filter.description && (
                <p className="mt-1 text-xs text-muted">{filter.description}</p>
              )}
            </div>
          );
        }
        return (
          <div key={filter.name}>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              {filter.label}
              {filter.required && <span className="text-danger ml-1">*</span>}
            </label>
            <Input
              type="text"
              value={value}
              onChange={(e) => handleDynamicFilterChange(filter.name, e.target.value)}
              className="w-full"
            />
            {filter.description && (
              <p className="mt-1 text-xs text-muted">{filter.description}</p>
            )}
          </div>
        );

      case ReportFilterFieldType.Text:
      case ReportFilterFieldType.TextExact:
        return (
          <div key={filter.name}>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              {filter.label}
              {filter.required && <span className="text-danger ml-1">*</span>}
            </label>
            <Input
              type="text"
              value={value}
              onChange={(e) => handleDynamicFilterChange(filter.name, e.target.value)}
              className="w-full"
            />
            {filter.description && (
              <p className="mt-1 text-xs text-muted">{filter.description}</p>
            )}
          </div>
        );

      case ReportFilterFieldType.Boolean:
        return (
          <div key={filter.name}>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={value === true || value === "true"}
                onChange={(e) => handleDynamicFilterChange(filter.name, e.target.checked)}
                className="rounded border-border bg-surface-light"
              />
              {filter.label}
              {filter.required && <span className="text-danger ml-1">*</span>}
            </label>
            {filter.description && (
              <p className="mt-1 text-xs text-muted">{filter.description}</p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  if (template.isLoading) return <Loading />;
  if (!template.data) {
    return (
      <div className="space-y-6">
        <Card>
          <p className="text-center text-muted">Template não encontrado</p>
        </Card>
      </div>
    );
  }

  const schema = template.data.executionSchema ?? EMPTY_EXECUTION_SCHEMA;
  
  const selectedFormat = format ?? template.data.defaultFormat;
  const executionStatus = normalizeExecutionStatus(
    execution.data?.status as ReportExecutionStatus | string | number,
  );
  const executionStatusConfig =
    executionStatus !== undefined
      ? STATUS_CONFIG[executionStatus as keyof typeof STATUS_CONFIG]
      : undefined;
  const isProcessing =
    executionStatus === ReportExecutionStatus.Pending ||
    executionStatus === ReportExecutionStatus.Running;

  return (
    <div className="space-y-6">
      <PageHeader title="Executar Relatório" description={template.data.name}>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </PageHeader>

      {/* Instruções */}
      {template.data.instructions && (
        <Card className="border-l-4 border-l-primary">
          <div className="flex gap-3">
            <Icon name="info" className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Instruções</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {template.data.instructions}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Configurações
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdvancedMode(!advancedMode)}
            >
              {advancedMode ? (
                <>
                  <Icon name="lightbulb" className="h-4 w-4" />
                  Modo Guiado
                </>
              ) : (
                <>
                  <Icon name="code" className="h-4 w-4" />
                  Modo JSON
                </>
              )}
            </Button>
          </div>

          <div className="space-y-4">
            {/* Formato */}
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Formato de Saída
              </label>
              <select
                value={selectedFormat}
                onChange={(e) => setFormat(Number(e.target.value) as ReportFormat)}
                className={SELECT_CLASSNAME}
                aria-label="Formato de saída"
              >
                <option className={SELECT_OPTION_CLASSNAME} value={ReportFormat.Xlsx}>
                  {FORMAT_LABELS[ReportFormat.Xlsx]}
                </option>
                <option className={SELECT_OPTION_CLASSNAME} value={ReportFormat.Csv}>
                  {FORMAT_LABELS[ReportFormat.Csv]}
                </option>
                <option className={SELECT_OPTION_CLASSNAME} value={ReportFormat.Markdown}>
                  {FORMAT_LABELS[ReportFormat.Markdown]}
                </option>
              </select>
            </div>

            {/* Orientation */}
            {schema.allowedOrientations && schema.allowedOrientations.length > 1 && (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">
                  Orientação
                </label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value)}
                  className={SELECT_CLASSNAME}
                  aria-label="Orientação do relatório"
                >
                  {schema.allowedOrientations.map(o => (
                    <option className={SELECT_OPTION_CLASSNAME} key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Order By */}
            {schema.allowedSortFields && schema.allowedSortFields.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Ordenar Por
                  </label>
                  <select
                    value={orderBy}
                    onChange={(e) => setOrderBy(e.target.value)}
                    className={SELECT_CLASSNAME}
                    aria-label="Campo de ordenação"
                  >
                    {schema.allowedSortFields.map(field => (
                      <option className={SELECT_OPTION_CLASSNAME} key={field} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Direção
                  </label>
                  <select
                    value={orderDirection}
                    onChange={(e) => setOrderDirection(e.target.value)}
                    className={SELECT_CLASSNAME}
                    aria-label="Direção da ordenação"
                  >
                    {schema.allowedSortDirections.map(dir => (
                      <option className={SELECT_OPTION_CLASSNAME} key={dir} value={dir}>
                        {dir}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Auto-download */}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={autoDownload}
                onChange={(e) => setAutoDownload(e.target.checked)}
                className="rounded border-border bg-surface-light"
              />
              Baixar automaticamente quando concluir
            </label>

            <hr className="border-border" />

            {/* Presets (se disponíveis) */}
            {!advancedMode && enrichedPresets.length > 0 && (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">
                  Presets Rápidos
                </label>
                <div className="flex flex-wrap gap-2">
                  {enrichedPresets.map((preset, idx) => (
                    <Button
                      key={idx}
                      variant="secondary"
                      size="sm"
                      onClick={() => applyPreset(preset)}
                    >
                      <Icon name="lightbulb" className="h-3 w-3" />
                      {(preset as any).name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Filtros Dinâmicos */}
            {advancedMode ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">
                  Filtros (JSON)
                </label>
                <textarea
                  value={filtersJson}
                  onChange={(e) => setFiltersJson(e.target.value)}
                  placeholder='{"clientId": "1", "from": "2026-01-01T00:00:00", "to": "2026-03-07T23:59:59"}'
                  className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 font-mono text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                  rows={10}
                />
                <p className="mt-1 text-xs text-muted">
                  Edite o JSON diretamente. Campos disponíveis: {schema.filters.map(f => f.name).join(", ")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {effectiveFilterDefs.some((f) => f.name === "from" || f.name === "to") && (
                  <div className="flex flex-wrap items-center gap-2 pb-1">
                    <span className="text-xs text-muted">Período rápido:</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => applyQuickDateRange(0)}>
                      Hoje
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => applyQuickDateRange(7)}>
                      Últimos 7 dias
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => applyQuickDateRange(30)}>
                      Últimos 30 dias
                    </Button>
                  </div>
                )}
                {effectiveFilterDefs.map((filter) => renderFilterInput(filter))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={handleRun}
                disabled={runMutation.isPending || isProcessing}
                className="flex-1"
              >
                <Icon name="play_arrow" className="h-4 w-4" />
                {runMutation.isPending ? "Enfileirando..." : isProcessing ? "Processando..." : "Executar Relatório"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handlePreviewHtml}
                disabled={previewMutation.isPending}
              >
                <Icon name="visibility" className="h-4 w-4" />
                {previewMutation.isPending ? "Gerando Preview..." : "Visualizar / PDF"}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Status da Execução</h2>
          {runMutation.isPending ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted">
              <Loading />
              <span>Enfileirando relatório...</span>
            </div>
          ) : !executionId ? (
            <p className="text-center text-muted py-6">
              Nenhuma execução iniciada. Use <strong>Executar Relatório</strong> para gerar o arquivo ou <strong>Visualizar / PDF</strong> para abrir o preview imediato.
            </p>
          ) : execution.isLoading ? (
            <Loading />
          ) : execution.data ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Status:</span>
                <Badge color={executionStatusConfig?.color ?? "slate"}>
                  {executionStatusConfig?.label ?? "Desconhecido"}
                </Badge>
              </div>

              {execution.data.rowCount != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Linhas:</span>
                  <span className="text-foreground">
                    {execution.data.rowCount.toLocaleString()}
                  </span>
                </div>
              )}

              {execution.data.resultSizeBytes != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Tamanho:</span>
                  <span className="text-foreground">
                    {(execution.data.resultSizeBytes / 1024 / 1024).toFixed(2)}{" "}
                    MB
                  </span>
                </div>
              )}

              {execution.data.executionTimeMs != null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Tempo:</span>
                  <span className="text-foreground">
                    {(execution.data.executionTimeMs / 1000).toFixed(2)}s
                  </span>
                </div>
              )}

              {execution.data.errorMessage && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <p className="text-sm text-danger">
                    {execution.data.errorMessage}
                  </p>
                </div>
              )}

              {executionStatus === ReportExecutionStatus.Completed && (
                <Button
                  className="w-full"
                  disabled={isDownloading}
                  onClick={async () => {
                    setIsDownloading(true);
                    try {
                      await downloadReportFile(
                        executionId,
                        undefined,
                        dynamicFilters.clientId || clientIdParam || undefined,
                      );
                      toast.success("Download iniciado!");
                    } catch (error) {
                      toast.error(
                        `Erro ao fazer download: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
                      );
                    } finally {
                      setIsDownloading(false);
                    }
                  }}
                >
                  <Icon name="download" className="h-4 w-4" />
                  {isDownloading ? "Baixando..." : "Baixar Relatório"}
                </Button>
              )}
            </div>
          ) : null}
        </Card>
      </div>

      {previewHtml && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-foreground">Preview do Relatório</h3>
              {previewRowCount != null && (
                <p className="text-xs text-muted">{previewRowCount.toLocaleString()} registros exibidos no preview</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => printHtmlAsPdf(previewHtml, template.data?.name || "Relatorio")}
              >
                <Icon name="print" className="h-4 w-4" />
                Imprimir / Salvar PDF
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreviewHtml(null)}
              >
                Fechar
              </Button>
            </div>
          </div>
          <iframe
            title="Preview HTML do relatório"
            className="h-[540px] w-full rounded-lg border border-border bg-white"
            sandbox=""
            srcDoc={DOMPurify.sanitize(previewHtml, { WHOLE_DOCUMENT: /<html[\s>]/i.test(previewHtml), ADD_TAGS: ["style"], FORBID_TAGS: ["script", "iframe", "object", "embed", "form"] })}
          />
        </Card>
      )}

      {template.data.description && (
        <Card>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Descrição</h3>
          <p className="text-sm text-muted">{template.data.description}</p>
        </Card>
      )}
    </div>
  );
}
