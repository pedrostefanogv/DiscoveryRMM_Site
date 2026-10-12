import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  type Column,
  ErrorDisplay,
  Input,
  Loading,
  Modal,
  Select,
  TextArea,
} from "@/components/ui";
import {
  AutomationScriptType,
  type AutomationScriptConsume,
  type AutomationScriptSummary,
} from "@/api";
import { CustomFieldsUsedByPanel } from "@/components/custom-fields/CustomFieldsUsedByPanel";
import { ScriptContentEditor } from "./ScriptContentEditor";
import { useClients } from "@/hooks/useClients";
import {
  useAutomationScriptAudit,
  useAutomationScript,
  useAutomationScripts,
  useConsumeAutomationScript,
  useDeleteAutomationScript,
} from "@/hooks/useAutomation";

function scriptTypeLabel(value: unknown): string {
  if (value === AutomationScriptType.PowerShell || value === "PowerShell") return "PowerShell";
  if (value === AutomationScriptType.Shell || value === "Shell") return "Shell";
  if (value === AutomationScriptType.Python || value === "Python") return "Python";
  if (value === AutomationScriptType.Batch || value === "Batch") return "Batch";
  if (value === AutomationScriptType.Custom || value === "Custom") return "Custom";
  return String(value ?? "-");
}

function scriptChangeTypeLabel(value: unknown): string {
  switch (String(value)) {
    case "Created":
      return "Criado";
    case "Updated":
      return "Atualizado";
    case "Deleted":
      return "Excluído";
    case "Consumed":
      return "Consumido";
    case "Activated":
      return "Ativado";
    case "Deactivated":
      return "Desativado";
    default:
      return String(value ?? "-");
  }
}

function prettyJson(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function buildCorrelationId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Catálogo de scripts de automação.
 *
 * Criar/editar acontece em página dedicada (/automation/scripts/new e
 * /automation/scripts/:id/edit): o formulário tem editor de conteúdo e JSONs
 * opcionais e não cabia bem em modal. Consulta e auditoria continuam em modal.
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
  const [viewScriptId, setViewScriptId] = useState<string | null>(null);
  const [consumedPayload, setConsumedPayload] = useState<AutomationScriptConsume | null>(null);

  const cursor = pageCursors[page - 1];
  const list = useAutomationScripts({
    clientId: clientId || undefined,
    activeOnly,
    cursor,
    limit,
  });

  const deleteMutation = useDeleteAutomationScript();
  const consumeMutation = useConsumeAutomationScript();
  const auditQuery = useAutomationScriptAudit(auditScriptId ?? "", 50, !!auditScriptId);
  const viewScript = useAutomationScript(viewScriptId ?? "");

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

  const columns = useMemo<Column<AutomationScriptSummary>[]>(
    () => [
      {
        key: "name",
        header: "Nome",
        render: (item) => (
          <div>
            <p className="font-medium text-foreground">{item.name}</p>
            <p className="text-xs text-muted">{item.summary}</p>
          </div>
        ),
      },
      {
        key: "type",
        header: "Tipo",
        render: (item) => <Badge color="primary">{scriptTypeLabel(item.scriptType)}</Badge>,
      },
      {
        key: "version",
        header: "Versao",
        className: "font-mono",
        render: (item) => item.version,
      },
      {
        key: "triggers",
        header: "Triggers",
        render: (item) => item.triggerModes.join(", "),
      },
      {
        key: "status",
        header: "Status",
        render: (item) => (
          <Badge color={item.isActive ? "success" : "slate"}>
            {item.isActive ? "Ativo" : "Inativo"}
          </Badge>
        ),
      },
      {
        key: "updated",
        header: "Atualizado",
        render: (item) => new Date(item.lastUpdatedAt).toLocaleString("pt-BR"),
      },
      {
        key: "actions",
        header: "Ações",
        render: (item) => (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/automation/scripts/${item.id}/edit`)}
            >
              Editar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConsumedPayload(null);
                setViewScriptId(item.id);
              }}
            >
              Consultar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAuditScriptId(item.id)}>
              Auditoria
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (!window.confirm(`Excluir o script ${item.name}?`)) return;
                deleteMutation.mutate(
                  {
                    id: item.id,
                    correlationId: buildCorrelationId("script-delete"),
                  },
                  {
                    onSuccess: () => toast.success("Script excluido"),
                    onError: () => toast.error("Falha ao excluir script"),
                  },
                );
              }}
            >
              Excluir
            </Button>
          </div>
        ),
      },
    ],
    [deleteMutation, navigate],
  );

  const clientOptions = [
    { value: "", label: "Todos os clientes" },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const handleConsume = async () => {
    if (!viewScriptId) return;
    try {
      const data = await consumeMutation.mutateAsync(viewScriptId);
      setConsumedPayload(data);
      toast.success(`Consumo registrado na auditoria (hash ${data.contentHashSha256.slice(0, 10)}...)`);
    } catch {
      toast.error("Falha ao registrar o consumo do script");
    }
  };

  const clientLabel = (id: string | null | undefined) =>
    id ? clients.data?.find((c) => c.id === id)?.name ?? id : "Global";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scripts de Automação</h1>
          <p className="text-sm text-muted">Catálogo de scripts reutilizaveis.</p>
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
              showPagination={false}
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

      <Modal
        open={!!viewScriptId}
        onClose={() => {
          setViewScriptId(null);
          setConsumedPayload(null);
        }}
        title="Consultar script"
        maxWidth="max-w-4xl"
      >
        {viewScript.isLoading && <Loading message="Carregando script..." />}
        {viewScript.isError && <ErrorDisplay onRetry={() => viewScript.refetch()} />}
        {!viewScript.isLoading && !viewScript.isError && viewScript.data && (
          <div className="space-y-4">
            <p className="text-xs text-muted">
              Modo consulta: o script aparece exatamente como está salvo. Nada é executado nem
              alterado nesta tela.
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Cliente" value={clientLabel(viewScript.data.clientId)} readOnly />
              <Input label="Nome" value={viewScript.data.name} readOnly />
              <Input label="Resumo" value={viewScript.data.summary} readOnly />
              <Input
                label="ScriptType"
                value={scriptTypeLabel(viewScript.data.scriptType)}
                readOnly
              />
              <Input label="Versão" value={viewScript.data.version} readOnly />
              <Input
                label="ExecutionFrequency"
                value={viewScript.data.executionFrequency || "manual"}
                readOnly
              />
              <Input
                label="TriggerModes"
                value={viewScript.data.triggerModes.join(", ") || "-"}
                readOnly
              />
              <Input label="Status" value={viewScript.data.isActive ? "Ativo" : "Inativo"} readOnly />
            </div>

            <div className="grid gap-1 text-xs text-muted md:grid-cols-2">
              <p>Atualizado em: {new Date(viewScript.data.lastUpdatedAt).toLocaleString("pt-BR")}</p>
              <p className="break-all font-mono">SHA-256: {viewScript.data.contentHashSha256}</p>
            </div>

            <ScriptContentEditor
              readOnly
              label="Conteúdo do script"
              scriptType={viewScript.data.scriptType}
              value={viewScript.data.content}
              onChange={() => {}}
              hint="Somente leitura — use 'Editar' para abrir a tela dedicada de edição."
            />

            <TextArea
              label="ParametersSchemaJson"
              className="font-mono"
              rows={5}
              value={prettyJson(viewScript.data.parametersSchemaJson)}
              readOnly
              hint="Parâmetros aceitos pelo script (JSON Schema). Vazio quando o script não recebe parâmetros."
            />
            <TextArea
              label="MetadataJson"
              className="font-mono"
              rows={5}
              value={prettyJson(viewScript.data.metadataJson)}
              readOnly
              hint="Anotações livres do script (autor, origem, tags) e chaves interpretadas pelo agente (ex.: psadtWelcome)."
            />

            <div className="space-y-2 rounded-lg border border-border bg-surface-light p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Payload de consumo</p>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={consumeMutation.isPending}
                  onClick={handleConsume}
                >
                  Registrar consumo
                </Button>
              </div>
              <p className="text-xs text-muted">
                "Consumir" monta o payload que o agente recebe (conteúdo + hash SHA-256 +
                ParametersSchemaJson + MetadataJson) e grava um evento <strong>Consumido</strong> na
                auditoria. Abrir esta consulta não gera auditoria; somente o botão ao lado gera.
              </p>
              {consumedPayload && (
                <pre className="max-h-48 overflow-auto rounded border border-border bg-background/40 p-2 text-xs text-foreground">
                  {JSON.stringify({ scriptId: consumedPayload.scriptId, name: consumedPayload.name, version: consumedPayload.version, contentHashSha256: consumedPayload.contentHashSha256, triggerModes: consumedPayload.triggerModes, executionFrequency: consumedPayload.executionFrequency }, null, 2)}
                </pre>
              )}
            </div>

            <CustomFieldsUsedByPanel scriptId={viewScriptId ?? undefined} />
          </div>
        )}
      </Modal>

      <Modal
        open={!!auditScriptId}
        onClose={() => setAuditScriptId(null)}
        title="Auditoria do script"
        maxWidth="max-w-3xl"
      >
        <p className="mb-3 text-xs text-muted">
          Cada evento mostra o tipo de mudança, quem alterou e os snapshots antes/depois.
        </p>
        {auditQuery.isLoading && <Loading message="Carregando auditoria..." />}
        {auditQuery.isError && (
          <ErrorDisplay
            message="Não foi possível carregar a trilha de auditoria deste script."
            onRetry={() => auditQuery.refetch()}
          />
        )}
        {!auditQuery.isLoading && !auditQuery.isError && (
          <div className="space-y-3">
            {(auditQuery.data ?? []).map((entry) => (
              <div key={entry.id} className="rounded-lg border border-border bg-surface-light p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge color="accent">{scriptChangeTypeLabel(entry.changeType)}</Badge>
                  <p className="text-xs text-muted">{new Date(entry.changedAt).toLocaleString("pt-BR")}</p>
                </div>
                <p className="text-sm text-muted-foreground">Motivo: {entry.reason || "-"}</p>
                <p className="text-sm text-muted-foreground">Alterado por: {entry.changedBy || "-"}</p>
                <p className="text-xs text-muted">
                  IP: {entry.ipAddress || "-"} · Correlation: {entry.correlationId || "-"}
                </p>
                {(entry.oldValueJson || entry.newValueJson) && (
                  <details className="mt-2 rounded border border-border bg-background/40 p-2">
                    <summary className="cursor-pointer text-xs text-muted">Snapshots (antes/depois)</summary>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <pre className="max-h-56 overflow-auto rounded border border-border bg-surface/60 p-2 text-xs text-foreground">
                        {prettyJson(entry.oldValueJson) || "null"}
                      </pre>
                      <pre className="max-h-56 overflow-auto rounded border border-border bg-surface/60 p-2 text-xs text-foreground">
                        {prettyJson(entry.newValueJson) || "null"}
                      </pre>
                    </div>
                  </details>
                )}
              </div>
            ))}
            {!auditQuery.data?.length && (
              <p className="text-sm text-muted">Nenhum evento de auditoria encontrado.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
