import { useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Badge, Button, Card, CardHeader, DataTable, ErrorDisplay, Input, Loading, Modal, PageHeader, Select, type Column } from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import { useSites } from "@/hooks/useSites";
import {
  useCreatePatchApproval,
  useDeletePatchApproval,
  usePatchApprovalAudit,
  usePatchApprovals,
} from "@/hooks/usePatches";
import type { PatchApproval, PatchApprovalAudit, PatchApprovalScopeType } from "@/api/types";
import { formatPatchDate } from "./patchesUtils";

const SCOPE_OPTIONS: Array<{ value: PatchApprovalScopeType | ""; label: string }> = [
  { value: "", label: "Todos os escopos" },
  { value: "Global", label: "Global" },
  { value: "Client", label: "Cliente" },
  { value: "Site", label: "Site" },
  { value: "Agent", label: "Agente" },
];

const CREATE_SCOPE_OPTIONS = SCOPE_OPTIONS.filter((option) => option.value !== "");

export default function PatchesApprovals() {
  const [tab, setTab] = useState<"rules" | "audit">("rules");
  const [scopeType, setScopeType] = useState<PatchApprovalScopeType | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const [formScope, setFormScope] = useState<PatchApprovalScopeType>("Global");
  const [formClientId, setFormClientId] = useState("");
  const [formSiteId, setFormSiteId] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formUpdateKey, setFormUpdateKey] = useState("");
  const [formAction, setFormAction] = useState<"Approve" | "Deny">("Approve");
  const [formReason, setFormReason] = useState("");

  const clients = useClients();
  const sites = useSites(formClientId || undefined);
  const approvals = usePatchApprovals({
    scopeType: scopeType || undefined,
    search: searchApplied || undefined,
  });
  const audit = usePatchApprovalAudit();
  const createApproval = useCreatePatchApproval();
  const deleteApproval = useDeletePatchApproval();

  const clientOptions = useMemo(
    () => [{ value: "", label: "Selecione um cliente..." }, ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name }))],
    [clients.data],
  );
  const siteOptions = useMemo(
    () => [{ value: "", label: "Selecione um site..." }, ...(sites.data ?? []).map((site) => ({ value: site.id, label: site.name }))],
    [sites.data],
  );

  const formScopeId = formScope === "Global"
    ? null
    : formScope === "Client"
      ? formClientId || null
      : formScope === "Site"
        ? formSiteId || null
        : formAgentId || null;

  const handleCreate = async () => {
    if (!formUpdateKey.trim()) {
      toast.error("Informe a chave da atualização (kb:KBxxxx ou guid:...).");
      return;
    }
    if (formScope !== "Global" && !formScopeId) {
      toast.error("Selecione o escopo da aprovação.");
      return;
    }
    try {
      await createApproval.mutateAsync({
        scopeType: formScope,
        scopeId: formScopeId,
        updateKey: formUpdateKey.trim(),
        action: formAction,
        reason: formReason.trim() || null,
      });
      toast.success("Aprovação salva.");
      setCreateOpen(false);
      setFormUpdateKey("");
      setFormReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar aprovação.");
    }
  };

  const handleDelete = async (rule: PatchApproval) => {
    try {
      await deleteApproval.mutateAsync(rule.id);
      toast.success("Aprovação removida.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover aprovação.");
    }
  };

  const ruleColumns: Column<PatchApproval>[] = [
    { key: "scope", header: "Escopo", render: (rule) => <Badge color="slate">{rule.scopeType}</Badge> },
    { key: "update", header: "Atualização", render: (rule) => <span className="font-mono text-xs">{rule.updateKey}</span> },
    {
      key: "action",
      header: "Ação",
      render: (rule) => (
        <Badge color={rule.action === "Deny" ? "danger" : "success"}>
          {rule.action === "Deny" ? "Recusar" : "Aprovar"}
        </Badge>
      ),
    },
    { key: "reason", header: "Motivo", render: (rule) => rule.reason ?? "—" },
    { key: "updated", header: "Atualizada", render: (rule) => formatPatchDate(rule.updatedAt) },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (rule) => (
        <Button size="sm" variant="danger" onClick={() => void handleDelete(rule)} disabled={deleteApproval.isPending}>
          <Trash2 className="h-4 w-4" />
          Remover
        </Button>
      ),
    },
  ];

  const auditColumns: Column<PatchApprovalAudit>[] = [
    { key: "when", header: "Quando", render: (item) => formatPatchDate(item.changedAt) },
    { key: "change", header: "Mudança", render: (item) => item.changeType },
    { key: "scope", header: "Escopo", render: (item) => item.scopeType },
    { key: "update", header: "Atualização", render: (item) => <span className="font-mono text-xs">{item.updateKey}</span> },
    { key: "action", header: "Ação", render: (item) => item.newAction ?? item.oldAction ?? "—" },
    { key: "reason", header: "Motivo", render: (item) => item.reason ?? "—" },
    { key: "by", header: "Por", render: (item) => item.changedBy ?? "—" },
  ];

  if (clients.isLoading) return <Loading />;
  if (clients.isError) return <ErrorDisplay onRetry={() => clients.refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Aprovações de atualizações" description="Aprove ou recuse KBs por escopo (Global → Cliente → Site → Agente).">
        <Button variant="secondary" onClick={() => void (tab === "rules" ? approvals.refetch() : audit.refetch())}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Nova aprovação
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-lg border border-border p-1">
          <Button size="sm" variant={tab === "rules" ? "primary" : "ghost"} onClick={() => setTab("rules")}>Aprovações</Button>
          <Button size="sm" variant={tab === "audit" ? "primary" : "ghost"} onClick={() => setTab("audit")}>Auditoria</Button>
        </div>
        {tab === "rules" && (
          <>
            <Select
              label="Escopo"
              fullWidth={false}
              value={scopeType}
              onChange={(event) => setScopeType(event.target.value as PatchApprovalScopeType | "")}
              options={SCOPE_OPTIONS}
            />
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setSearchApplied(searchInput.trim());
              }}
            >
              <Input label="Buscar" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="KB ou motivo" />
              <Button type="submit" variant="secondary">Buscar</Button>
            </form>
          </>
        )}
      </div>

      {tab === "rules" ? (
        approvals.isLoading ? (
          <Loading />
        ) : approvals.isError ? (
          <ErrorDisplay onRetry={() => approvals.refetch()} />
        ) : (
          <Card>
            <CardHeader title="Regras de aprovação" subtitle="A regra mais específica vence; Deny vence Approve em empate." />
            <DataTable columns={ruleColumns} data={approvals.data ?? []} keyExtractor={(rule) => rule.id} emptyMessage="Nenhuma aprovação cadastrada" />
          </Card>
        )
      ) : audit.isLoading ? (
        <Loading />
      ) : audit.isError ? (
        <ErrorDisplay onRetry={() => audit.refetch()} />
      ) : (
        <Card>
          <CardHeader title="Auditoria de aprovações" subtitle="Histórico imutável de criação/alteração/remoção." />
          <DataTable columns={auditColumns} data={audit.data ?? []} keyExtractor={(item) => item.id} emptyMessage="Nenhum evento de auditoria" />
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nova aprovação de patch" maxWidth="max-w-xl">
        <div className="space-y-3">
          <Select
            label="Escopo"
            value={formScope}
            onChange={(event) => setFormScope(event.target.value as PatchApprovalScopeType)}
            options={CREATE_SCOPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          />
          {formScope === "Client" && (
            <Select label="Cliente" value={formClientId} onChange={(event) => setFormClientId(event.target.value)} options={clientOptions} />
          )}
          {formScope === "Site" && (
            <>
              <Select label="Cliente" value={formClientId} onChange={(event) => { setFormClientId(event.target.value); setFormSiteId(""); }} options={clientOptions} />
              <Select label="Site" value={formSiteId} onChange={(event) => setFormSiteId(event.target.value)} options={siteOptions} />
            </>
          )}
          {formScope === "Agent" && (
            <Input label="ID do agente" value={formAgentId} onChange={(event) => setFormAgentId(event.target.value)} placeholder="UUID do agente" />
          )}
          <Input
            label="Chave da atualização"
            value={formUpdateKey}
            onChange={(event) => setFormUpdateKey(event.target.value)}
            placeholder="kb:KB5034441 ou guid:<uuid>:<revisão>"
          />
          <Select
            label="Ação"
            value={formAction}
            onChange={(event) => setFormAction(event.target.value === "Deny" ? "Deny" : "Approve")}
            options={[{ value: "Approve", label: "Aprovar" }, { value: "Deny", label: "Recusar" }]}
          />
          <Input label="Motivo" value={formReason} onChange={(event) => setFormReason(event.target.value)} placeholder="Obrigatório na prática (auditoria)" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleCreate()} disabled={createApproval.isPending}>Salvar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
