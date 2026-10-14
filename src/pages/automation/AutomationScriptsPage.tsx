import { useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Eye, History, Pencil, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ContextMenu,
  DataTable,
  type Column,
  type ContextMenuItem,
  ErrorDisplay,
  Loading,
  Modal,
  Select,
} from "@/components/ui";
import { type AutomationScriptSummary } from "@/api";
import { AutomationScriptAuditTrail } from "./AutomationScriptAuditTrail";
import { scriptTypeLabel } from "./automationScriptUtils";
import { useClients } from "@/hooks/useClients";
import { useAutomationScripts, useDeleteAutomationScript } from "@/hooks/useAutomation";

function buildCorrelationId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

interface ScriptContextMenuState {
  script: AutomationScriptSummary;
  x: number;
  y: number;
}

/**
 * Catálogo de scripts de automação.
 *
 * A lista é enxuta (sem coluna de ações): clicar em um item abre a página de
 * detalhes/consulta (/automation/scripts/:id) e o botão direito abre o menu de
 * ações (abrir, editar, auditoria, excluir). Criar/editar acontece em página
 * dedicada; a auditoria continua em modal para não tirar o usuário da lista.
 */
export default function AutomationScriptsPage() {
  const navigate = useNavigate();
  const clients = useClients();
  const [activeOnly, setActiveOnly] = useState(true);
  const [clientId, setClientId] = useState("");
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined]);

  const [auditScriptId, setAuditScriptId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ScriptContextMenuState | null>(null);

  const cursor = pageCursors[page - 1];
  const list = useAutomationScripts({
    clientId: clientId || undefined,
    activeOnly,
    cursor,
    limit,
  });

  const deleteMutation = useDeleteAutomationScript();

  const canPrev = page > 1 && !list.isFetching;
  const canNext = Boolean(list.data?.hasMore && list.data?.nextCursor) && !list.isFetching;

  const goToNextPage = () => {
    if (!list.data?.nextCursor) return;
    setPageCursors((prev) => {
      const next = [...prev];
      next[page] = list.data!.nextCursor!;
      return next;
    });
    setPage((p) => p + 1);
  };

  const goToPrevPage = () => {
    setPage((p) => Math.max(1, p - 1));
  };

  const resetPagination = () => {
    setPage(1);
    setPageCursors([undefined]);
  };

  const clientLabel = (id: string | null | undefined) =>
    id ? clients.data?.find((c) => c.id === id)?.name ?? id : "Global";

  const openContextMenu = (
    event: MouseEvent<HTMLTableRowElement>,
    script: AutomationScriptSummary,
  ) => {
    event.preventDefault();
    setContextMenu({ script, x: event.clientX, y: event.clientY });
  };

  const contextMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenu) return [];
    const { script } = contextMenu;
    return [
      {
        key: "view",
        label: "Abrir detalhes",
        icon: <Eye className="h-4 w-4" />,
        onClick: () => navigate(`/automation/scripts/${script.id}`),
      },
      {
        key: "edit",
        label: "Editar",
        icon: <Pencil className="h-4 w-4" />,
        onClick: () => navigate(`/automation/scripts/${script.id}/edit`),
      },
      {
        key: "audit",
        label: "Auditoria",
        icon: <History className="h-4 w-4" />,
        onClick: () => setAuditScriptId(script.id),
      },
      {
        key: "delete",
        label: "Excluir",
        icon: <Trash2 className="h-4 w-4" />,
        danger: true,
        separatorBefore: true,
        onClick: () => {
          if (!window.confirm(`Excluir o script ${script.name}?`)) return;
          deleteMutation.mutate(
            {
              id: script.id,
              correlationId: buildCorrelationId("script-delete"),
            },
            {
              onSuccess: () => toast.success("Script excluido"),
              onError: () => toast.error("Falha ao excluir script"),
            },
          );
        },
      },
    ];
  }, [contextMenu, navigate, deleteMutation]);

  const columns = useMemo<Column<AutomationScriptSummary>[]>(
    () => [
      {
        key: "name",
        header: "Nome",
        width: "30%",
        render: (item) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{item.name}</p>
            <p className="truncate text-xs text-muted">{item.summary}</p>
          </div>
        ),
      },
      {
        key: "type",
        header: "Tipo",
        sortValue: (item) => scriptTypeLabel(item.scriptType),
        width: "12%",
        render: (item) => <Badge color="primary">{scriptTypeLabel(item.scriptType)}</Badge>,
      },
      {
        key: "scope",
        header: "Escopo",
        sortValue: (item) => clientLabel(item.clientId),
        width: "18%",
        render: (item) => (
          <span className="block truncate" title={clientLabel(item.clientId)}>
            {clientLabel(item.clientId)}
          </span>
        ),
      },
      {
        key: "version",
        header: "Versao",
        width: "10%",
        className: "font-mono",
        render: (item) => item.version,
      },
      {
        key: "status",
        header: "Status",
        sortValue: (item) => (item.isActive ? 0 : 1),
        width: "12%",
        render: (item) => (
          <Badge color={item.isActive ? "success" : "slate"}>
            {item.isActive ? "Ativo" : "Inativo"}
          </Badge>
        ),
      },
      {
        key: "updated",
        header: "Atualizado",
        sortValue: (item) => Date.parse(item.lastUpdatedAt) || 0,
        width: "18%",
        render: (item) => new Date(item.lastUpdatedAt).toLocaleString("pt-BR"),
      },
    ],
    [clients.data],
  );

  const clientOptions = [
    { value: "", label: "Todos os clientes" },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scripts de Automação</h1>
          <p className="text-sm text-muted">
            Catálogo de scripts reutilizáveis. Clique em um item para consultar; clique com o botão
            direito para ver as ações.
          </p>
        </div>
        <Button onClick={() => navigate("/automation/scripts/new")}>Novo script</Button>
      </div>

      <Card>
        <CardHeader title="Filtros" subtitle="Refine por escopo e status" />
        <div className="grid gap-3 md:grid-cols-4">
          <Select
            label="Cliente"
            options={clientOptions}
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              resetPagination();
            }}
          />
          <Select
            label="Ativos"
            options={[
              { value: "true", label: "Somente ativos" },
              { value: "false", label: "Todos" },
            ]}
            value={String(activeOnly)}
            onChange={(e) => {
              setActiveOnly(e.target.value === "true");
              resetPagination();
            }}
          />
          <Select
            label="Limite"
            options={[
              { value: "20", label: "20" },
              { value: "50", label: "50" },
              { value: "100", label: "100" },
            ]}
            value={String(limit)}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              resetPagination();
            }}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Scripts"
          subtitle={`${list.data?.items?.length ?? 0} itens retornados`}
        />
        {list.isLoading && <Loading message="Carregando scripts..." />}
        {list.isError && <ErrorDisplay onRetry={() => list.refetch()} />}
        {!list.isLoading && !list.isError && (
          <>
            <DataTable
              columns={columns}
              data={list.data?.items ?? []}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => navigate(`/automation/scripts/${item.id}`)}
              onRowContextMenu={openContextMenu}
              showPagination={false}
              fixedLayout
              flush
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={!canPrev} onClick={goToPrevPage}>
                Anterior
              </Button>
              <Button size="sm" variant="secondary" disabled={!canNext} onClick={goToNextPage}>
                Proxima
              </Button>
            </div>
          </>
        )}
      </Card>

      {contextMenu && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      <Modal
        open={!!auditScriptId}
        onClose={() => setAuditScriptId(null)}
        title="Auditoria do script"
        maxWidth="max-w-3xl"
      >
        <p className="mb-3 text-xs text-muted">
          Cada evento mostra o tipo de mudança, quem alterou e os snapshots antes/depois.
        </p>
        <AutomationScriptAuditTrail scriptId={auditScriptId ?? ""} />
      </Modal>
    </div>
  );
}
