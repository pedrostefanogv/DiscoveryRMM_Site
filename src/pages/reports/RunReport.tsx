import { useState, useEffect } from "react";
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
  type RunReportRequest,
  type ReportFilterDefinition,
  type ReportFilterPreset,
} from "@/api/types";
import { getReportDownloadUrl } from "@/api/reports";
import toast from "react-hot-toast";

const SELECT_CLASSNAME =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-primary focus:ring-1 focus:ring-primary";
const SELECT_OPTION_CLASSNAME = "bg-slate-900 text-slate-100";

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

const FORMAT_LABELS: Record<ReportFormat, string> = {
  [ReportFormat.Xlsx]: "Excel (.xlsx)",
  [ReportFormat.Csv]: "CSV (.csv)",
  [ReportFormat.Pdf]: "PDF (.pdf)",
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

  const template = useReportTemplate(templateId, clientIdParam);
  const runMutation = useRunReport();
  const execution = useReportExecution(executionId || "", clientIdParam);

  const clients = useClients(false);
  const sites = useSites(dynamicFilters.clientId || "", false);
  const agents = useAgentsBySite(dynamicFilters.siteId || "");

  // Auto-download quando completar
  useEffect(() => {
    if (!executionId || !execution.data || !autoDownload) return;

    const normalizedStatus = normalizeExecutionStatus(
      execution.data.status as ReportExecutionStatus | string | number,
    );

    if (
      normalizedStatus === ReportExecutionStatus.Completed &&
      lastAutoDownloadedExecutionId !== executionId
    ) {
      const url = getReportDownloadUrl(
        executionId,
        dynamicFilters.clientId || clientIdParam || undefined,
      );
      window.open(url, "_blank");
      setLastAutoDownloadedExecutionId(executionId);
      toast.success("Relatório pronto! Download iniciado automaticamente.");
    }
  }, [
    autoDownload,
    clientIdParam,
    execution.data,
    executionId,
    lastAutoDownloadedExecutionId,
    dynamicFilters.clientId,
  ]);

  // Inicializar orientação, orderBy e orderDirection com valores padrão do schema
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
  }, [template.data, orientation, orderBy, orderDirection]);

  const applyPreset = (preset: ReportFilterPreset) => {
    const { name, ...filters } = preset;
    setDynamicFilters(filters);
    toast.success(`Preset "${name}" aplicado`);
  };

  const handleDynamicFilterChange = (filterName: string, value: any) => {
    setDynamicFilters(prev => ({
      ...prev,
      [filterName]: value || undefined
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
      // Remove valores vazios
      filters = Object.fromEntries(
        Object.entries(dynamicFilters).filter(([_, v]) => v !== undefined && v !== "")
      );
    }

    // Validar campos obrigatórios
    const schema = template.data.executionSchema;
    const requiredFields = schema.filters.filter(f => f.required);
    const missingFields = requiredFields.filter(f => !filters[f.name]);
    
    if (missingFields.length > 0) {
      toast.error(`Campos obrigatórios faltando: ${missingFields.map(f => f.label).join(", ")}`);
      return;
    }

    const request: RunReportRequest = {
      templateId,
      format: format ?? undefined,
      orientation: orientation || undefined,
      filtersJson: Object.keys(filters).length > 0 ? filters : undefined,
      orderBy: orderBy || undefined,
      orderDirection: orderDirection || undefined,
      createdBy: "user@example.com",
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

  const renderFilterInput = (filter: ReportFilterDefinition) => {
    const value = dynamicFilters[filter.name] ?? "";

    switch (filter.type) {
      case "DateTime":
        return (
          <div key={filter.name}>
            <label className="mb-2 block text-sm font-medium text-slate-300">
              {filter.label}
              {filter.required && <span className="text-red-400 ml-1">*</span>}
            </label>
            <Input
              type="datetime-local"
              value={value}
              onChange={(e) => handleDynamicFilterChange(filter.name, e.target.value)}
              className="w-full"
            />
            {filter.description && (
              <p className="mt-1 text-xs text-slate-500">{filter.description}</p>
            )}
          </div>
        );

      case "Long":
        // Casos especiais para selects dropdown
        if (filter.name === "clientId") {
          return (
            <div key={filter.name}>
              <label className="mb-2 block text-sm font-medium text-slate-300">
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
                <p className="mt-1 text-xs text-slate-500">{filter.description}</p>
              )}
            </div>
          );
        }
        
        if (filter.name === "siteId") {
          return (
            <div key={filter.name}>
              <label className="mb-2 block text-sm font-medium text-slate-300">
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
                <p className="mt-1 text-xs text-slate-500">Selecione um cliente primeiro</p>
              )}
              {filter.description && (
                <p className="mt-1 text-xs text-slate-500">{filter.description}</p>
              )}
            </div>
          );
        }
        
        if (filter.name === "agentId") {
          return (
            <div key={filter.name}>
              <label className="mb-2 block text-sm font-medium text-slate-300">
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
                <p className="mt-1 text-xs text-slate-500">Selecione um site primeiro</p>
              )}
              {filter.description && (
                <p className="mt-1 text-xs text-slate-500">{filter.description}</p>
              )}
            </div>
          );
        }

        // Número genérico
        return (
          <div key={filter.name}>
            <label className="mb-2 block text-sm font-medium text-slate-300">
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
              <p className="mt-1 text-xs text-slate-500">{filter.description}</p>
            )}
          </div>
        );

      case "String":
        return (
          <div key={filter.name}>
            <label className="mb-2 block text-sm font-medium text-slate-300">
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
              <p className="mt-1 text-xs text-slate-500">{filter.description}</p>
            )}
          </div>
        );

      case "Boolean":
        return (
          <div key={filter.name}>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={value === true || value === "true"}
                onChange={(e) => handleDynamicFilterChange(filter.name, e.target.checked)}
                className="rounded border-white/10 bg-white/5"
              />
              {filter.label}
              {filter.required && <span className="text-red-400 ml-1">*</span>}
            </label>
            {filter.description && (
              <p className="mt-1 text-xs text-slate-500">{filter.description}</p>
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
          <p className="text-center text-slate-400">Template não encontrado</p>
        </Card>
      </div>
    );
  }

  const schema = template.data.executionSchema || {
    scope: "Unknown",
    dateMode: "None",
    filters: [],
    allowedOrientations: ["Portrait"],
    allowedSortFields: [],
    allowedSortDirections: ["ASC", "DESC"],
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
          <h1 className="text-2xl font-bold text-white">Executar Relatório</h1>
          <p className="text-sm text-slate-400">{template.data.name}</p>
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
              <h3 className="text-sm font-semibold text-white mb-1">Instruções</h3>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">
                {template.data.instructions}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
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
              <label className="mb-2 block text-sm font-medium text-slate-300">
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
                <label className="mb-2 block text-sm font-medium text-slate-300">
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
                  <label className="mb-2 block text-sm font-medium text-slate-300">
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
                  <label className="mb-2 block text-sm font-medium text-slate-300">
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
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={autoDownload}
                onChange={(e) => setAutoDownload(e.target.checked)}
                className="rounded border-white/10 bg-white/5"
              />
              Baixar automaticamente quando concluir
            </label>

            <hr className="border-white/10" />

            {/* Presets (se disponíveis) */}
            {!advancedMode && schema.sampleFilterPresets && schema.sampleFilterPresets.length > 0 && (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Presets Rápidos
                </label>
                <div className="flex flex-wrap gap-2">
                  {schema.sampleFilterPresets.map((preset, idx) => (
                    <Button
                      key={idx}
                      variant="secondary"
                      size="sm"
                      onClick={() => applyPreset(preset)}
                    >
                      <Lightbulb className="h-3 w-3" />
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Filtros Dinâmicos */}
            {advancedMode ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Filtros (JSON)
                </label>
                <textarea
                  value={filtersJson}
                  onChange={(e) => setFiltersJson(e.target.value)}
                  placeholder='{"clientId": "1", "from": "2026-01-01T00:00:00", "to": "2026-03-07T23:59:59"}'
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary"
                  rows={10}
                />
                <p className="mt-1 text-xs text-slate-500">
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
          <h2 className="mb-4 text-lg font-semibold text-white">Status da Execução</h2>
          {!executionId ? (
            <p className="text-center text-slate-400">
              Nenhuma execução iniciada
            </p>
          ) : execution.isLoading ? (
            <Loading />
          ) : execution.data ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Status:</span>
                <Badge color={executionStatusConfig?.color ?? "slate"}>
                  {executionStatusConfig?.label ?? "Desconhecido"}
                </Badge>
              </div>

              {execution.data.rowCount !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Linhas:</span>
                  <span className="text-white">
                    {execution.data.rowCount.toLocaleString()}
                  </span>
                </div>
              )}

              {execution.data.resultSizeBytes !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Tamanho:</span>
                  <span className="text-white">
                    {(execution.data.resultSizeBytes / 1024 / 1024).toFixed(2)}{" "}
                    MB
                  </span>
                </div>
              )}

              {execution.data.executionTimeMs !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Tempo:</span>
                  <span className="text-white">
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
                  onClick={() => {
                    const url = getReportDownloadUrl(
                      executionId,
                      dynamicFilters.clientId || clientIdParam || undefined
                    );
                    window.open(url, "_blank");
                  }}
                >
                  <Download className="h-4 w-4" />
                  Baixar Relatório
                </Button>
              )}
            </div>
          ) : null}
        </Card>
      </div>

      {template.data.description && (
        <Card>
          <h3 className="mb-2 text-sm font-medium text-slate-300">Descrição</h3>
          <p className="text-sm text-slate-400">{template.data.description}</p>
        </Card>
      )}

      {/* Debug: Schema Info */}
      {schema && (
        <Card className="border-slate-700">
          <details className="cursor-pointer">
            <summary className="text-sm font-medium text-slate-400 hover:text-slate-300">
              🔧 Informações Técnicas do Schema
            </summary>
            <div className="mt-3 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-slate-500">Scope:</div>
                <div className="text-slate-300 font-mono">{schema.scope || "N/A"}</div>
                
                <div className="text-slate-500">Date Mode:</div>
                <div className="text-slate-300 font-mono">{schema.dateMode || "N/A"}</div>
                
                <div className="text-slate-500">Filtros Disponíveis:</div>
                <div className="text-slate-300 font-mono">{schema.filters?.length || 0}</div>
                
                <div className="text-slate-500">Orientações:</div>
                <div className="text-slate-300 font-mono">{schema.allowedOrientations?.join(", ") || "N/A"}</div>
                
                <div className="text-slate-500">Campos Ordenáveis:</div>
                <div className="text-slate-300 font-mono">{schema.allowedSortFields?.join(", ") || "N/A"}</div>
              </div>
              
              {schema.filters && schema.filters.length > 0 && (
                <div className="mt-3">
                  <div className="text-slate-500 mb-2">Filtros Configurados:</div>
                  <div className="bg-slate-900/50 rounded p-2 space-y-1">
                    {schema.filters.map((f, idx) => (
                      <div key={idx} className="text-slate-300">
                        • <span className="text-primary">{f.name}</span>{" "}
                        <span className="text-slate-500">({f.type})</span>
                        {f.required && <span className="text-red-400 ml-1">*obrigatório</span>}
                        {f.label && <span className="text-slate-400"> - {f.label}</span>}
                      </div>
                    ))}
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
