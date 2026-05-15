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
  type CreateAutomationScriptRequest,
  type UpdateAutomationScriptRequest,
  type AutomationScriptSummary,
} from "@/api";
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
  const [offset, setOffset] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [auditScriptId, setAuditScriptId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AutomationScriptSummary | null>(null);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState<ScriptFormState>(defaultForm);

  const list = useAutomationScripts({
    clientId: clientId || undefined,
    activeOnly,
    limit,
    offset,
  });

  const createMutation = useCreateAutomationScript();
  const updateMutation = useUpdateAutomationScript();
  const deleteMutation = useDeleteAutomationScript();
  const consumeMutation = useConsumeAutomationScript();
  const auditQuery = useAutomationScriptAudit(auditScriptId ?? "", 50, !!auditScriptId);
  const scriptDetail = useAutomationScript(editingId);

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

  const total = list.data?.total ?? 0;
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const columns = useMemo<Column<AutomationScriptSummary>[]>(
    () => [
      {
        key: "name",
        header: "Nome",
        render: (item) => (
          <div>
            <p className="font-medium text-white">{item.name}</p>
            <p className="text-xs text-slate-500">{item.summary}</p>
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
              onClick={async () => {
                try {
                  const data = await consumeMutation.mutateAsync(item.id);
                  toast.success(`Payload consumido (${data.contentHashSha256.slice(0, 10)}...)`);
                } catch {
                  toast.error("Falha ao consumir script");
                }
              }}
            >
              Consumir
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
    [consumeMutation, deleteMutation],
  );

  const clientOptions = [
    { value: "", label: "Todos os clientes" },
    ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

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
          <h1 className="text-2xl font-bold text-white">Scripts de Automação</h1>
          <p className="text-sm text-slate-400">Catálogo de scripts reutilizaveis.</p>
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
              setOffset(0);
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
              setOffset(0);
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
              setOffset(0);
            }}
          />
          <Input
            label="Offset"
            type="number"
            min={0}
            value={String(offset)}
            onChange={(e) => setOffset(Math.max(0, Number(e.target.value || 0)))}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Scripts"
          subtitle={`${list.data?.count ?? 0} itens retornados de ${total} total`}
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
              <Button size="sm" variant="secondary" disabled={!canPrev} onClick={() => setOffset((x) => Math.max(0, x - limit))}>
                Anterior
              </Button>
              <Button size="sm" variant="secondary" disabled={!canNext} onClick={() => setOffset((x) => x + limit)}>
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
          />
          <Input
            label="TriggerModes (csv)"
            value={form.triggerModesCsv}
            onChange={(e) => setForm((p) => ({ ...p, triggerModesCsv: e.target.value }))}
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
          <TextArea
            label="Conteudo"
            className="min-h-40 font-mono"
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
          />
          <TextArea
            label="ParametersSchemaJson"
            className="font-mono"
            value={form.parametersSchemaJson}
            onChange={(e) => setForm((p) => ({ ...p, parametersSchemaJson: e.target.value }))}
          />
          <TextArea
            label="MetadataJson"
            className="font-mono"
            value={form.metadataJson}
            onChange={(e) => setForm((p) => ({ ...p, metadataJson: e.target.value }))}
          />
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
        open={!!auditScriptId}
        onClose={() => setAuditScriptId(null)}
        title="Auditoria do script"
        maxWidth="max-w-3xl"
      >
        {auditQuery.isLoading && <Loading message="Carregando auditoria..." />}
        {auditQuery.isError && <ErrorDisplay onRetry={() => auditQuery.refetch()} />}
        {!auditQuery.isLoading && !auditQuery.isError && (
          <div className="space-y-3">
            {(auditQuery.data ?? []).map((entry) => (
              <div key={entry.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge color="accent">{String(entry.changeType)}</Badge>
                  <p className="text-xs text-slate-500">{new Date(entry.changedAt).toLocaleString("pt-BR")}</p>
                </div>
                <p className="text-sm text-slate-300">Motivo: {entry.reason || "-"}</p>
                <p className="text-xs text-slate-500">Correlation: {entry.correlationId || "-"}</p>
              </div>
            ))}
            {!auditQuery.data?.length && (
              <p className="text-sm text-slate-400">Nenhum evento de auditoria encontrado.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
