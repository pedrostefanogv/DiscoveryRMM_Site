import { useMemo, useState } from "react";
import { ArrowRight, Building2, Globe, Link2, Plus, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  useDepartments,
  useCreateDepartment,
  useGlobalDepartments,
} from "@/hooks/useDepartments";
import { useClients } from "@/hooks/useClients";
import { buildInheritanceOptions, parseDepartmentValidationErrors } from "@/api";
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

/** Valor do filtro: todos os escopos (é o default da listagem). */
export const ALL_DEPARTMENTS_SCOPE = "";
/** Valor do filtro: apenas departamentos globais (ClientId nulo). */
export const GLOBAL_DEPARTMENTS_SCOPE = "__global__";

/**
 * Opções do filtro de escopo.
 *
 * A listagem é filtrada no client: GET /departments sem clientId devolve todos
 * os departamentos (globais + clientes). Antes o rótulo dizia "Global + todos
 * os clientes" mas o parâmetro ia vazio — e o backend devolvia só os globais.
 */
export function buildDepartmentScopeOptions(
  clients: Array<{ id: string; name: string }>,
): { value: string; label: string }[] {
  return [
    { value: ALL_DEPARTMENTS_SCOPE, label: "Todos os departamentos (globais + clientes)" },
    { value: GLOBAL_DEPARTMENTS_SCOPE, label: "Somente globais (sem cliente)" },
    ...clients.map((client) => ({ value: client.id, label: client.name })),
  ];
}

/**
 * Parâmetros da listagem que alimenta o filtro de escopo.
 *
 * `allClients` é obrigatório aqui: sem ele a API devolve apenas os globais e
 * qualquer filtro por cliente apareceria vazio (D11).
 */
export const DEPARTMENT_LIST_PARAMS = {
  includeGlobal: true,
  activeOnly: false,
  allClients: true,
} as const;

/** Aplica o filtro de escopo sobre a lista já carregada. */
export function filterDepartmentsByScope<T extends { clientId: string | null }>(
  departments: T[],
  scope: string,
): T[] {
  if (scope === GLOBAL_DEPARTMENTS_SCOPE) {
    return departments.filter((department) => !department.clientId);
  }
  // "" = todos os escopos: é exatamente o que a API devolve sem clientId.
  if (!scope) return departments;
  return departments.filter((department) => department.clientId === scope);
}

export default function DepartmentSettings() {
  const navigate = useNavigate();

  const [scope, setScope] = useState(ALL_DEPARTMENTS_SCOPE);
  const [searchTerm, setSearchTerm] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // Uma única consulta pede TODOS os escopos (allClients) e o filtro é aplicado
  // sobre a lista, então o rótulo sempre bate com o exibido. Sem allClients a
  // API devolveria apenas os globais (D11).
  const depts = useDepartments(DEPARTMENT_LIST_PARAMS);
  const clients = useClients();

  const clientsById = useMemo(
    () => new Map((clients.data ?? []).map((client) => [client.id, client.name])),
    [clients.data],
  );

  const scopeOpts = useMemo(
    () => buildDepartmentScopeOptions(clients.data ?? []),
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

  const departmentsById = useMemo(
    () => new Map(sortedDepartments.map((department) => [department.id, department])),
    [sortedDepartments],
  );

  const scopedDepartments = useMemo(
    () => filterDepartmentsByScope(sortedDepartments, scope),
    [scope, sortedDepartments],
  );

  const filteredDepartments = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("pt-BR");
    if (!term) return scopedDepartments;

    return scopedDepartments.filter((department) => {
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
  }, [clientsById, searchTerm, scopedDepartments]);

  const totalDepartments = scopedDepartments.length;
  const globalDepartments = scopedDepartments.filter(
    (department) => !department.clientId,
  ).length;
  const clientDepartments = totalDepartments - globalDepartments;
  const inactiveDepartments = scopedDepartments.filter(
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
            label="Filtrar por escopo"
            options={scopeOpts}
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            hint="A lista mostra exatamente o escopo escolhido."
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
            <p className="rounded-xl border border-border bg-surface-light px-4 py-5 text-center text-sm text-muted">
              Nenhum departamento encontrado para o filtro atual.
            </p>
          )}

          {totalDepartments > 0 && filteredDepartments.length === 0 && (
            <div className="rounded-xl border border-border bg-surface-light px-4 py-5 text-sm text-muted">
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
            const inheritedFrom = department.inheritFromGlobalId
              ? departmentsById.get(department.inheritFromGlobalId)
              : null;

            return (
              <button
                key={department.id}
                type="button"
                onClick={() => navigate(`/tickets/departments/${department.id}`)}
                className="group flex w-full items-center gap-4 rounded-xl border border-border bg-surface-light px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-surface-hover"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface/60 ring-1 ring-black/15 dark:ring-white/10">
                  {department.clientId ? (
                    <Building2 className="h-5 w-5 text-accent" />
                  ) : (
                    <Globe className="h-5 w-5 text-primary" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{department.name}</p>
                    <Badge color={department.clientId ? "accent" : "slate"}>
                      {clientName ?? "Global"}
                    </Badge>
                    <Badge color={department.isActive ? "success" : "warning"}>
                      {department.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                    {department.inheritFromGlobalId && (
                      <Badge color="primary">
                        <Link2 className="mr-1 h-3 w-3" />
                        herda de {inheritedFrom?.name ?? "global"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">
                    {department.description || "Sem descrição"}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted">Ordem</p>
                  <p className="text-sm font-semibold text-foreground">#{department.sortOrder}</p>
                </div>

                <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
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
  // Só consulta os globais quando o modal abre (evita request na listagem).
  const globals = useGlobalDepartments(open);
  const [form, setForm] = useState<CreateDepartmentRequest>({ ...EMPTY_CREATE_FORM });
  const [createErrors, setCreateErrors] = useState<string[]>([]);

  const clientOpts = useMemo(
    () => [
      { value: "", label: "Global (sem cliente)" },
      ...clients.map((client) => ({ value: client.id, label: client.name })),
    ],
    [clients],
  );

  // Departamento global não herda: só listamos os globais quando há cliente.
  const isGlobalScope = !form.clientId;
  const inheritanceOptions = useMemo(
    () => buildInheritanceOptions(globals.data, null),
    [globals.data],
  );

  const valid = form.name.trim().length >= 2;

  function closeAndReset() {
    onClose();
    setForm({ ...EMPTY_CREATE_FORM });
    setCreateErrors([]);
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
        // null explícito = sem herança (não é "campo ausente").
        inheritFromGlobalId: isGlobalScope ? null : form.inheritFromGlobalId ?? null,
        sortOrder: Math.max(0, Number(form.sortOrder || 0)),
      });
      toast.success("Departamento criado com sucesso.");
      closeAndReset();
      onCreated(created);
    } catch (error) {
      const validation = parseDepartmentValidationErrors(
        error,
        "Erro ao criar departamento (nome duplicado?).",
      );
      setCreateErrors(validation.messages);
      toast.error(validation.messages[0] ?? "Erro ao criar departamento.");
    }
  }

  return (
    <Modal open={open} onClose={closeAndReset} title="Novo departamento" maxWidth="max-w-xl">
      <div className="space-y-4">
        <Select
          label="Cliente"
          options={clientOpts}
          value={form.clientId ?? ""}
          onChange={(event) => {
            const nextClientId = event.target.value || null;
            setCreateErrors([]);
            setForm((current) => ({
              ...current,
              clientId: nextClientId,
              // Global não herda: limpa a herança ao trocar para escopo global.
              inheritFromGlobalId: nextClientId ? current.inheritFromGlobalId : null,
            }));
          }}
        />
        <Select
          label="Herdar de (opcional)"
          options={inheritanceOptions}
          value={form.inheritFromGlobalId ?? ""}
          disabled={isGlobalScope || globals.isLoading}
          hint={
            isGlobalScope
              ? "Departamento global não herda de outro departamento."
              : "Apenas departamentos globais. Globais inativos aparecem como (inativo) e não podem ser escolhidos. \"Nenhum\" cria sem herança."
          }
          onChange={(event) => {
            setCreateErrors([]);
            setForm((current) => ({
              ...current,
              inheritFromGlobalId: event.target.value || null,
            }));
          }}
        />
        {createErrors.length > 0 && (
          <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
            <p className="font-medium text-danger">Não foi possível criar o departamento</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              {createErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}
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
