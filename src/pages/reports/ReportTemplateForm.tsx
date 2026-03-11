import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Save, X } from "lucide-react";
import {
  useCreateReportTemplate,
  useUpdateReportTemplate,
  useReportTemplate,
  useReportDatasets,
} from "@/hooks";
import { Button, Card, Input, TextArea, Loading } from "@/components/ui";
import { ReportTemplateHistoryPanel } from "@/components/reports/ReportTemplateHistoryPanel";
import {
  ReportDatasetType,
  ReportFormat,
  type CreateReportTemplateRequest,
  type UpdateReportTemplateRequest,
} from "@/api/types";
import toast from "react-hot-toast";

const DATASET_LABELS: Record<ReportDatasetType, string> = {
  [ReportDatasetType.SoftwareInventory]: "Inventário de Software",
  [ReportDatasetType.Logs]: "Logs",
  [ReportDatasetType.ConfigurationAudit]: "Auditoria de Configuração",
  [ReportDatasetType.Tickets]: "Tickets",
  [ReportDatasetType.AgentHardware]: "Hardware de Agentes",
};

const FORMAT_LABELS: Record<ReportFormat, string> = {
  [ReportFormat.Xlsx]: "Excel (.xlsx)",
  [ReportFormat.Csv]: "CSV (.csv)",
  [ReportFormat.Pdf]: "PDF (.pdf)",
};

const DATASET_FIELDS: Record<ReportDatasetType, string[]> = {
  [ReportDatasetType.SoftwareInventory]: [
    "clientId",
    "siteId",
    "agentId",
    "softwareName",
    "publisher",
    "version",
    "installedAt",
    "lastSeenAt",
    "agentHostname",
    "siteName",
  ],
  [ReportDatasetType.Logs]: [
    "clientId",
    "siteId",
    "agentId",
    "type",
    "level",
    "source",
    "from",
    "to",
    "createdAt",
    "message",
    "timestamp",
  ],
  [ReportDatasetType.ConfigurationAudit]: [
    "entityType",
    "entityId",
    "fieldName",
    "oldValue",
    "newValue",
    "changedBy",
    "changedAt",
    "reason",
    "timestamp",
  ],
  [ReportDatasetType.Tickets]: [
    "clientId",
    "siteId",
    "agentId",
    "workflowStateId",
    "priority",
    "createdAt",
    "closedAt",
    "slaBreached",
    "timestamp",
  ],
  [ReportDatasetType.AgentHardware]: [
    "siteName",
    "agentHostname",
    "osName",
    "osVersion",
    "osBuild",
    "osArchitecture",
    "processor",
    "processorCores",
    "processorThreads",
    "processorArchitecture",
    "totalMemoryGB",
    "motherboardManufacturer",
    "motherboardModel",
    "biosVersion",
    "biosManufacturer",
    "collectedAt",
  ],
};

const ORDER_BY_HINTS: Record<ReportDatasetType, string[]> = {
  [ReportDatasetType.SoftwareInventory]: [
    "softwareName",
    "publisher",
    "version",
    "lastSeenAt",
    "agentHostname",
    "siteName",
  ],
  [ReportDatasetType.Logs]: ["timestamp", "level", "source", "type"],
  [ReportDatasetType.ConfigurationAudit]: [
    "timestamp",
    "entityType",
    "changedBy",
    "fieldName",
  ],
  [ReportDatasetType.Tickets]: [
    "timestamp",
    "priority",
    "slaBreached",
    "closedAt",
  ],
  [ReportDatasetType.AgentHardware]: [
    "siteName",
    "agentHostname",
    "collectedAt",
    "osName",
  ],
};

const FILTER_SNIPPETS: Record<
  ReportDatasetType,
  Array<{ label: string; value: Record<string, unknown> }>
> = {
  [ReportDatasetType.SoftwareInventory]: [
    { label: "Base", value: { limit: 1000, orderBy: "softwareName", orderDirection: "asc" } },
    {
      label: "Microsoft",
      value: { publisher: "Microsoft", limit: 5000, orderBy: "softwareName", orderDirection: "asc" },
    },
  ],
  [ReportDatasetType.Logs]: [
    {
      label: "Erros 7 dias",
      value: {
        level: ["Error", "Critical"],
        daysBack: 7,
        limit: 10000,
        orderBy: "timestamp",
        orderDirection: "desc",
      },
    },
    {
      label: "Últimas 24h",
      value: {
        daysBack: 1,
        limit: 5000,
        orderBy: "timestamp",
        orderDirection: "desc",
      },
    },
  ],
  [ReportDatasetType.ConfigurationAudit]: [
    {
      label: "Últimos 30 dias",
      value: {
        daysBack: 30,
        limit: 10000,
        orderBy: "timestamp",
        orderDirection: "desc",
      },
    },
    {
      label: "Por entidade",
      value: {
        entityType: "Client",
        limit: 5000,
        orderBy: "timestamp",
        orderDirection: "desc",
      },
    },
  ],
  [ReportDatasetType.Tickets]: [
    {
      label: "Prioridade alta",
      value: {
        priority: "High",
        limit: 10000,
        orderBy: "timestamp",
        orderDirection: "desc",
      },
    },
    {
      label: "SLA violado",
      value: {
        slaBreached: true,
        limit: 10000,
        orderBy: "timestamp",
        orderDirection: "desc",
      },
    },
  ],
  [ReportDatasetType.AgentHardware]: [
    {
      label: "Inventário geral",
      value: { limit: 5000, orderBy: "siteName", orderDirection: "asc" },
    },
    {
      label: "Apenas Windows",
      value: { osName: "Windows", limit: 5000, orderBy: "siteName", orderDirection: "asc" },
    },
  ],
};

function formatFieldLabel(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function buildDefaultLayout(datasetType: ReportDatasetType): string {
  const defaultColumns = DATASET_FIELDS[datasetType].slice(0, 6).map((field) => ({
    field,
    header: formatFieldLabel(field),
    width: 20,
  }));

  return JSON.stringify(
    {
      title: DATASET_LABELS[datasetType],
      columns: defaultColumns,
      pageSize: 100,
      orientation: "landscape",
    },
    null,
    2,
  );
}

function stringifyJson(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

function validateLayoutJson(layout: unknown): string[] {
  const errors: string[] = [];

  if (!layout || typeof layout !== "object") {
    errors.push("layoutJson deve ser um objeto JSON válido");
    return errors;
  }

  const candidate = layout as {
    title?: unknown;
    columns?: unknown;
    orientation?: unknown;
    pageSize?: unknown;
  };

  if (typeof candidate.title !== "string" || candidate.title.trim().length === 0) {
    errors.push("layoutJson.title é obrigatório");
  }

  if (!Array.isArray(candidate.columns) || candidate.columns.length === 0) {
    errors.push("layoutJson.columns deve conter ao menos 1 coluna");
  } else {
    candidate.columns.forEach((column, index) => {
      if (!column || typeof column !== "object") {
        errors.push(`layoutJson.columns[${index}] deve ser objeto`);
        return;
      }

      const typedColumn = column as {
        field?: unknown;
        header?: unknown;
        width?: unknown;
      };

      if (
        typeof typedColumn.field !== "string" ||
        typedColumn.field.trim().length === 0
      ) {
        errors.push(`layoutJson.columns[${index}].field é obrigatório`);
      }

      if (
        typeof typedColumn.header !== "string" ||
        typedColumn.header.trim().length === 0
      ) {
        errors.push(`layoutJson.columns[${index}].header é obrigatório`);
      }

      if (
        typeof typedColumn.width !== "number" ||
        Number.isNaN(typedColumn.width) ||
        typedColumn.width <= 0
      ) {
        errors.push(`layoutJson.columns[${index}].width deve ser número > 0`);
      }
    });
  }

  if (
    candidate.orientation !== undefined &&
    candidate.orientation !== "landscape" &&
    candidate.orientation !== "portrait"
  ) {
    errors.push('layoutJson.orientation deve ser "landscape" ou "portrait"');
  }

  if (
    candidate.pageSize !== undefined &&
    (typeof candidate.pageSize !== "number" || candidate.pageSize <= 0)
  ) {
    errors.push("layoutJson.pageSize deve ser número > 0");
  }

  return errors;
}

type LayoutColumn = {
  field: string;
  header: string;
  width: number;
  format?: string;
};

type ParsedLayout = {
  title: string;
  columns: LayoutColumn[];
  pageSize?: number;
  orientation?: "landscape" | "portrait";
};

function extractLayout(layout: unknown): ParsedLayout | null {
  if (!layout || typeof layout !== "object") return null;
  const candidate = layout as {
    title?: unknown;
    columns?: unknown;
    pageSize?: unknown;
    orientation?: unknown;
  };
  if (typeof candidate.title !== "string" || !Array.isArray(candidate.columns)) {
    return null;
  }

  const safeColumns = candidate.columns
    .filter((col): col is LayoutColumn => !!col && typeof col === "object")
    .map((col) => {
      const typed = col as {
        field?: unknown;
        header?: unknown;
        width?: unknown;
        format?: unknown;
      };
      return {
        field: typeof typed.field === "string" ? typed.field : "",
        header: typeof typed.header === "string" ? typed.header : "",
        width: typeof typed.width === "number" ? typed.width : 0,
        format: typeof typed.format === "string" ? typed.format : undefined,
      };
    });

  return {
    title: candidate.title,
    columns: safeColumns,
    pageSize: typeof candidate.pageSize === "number" ? candidate.pageSize : undefined,
    orientation:
      candidate.orientation === "landscape" || candidate.orientation === "portrait"
        ? candidate.orientation
        : undefined,
  };
}

function getUnknownLayoutFields(
  layout: ParsedLayout,
  datasetType: ReportDatasetType,
): string[] {
  const validFields = new Set(DATASET_FIELDS[datasetType]);
  const unknown = layout.columns
    .map((col) => col.field)
    .filter((field) => field && !validFields.has(field));
  return Array.from(new Set(unknown));
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function findClosestFieldName(
  fieldName: string,
  datasetType: ReportDatasetType,
): string | null {
  const candidates = DATASET_FIELDS[datasetType];
  if (!fieldName.trim() || candidates.length === 0) return null;

  let best: { field: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = levenshteinDistance(fieldName.toLowerCase(), candidate.toLowerCase());
    if (!best || score < best.score) {
      best = { field: candidate, score };
    }
  }

  if (!best) return null;
  const threshold = Math.max(2, Math.floor(fieldName.length * 0.5));
  return best.score <= threshold ? best.field : null;
}

function updateLayoutColumnField(
  layoutJson: string,
  columnIndex: number,
  nextField: string,
): string | null {
  try {
    const parsed = JSON.parse(layoutJson) as {
      columns?: Array<Record<string, unknown>>;
    };

    if (!Array.isArray(parsed.columns) || !parsed.columns[columnIndex]) {
      return null;
    }

    parsed.columns[columnIndex] = {
      ...parsed.columns[columnIndex],
      field: nextField,
    };

    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

export default function ReportTemplateForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") || undefined;

  const isEdit = !!id && id !== "new";

  const template = useReportTemplate(id || "", clientId);
  const datasets = useReportDatasets();
  const createMutation = useCreateReportTemplate();
  const updateMutation = useUpdateReportTemplate();

  const [form, setForm] = useState({
    name: "",
    description: "",
    auditUser: "",
    datasetType: ReportDatasetType.SoftwareInventory,
    defaultFormat: ReportFormat.Xlsx,
    layoutJson: buildDefaultLayout(ReportDatasetType.SoftwareInventory),
    filtersJson: "",
  });

  const [layoutDirty, setLayoutDirty] = useState(false);
  const [quickValidationErrors, setQuickValidationErrors] = useState<string[]>([]);

  const layoutPreview = useMemo(() => {
    try {
      const parsed = JSON.parse(form.layoutJson);
      const layout = extractLayout(parsed);
      if (!layout) {
        return {
          error: "Não foi possível interpretar o layout atual.",
          layout: null as ParsedLayout | null,
          unknownFields: [] as string[],
          invalidColumns: [] as Array<{ index: number; field: string; suggestion: string | null }>,
        };
      }

      const validFieldSet = new Set(DATASET_FIELDS[form.datasetType]);
      const invalidColumns = layout.columns
        .map((column, index) => ({
          index,
          field: column.field,
          isValid: !!column.field && validFieldSet.has(column.field),
        }))
        .filter((column) => !column.isValid)
        .map((column) => ({
          index: column.index,
          field: column.field,
          suggestion: findClosestFieldName(column.field, form.datasetType),
        }));

      return {
        error: null,
        layout,
        unknownFields: getUnknownLayoutFields(layout, form.datasetType),
        invalidColumns,
      };
    } catch {
      return {
        error: "JSON inválido. Corrija para visualizar o preview.",
        layout: null as ParsedLayout | null,
        unknownFields: [] as string[],
        invalidColumns: [] as Array<{ index: number; field: string; suggestion: string | null }>,
      };
    }
  }, [form.layoutJson, form.datasetType]);

  useEffect(() => {
    if (isEdit && template.data) {
      setForm({
        name: template.data.name,
        description: template.data.description || "",
        auditUser: template.data.updatedBy || template.data.createdBy || "",
        datasetType: template.data.datasetType,
        defaultFormat: template.data.defaultFormat,
        layoutJson: stringifyJson(template.data.layoutJson, buildDefaultLayout(template.data.datasetType)),
        filtersJson: stringifyJson(template.data.filtersJson, ""),
      });
      setLayoutDirty(true);
    }
  }, [isEdit, template.data]);

  useEffect(() => {
    if (isEdit || layoutDirty) return;
    setForm((prev) => ({
      ...prev,
      layoutJson: buildDefaultLayout(prev.datasetType),
    }));
  }, [form.datasetType, isEdit, layoutDirty]);

  const applySuggestedLayout = (useAllFields: boolean) => {
    const fields = useAllFields
      ? DATASET_FIELDS[form.datasetType]
      : DATASET_FIELDS[form.datasetType].slice(0, 6);
    const columns = fields.map((field) => ({
      field,
      header: formatFieldLabel(field),
      width: 20,
    }));

    setForm((prev) => ({
      ...prev,
      layoutJson: JSON.stringify(
        {
          title: DATASET_LABELS[form.datasetType],
          columns,
          pageSize: 100,
          orientation: "landscape",
        },
        null,
        2,
      ),
    }));
    setLayoutDirty(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = form.name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 200) {
      toast.error("Nome deve ter entre 2 e 200 caracteres");
      return;
    }

    if (form.description.length > 2000) {
      toast.error("Descrição deve ter no máximo 2000 caracteres");
      return;
    }

    if (form.auditUser.length > 256) {
      toast.error("Campo de auditoria deve ter no máximo 256 caracteres");
      return;
    }

    let parsedLayout: unknown;
    let parsedFilters: unknown = null;

    try {
      parsedLayout = JSON.parse(form.layoutJson);
    } catch {
      toast.error("Layout JSON inválido");
      return;
    }

    const layoutErrors = validateLayoutJson(parsedLayout);
    if (layoutErrors.length > 0) {
      toast.error(layoutErrors[0]);
      return;
    }

    const normalizedLayout = extractLayout(parsedLayout);
    if (!normalizedLayout) {
      toast.error("Layout inválido");
      return;
    }

    const unknownFields = getUnknownLayoutFields(normalizedLayout, form.datasetType);
    if (unknownFields.length > 0) {
      toast.error(
        `layoutJson contém campos inválidos para o dataset: ${unknownFields.join(", ")}`,
      );
      return;
    }

    if (form.filtersJson.trim()) {
      try {
        parsedFilters = JSON.parse(form.filtersJson);
      } catch {
        toast.error("Filtros JSON inválidos");
        return;
      }
    }

    if (isEdit && id) {
      const updatePayload: UpdateReportTemplateRequest = {
        name: trimmedName,
        description: form.description || null,
        datasetType: form.datasetType,
        defaultFormat: form.defaultFormat,
        layoutJson: JSON.stringify(parsedLayout),
        filtersJson: parsedFilters ? JSON.stringify(parsedFilters) : null,
        isActive: true,
        updatedBy: form.auditUser.trim() || null,
      };

      updateMutation.mutate(
        { id, data: updatePayload },
        {
          onSuccess: () => {
            toast.success("Template atualizado com sucesso");
            navigate(`/reports/templates`);
          },
          onError: () => toast.error("Erro ao atualizar template"),
        }
      );
    } else {
      const createPayload: CreateReportTemplateRequest = {
        name: trimmedName,
        description: form.description || null,
        datasetType: form.datasetType,
        defaultFormat: form.defaultFormat,
        layoutJson: JSON.stringify(parsedLayout),
        filtersJson: parsedFilters ? JSON.stringify(parsedFilters) : null,
        createdBy: form.auditUser.trim() || null,
      };

      createMutation.mutate(createPayload, {
        onSuccess: () => {
          toast.success("Template criado com sucesso");
          navigate(`/reports/templates`);
        },
        onError: () => toast.error("Erro ao criar template"),
      });
    }
  };

  const applyFilterSnippet = (value: Record<string, unknown>) => {
    setForm((prev) => ({
      ...prev,
      filtersJson: JSON.stringify(value, null, 2),
    }));
    toast.success("Snippet de filtros aplicado");
  };

  const runQuickValidation = () => {
    const errors: string[] = [];

    const trimmedName = form.name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 200) {
      errors.push("Nome deve ter entre 2 e 200 caracteres");
    }
    if (form.description.length > 2000) {
      errors.push("Descrição deve ter no máximo 2000 caracteres");
    }
    if (form.auditUser.length > 256) {
      errors.push("Usuário de auditoria deve ter no máximo 256 caracteres");
    }

    let parsedLayout: unknown;
    try {
      parsedLayout = JSON.parse(form.layoutJson);
      const layoutErrors = validateLayoutJson(parsedLayout);
      errors.push(...layoutErrors);
      const normalizedLayout = extractLayout(parsedLayout);
      if (!normalizedLayout) {
        errors.push("layoutJson inválido");
      } else {
        const unknownFields = getUnknownLayoutFields(normalizedLayout, form.datasetType);
        if (unknownFields.length > 0) {
          errors.push(
            `Campos de layout fora do dataset: ${unknownFields.join(", ")}`,
          );
        }
      }
    } catch {
      errors.push("Layout JSON inválido");
    }

    if (form.filtersJson.trim()) {
      try {
        JSON.parse(form.filtersJson);
      } catch {
        errors.push("Filtros JSON inválidos");
      }
    }

    setQuickValidationErrors(errors);
    if (errors.length === 0) {
      toast.success("Validação concluída: sem erros");
    } else {
      toast.error(`Validação encontrou ${errors.length} problema(s)`);
    }
  };

  const applySuggestedFieldFix = (columnIndex: number, suggestedField: string) => {
    const nextLayout = updateLayoutColumnField(form.layoutJson, columnIndex, suggestedField);
    if (!nextLayout) {
      toast.error("Não foi possível aplicar a correção automática");
      return;
    }

    setLayoutDirty(true);
    setForm((prev) => ({
      ...prev,
      layoutJson: nextLayout,
    }));
    toast.success(`Campo ajustado para '${suggestedField}'`);
  };

  if (isEdit && template.isLoading) return <Loading />;
  if (datasets.isLoading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {isEdit ? "Editar Template" : "Novo Template"}
          </h1>
          <p className="text-sm text-slate-400">
            Configure um template de relatório reutilizável
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <X className="h-4 w-4" /> Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-white">
            Informações Básicas
          </h2>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Nome do Template *
                </label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Ex: Relatório Mensal de Software"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Usuário de Auditoria (createdBy/updatedBy)
              </label>
              <Input
                value={form.auditUser}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, auditUser: e.target.value }))
                }
                placeholder="usuario@empresa.com"
                maxLength={256}
              />
              <p className="mt-1 text-xs text-slate-500">
                Opcional, porém recomendado para rastreabilidade.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Descrição
              </label>
              <TextArea
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Descrição opcional do template"
                rows={2}
              />
            </div>
          </div>
        </Card>

        {isEdit && id && template.data && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Histórico de Alterações
                </h2>
                <p className="text-xs text-slate-400">
                  Versão atual v{template.data.version} • Última atualização em {new Date(template.data.updatedAt).toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
            <ReportTemplateHistoryPanel templateId={id} limit={25} />
          </div>
        )}

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-white">
            Configuração de Dados
          </h2>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Tipo de Dataset *
                </label>
                <select
                  value={form.datasetType}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      datasetType: Number(e.target.value) as ReportDatasetType,
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-primary focus:ring-1 focus:ring-primary"
                  aria-label="Selecionar tipo de dataset"
                >
                  {Object.entries(DATASET_LABELS).map(([value, label]) => (
                    <option
                      key={value}
                      value={value}
                      className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Formato Padrão *
                </label>
                <select
                  value={form.defaultFormat}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      defaultFormat: Number(e.target.value) as ReportFormat,
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-primary focus:ring-1 focus:ring-primary"
                  aria-label="Selecionar formato padrão"
                >
                  {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                    <option
                      key={value}
                      value={value}
                      className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  PDF depende de habilitação no backend.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
              <p className="text-xs font-medium text-blue-300">
                Campos disponíveis para {DATASET_LABELS[form.datasetType]}:
              </p>
              <p className="mt-1 text-xs text-blue-200/90 break-words">
                {DATASET_FIELDS[form.datasetType].join(", ")}
              </p>
              <p className="mt-2 text-xs text-blue-300/80">
                orderBy permitidos: {ORDER_BY_HINTS[form.datasetType].join(", ")}
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-slate-300">
                  Layout JSON *
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => applySuggestedLayout(false)}
                  >
                    Layout mínimo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => applySuggestedLayout(true)}
                  >
                    Layout completo
                  </Button>
                </div>
              </div>
              <TextArea
                value={form.layoutJson}
                onChange={(e) => {
                  setLayoutDirty(true);
                  setForm((prev) => ({ ...prev, layoutJson: e.target.value }));
                }}
                rows={12}
                className="font-mono text-sm"
                placeholder='{"title":"Título do Relatório","columns":[{"field":"fieldName","header":"Cabeçalho","width":20}],"pageSize":100,"orientation":"landscape"}'
              />
              <p className="mt-1 text-xs text-slate-500">
                Obrigatório. Estrutura mínima: title + columns[].
              </p>

              {layoutPreview.error && (
                <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <p className="text-xs text-red-300">{layoutPreview.error}</p>
                </div>
              )}

              {!layoutPreview.error && layoutPreview.layout && (
                <div className="mt-3 space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                    <span className="rounded bg-white/10 px-2 py-1">
                      Título: {layoutPreview.layout.title}
                    </span>
                    <span className="rounded bg-white/10 px-2 py-1">
                      Orientação: {layoutPreview.layout.orientation || "-"}
                    </span>
                    <span className="rounded bg-white/10 px-2 py-1">
                      PageSize: {layoutPreview.layout.pageSize ?? "-"}
                    </span>
                    <span className="rounded bg-white/10 px-2 py-1">
                      Colunas: {layoutPreview.layout.columns.length}
                    </span>
                  </div>

                  {layoutPreview.unknownFields.length > 0 && (
                    <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-2">
                      <p className="text-xs text-yellow-200">
                        Campos fora do dataset selecionado: {layoutPreview.unknownFields.join(", ")}
                      </p>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs text-slate-300">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400">
                          <th className="px-2 py-1">Field</th>
                          <th className="px-2 py-1">Header</th>
                          <th className="px-2 py-1">Width</th>
                          <th className="px-2 py-1">Format</th>
                        </tr>
                      </thead>
                      <tbody>
                        {layoutPreview.layout.columns.slice(0, 12).map((column, index) => {
                          const invalidColumn = layoutPreview.invalidColumns.find(
                            (item) => item.index === index,
                          );
                          const isInvalid = !!invalidColumn;

                          return (
                            <tr
                              key={`${column.field}-${index}`}
                              className={
                                isInvalid
                                  ? "border-b border-red-500/30 bg-red-500/5"
                                  : "border-b border-white/5"
                              }
                            >
                            <td className="px-2 py-1 font-mono">
                              {column.field || "-"}
                              {isInvalid && (
                                <span className="ml-2 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-200">
                                  inválido
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1">{column.header || "-"}</td>
                            <td className="px-2 py-1">{column.width || "-"}</td>
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-2">
                                <span>{column.format || "-"}</span>
                                {invalidColumn?.suggestion && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                      applySuggestedFieldFix(index, invalidColumn.suggestion as string)
                                    }
                                  >
                                    Corrigir para {invalidColumn.suggestion}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {layoutPreview.layout.columns.length > 12 && (
                    <p className="text-xs text-slate-500">
                      Mostrando 12 de {layoutPreview.layout.columns.length} colunas.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Filtros Padrão (JSON)
              </label>
              <div className="mb-2 flex flex-wrap gap-2">
                {FILTER_SNIPPETS[form.datasetType].map((snippet) => (
                  <Button
                    key={snippet.label}
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => applyFilterSnippet(snippet.value)}
                  >
                    {snippet.label}
                  </Button>
                ))}
              </div>
              <TextArea
                value={form.filtersJson}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, filtersJson: e.target.value }))
                }
                placeholder='{"limit":1000,"orderBy":"timestamp","orderDirection":"desc"}'
                rows={5}
                className="font-mono text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Opcional. Use para definir filtros padrão do template.
              </p>
            </div>

            {datasets.data && datasets.data.length > 0 && (
              <div>
                <details className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <summary className="cursor-pointer text-xs text-slate-300 hover:text-white">
                    Ver catálogo retornado pela API (campos e formatos)
                  </summary>
                  <pre className="mt-2 overflow-auto text-xs text-slate-400">
                    {JSON.stringify(datasets.data, null, 2)}
                  </pre>
                </details>
              </div>
            )}

            {quickValidationErrors.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-xs font-medium text-red-300">
                  Problemas encontrados na validação rápida:
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-red-200">
                  {quickValidationErrors.map((error, index) => (
                    <li key={`${error}-${index}`}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={runQuickValidation}>
            Validar
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(-1)}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            <Save className="h-4 w-4" />
            {createMutation.isPending || updateMutation.isPending
              ? "Salvando..."
              : isEdit
              ? "Atualizar Template"
              : "Criar Template"}
          </Button>
        </div>
      </form>
    </div>
  );
}
