import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Save, X, Download, AlertCircle, CheckCircle } from "lucide-react";
import {
  useCreateReportTemplate,
  useUpdateReportTemplate,
  useReportTemplate,
  useReportDatasets,
} from "@/hooks";
import { useClients } from "@/hooks/useClients";
import { Button, Card, Input, TextArea, Loading } from "@/components/ui";
import {
  ReportDatasetType,
  ReportFormat,
  type CreateReportTemplateRequest,
  type UpdateReportTemplateRequest,
} from "@/api/types";
import {
  getDefaultSchemaForDataset,
  formatSchemaToJson,
  validateCustomSchema,
  getDatasetTypeDescription,
} from "@/utils/reportSchemas";
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

export default function ReportTemplateForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") || undefined;

  const isEdit = !!id && id !== "new";

  const template = useReportTemplate(id || "", clientId);
  const datasets = useReportDatasets();
  const clients = useClients(false);
  const createMutation = useCreateReportTemplate();
  const updateMutation = useUpdateReportTemplate();

  const [form, setForm] = useState({
    clientId: clientId || "",
    name: "",
    description: "",
    instructions: "",
    datasetType: ReportDatasetType.SoftwareInventory,
    defaultFormat: ReportFormat.Xlsx,
    layoutJson: "{}",
    filtersJson: "",
    executionSchemaJson: "",
  });

  const [selectedFields] = useState<string[]>([]);
  const [useCustomSchema, setUseCustomSchema] = useState(false);
  const [schemaValidation, setSchemaValidation] = useState<{ valid: boolean; errors: string[] }>({ 
    valid: true, 
    errors: [] 
  });

  // Validar schema ao digitar
  useEffect(() => {
    if (useCustomSchema && form.executionSchemaJson) {
      try {
        const parsed = JSON.parse(form.executionSchemaJson);
        const validation = validateCustomSchema(parsed);
        setSchemaValidation(validation);
      } catch {
        setSchemaValidation({ valid: false, errors: ["JSON inválido"] });
      }
    } else {
      setSchemaValidation({ valid: true, errors: [] });
    }
  }, [form.executionSchemaJson, useCustomSchema]);

  const loadDefaultSchema = () => {
    const defaultSchema = getDefaultSchemaForDataset(form.datasetType);
    setForm(prev => ({
      ...prev,
      executionSchemaJson: formatSchemaToJson(defaultSchema),
    }));
    toast.success("Schema padrão carregado!");
  };

  useEffect(() => {
    if (isEdit && template.data) {
      setForm({
        clientId: template.data.clientId || "",
        name: template.data.name,
        description: template.data.description || "",
        instructions: template.data.instructions || "",
        datasetType: template.data.datasetType,
        defaultFormat: template.data.defaultFormat,
        layoutJson: template.data.layoutJson || "{}",
        filtersJson: template.data.filtersJson || "",
        executionSchemaJson: template.data.executionSchemaJson 
          ? JSON.stringify(template.data.executionSchemaJson, null, 2) 
          : "",
      });

      setUseCustomSchema(!!template.data.executionSchemaJson);

      // Layout JSON é mantido apenas por compatibilidade com a API
    }
  }, [isEdit, template.data]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    // Validate JSON fields
    try {
      if (form.filtersJson) JSON.parse(form.filtersJson);
      if (useCustomSchema && form.executionSchemaJson) {
        JSON.parse(form.executionSchemaJson);
      }
    } catch {
      toast.error("JSON inválido");
      return;
    }

    // Build layout with selected fields
    const layout = {
      columns: selectedFields,
      ...JSON.parse(form.layoutJson || "{}"),
    };

    if (isEdit && id) {
      const updatePayload: UpdateReportTemplateRequest = {
        name: form.name,
        description: form.description || null,
        instructions: form.instructions || null,
        datasetType: form.datasetType,
        defaultFormat: form.defaultFormat,
        layoutJson: JSON.stringify(layout),
        filtersJson: form.filtersJson || null,
        executionSchemaJson: useCustomSchema && form.executionSchemaJson 
          ? JSON.parse(form.executionSchemaJson)
          : null,
        isActive: true,
        updatedBy: "user@example.com",
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
        name: form.name,
        description: form.description || null,
        instructions: form.instructions || null,
        datasetType: form.datasetType,
        defaultFormat: form.defaultFormat,
        layoutJson: JSON.stringify(layout),
        filtersJson: form.filtersJson || null,
        executionSchemaJson: useCustomSchema && form.executionSchemaJson 
          ? JSON.parse(form.executionSchemaJson)
          : null,
        createdBy: "user@example.com",
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

  const currentDataset = datasets.data?.find(
    (d) => d.type === form.datasetType
  );

  if (isEdit && template.isLoading) return <Loading />;
  if (datasets.isLoading || clients.isLoading) return <Loading />;

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
                  Cliente
                </label>
                <select
                  value={form.clientId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, clientId: e.target.value }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-primary focus:ring-1 focus:ring-primary"
                  aria-label="Selecionar cliente"
                >
                  <option value="">Global (Todos os clientes)</option>
                  {clients.data?.map((client: any) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>

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

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Instruções de Execução
              </label>
              <TextArea
                value={form.instructions}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, instructions: e.target.value }))
                }
                placeholder="Ex: Execute este relatório mensalmente. Campos obrigatórios: período (from/to)."
                rows={3}
              />
              <p className="mt-1 text-xs text-slate-500">
                Instruções que serão exibidas ao executar o relatório
              </p>
            </div>
          </div>
        </Card>

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
                    <option key={value} value={value}>
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
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {currentDataset && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-300">
                    Schema de Execução Customizado
                  </label>
                  {useCustomSchema && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={loadDefaultSchema}
                    >
                      <Download className="h-3 w-3" />
                      Carregar Schema Padrão
                    </Button>
                  )}
                </div>
                
                <label className="flex items-center gap-2 text-sm text-slate-300 mb-3">
                  <input
                    type="checkbox"
                    checked={useCustomSchema}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseCustomSchema(checked);
                      if (checked && !form.executionSchemaJson) {
                        loadDefaultSchema();
                      }
                    }}
                    className="rounded border-white/10 bg-white/5"
                  />
                  Usar schema customizado (deixe desmarcado para usar o padrão do dataset)
                </label>

                {useCustomSchema && (
                  <>
                    {/* Validação visual */}
                    {form.executionSchemaJson && (
                      <div className={`mb-3 rounded-lg border p-3 ${
                        schemaValidation.valid 
                          ? 'border-green-500/20 bg-green-500/10' 
                          : 'border-red-500/20 bg-red-500/10'
                      }`}>
                        <div className="flex items-start gap-2">
                          {schemaValidation.valid ? (
                            <>
                              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-medium text-green-500">
                                  Schema válido ✓
                                </p>
                                <p className="text-xs text-green-400/80 mt-1">
                                  O schema está bem formatado e pronto para uso.
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-xs font-medium text-red-500 mb-1">
                                  Erros no schema:
                                </p>
                                <ul className="text-xs text-red-400/80 space-y-1">
                                  {schemaValidation.errors.map((error, idx) => (
                                    <li key={idx}>• {error}</li>
                                  ))}
                                </ul>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mb-3 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                      <p className="text-xs font-medium text-blue-400 mb-2">
                        📚 Dataset: <strong>{DATASET_LABELS[form.datasetType]}</strong>
                      </p>
                      <p className="text-xs text-blue-300/80 mb-2">
                        {getDatasetTypeDescription(form.datasetType)}
                      </p>
                      <div className="mt-2 space-y-1 text-[10px] text-blue-300/60">
                        <div>• <strong>Tipos de filtro:</strong> DateTime, Long, String, Boolean</div>
                        <div>• <strong>DateTime:</strong> Use formato ISO (YYYY-MM-DDTHH:mm:ss)</div>
                        <div>• <strong>Long:</strong> Números inteiros (IDs de cliente, site, etc)</div>
                        <div>• <strong>Presets:</strong> Atalhos rápidos para combinações comuns de filtros</div>
                      </div>
                    </div>
                    
                    <TextArea
                      value={form.executionSchemaJson}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, executionSchemaJson: e.target.value }))
                      }
                      placeholder="Cole o JSON do schema aqui ou clique em 'Carregar Schema Padrão'..."
                      rows={18}
                      className="font-mono text-sm"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Use o botão "Carregar Schema Padrão" acima para começar com um schema pré-configurado para este tipo de dataset.
                    </p>
                  </>
                )}
                {!useCustomSchema && (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">
                      Usando schema padrão do dataset <strong>{currentDataset.name}</strong>
                    </p>
                    {currentDataset.executionSchema && (
                      <details className="mt-2">
                        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
                          Ver schema padrão
                        </summary>
                        <pre className="mt-2 text-xs text-slate-400 overflow-auto">
                          {JSON.stringify(currentDataset.executionSchema, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Filtros Padrão (JSON)
              </label>
              <TextArea
                value={form.filtersJson}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, filtersJson: e.target.value }))
                }
                placeholder='{"from": "2026-01-01T00:00:00", "to": "2026-12-31T23:59:59"}'
                rows={4}
                className="font-mono text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Opcional. Esses filtros serão pré-preenchidos ao executar o relatório.
              </p>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
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
