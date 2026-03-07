import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Save, X } from "lucide-react";
import {
  useCreateReportTemplate,
  useUpdateReportTemplate,
  useReportTemplate,
  useReportDatasets,
  useReportTemplateHistory,
  useReportNotifications,
} from "@/hooks";
import { useClients } from "@/hooks/useClients";
import { Button, Card, Input, TextArea, Loading } from "@/components/ui";
import { ReportPreview } from "@/components/reports/ReportPreview";
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
  const { addEntry } = useReportTemplateHistory();
  const { addNotification } = useReportNotifications();

  const [form, setForm] = useState({
    clientId: clientId || "",
    name: "",
    description: "",
    datasetType: ReportDatasetType.SoftwareInventory,
    defaultFormat: ReportFormat.Xlsx,
    layoutJson: "{}",
    filtersJson: "",
  });

  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  useEffect(() => {
    if (isEdit && template.data) {
      setForm({
        clientId: template.data.clientId || "",
        name: template.data.name,
        description: template.data.description || "",
        datasetType: template.data.datasetType,
        defaultFormat: template.data.defaultFormat,
        layoutJson: template.data.layoutJson || "{}",
        filtersJson: template.data.filtersJson || "",
      });

      // Parse layout to get selected fields
      try {
        const layout = JSON.parse(template.data.layoutJson || "{}");
        if (layout.fields && Array.isArray(layout.fields)) {
          setSelectedFields(layout.fields);
        }
      } catch (e) {
        console.error("Error parsing layout JSON:", e);
      }
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
    } catch {
      toast.error("Filtros JSON inválido");
      return;
    }

    // Build layout with selected fields
    const layout = {
      fields: selectedFields,
      ...JSON.parse(form.layoutJson || "{}"),
    };

    const payload = {
      ...form,
      clientId: form.clientId || null,
      layoutJson: JSON.stringify(layout),
      filtersJson: form.filtersJson || null,
      createdBy: "user@example.com", // TODO: Get from auth
    };

    if (isEdit && id) {
      const updatePayload: UpdateReportTemplateRequest = {
        ...payload,
        isActive: true,
        updatedBy: "user@example.com",
      };

      updateMutation.mutate(
        { id, data: updatePayload },
        {
          onSuccess: () => {
            toast.success("Template atualizado com sucesso");
            addEntry("updated", {
              templateId: id,
              templateName: form.name,
              details: "Template atualizado no formulário",
            });
            addNotification({
              title: "Template atualizado",
              message: `O template \"${form.name}\" foi atualizado.`,
              type: "success",
            });
            navigate(`/reports/templates?clientId=${form.clientId}`);
          },
          onError: () => toast.error("Erro ao atualizar template"),
        }
      );
    } else {
      createMutation.mutate(payload as CreateReportTemplateRequest, {
        onSuccess: () => {
          toast.success("Template criado com sucesso");
          addEntry("created", {
            templateId: "new-template",
            templateName: form.name,
            details: "Template criado pelo formulário",
          });
          addNotification({
            title: "Template criado",
            message: `Novo template \"${form.name}\" disponível para execução.`,
            type: "success",
          });
          navigate(`/reports/templates?clientId=${form.clientId}`);
        },
        onError: () => toast.error("Erro ao criar template"),
      });
    }
  };

  const currentDataset = datasets.data?.find(
    (d) => d.type === form.datasetType
  );

  const toggleField = (field: string) => {
    setSelectedFields((prev) =>
      prev.includes(field)
        ? prev.filter((f) => f !== field)
        : [...prev, field]
    );
  };

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
                rows={3}
              />
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
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Campos do Relatório
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/5 p-4 md:grid-cols-3">
                  {currentDataset.fields.map((field) => (
                    <label
                      key={field}
                      className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(field)}
                        onChange={() => toggleField(field)}
                        className="rounded border-white/10 bg-white/5"
                      />
                      {field}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {selectedFields.length} campo(s) selecionado(s)
                </p>
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
                placeholder='{"from": "2026-01-01", "to": "2026-12-31"}'
                rows={4}
                className="font-mono text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Opcional. Esses filtros serão aplicados por padrão ao executar o
                relatório.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-white">
            Visualização Prévia
          </h2>
          <ReportPreview
            datasetType={form.datasetType}
            filters={form.filtersJson}
            selectedFields={selectedFields}
          />
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
