import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  FileText,
  Play,
  Edit2,
  Trash2,
  Star,
  Upload,
  Download,
} from "lucide-react";
import {
  useReportTemplates,
  useDeleteReportTemplate,
  useReportDatasets,
  useReportFavorites,
  useCreateReportTemplate,
} from "@/hooks";
import {
  Button,
  Card,
  DataTable,
  Badge,
  Loading,
  Modal,
} from "@/components/ui";
import { ReportNotificationBell } from "@/components/reports/ReportNotificationBell";
import type { ReportTemplate } from "@/api/types";
import type { Column } from "@/components/ui";
import toast from "react-hot-toast";
import {
  ReportDatasetType,
  ReportFormat,
  type CreateReportTemplateRequest,
} from "@/api/types";

const DATASET_LABELS: Record<ReportDatasetType, string> = {
  [ReportDatasetType.SoftwareInventory]: "Inventário de Software",
  [ReportDatasetType.Logs]: "Logs",
  [ReportDatasetType.ConfigurationAudit]: "Auditoria de Configuração",
  [ReportDatasetType.Tickets]: "Tickets",
  [ReportDatasetType.AgentHardware]: "Hardware de Agentes",
};

const FORMAT_LABELS: Record<ReportFormat, string> = {
  [ReportFormat.Xlsx]: "Excel",
  [ReportFormat.Csv]: "CSV",
  [ReportFormat.Pdf]: "PDF",
};

export default function ReportTemplateList() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") || undefined;
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showInactive, setShowInactive] = useState(false);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const templates = useReportTemplates({
    isActive: !showInactive ? true : undefined,
  });
  const datasets = useReportDatasets();
  const deleteMutation = useDeleteReportTemplate();
  const createMutation = useCreateReportTemplate();
  const { isFavorite, toggleFavorite } = useReportFavorites();

  const handleDelete = () => {
    if (!deleteId) return;

    deleteMutation.mutate(deleteId, {
      onSuccess: () => {
        toast.success("Template excluído com sucesso");
        setDeleteId(null);
      },
      onError: () => {
        toast.error("Erro ao excluir template");
      },
    });
  };

  const handleExportTemplates = () => {
    const source = showOnlyFavorites
      ? templates.data?.filter((t) => isFavorite(t.id)) ?? []
      : templates.data ?? [];

    if (source.length === 0) {
      toast.error("Não há templates para exportar");
      return;
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      clientId: clientId ?? null,
      total: source.length,
      templates: source.map((t) => ({
        name: t.name,
        description: t.description,
        datasetType: t.datasetType,
        defaultFormat: t.defaultFormat,
        layoutJson: t.layoutJson,
        filtersJson: t.filtersJson,
        isActive: t.isActive,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `report-templates-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    toast.success("Exportação concluída");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportTemplates = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as {
        templates?: Array<{
          name: string;
          description: string | null;
          datasetType: ReportDatasetType;
          defaultFormat: ReportFormat;
          layoutJson: string;
          filtersJson: string | null;
          isActive?: boolean;
        }>;
      };

      if (!parsed.templates || !Array.isArray(parsed.templates)) {
        toast.error("Arquivo inválido. Estrutura de templates não encontrada.");
        return;
      }

      if (parsed.templates.length === 0) {
        toast.error("Arquivo sem templates para importar.");
        return;
      }

      const jobs = parsed.templates.map((item) => {
        const payload: CreateReportTemplateRequest = {
          name: item.name,
          description: item.description ?? null,
          datasetType: item.datasetType,
          defaultFormat: item.defaultFormat,
          layoutJson: item.layoutJson ?? "{}",
          filtersJson: item.filtersJson ?? null,
          createdBy: "user@example.com",
        };

        return createMutation.mutateAsync(payload);
      });

      const results = await Promise.allSettled(jobs);
      const successCount = results.filter((r) => r.status === "fulfilled").length;
      const failedCount = results.length - successCount;

      if (failedCount > 0) {
        toast.error(
          `Importação parcial: ${successCount} sucesso, ${failedCount} falha(s).`,
        );
      } else {
        toast.success(`Importação concluída: ${successCount} template(s).`);
      }

      templates.refetch();
    } catch {
      toast.error("Não foi possível importar o arquivo de templates.");
    } finally {
      event.target.value = "";
    }
  };

  const columns: Column<ReportTemplate>[] = [
    {
      key: "favorite",
      header: "",
      render: (t) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(t.id, t.name);
          }}
          className="text-slate-400 hover:text-yellow-400 transition-colors"
          aria-label={isFavorite(t.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        >
          <Star
            className={`h-5 w-5 ${
              isFavorite(t.id) ? "fill-yellow-400 text-yellow-400" : ""
            }`}
          />
        </button>
      ),
    },
    {
      key: "name",
      header: "Nome",
      render: (t) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-white">{t.name}</p>
            <p className="text-xs text-slate-500">
              {t.description || "Sem descrição"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "datasetType",
      header: "Tipo de Dados",
      render: (t) => (
        <span className="text-slate-300">
          {DATASET_LABELS[t.datasetType] || t.datasetType}
        </span>
      ),
    },
    {
      key: "defaultFormat",
      header: "Formato Padrão",
      render: (t) => (
        <Badge color="slate">
          {FORMAT_LABELS[t.defaultFormat] || t.defaultFormat}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (t) => (
        <Badge color={t.isActive ? "success" : "slate"}>
          {t.isActive ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (t) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate(`/reports/run?templateId=${t.id}&clientId=${clientId}`)
            }
          >
            <Play className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate(`/reports/templates/${t.id}/edit?clientId=${clientId}`)
            }
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteId(t.id)}
          >
            <Trash2 className="h-4 w-4 text-red-400" />
          </Button>
        </div>
      ),
    },
  ];

  if (templates.isLoading || datasets.isLoading) return <Loading />;

  // Filter templates by favorites if needed
  const filteredTemplates = showOnlyFavorites
    ? templates.data?.filter((t) => isFavorite(t.id)) || []
    : templates.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Templates de Relatórios</h1>
          <p className="text-sm text-slate-400">
            {filteredTemplates.length} templates
            {showOnlyFavorites && " favoritos"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-end">
          <ReportNotificationBell />
          <Button variant="secondary" onClick={handleExportTemplates}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button variant="secondary" onClick={handleImportClick}>
            <Upload className="h-4 w-4" /> Importar
          </Button>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={showOnlyFavorites}
              onChange={(e) => setShowOnlyFavorites(e.target.checked)}
              className="rounded border-white/10 bg-white/5"
            />
            Apenas favoritos
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-white/10 bg-white/5"
            />
            Mostrar inativos
          </label>
          <Button
            onClick={() =>
              navigate(`/reports/templates/new?clientId=${clientId}`)
            }
          >
            <Plus className="h-4 w-4" /> Novo Template
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            aria-label="Selecionar arquivo de templates para importação"
            title="Selecionar arquivo de templates para importação"
            onChange={handleImportTemplates}
          />
        </div>
      </div>

      <Card padding={false}>
        <DataTable
          columns={columns}
          data={filteredTemplates}
          keyExtractor={(t) => t.id}
        />
      </Card>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Excluir Template"
      >
        <div className="space-y-4">
          <p className="text-slate-300">
            Tem certeza que deseja excluir este template? Esta ação não pode ser
            desfeita.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
