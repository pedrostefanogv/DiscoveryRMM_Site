import { useMemo, useState } from "react";
import { ArrowRight, Building2, Globe, Plus, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useDepartments, useCreateDepartment } from "@/hooks/useDepartments";
import { useClients } from "@/hooks/useClients";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorDisplay,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select,
  StatCard,
} from "@/components/ui";
import type { CreateDepartmentRequest, Department } from "@/api";

const EMPTY_CREATE_FORM: CreateDepartmentRequest = {
  clientId: null,
  name: "",
  description: null,
  inheritFromGlobalId: null,
  sortOrder: 0,
};

export default function DepartmentSettings() {
  const navigate = useNavigate();

  const [clientId, setClientId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const depts = useDepartments({
    clientId: clientId || undefined,
    includeGlobal: true,
    activeOnly: false,
  });
  const clients = useClients();

  const clientsById = useMemo(
    () => new Map((clients.data ?? []).map((client) => [client.id, client.name])),
    [clients.data],
  );

  const clientOpts = useMemo(
    () => [
      { value: "", label: "Global + todos os clientes" },
      ...(clients.data ?? []).map((client) => ({
        value: client.id,
        label: client.name,
      })),
    ],
    [clients.data],
  );

  const sortedDepartments = useMemo(
    () =>
      [...(depts.data ?? [])].sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }
        return left.name.localeCompare(right.name);
      }),
    [depts.data],
  );

  const filteredDepartments = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("pt-BR");
    if (!term) return sortedDepartments;

    return sortedDepartments.filter((department) => {
      const clientName = department.clientId
        ? clientsById.get(department.clientId) ?? ""
        : "global";

      return [
        department.name,
        department.description ?? "",
        clientName,
        String(department.sortOrder),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term);
    });
  }, [clientsById, searchTerm, sortedDepartments]);

  const totalDepartments = sortedDepartments.length;
  const globalDepartments = sortedDepartments.filter(
    (department) => !department.clientId,
  ).length;
  const clientDepartments = totalDepartments - globalDepartments;
  const inactiveDepartments = sortedDepartments.filter(
    (department) => !department.isActive,
  ).length;

  if (depts.isLoading) {
    return <Loading message="Carregando departamentos..." />;
  }

  if (depts.isError) {
    return (
      <ErrorDisplay
        onRetry={() => {
          void depts.refetch();
          void clients.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departamentos"
        description="Estruture atendimento por cliente e mantenha cada departamento com uma URL própria para consulta e configuração."
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo departamento
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Building2} label="Total" value={totalDepartments} tone="primary" />
        <StatCard icon={Globe} label="Globais" value={globalDepartments} tone="accent" />
        <StatCard icon={Users} label="Por cliente" value={clientDepartments} tone="success" />
        <StatCard icon={Building2} label="Inativos" value={inactiveDepartments} tone="warning" />
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
          <Select
            label="Filtrar por cliente"
            options={clientOpts}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          />
          <Input
            label="Buscar departamento"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Nome, descrição, cliente ou ordem"
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Listagem de departamentos"
          subtitle={`Mostrando ${filteredDepartments.length} de ${totalDepartments} departamento(s)`}
        />

        <div className="space-y-2">
          {totalDepartments === 0 && (
            <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-center text-sm text-slate-500">
              Nenhum departamento encontrado para o filtro atual.
            </p>
          )}

          {totalDepartments > 0 && filteredDepartments.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-400">
              <p>Nenhum departamento encontrado para a busca atual.</p>
              <div className="mt-2">
                <Button size="sm" variant="ghost" onClick={() => setSearchTerm("")}>
                  Limpar busca
                </Button>
              </div>
            </div>
          )}

          {filteredDepartments.map((department) => {
            const clientName = department.clientId
              ? clientsById.get(department.clientId) ?? "Cliente"
              : null;

            return (
              <button
                key={department.id}
                type="button"
                onClick={() => navigate(`/tickets/departments/${department.id}`)}
                className="group flex w-full items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-white/10"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900/60 ring-1 ring-white/10">
                  {department.clientId ? (
                    <Building2 className="h-5 w-5 text-accent" />
                  ) : (
                    <Globe className="h-5 w-5 text-primary" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">{department.name}</p>
                    <Badge color={department.clientId ? "accent" : "slate"}>
                      {clientName ?? "Global"}
                    </Badge>
                    <Badge color={department.isActive ? "success" : "warning"}>
                      {department.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">
                    {department.description || "Sem descrição"}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-500">Ordem</p>
                  <p className="text-sm font-semibold text-slate-200">#{department.sortOrder}</p>
                </div>

                <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            );
          })}
        </div>
      </Card>

      <CreateDepartmentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        clients={clients.data ?? []}
        onCreated={(department) => navigate(`/tickets/departments/${department.id}`)}
      />
    </div>
  );
}

function CreateDepartmentModal({
  open,
  onClose,
  clients,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clients: Array<{ id: string; name: string }>;
  onCreated: (department: Department) => void;
}) {
  const create = useCreateDepartment();
  const [form, setForm] = useState<CreateDepartmentRequest>({ ...EMPTY_CREATE_FORM });

  const clientOpts = useMemo(
    () => [
      { value: "", label: "Global (sem cliente)" },
      ...clients.map((client) => ({ value: client.id, label: client.name })),
    ],
    [clients],
  );

  const valid = form.name.trim().length >= 2;

  function closeAndReset() {
    onClose();
    setForm({ ...EMPTY_CREATE_FORM });
  }

  async function handleSubmit() {
    if (!valid) {
      toast.error("Informe um nome com ao menos 2 caracteres.");
      return;
    }

    try {
      const created = await create.mutateAsync({
        clientId: form.clientId,
        name: form.name.trim(),
        description: form.description?.trim() || null,
        inheritFromGlobalId: null,
        sortOrder: Math.max(0, Number(form.sortOrder || 0)),
      });
      toast.success("Departamento criado com sucesso.");
      closeAndReset();
      onCreated(created);
    } catch {
      toast.error("Erro ao criar departamento (nome duplicado?).");
    }
  }

  return (
    <Modal open={open} onClose={closeAndReset} title="Novo departamento" maxWidth="max-w-xl">
      <div className="space-y-4">
        <Select
          label="Cliente"
          options={clientOpts}
          value={form.clientId ?? ""}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              clientId: event.target.value || null,
            }))
          }
        />
        <Input
          label="Nome *"
          value={form.name}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              name: event.target.value,
            }))
          }
          placeholder="Ex: Financeiro"
        />
        <Input
          label="Descrição"
          value={form.description ?? ""}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              description: event.target.value || null,
            }))
          }
          placeholder="Contexto operacional do departamento"
        />
        <Input
          label="Ordem"
          type="number"
          min="0"
          value={form.sortOrder}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              sortOrder: Math.max(0, Number(event.target.value || 0)),
            }))
          }
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={closeAndReset}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} loading={create.isPending} disabled={!valid}>
            Criar e abrir detalhes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
