import { useEffect, useMemo, useState } from "react";
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
  type CreateAutomationScriptRequest,
  type UpdateAutomationScriptRequest,
  type AutomationScriptSummary,
} from "@/api";
import { CustomFieldsUsedByPanel } from "@/components/custom-fields/CustomFieldsUsedByPanel";
import { ScriptContentEditor } from "./ScriptContentEditor";
import { languageForScriptType } from "./scriptLanguages";
import { validateJsonField, validateScriptSyntax } from "./scriptValidation";
import { useClients } from "@/hooks/useClients";
import {
  useAutomationScriptAudit,
  useAutomationScript,
  useAutomationScripts,
  useConsumeAutomationScript,
  useCreateAutomationScript,
  useDeleteAutomationScript,
  useUpdateAutomationScript,
} from "@/hooks/useAutomation";

const scriptTypeOptions = [
  { value: String(AutomationScriptType.PowerShell), label: "PowerShell" },
  { value: String(AutomationScriptType.Shell), label: "Shell" },
  { value: String(AutomationScriptType.Python), label: "Python" },
  { value: String(AutomationScriptType.Batch), label: "Batch" },
  { value: String(AutomationScriptType.Custom), label: "Custom" },
];

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

type ScriptFormState = {
  clientId: string;
  name: string;
  summary: string;
  scriptType: string;
  version: string;
  executionFrequency: string;
  triggerModesCsv: string;
  content: string;
  parametersSchemaJson: string;
  metadataJson: string;
  isActive: boolean;
};

const defaultForm: ScriptFormState = {
  clientId: "",
  name: "",
  summary: "",
  scriptType: String(AutomationScriptType.PowerShell),
  version: "1.0.0",
  executionFrequency: "manual",
  triggerModesCsv: "manual",
  content: "",
  parametersSchemaJson: "",
  metadataJson: "",
  isActive: true,
};

export default function AutomationScriptsPage() {
  const clients = useClients();
  const [activeOnly, setActiveOnly] = useState(true);
  const [clientId, setClientId] = useState("");
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined]);

  const [formOpen, setFormOpen] = useState(false);
  const [auditScriptId, setAuditScriptId] = useState<string | null>(null);
  const [viewScriptId, setViewScriptId] = useState<string | null>(null);
  const [consumedPayload, setConsumedPayload] = useState<AutomationScriptConsume | null>(null);
  const [editing, setEditing] = useState<AutomationScriptSummary | null>(null);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState<ScriptFormState>(defaultForm);

  const cursor = pageCursors[page - 1];
  const list = useAutomationScripts({
    clientId: clientId || undefined,
    activeOnly,
    cursor,
    limit,
  });

  const createMutation = useCreateAutomationScript();
  const updateMutation = useUpdateAutomationScript();
  const deleteMutation = useDeleteAutomationScript();
  const consumeMutation = useConsumeAutomationScript();
  const auditQuery = useAutomationScriptAudit(auditScriptId ?? "", 50, !!auditScriptId);
  const scriptDetail = useAutomationScript(editingId);
  const viewScript = useAutomationScript(viewScriptId ?? "");

  useEffect(() => {
    if (!editingId || !scriptDetail.data) return;
    const detail = scriptDetail.data;
    setForm({
      clientId: detail.clientId ?? "",
      name: detail.name,
      summary: detail.summary,
      scriptType: String(detail.scriptType),
      version: detail.version,
      executionFrequency: detail.executionFrequency,
      triggerModesCsv: detail.triggerModes.join(", "),
      content: detail.content,
      parametersSchemaJson: detail.parametersSchemaJson ?? "",
      metadataJson: detail.metadataJson ?? "",
      isActive: detail.isActive,
    });
  }, [editingId, scriptDetail.data]);

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
              onClick={() => {
                setEditing(item);
                setEditingId(item.id);
                setForm({
                  ...defaultForm,
                  clientId: item.clientId ?? "",
                  name: item.name,
                  summary: item.summary,
                  scriptType: String(item.scriptType),
                  version: item.version,
                  executionFrequency: item.executionFrequency,
                  triggerModesCsv: item.triggerModes.join(", "),
                  isActive: item.isActive,
                });
                setFormOpen(true);
              }}
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
    [deleteMutation],
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

  const handleSubmit = () => {
    const name = form.name.trim();
    const summary = form.summary.trim();
    const content = form.content.trim();
    const triggerModes = Array.from(
      new Set(
        form.triggerModesCsv
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    );

    if (!name) return toast.error("Nome obrigatorio");
    if (name.length > 200) return toast.error("Nome deve ter no máximo 200 caracteres");
    if (!summary) return toast.error("Resumo obrigatorio");
    if (summary.length > 2000) return toast.error("Resumo deve ter no máximo 2000 caracteres");
    if (!content) return toast.error("Conteudo obrigatorio");
    if (content.length > 200000) return toast.error("Conteudo acima do limite");
    if (!triggerModes.length) return toast.error("Informe ao menos um trigger mode");

    // Validacao de sintaxe do conteudo conforme o tipo selecionado.
    const language = languageForScriptType(form.scriptType);
    const syntaxErrors = validateScriptSyntax(form.content, language).filter(
      (issue) => issue.severity === "error",
    );
    if (syntaxErrors.length) {
      return toast.error(
        `Corrija ${syntaxErrors.length} erro(s) de sintaxe (linha ${syntaxErrors[0].line}): ${syntaxErrors[0].message}`,
      );
    }

    // JSONs opcionais tambem precisam estar bem formados.
    const jsonIssue =
      validateJsonField("ParametersSchemaJson", form.parametersSchemaJson) ??
      validateJsonField("MetadataJson", form.metadataJson);
    if (jsonIssue) return toast.error(jsonIssue.message);

    const basePayload: CreateAutomationScriptRequest = {
      clientId: form.clientId || null,
      name,
      summary,
      scriptType: Number(form.scriptType) as AutomationScriptType,
      version: form.version.trim() || "1.0.0",
      executionFrequency: form.executionFrequency.trim() || "manual",
      triggerModes,
      content,
      parametersSchemaJson: form.parametersSchemaJson.trim() || null,
      metadataJson: form.metadataJson.trim() || null,
      isActive: form.isActive,
    };

    if (editing) {
      const payload: UpdateAutomationScriptRequest = {
        ...basePayload,
        content,
      };
      updateMutation.mutate(
        {
          id: editing.id,
          data: payload,
          correlationId: buildCorrelationId("script-update"),
        },
        {
          onSuccess: () => {
            toast.success("Script atualizado");
            setFormOpen(false);
            setEditing(null);
            setEditingId("");
            setForm(defaultForm);
          },
          onError: () => toast.error("Falha ao atualizar script"),
        },
      );
      return;
    }

    createMutation.mutate(
      {
        data: basePayload,
        correlationId: buildCorrelationId("script-create"),
      },
      {
        onSuccess: () => {
          toast.success("Script criado");
          setFormOpen(false);
          setEditingId("");
          setForm(defaultForm);
        },
        onError: () => toast.error("Falha ao criar script"),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scripts de Automação</h1>
          <p className="text-sm text-muted">Catálogo de scripts reutilizaveis.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setEditingId("");
            setForm(defaultForm);
            setFormOpen(true);
          }}
        >
          Novo script
        </Button>
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
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setEditingId("");
        }}
        title={editing ? "Editar script" : "Novo script"}
        maxWidth="max-w-4xl"
      >
        {editing && scriptDetail.isLoading && (
          <div className="mb-3">
            <Loading message="Carregando detalhes do script..." />
          </div>
        )}
        {editing && scriptDetail.isError && (
          <div className="mb-3">
            <ErrorDisplay onRetry={() => scriptDetail.refetch()} />
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            label="Cliente"
            options={[{ value: "", label: "Global" }, ...clientOptions.slice(1)]}
            value={form.clientId}
            onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))}
          />
          <Input
            label="Nome"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            label="Resumo"
            value={form.summary}
            onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
          />
          <Select
            label="ScriptType"
            options={scriptTypeOptions}
            value={form.scriptType}
            onChange={(e) => setForm((p) => ({ ...p, scriptType: e.target.value }))}
          />
          <Input
            label="Versao"
            value={form.version}
            onChange={(e) => setForm((p) => ({ ...p, version: e.target.value }))}
          />
          <Input
            label="ExecutionFrequency"
            value={form.executionFrequency}
            onChange={(e) => setForm((p) => ({ ...p, executionFrequency: e.target.value }))}
            hint="Frequência declarada no catálogo (ex.: manual, diária). É informativa: quem agenda a execução é a tarefa de automação, não este campo."
          />
          <Input
            label="TriggerModes (csv)"
            value={form.triggerModesCsv}
            onChange={(e) => setForm((p) => ({ ...p, triggerModesCsv: e.target.value }))}
            hint="Como o script é disparado, separado por vírgula (ex.: manual, agent-checkin). Também é metadado: o disparo real vem dos gatilhos da tarefa."
          />
          <Select
            label="Status"
            options={[
              { value: "true", label: "Ativo" },
              { value: "false", label: "Inativo" },
            ]}
            value={String(form.isActive)}
            onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.value === "true" }))}
          />
        </div>
        <div className="mt-3 space-y-3">
          <ScriptContentEditor
            label="Conteudo do script"
            scriptType={form.scriptType}
            value={form.content}
            onChange={(content) => setForm((p) => ({ ...p, content }))}
            hint="A apresentacao (sintaxe, indentacao e modelo) acompanha o tipo de script selecionado."
          />
          <TextArea
            label="ParametersSchemaJson"
            className="font-mono"
            value={form.parametersSchemaJson}
            onChange={(e) => setForm((p) => ({ ...p, parametersSchemaJson: e.target.value }))}
            hint="Opcional. JSON Schema dos parâmetros do script. É repassado ao agente junto do conteúdo; deixe vazio quando o script não recebe parâmetros."
          />
          <TextArea
            label="MetadataJson"
            className="font-mono"
            value={form.metadataJson}
            onChange={(e) => setForm((p) => ({ ...p, metadataJson: e.target.value }))}
            hint="Opcional. JSON livre para anotações do script (autor, origem, tags). É repassado ao agente sem interpretação."
          />
          {editing && editingId ? <CustomFieldsUsedByPanel scriptId={editingId} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editing ? "Salvar" : "Criar"}
            </Button>
          </div>
        </div>
      </Modal>

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
              hint="Somente leitura — use 'Editar' na lista para alterar o conteúdo."
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
              hint="Anotações livres do script (autor, origem, tags)."
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
