import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Copy,
  Globe,
  ListTodo,
  Settings,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { DepartmentCustomFieldsSection } from "@/components/configuration/DepartmentCustomFieldsSection";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Input,
  Loading,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { useClients } from "@/hooks/useClients";
import {
  useDeleteDepartment,
  useDepartment,
  useUpdateDepartment,
} from "@/hooks/useDepartments";
import type { UpdateDepartmentRequest } from "@/api";

type DepartmentTab = "general" | "fields";

export default function DepartmentDetailPage() {
  const navigate = useNavigate();
  const { departmentId = "" } = useParams();

  const departmentQuery = useDepartment(departmentId);
  const clientsQuery = useClients();

  const updateDepartment = useUpdateDepartment();
  const deleteDepartment = useDeleteDepartment();

  const [tab, setTab] = useState<DepartmentTab>("general");
  const [form, setForm] = useState<UpdateDepartmentRequest | null>(null);

  const clientsById = useMemo(
    () => new Map((clientsQuery.data ?? []).map((client) => [client.id, client.name])),
    [clientsQuery.data],
  );

  useEffect(() => {
    if (!departmentQuery.data) return;

    setForm({
      name: departmentQuery.data.name,
      description: departmentQuery.data.description,
      inheritFromGlobalId: departmentQuery.data.inheritFromGlobalId,
      sortOrder: departmentQuery.data.sortOrder,
      isActive: departmentQuery.data.isActive,
    });
  }, [departmentQuery.data]);

  if (!departmentId) {
    return (
      <ErrorDisplay
        message="Departamento inválido."
        onRetry={() => navigate("/tickets/departments")}
      />
    );
  }

  if (departmentQuery.isLoading) {
    return <Loading message="Carregando detalhes do departamento..." />;
  }

  if (departmentQuery.isError || !departmentQuery.data || !form) {
    return (
      <ErrorDisplay
        message="Não foi possível carregar o departamento solicitado."
        onRetry={() => void departmentQuery.refetch()}
      />
    );
  }

  const department = departmentQuery.data;
  const clientName = department.clientId
    ? clientsById.get(department.clientId) ?? "Cliente"
    : null;

  const valid = form.name.trim().length >= 2;

  async function handleCopyUrl() {
    const url = `${window.location.origin}/tickets/departments/${department.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copiada para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar automaticamente a URL.");
    }
  }

  async function handleSave() {
    const currentForm = form;
    if (!currentForm) return;

    if (!valid) {
      toast.error("Informe um nome com ao menos 2 caracteres.");
      return;
    }

    try {
      await updateDepartment.mutateAsync({
        id: department.id,
        data: {
          ...currentForm,
          name: currentForm.name.trim(),
          description: currentForm.description?.trim() || null,
          inheritFromGlobalId: currentForm.inheritFromGlobalId ?? null,
          sortOrder: Math.max(0, Number(currentForm.sortOrder || 0)),
          isActive: currentForm.isActive ?? true,
        },
      });
      toast.success("Departamento atualizado com sucesso.");
      void departmentQuery.refetch();
    } catch {
      toast.error("Erro ao atualizar departamento.");
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Excluir departamento \"${department.name}\"?`)) {
      return;
    }

    try {
      await deleteDepartment.mutateAsync(department.id);
      toast.success("Departamento excluído com sucesso.");
      navigate("/tickets/departments");
    } catch {
      toast.error("Erro ao excluir departamento.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <button
          type="button"
          onClick={() => navigate("/tickets")}
          className="transition-colors hover:text-muted-foreground"
        >
          Suporte
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <button
          type="button"
          onClick={() => navigate("/tickets/departments")}
          className="transition-colors hover:text-muted-foreground"
        >
          Departamentos
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-muted-foreground">{department.name}</span>
      </div>

      <PageHeader
        title={department.name}
        description="Detalhes do departamento com URL direta para consulta e configuração."
      >
        <Button variant="ghost" onClick={() => navigate("/tickets/departments")}>
          <ArrowLeft className="h-4 w-4" />
          Voltar para listagem
        </Button>
        <Button variant="secondary" onClick={() => void handleCopyUrl()}>
          <Copy className="h-4 w-4" />
          Copiar URL
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={department.clientId ? Building2 : Globe}
          label="Escopo"
          value={clientName ?? "Global"}
          tone={department.clientId ? "accent" : "primary"}
        />
        <StatCard
          icon={Building2}
          label="Ordem"
          value={`#${department.sortOrder}`}
          tone="warning"
        />
        <StatCard
          icon={Settings}
          label="Status"
          value={department.isActive ? "Ativo" : "Inativo"}
          tone={department.isActive ? "success" : "warning"}
        />
        <StatCard
          icon={ListTodo}
          label="Identificador"
          value={department.id.slice(0, 8)}
          tone="primary"
        />
      </div>

      <div className="inline-flex rounded-xl border border-border bg-surface-light p-1">
        <button
          type="button"
          onClick={() => setTab("general")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "general"
              ? "bg-primary/20 text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          <Settings className="mr-1.5 inline h-4 w-4" />
          Geral
        </button>
        <button
          type="button"
          onClick={() => setTab("fields")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "fields"
              ? "bg-primary/20 text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          <ListTodo className="mr-1.5 inline h-4 w-4" />
          Campos customizados
        </button>
      </div>

      {tab === "general" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <Card>
            <CardHeader
              title="Dados do departamento"
              subtitle="Atualize os dados principais e salve nesta própria URL."
            />
            <div className="space-y-4">
              <Input
                label="Nome *"
                value={form.name}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          name: event.target.value,
                        }
                      : current,
                  )
                }
              />

              <Input
                label="Descrição"
                value={form.description ?? ""}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          description: event.target.value || null,
                        }
                      : current,
                  )
                }
                placeholder="Contexto operacional e regras deste departamento"
              />

              <Input
                label="Ordem"
                type="number"
                min="0"
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          sortOrder: Math.max(0, Number(event.target.value || 0)),
                        }
                      : current,
                  )
                }
              />

              <div className="rounded-xl border border-border bg-surface-light px-4 py-3 text-sm text-muted-foreground">
                <p className="text-xs uppercase tracking-wide text-muted">Cliente vinculado</p>
                <p className="mt-1 text-foreground">{clientName ?? "Global"}</p>
                <p className="mt-1 text-xs text-muted">
                  O escopo cliente/global nao pode ser alterado por este endpoint.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            isActive: event.target.checked,
                          }
                        : current,
                    )
                  }
                  className="rounded border-border bg-surface-light"
                />
                Ativo
              </label>

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <Button
                  onClick={() => void handleSave()}
                  loading={updateDepartment.isPending}
                  disabled={!valid}
                >
                  Salvar alterações
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Zona de risco" subtitle="Ação irreversível." />
            <div className="space-y-4">
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-danger">Excluir departamento</p>
                <p className="mt-1 text-muted">
                  Os valores já preenchidos em chamados permanecem, mas o departamento deixa de
                  existir para novos fluxos.
                </p>
              </div>

              <Button
                variant="danger"
                onClick={() => void handleDelete()}
                loading={deleteDepartment.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Excluir departamento
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader
            title="Campos customizados"
            subtitle="Defina quais campos aparecem na abertura de chamados deste departamento."
          />
          <DepartmentCustomFieldsSection departmentId={department.id} />
        </Card>
      )}

      {!clientsQuery.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Badge color="slate">URL direta</Badge>
          <span>{`/tickets/departments/${department.id}`}</span>
        </div>
      )}
    </div>
  );
}
