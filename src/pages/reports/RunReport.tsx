import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Play, Download, Clock, CheckCircle, XCircle, Code2, Lightbulb, Info } from "lucide-react";
import {
  useReportTemplate,
  useRunReport,
  useReportExecution,
  useClients,
  useSites,
  useAgentsBySite,
} from "@/hooks";
import { Button, Card, Loading, Badge, Input } from "@/components/ui";
import {
  ReportFormat,
  ReportExecutionStatus,
  ReportScopeType,
  ReportDateMode,
  ReportFilterFieldType,
  type RunReportRequest,
  type ReportFilterField,
  type ReportFilterPreset,
} from "@/api/types";
import { downloadReportFile } from "@/api/reports";
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

// Converte qualquer representação de data/datetime para ISO UTC.
// Para filtros "to", usa fim do dia (23:59:59Z) quando só data é fornecida.
function normalizeDateFilterValue(value: unknown, fieldName?: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Formato de só data (YYYY-MM-DD) → adiciona horário de início ou fim do dia
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = fieldName === "to" ? "T23:59:59.000Z" : "T00:00:00.000Z";
    return `${trimmed}${suffix}`;
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
  [ReportFormat.Pdf]: "PDF (.pdf)",
  [ReportFormat.Markdown]: "Markdown (.md)",
};

const STATUS_CONFIG = {
  [ReportExecutionStatus.Pending]: {
    label: "Pendente",
    color: "slate" as const,
    icon: Clock,
  },
  [ReportExecutionStatus.Running]: {
    label: "Processando",
    color: "primary" as const,
    icon: Clock,
  },
  [ReportExecutionStatus.Completed]: {
    label: "Concluído",
    color: "success" as const,
    icon: CheckCircle,
  },
  [ReportExecutionStatus.Failed]: {
    label: "Falhou",
    color: "danger" as const,
    icon: XCircle,
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
  const runMutation = useRunReport();
  const execution = useReportExecution(executionId || "", clientIdParam);

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

  // Resetar preset applied ref quando o template mudar
  useEffect(() => {
    presetAppliedRef.current = false;
  }, [templateId]);

  // Inicializar orientação, orderBy e orderDirection com valores padrão do schema
  // Presets são obtidos do executionSchemaJson (string raw) pois o backend perde campos
  // extras (from, to, etc.) na desserialização do executionSchema.sampleFilterPresets
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

    const hasRequiredFields = schema.filters.some((f) => f.required);
    if (!hasRequiredFields || presetAppliedRef.current) return;

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
  }, [template.data?.executionSchema?.scopeType]);


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
      const filterDef = template.data?.executionSchema.filters.find((f) => f.name === key);
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

    setDynamicFilters((prev) => ({
      ...prev,
      [filterName]: normalizedValue,
    }));
  };

  const handleRun = () => {
    if (!template.data) return;

    let filters: Record<string, any> = {};

    if (advancedMode) {
      try {
        filters = filtersJson.trim() ? JSON.parse(filtersJson) : {};
      } catch (e) {
        toast.error("JSON de filtros inválido");
        return;
      }
    } else {
      // Remove valores undefined/null/vazios (mas mantém 0, false, strings ISO)
      filters = Object.fromEntries(
        Object.entries(dynamicFilters).filter(([_, v]) => {
          return v !== undefined && v !== null && v !== "";
        })
      );

      for (const filterDef of template.data.executionSchema.filters) {
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
    }

    // Validar campos obrigatórios
    const schema = template.data.executionSchema;
    const requiredFields = schema.filters.filter((f) => f.required);
    const missingFields = requiredFields.filter(f => {
      const fieldValue = filters[f.name];
      // Campo está faltando se for undefined, null ou string vazia (false é válido)
      return fieldValue === undefined || fieldValue === null || fieldValue === "";
    });
    
    if (missingFields.length > 0) {
      toast.error(`Campos obrigatórios faltando: ${missingFields.map(f => f.label).join(", ")}`);
      return;
    }

    if (orderBy) {
      filters.orderBy = orderBy;
    }
    if (orderDirection) {
      filters.orderDirection = orderDirection;
    }
    if (orientation) {
      filters.orientation = orientation;
    }

    const request: RunReportRequest = {
      templateId,
      format: format ?? undefined,
      filtersJson:
        Object.keys(filters).length > 0 ? JSON.stringify(filters) : undefined,
      createdBy: "user@example.com",
      runAsync: true,
    };

    runMutation.mutate(request, {
      onSuccess: (response) => {
        setExecutionId(response.executionId);
        setLastAutoDownloadedExecutionId(null);
        toast.success("Relatório em processamento...");
      },
      onError: (error: any) => {
        const errorMsg = error?.response?.data?.errors?.join(", ") || "Erro ao executar relatório";
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
              {filter.required && <span className="text-red-400 ml-1">*</span>}
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
                {filter.required && <span className="text-red-400 ml-1">*</span>}
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
                {filter.required && <span className="text-red-400 ml-1">*</span>}
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
                {filter.required && <span className="text-red-400 ml-1">*</span>}
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
              {filter.required && <span className="text-red-400 ml-1">*</span>}
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
              {filter.required && <span className="text-red-400 ml-1">*</span>}
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
                {filter.required && <span className="text-red-400 ml-1">*</span>}
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
              {filter.required && <span className="text-red-400 ml-1">*</span>}
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
              {filter.required && <span className="text-red-400 ml-1">*</span>}
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
              {filter.required && <span className="text-red-400 ml-1">*</span>}
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

  const schema = template.data.executionSchema || {
    scopeType: ReportScopeType.Global,
    dateMode: ReportDateMode.None,
    filters: [],
    allowedOrientations: ["portrait"],
    defaultOrientation: "portrait",
    allowedSortFields: [],
    defaultSortField: "",
    allowedSortDirections: ["asc", "desc"],
    defaultSortDirection: "asc",
    sampleFilterPresets: [],
  };
  
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Executar Relatório</h1>
          <p className="text-sm text-muted">{template.data.name}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>

      {/* Instruções */}
      {template.data.instructions && (
        <Card className="border-l-4 border-l-primary">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
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
                  <Lightbulb className="h-4 w-4" />
                  Modo Guiado
                </>
              ) : (
                <>
                  <Code2 className="h-4 w-4" />
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
                <option className={SELECT_OPTION_CLASSNAME} value={ReportFormat.Pdf}>
                  {FORMAT_LABELS[ReportFormat.Pdf]}
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
                      <Lightbulb className="h-3 w-3" />
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
                {schema.filters && schema.filters.length > 0 ? (
                  schema.filters.map(filter => renderFilterInput(filter))
                ) : (
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
                    <div className="flex gap-2 items-start">
                      <Info className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-500 mb-1">
                          Nenhum filtro configurado
                        </p>
                        <p className="text-xs text-yellow-500/80 mb-2">
                          Este template não possui filtros dinâmicos configurados. O relatório será executado com os dados completos do dataset.
                        </p>
                        <p className="text-xs text-yellow-500/80">
                          💡 Para adicionar filtros (datas, clientes, etc), edite o template e configure um <strong>Schema de Execução Customizado</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2">
              <Button
                onClick={handleRun}
                disabled={runMutation.isPending || isProcessing}
                className="w-full"
              >
                <Play className="h-4 w-4" />
                {runMutation.isPending ? "Executando..." : "Executar Relatório"}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Status da Execução</h2>
          {!executionId ? (
            <p className="text-center text-muted">
              Nenhuma execução iniciada
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
                  <p className="text-sm text-red-400">
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
                  <Download className="h-4 w-4" />
                  {isDownloading ? "Baixando..." : "Baixar Relatório"}
                </Button>
              )}
            </div>
          ) : null}
        </Card>
      </div>

      {template.data.description && (
        <Card>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Descrição</h3>
          <p className="text-sm text-muted">{template.data.description}</p>
        </Card>
      )}

      {/* Debug: Schema Info + Filter State */}
      {schema && (
        <Card className="border-slate-700">
          <details className="cursor-pointer">
            <summary className="text-sm font-medium text-muted hover:text-muted-foreground">
              🔧 Informações Técnicas do Schema
            </summary>
            <div className="mt-3 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-muted">Scope:</div>
                <div className="text-muted-foreground font-mono">{String(schema.scopeType)}</div>
                
                <div className="text-muted">Date Mode:</div>
                <div className="text-muted-foreground font-mono">{schema.dateMode || "N/A"}</div>
                
                <div className="text-muted">Filtros Disponíveis:</div>
                <div className="text-muted-foreground font-mono">{schema.filters?.length || 0}</div>
                
                <div className="text-muted">Orientações:</div>
                <div className="text-muted-foreground font-mono">{schema.allowedOrientations?.join(", ") || "N/A"}</div>
                
                <div className="text-muted">Campos Ordenáveis:</div>
                <div className="text-muted-foreground font-mono">{schema.allowedSortFields?.join(", ") || "N/A"}</div>
              </div>
              
              {schema.filters && schema.filters.length > 0 && (
                <div className="mt-3">
                  <div className="text-muted mb-2">Filtros Configurados:</div>
                  <div className="bg-surface/50 rounded p-2 space-y-1">
                    {schema.filters.map((f, idx) => (
                      <div key={idx} className="text-muted-foreground">
                        • <span className="text-primary">{f.name}</span>{" "}
                        <span className="text-muted">({f.type})</span>
                        {f.required && <span className="text-red-400 ml-1">*obrigatório</span>}
                        {f.label && <span className="text-muted"> - {f.label}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Estado dos Filtros Obrigatórios */}
              {schema.filters && schema.filters.some(f => f.required) && (
                <div className="mt-3 rounded border border-blue-500/20 bg-blue-500/10 p-2">
                  <div className="text-blue-400 text-xs font-semibold mb-2">📊 Estado dos Campos Obrigatórios:</div>
                  <div className="space-y-1">
                    {schema.filters.filter(f => f.required).map((f) => {
                      const value = dynamicFilters[f.name];
                      const hasValue = value !== undefined && value !== null && value !== "";
                      return (
                        <div key={f.name} className="flex items-center gap-2 text-xs">
                          <span className={hasValue ? "text-green-400" : "text-red-400"}>
                            {hasValue ? "✓" : "✗"}
                          </span>
                          <span className="text-muted-foreground font-mono">{f.name}</span>
                          <span className="text-muted">:</span>
                          <span className={hasValue ? "text-green-400" : "text-red-400"}>
                            {hasValue ? `"${String(value).slice(0, 30)}${String(value).length > 30 ? "..." : ""}"` : "vazio"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {(!schema.filters || schema.filters.length === 0) && (
                <div className="mt-3 rounded bg-yellow-500/10 border border-yellow-500/20 p-3">
                  <p className="text-yellow-500 text-xs">
                    ⚠️ <strong>Problema:</strong> Este template não tem filtros configurados no executionSchema.
                  </p>
                  <p className="text-yellow-500/80 text-xs mt-1">
                    Para adicionar filtros de data, cliente, etc, você precisa editar o template e definir um schema customizado.
                  </p>
                </div>
              )}
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}
