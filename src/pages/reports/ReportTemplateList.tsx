import { useEffect, useRef, useState } from "react";
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
  History,
} from "lucide-react";
import {
  useReportTemplates,
  useDeleteReportTemplate,
  useReportFavorites,
  useCreateReportTemplate,
} from "@/hooks";
import {
  Button,
  Card,
  DataTable,
  Badge,
  Input,
  Loading,
  Modal,
} from "@/components/ui";
import { ReportTemplateHistoryPanel } from "@/components/reports/ReportTemplateHistoryPanel";
import type { ReportTemplate } from "@/api/types";
import type { Column } from "@/components/ui";
import toast from "react-hot-toast";
import { buildRunReportPath } from "./builtInTemplates";
import {
  ReportDatasetType,
  ReportFormat,
  type CreateReportTemplateRequest,
  type ReportDatasetTypeValue,
  type ReportFormatValue,
} from "@/api/types";

const DATASET_LABELS: Record<ReportDatasetType, string> = {
  [ReportDatasetType.SoftwareInventory]: "Inventário de Software",
  [ReportDatasetType.Logs]: "Logs",
  [ReportDatasetType.ConfigurationAudit]: "Auditoria de Configuração",
  [ReportDatasetType.Tickets]: "Tickets",
  [ReportDatasetType.AgentHardware]: "Hardware de Agentes",
  [ReportDatasetType.AgentInventoryComposite]: "Inventário Composto",
  [ReportDatasetType.AgentLabels]: "Labels de Agentes",
  [ReportDatasetType.AutomaticLabelRules]: "Regras de Labels",
  [ReportDatasetType.AutomationExecutions]: "Execuções de Automação",
  [ReportDatasetType.AgentMonitoringEvents]: "Eventos de Monitoramento",
  [ReportDatasetType.AgentAlerts]: "Alertas de Agentes",
  [ReportDatasetType.P2pTelemetry]: "Telemetria P2P",
  [ReportDatasetType.AgentDisks]: "Discos de Agentes",
  [ReportDatasetType.NetworkAdapters]: "Adaptadores de Rede",
  [ReportDatasetType.ListeningPorts]: "Portas em Escuta",
  [ReportDatasetType.Printers]: "Impressoras",
  [ReportDatasetType.SoftwareCatalog]: "Catálogo de Software",
  [ReportDatasetType.AutomationScripts]: "Scripts de Automação",
  [ReportDatasetType.AppPackages]: "Pacotes de Aplicativos",
  [ReportDatasetType.TicketActivity]: "Atividade de Chamados",
  [ReportDatasetType.TicketEscalations]: "Regras de Escalonamento",
  [ReportDatasetType.CustomFields]: "Campos Personalizados",
  [ReportDatasetType.KnowledgeBase]: "Base de Conhecimento",
};

const FORMAT_LABELS: Record<ReportFormat, string> = {
  [ReportFormat.Xlsx]: "Excel",
  [ReportFormat.Csv]: "CSV",
  [ReportFormat.Pdf]: "PDF",
  [ReportFormat.Markdown]: "Markdown",
};

function getDatasetLabel(datasetType: ReportDatasetTypeValue): string {
  if (typeof datasetType === "string") {
    const normalized = datasetType.trim();
    const lower = normalized.toLowerCase();
    const stringLabels: Record<string, string> = {
      softwareinventory: "Inventário de Software",
      "software-inventory": "Inventário de Software",
      logs: "Logs",
      configurationaudit: "Auditoria de Configuração",
      "configuration-audit": "Auditoria de Configuração",
      tickets: "Tickets",
      agenthardware: "Hardware de Agentes",
      "agent-hardware": "Hardware de Agentes",
      agentlabels: "Labels de Agentes",
      "agent-labels": "Labels de Agentes",
      knowledgebase: "Base de Conhecimento",
      "knowledge-base": "Base de Conhecimento",
    };
    return stringLabels[lower] ?? normalized;
  }

  return DATASET_LABELS[datasetType] ?? String(datasetType);
}

function getFormatLabel(format: ReportFormatValue): string {
  if (typeof format === "string") {
    const lower = format.toLowerCase();
    if (lower === "pdf") return "PDF";
    if (lower === "csv") return "CSV";
    if (lower === "xlsx") return "Excel";
    return format;
  }

  return FORMAT_LABELS[format] ?? String(format);
}

type TemplateContextMenuState = {
  template: ReportTemplate;
  x: number;
  y: number;
};

export default function ReportTemplateList() {
  const [searchParams] = useSearchParams();
  const clientIdParam = searchParams.get("clientId");
  const clientId =
    clientIdParam && clientIdParam !== "undefined" && clientIdParam !== "null"
      ? clientIdParam
      : undefined;
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showInactive, setShowInactive] = useState(false);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyName, setHistoryName] = useState<string>("");
  const [templateContextMenu, setTemplateContextMenu] =
    useState<TemplateContextMenuState | null>(null);

  const buildTemplatePath = (basePath: string): string => {
    if (!clientId) return basePath;
    const params = new URLSearchParams();
    params.set("clientId", clientId);
    return `${basePath}?${params.toString()}`;
  };

  const templates = useReportTemplates({
    isActive: !showInactive ? true : undefined,
  });
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

  const exportTemplates = (source: ReportTemplate[], fileName: string) => {
    if (source.length === 0) return;

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
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
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
          datasetType: ReportDatasetTypeValue;
          defaultFormat: ReportFormatValue;
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

  const openTemplateContextMenu = (
    event: React.MouseEvent<HTMLTableRowElement>,
    template: ReportTemplate,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!pageRef.current) return;

    const rect = pageRef.current.getBoundingClientRect();
    const menuWidth = 248;
    const menuHeight = 204;
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;

    const x = Math.max(8, Math.min(rawX, rect.width - menuWidth - 8));
    const y = Math.max(8, Math.min(rawY, rect.height - menuHeight - 8));

    setTemplateContextMenu({ template, x, y });
  };

  const closeTemplateContextMenu = () => {
    setTemplateContextMenu(null);
  };

  const handleContextMenuEdit = () => {
    if (!templateContextMenu) return;
    navigate(
      buildTemplatePath(`/reports/templates/${templateContextMenu.template.id}/edit`),
    );
    closeTemplateContextMenu();
  };

  const handleContextMenuHistory = () => {
    if (!templateContextMenu) return;
    setHistoryId(templateContextMenu.template.id);
    setHistoryName(templateContextMenu.template.name);
    closeTemplateContextMenu();
  };

  const handleContextMenuDelete = () => {
    if (!templateContextMenu) return;
    setDeleteId(templateContextMenu.template.id);
    closeTemplateContextMenu();
  };

  const handleContextMenuExport = () => {
    if (!templateContextMenu) return;

    const template = templateContextMenu.template;
    const safeName = template.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "template";

    exportTemplates(
      [template],
      `report-template-${safeName}-${new Date().toISOString().slice(0, 10)}.json`,
    );

    toast.success(`Template \"${template.name}\" exportado com sucesso`);
    closeTemplateContextMenu();
  };

  useEffect(() => {
    if (!templateContextMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        contextMenuRef.current &&
        event.target instanceof Node &&
        !contextMenuRef.current.contains(event.target)
      ) {
        closeTemplateContextMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeTemplateContextMenu();
      }
    };

    const handleViewportChange = () => {
      closeTemplateContextMenu();
    };

    window.addEventListener("mousedown", handleClickOutside, true);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handleClickOutside, true);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [templateContextMenu]);

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
          className="text-muted hover:text-yellow-400 transition-colors"
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/20">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">{t.name}</p>
            <p className="text-xs text-muted">
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
        <span className="text-muted-foreground">
          {getDatasetLabel(t.datasetType)}
        </span>
      ),
    },
    {
      key: "defaultFormat",
      header: "Formato Padrão",
      render: (t) => (
        <Badge color="slate">
          {getFormatLabel(t.defaultFormat)}
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
            variant="secondary"
            size="sm"
            onClick={() =>
              navigate(buildRunReportPath(t.id, clientId))
            }
            title="Gerar relatório"
            aria-label="Gerar relatório"
          >
            <Play className="h-4 w-4" />
            <span className="hidden xl:inline">Gerar</span>
          </Button>
        </div>
      ),
    },
  ];

  if (templates.isLoading) return <Loading />;

  const favoritesFilteredTemplates = showOnlyFavorites
    ? templates.data?.filter((t) => isFavorite(t.id)) || []
    : templates.data || [];

  const query = search.trim().toLowerCase();
  const filteredTemplates =
    query.length === 0
      ? favoritesFilteredTemplates
      : favoritesFilteredTemplates.filter((template) => {
          const searchable = [
            template.name,
            template.description ?? "",
            getDatasetLabel(template.datasetType),
            getFormatLabel(template.defaultFormat),
          ]
            .join(" ")
            .toLowerCase();
          return searchable.includes(query);
        });

  const activeCount = templates.data?.filter((t) => t.isActive).length ?? 0;
  const inactiveCount = (templates.data?.length ?? 0) - activeCount;

  return (
    <div ref={pageRef} className="relative space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Central de Relatórios</h1>
          <p className="text-sm text-muted">
            Gere relatórios diretamente da lista de templates. Dataset inicial fica no fluxo de Novo Template.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-end">
          <Button
            onClick={() =>
              navigate(buildTemplatePath("/reports/templates/new"))
            }
          >
            <Plus className="h-4 w-4" /> Novo Template
          </Button>
          <Button variant="secondary" onClick={handleImportClick}>
            <Upload className="h-4 w-4" /> Importar
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs uppercase tracking-wide text-muted">Templates Visíveis</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{filteredTemplates.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs uppercase tracking-wide text-muted">Ativos</p>
          <p className="mt-1 text-xl font-semibold text-emerald-300">{activeCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs uppercase tracking-wide text-muted">Inativos</p>
          <p className="mt-1 text-xl font-semibold text-amber-300">{inactiveCount}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs uppercase tracking-wide text-muted">Favoritos</p>
          <p className="mt-1 text-xl font-semibold text-sky-300">
            {templates.data?.filter((t) => isFavorite(t.id)).length ?? 0}
          </p>
        </Card>
      </div>

      <Card>
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-end">
          <Input
            label="Buscar templates"
            placeholder="Nome, descrição, dataset ou formato"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showOnlyFavorites}
              onChange={(e) => setShowOnlyFavorites(e.target.checked)}
              className="rounded border-border bg-surface-light"
            />
            Apenas favoritos
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-border bg-surface-light"
            />
            Mostrar inativos
          </label>
          </div>
        </div>
      </Card>

      {filteredTemplates.length === 0 ? (
        <Card>
          <div className="space-y-3 py-6 text-center">
            <p className="text-base font-semibold text-foreground">Nenhum template encontrado</p>
            <p className="text-sm text-muted">
              Ajuste os filtros ou crie um novo template para começar a geração de relatórios.
            </p>
            <div className="flex justify-center">
              <Button onClick={() => navigate(buildTemplatePath("/reports/templates/new"))}>
                <Plus className="h-4 w-4" /> Criar Template
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card padding={false}>
          <DataTable
            columns={columns}
            data={filteredTemplates}
            keyExtractor={(t) => t.id}
            onRowContextMenu={openTemplateContextMenu}
          />
        </Card>
      )}

      {templateContextMenu && (
        <div
          ref={contextMenuRef}
          className="absolute z-[80] w-64 overflow-hidden rounded-xl border border-border bg-surface/95 p-1 shadow-2xl backdrop-blur"
          style={{ top: templateContextMenu.y, left: templateContextMenu.x }}
          role="menu"
          aria-label={`Ações do template ${templateContextMenu.template.name}`}
        >
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover"
            onClick={handleContextMenuEdit}
            role="menuitem"
          >
            <span>Editar template</span>
            <Edit2 className="h-4 w-4 text-muted" />
          </button>
          <button
            type="button"
            className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover"
            onClick={handleContextMenuExport}
            role="menuitem"
          >
            <span>Exportar template</span>
            <Download className="h-4 w-4 text-muted" />
          </button>
          <button
            type="button"
            className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover"
            onClick={handleContextMenuHistory}
            role="menuitem"
          >
            <span>Ver histórico de alterações</span>
            <History className="h-4 w-4 text-muted" />
          </button>
          <button
            type="button"
            className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/15"
            onClick={handleContextMenuDelete}
            role="menuitem"
          >
            <span>Excluir template</span>
            <Trash2 className="h-4 w-4 text-red-400" />
          </button>
        </div>
      )}

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Excluir Template"
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
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

      <Modal
        open={!!historyId}
        onClose={() => {
          setHistoryId(null);
          setHistoryName("");
        }}
        title={`Histórico de Alterações${historyName ? ` - ${historyName}` : ""}`}
      >
        {historyId && <ReportTemplateHistoryPanel templateId={historyId} limit={25} />}
      </Modal>
    </div>
  );
}
