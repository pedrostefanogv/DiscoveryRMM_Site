import { formatDateTime } from '@/utils/format';
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Icon,
  Badge,
  Button,
  Card,
  CardHeader,
  ContextMenu,
  DataTable,
  type Column,
  type ContextMenuItem,
  ErrorDisplay,
  Input,
  Loading,
  Modal,
  Pagination,
  Select,
  ConfirmDialog,
  PageHeader,
} from "@/components/ui";
import { AutomationScriptType, type AutomationScriptSummary } from "@/api";
import { useAuthorization } from "@/auth/authorization";
import { AutomationScriptAuditTrail } from "./AutomationScriptAuditTrail";
import { AutomationSubnav } from "./AutomationSubnav";
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

const SCRIPT_TYPE_FILTERS = [
  { value: "", label: "Todas as linguagens" },
  { value: String(AutomationScriptType.PowerShell), label: "PowerShell" },
  { value: String(AutomationScriptType.Shell), label: "Shell" },
  { value: String(AutomationScriptType.Python), label: "Python" },
  { value: String(AutomationScriptType.Batch), label: "Batch" },
  { value: String(AutomationScriptType.Custom), label: "Custom" },
];

/**
 * Catálogo de scripts de automação.
 *
 * Clicar em um item abre a página de detalhes/consulta (/automation/scripts/:id)
 * e o menu de ações (botão ⋮ ou botão direito) oferece abrir, executar, editar,
 * auditoria e excluir.
 */
export default function AutomationScriptsPage() {
  const navigate = useNavigate();
  const { canCreateAutomation, canEditAutomation, canDeleteAutomation, canExecuteAutomation } = useAuthorization();
  const clients = useClients();
  const [activeOnly, setActiveOnly] = useState(true);
  const [clientId, setClientId] = useState("");
  const [scriptType, setScriptType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined]);

  const [auditScriptId, setAuditScriptId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ScriptContextMenuState | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const cursor = pageCursors[page - 1];
  const list = useAutomationScripts({
    clientId: clientId || undefined,
    activeOnly,
    search: searchDebounced || undefined,
    scriptType: scriptType !== "" ? Number(scriptType) : undefined,
    cursor,
    limit,
  });

  const deleteMutation = useDeleteAutomationScript();
  const [deleteTarget, setDeleteTarget] = useState<AutomationScriptSummary | null>(null);

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
    const items: ContextMenuItem[] = [
      {
        key: "view",
        label: "Abrir detalhes",
        icon: <Icon name="visibility" className="h-4 w-4" />,
        onClick: () => navigate(`/automation/scripts/${script.id}`),
      },
    ];
    if (canExecuteAutomation && script.isActive) {
      items.push({
        key: "run",
        label: "Executar agora",
        icon: <Icon name="play_arrow" className="h-4 w-4" />,
        onClick: () => navigate(`/automation/operations?scriptId=${script.id}`),
      });
    }
    if (canEditAutomation) {
      items.push({
        key: "edit",
        label: "Editar",
        icon: <Icon name="edit" className="h-4 w-4" />,
        onClick: () => navigate(`/automation/scripts/${script.id}/edit`),
      });
    }
    items.push({
      key: "audit",
      label: "Auditoria",
      icon: <Icon name="history" className="h-4 w-4" />,
      onClick: () => setAuditScriptId(script.id),
    });
    if (canDeleteAutomation) {
      items.push({
        key: "delete",
        label: "Excluir",
        icon: <Icon name="delete" className="h-4 w-4" />,
        danger: true,
        separatorBefore: true,
        onClick: () => setDeleteTarget(script),
      });
    }
    return items;
  }, [contextMenu, navigate, canExecuteAutomation, canEditAutomation, canDeleteAutomation]);

  const columns = useMemo<Column<AutomationScriptSummary>[]>(
    () => [
      {
        key: "name",
        header: "Nome",
        width: "28%",
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
        width: "11%",
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
        width: "16%",
        render: (item) => formatDateTime(item.lastUpdatedAt),
      },
      {
        key: "menu",
        header: "",
        width: "5%",
        render: (item) => (
          <div className="flex justify-end">
            <button
              type="button"
              aria-label={`Mais ações para ${item.name}`}
              title="Mais ações"
              className="rounded-lg p-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenu({ script: item, x: rect.right, y: rect.bottom });
              }}
            >
              <Icon name="more_vert" className="h-4 w-4" />
            </button>
          </div>
        ),
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
        <PageHeader title="Scripts de Automação" description="Catálogo de scripts reutilizáveis. Clique em um item para consultar; use o menu ⋮ ou o botão direito para ver as ações." />
        {canCreateAutomation && (
          <Button onClick={() => navigate("/automation/scripts/new")}>Novo script</Button>
        )}
      </div>

      <AutomationSubnav />

      <Card>
        <CardHeader title="Filtros" subtitle="Refine por busca, linguagem, escopo e status" />
        <div className="grid gap-3 md:grid-cols-5">
          <Input
            label="Busca"
            placeholder="Nome ou resumo..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              resetPagination();
            }}
          />
          <Select
            label="Linguagem"
            options={SCRIPT_TYPE_FILTERS}
            value={scriptType}
            onChange={(e) => {
              setScriptType(e.target.value);
              resetPagination();
            }}
          />
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
            <Pagination
              className="mt-4"
              page={page}
              totalPages={1}
              onPageChange={() => {}}
              cursor={{ hasPrev: canPrev, hasNext: canNext, onPrev: goToPrevPage, onNext: goToNextPage, loading: list.isFetching }}
            />
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir script"
        message={deleteTarget ? `Excluir o script ${deleteTarget.name}?` : ""}
        confirmLabel="Excluir"
        tone="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(
            {
              id: deleteTarget.id,
              correlationId: buildCorrelationId("script-delete"),
            },
            {
              onSuccess: () => {
                setDeleteTarget(null);
                toast.success("Script excluido");
              },
              onError: (error) =>
                toast.error(error instanceof Error ? error.message : "Falha ao excluir script"),
            },
          );
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
