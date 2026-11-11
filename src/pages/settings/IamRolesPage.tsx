import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import toast from "react-hot-toast";
import { Icon,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  ErrorDisplay,
  Input,
  Loading,
  Modal,
  PermissionMultiSelect,
  Select,
  type Column,
  type PermissionOption,

PageHeader,
} from "@/components/ui";
import {
  type CreateRoleRequest,
  type MfaRequirement,
  type PermissionDto,
  type RoleDto,
  type UpdateRoleRequest,
} from "@/api";
import {
  useBulkAddIamRolePermissions,
  useBulkRemoveIamRolePermissions,
  useCreateIamRole,
  useDeleteIamRole,
  useIamPermissionsCatalog,
  useIamRolePermissions,
  useIamRoles,
  useRemoveIamRolePermission,
  useUpdateIamRole,
} from "@/hooks";
import { ApiError } from "@/api";
import { useAuthorization } from "@/auth/authorization";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

type PermissionLike = PermissionDto & Record<string, unknown>;

function readString(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function getPermissionId(permission: PermissionLike) {
  return readString(permission, "id", "permissionId");
}

function getPermissionCode(permission: PermissionLike) {
  return readString(
    permission,
    "code",
    "permissionCode",
    "key",
    "slug",
  );
}

function getPermissionName(permission: PermissionLike) {
  return readString(
    permission,
    "name",
    "displayName",
    "title",
    "label",
    "description",
  );
}

function getPermissionLabel(permission: PermissionLike) {
  const code = getPermissionCode(permission);
  const name = getPermissionName(permission);

  if (code && name && code !== name) {
    return `${code} - ${name}`;
  }

  if (name) return name;
  if (code) return code;

  return getPermissionId(permission) || "Permissão sem identificação";
}

const MFA_REQUIREMENT_OPTIONS: Array<{ value: MfaRequirement; label: string }> = [
  { value: "None", label: "Nenhum (None)" },
  { value: "Totp", label: "OTP/TOTP" },
  { value: "Fido2", label: "FIDO2" },
];

function getMfaRequirementLabel(value: MfaRequirement) {
  return MFA_REQUIREMENT_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export default function IamRolesPage() {
  const rolesQuery = useIamRoles();
  const permissionsCatalogQuery = useIamPermissionsCatalog();

  const createRole = useCreateIamRole();
  const updateRole = useUpdateIamRole();
  const deleteRole = useDeleteIamRole();

  const [selectedRole, setSelectedRole] = useState<RoleDto | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoleDto | null>(null);

  const { hasAnyPermission } = useAuthorization();
  const canWrite = hasAnyPermission(["roles.write", "roles.*", "identity.*", "admin.*"]);
  const canDelete = hasAnyPermission(["roles.delete", "roles.*", "identity.*", "admin.*"]);

  const roleColumns = useMemo<Column<RoleDto>[]>(
    () => [
      {
        key: "name",
        header: "Role",
        render: (item) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{item.name}</p>
            <p className="text-xs text-muted">{item.description ?? "Sem descrição"}</p>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (item) => (
          <div className="flex items-center gap-2">
            {item.isSystem ? <Badge color="warning">Sistema</Badge> : <Badge color="accent">Custom</Badge>}
            <Badge color={item.isActive ? "success" : "slate"}>{item.isActive ? "Ativa" : "Inativa"}</Badge>
          </div>
        ),
      },
      {
        key: "mfaRequirement",
        header: "MFA da role",
        render: (item) => (
          <Badge color={item.mfaRequirement === "Fido2" ? "accent" : item.mfaRequirement === "Totp" ? "warning" : "slate"}>
            {getMfaRequirementLabel(item.mfaRequirement)}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: "Ações",
        className: "w-[160px]",
        render: (item) => (
          <div className="flex justify-end gap-2">
            {canWrite && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditTarget(item);
                }}
              >
                Editar
              </Button>
            )}
            {canDelete && !item.isSystem && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDelete(item);
                }}
                aria-label="Excluir role"
                title="Excluir role"
              >
                <Icon name="delete" className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canDelete, canWrite],
  );

  const handleDelete = async (role: RoleDto) => {
    const confirmed = window.confirm(`Excluir role \"${role.name}\"?`);
    if (!confirmed) return;

    try {
      await deleteRole.mutateAsync(role.id);
      toast.success("Role removida com sucesso.");
      if (selectedRole?.id === role.id) {
        setSelectedRole(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover a role."));
    }
  };

  if (rolesQuery.isLoading) {
    return <Loading message="Carregando roles..." />;
  }

  if (rolesQuery.isError) {
    return (
      <ErrorDisplay
        message="Falha ao carregar roles."
        onRetry={() => void rolesQuery.refetch()}
      />
    );
  }

  const roles = rolesQuery.data ?? [];
  const permissionsCatalog = permissionsCatalogQuery.data ?? [];
  const selected = selectedRole ? roles.find((role) => role.id === selectedRole.id) ?? null : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Roles e Permissões" description="Gerencie roles customizadas e atribua permissões do catálogo disponível na API."   breadcrumb={<Link to="/settings" className="transition-colors hover:text-foreground">Configurações</Link>}
      />

      <Card>
        <CardHeader
          title="Roles"
          subtitle={`${roles.length} registro(s)`}
          action={
            canWrite ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Icon name="add" className="h-4 w-4" /> Nova role
              </Button>
            ) : undefined
          }
        />

        <DataTable
          columns={roleColumns}
          data={roles}
          keyExtractor={(item) => item.id}
          onRowClick={(item) => setSelectedRole(item)}
          emptyMessage="Nenhuma role encontrada."
        />
      </Card>

      {selected && (
        <RolePermissionsPanel
          role={selected}
          canManage={!selected.isSystem && canWrite}
          permissionsCatalog={permissionsCatalog}
          loadingCatalog={permissionsCatalogQuery.isLoading}
        />
      )}

      <CreateRoleModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        loading={createRole.isPending}
        onSubmit={async (payload) => {
          await createRole.mutateAsync(payload);
        }}
      />

      {editTarget && (
        <EditRoleModal
          role={editTarget}
          onClose={() => setEditTarget(null)}
          loading={updateRole.isPending}
          onSubmit={async (payload) => {
            await updateRole.mutateAsync({ id: editTarget.id, payload });
          }}
        />
      )}
    </div>
  );
}

/** Item do catálogo já normalizado para a UI (id + rótulo + agrupador). */
interface PermissionEntry {
  id: string;
  label: string;
  code: string;
  group: string;
}

/**
 * Deriva o grupo (recurso) da permissão.
 *
 * Preferimos o `resourceType` que a API já manda; quando ele não vem (catálogo
 * antigo/parcial) caímos para o prefixo do código — "Users.Edit" -> "Users" —
 * porque é isso que o operador usa para achar a permissão numa lista de 100+.
 */
function getPermissionGroup(permission: PermissionLike, code: string) {
  const resourceType = readString(permission, "resourceType", "resource");
  if (resourceType) return resourceType;

  const [prefix] = code.split(".");
  if (prefix && prefix !== code) return prefix;

  return "Outras permissões";
}

function buildPermissionEntries(permissions: PermissionLike[]): PermissionEntry[] {
  const uniqueById = new Map<string, PermissionEntry>();

  for (const permission of permissions) {
    const id = getPermissionId(permission);
    if (!id || uniqueById.has(id)) continue;

    const code = getPermissionCode(permission);
    uniqueById.set(id, {
      id,
      label: getPermissionLabel(permission),
      code,
      group: getPermissionGroup(permission, code),
    });
  }

  return Array.from(uniqueById.values()).sort((a, b) => {
    const byGroup = a.group.localeCompare(b.group, "pt-BR");
    if (byGroup !== 0) return byGroup;
    return a.label.localeCompare(b.label, "pt-BR");
  });
}

function toPermissionOption(entry: PermissionEntry): PermissionOption {
  return {
    id: entry.id,
    label: entry.label,
    code: entry.code || entry.id,
    group: entry.group,
  };
}

/** Barra de busca das permissões JÁ vinculadas (essencial acima de ~100 itens). */
function PermissionFilter({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Icon
        name="search"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-xl border border-border bg-surface-light py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
      />
    </div>
  );
}

function RolePermissionsPanel({
  role,
  canManage,
  permissionsCatalog,
  loadingCatalog,
}: {
  role: RoleDto;
  canManage: boolean;
  permissionsCatalog: PermissionDto[];
  loadingCatalog: boolean;
}) {
  const rolePermissionsQuery = useIamRolePermissions(role.id);
  const removePermission = useRemoveIamRolePermission(role.id);
  const bulkAddPermissions = useBulkAddIamRolePermissions(role.id);
  const bulkRemovePermissions = useBulkRemoveIamRolePermissions(role.id);

  // Ids NOVOS marcados no multi-select. As já vinculadas NÃO entram aqui: elas vão
  // por `alreadyAssignedIds` (marcadas, com selo e travadas), então a atribuição em
  // lote recebe exatamente o que o operador marcou de novo, sem filtro extra.
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [linkedSearch, setLinkedSearch] = useState("");

  // useDeferredValue: com 104+ itens, digitar na busca não pode competir com a
  // renderização da lista inteira a cada tecla.
  const deferredLinkedSearch = useDeferredValue(linkedSearch);

  const catalog = useMemo(
    () =>
      buildPermissionEntries(
        permissionsCatalog.map((permission) => permission as PermissionLike),
      ),
    [permissionsCatalog],
  );

  const linked = useMemo(
    () =>
      buildPermissionEntries(
        (rolePermissionsQuery.data ?? []).map(
          (permission) => permission as PermissionLike,
        ),
      ),
    [rolePermissionsQuery.data],
  );

  const catalogOptions = useMemo(
    () => catalog.map(toPermissionOption),
    [catalog],
  );

  const linkedIdSet = useMemo(
    () => new Set(linked.map((entry) => entry.id)),
    [linked],
  );

  const assignableIds = useMemo(
    () => catalog.filter((entry) => !linkedIdSet.has(entry.id)).map((entry) => entry.id),
    [catalog, linkedIdSet],
  );

  const assignableIdSet = useMemo(
    () => new Set(assignableIds),
    [assignableIds],
  );

  useEffect(() => {
    // Remove da seleção o que deixou de ser atribuível (itens que entraram na role
    // ou saíram do catálogo): sem isso o botão “Atribuir N” mentiria o N.
    setPendingIds((current) => {
      const next = current.filter((id) => assignableIdSet.has(id));
      return next.length === current.length ? current : next;
    });
    // Só precisa reagir quando o conjunto de atribuíveis muda.
     
  }, [assignableIdSet]);

  const linkedGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of linked) {
      counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);
    }
    return counts;
  }, [linked]);

  const filteredLinked = useMemo(() => {
    const query = deferredLinkedSearch.trim().toLowerCase();
    if (!query) return linked;

    return linked.filter(
      (entry) =>
        entry.label.toLowerCase().includes(query) ||
        entry.code.toLowerCase().includes(query) ||
        entry.id.toLowerCase().includes(query),
    );
  }, [linked, deferredLinkedSearch]);

  // A busca da lista vinculada só esconde itens: o que já estava selecionado
  // continua contado e continua sendo removido (agir sobre o que não se vê é
  // surpresa; perder seleção por causa de um filtro também é).
  const filteredLinkedIds = useMemo(
    () => filteredLinked.map((entry) => entry.id),
    [filteredLinked],
  );

  const selectedLinked = useMemo(
    () => linkedIds.filter((id) => linkedIdSet.has(id)),
    [linkedIds, linkedIdSet],
  );

  const selectedLinkedSet = useMemo(
    () => new Set(selectedLinked),
    [selectedLinked],
  );

  const allFilteredSelected =
    filteredLinkedIds.length > 0 &&
    filteredLinkedIds.every((id) => selectedLinkedSet.has(id));

  const toggleLinked = (permissionId: string) => {
    if (!permissionId) return;
    setLinkedIds((current) =>
      current.includes(permissionId)
        ? current.filter((id) => id !== permissionId)
        : [...current, permissionId],
    );
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      setLinkedIds((current) =>
        current.filter((id) => !filteredLinkedIds.includes(id)),
      );
      return;
    }

    setLinkedIds((current) => {
      const next = [...current];
      for (const id of filteredLinkedIds) {
        if (!next.includes(id)) next.push(id);
      }
      return next;
    });
  };

  const assignSelected = async () => {
    const ids = pendingIds.filter((id) => assignableIdSet.has(id));
    if (ids.length === 0) return;

    try {
      const result = await bulkAddPermissions.mutateAsync({
        permissionIds: ids,
      });
      setPendingIds([]);
      // Contagens honestas: o backend responde o que REALMENTE aconteceu
      // (added x skipped), então o operador não é induzido a achar que
      // reatribuir o que já existia mudou alguma coisa.
      toast.success(
        `${result.added} permissão(ões) atribuída(s). ${result.skipped} já estava(m) vinculada(s).`,
      );
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Não foi possível atribuir as permissões."),
      );
    }
  };

  const removeSelected = async () => {
    const ids = selectedLinked;
    if (ids.length === 0) return;

    const confirmed = window.confirm(
      `Remover ${ids.length} permissão(ões) da role "${role.name}"?`,
    );
    if (!confirmed) return;

    try {
      const result = await bulkRemovePermissions.mutateAsync({
        permissionIds: ids,
      });
      setLinkedIds([]);
      toast.success(
        `${result.removed} permissão(ões) removida(s). ${result.skipped} não estava(m) vinculada(s).`,
      );
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Não foi possível remover as permissões."),
      );
    }
  };

  return (
    <Card>
      <CardHeader
        title={`Permissões da role: ${role.name}`}
        subtitle={`${linked.length} permissão(ões) — ${catalog.length} no catálogo`}
      />

      {canManage && (
        <div className="mb-6 space-y-3 rounded-xl border border-border bg-surface-light/40 p-3">
          <p className="text-sm font-medium text-foreground">
            Adicionar permissões
          </p>
          <PermissionMultiSelect
            options={catalogOptions}
            value={pendingIds}
            onChange={setPendingIds}
            alreadyAssignedIds={linked.map((entry) => entry.id)}
            loading={loadingCatalog}
            placeholder="Buscar permissão no catálogo..."
            maxHeightClassName="max-h-72"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => void assignSelected()}
              loading={bulkAddPermissions.isPending}
              disabled={pendingIds.length === 0}
              aria-label={`Atribuir ${pendingIds.length} permissão(ões) selecionada(s)`}
            >
              <Icon name="key" className="h-4 w-4" /> Atribuir {pendingIds.length} selecionada(s)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPendingIds([])}
              disabled={pendingIds.length === 0 || bulkAddPermissions.isPending}
              aria-label="Limpar seleção de novas permissões"
            >
              <Icon name="undo" className="h-4 w-4" /> Limpar seleção
            </Button>
          </div>
        </div>
      )}

      {rolePermissionsQuery.isLoading ? (
        <Loading message="Carregando permissões da role..." />
      ) : (
        <div className="space-y-3">
          {linked.length > 0 && (
            <PermissionFilter
              value={linkedSearch}
              onChange={setLinkedSearch}
              placeholder="Buscar entre as permissões vinculadas..."
            />
          )}

          {canManage && linked.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={toggleAllFiltered}
                disabled={filteredLinkedIds.length === 0}
                aria-label={`Selecionar todas as ${filteredLinkedIds.length} permissões vinculadas visíveis`}
              >
                <Icon name={allFilteredSelected ? "undo" : "done_all"} className="h-4 w-4" />
                {allFilteredSelected
                  ? `Limpar seleção (${filteredLinkedIds.length})`
                  : `Selecionar todas as ${filteredLinkedIds.length} vinculadas`}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => void removeSelected()}
                loading={bulkRemovePermissions.isPending}
                disabled={selectedLinked.length === 0}
                aria-label={`Remover ${selectedLinked.length} permissão(ões) selecionada(s)`}
              >
                <Icon name="delete" className="h-4 w-4" /> Remover {selectedLinked.length} selecionada(s)
              </Button>
            </div>
          )}

          {linked.length > 0 && (
            <p className="text-xs text-muted" aria-live="polite">
              {filteredLinked.length} de {linked.length} permissão(ões) vinculada(s)
              exibida(s){selectedLinked.length > 0 ? ` · ${selectedLinked.length} selecionada(s)` : ""}.
            </p>
          )}

          {Array.from(linkedGroups.entries()).map(([group, total]) => {
            const groupItems = filteredLinked.filter((entry) => entry.group === group);
            if (groupItems.length === 0) return null;

            return (
              <section key={group} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {group} ({groupItems.length} de {total})
                </h3>
                {groupItems.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-light px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {canManage && (
                        <input
                          type="checkbox"
                          checked={selectedLinkedSet.has(entry.id)}
                          onChange={() => toggleLinked(entry.id)}
                          aria-label={`Selecionar ${entry.label}`}
                          className="h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        />
                      )}
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium text-foreground">{entry.label}</p>
                        <p className="text-xs text-muted">{entry.code || entry.id}</p>
                      </div>
                    </div>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          removePermission.mutate(entry.id, {
                            onSuccess: () => toast.success("Permissão removida."),
                            onError: (error) => toast.error(getErrorMessage(error, "Não foi possível remover permissão.")),
                          })
                        }
                        disabled={!entry.id || bulkRemovePermissions.isPending}
                        aria-label={`Remover a permissão ${entry.label}`}
                        title="Remover permissão"
                      >
                        <Icon name="delete" className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </section>
            );
          })}

          {linked.length === 0 && (
            <div className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted">
              Nenhuma permissão vinculada a esta role.
            </div>
          )}

          {linked.length > 0 && filteredLinked.length === 0 && (
            <div className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted">
              Nenhuma permissão vinculada corresponde ao filtro.
            </div>
          )}
        </div>
      )}

      {role.isSystem && (
        <div className="mt-4 rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
          Roles de sistema não podem ser alteradas ou ter permissões modificadas.
        </div>
      )}
    </Card>
  );
}

function CreateRoleModal({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateRoleRequest) => Promise<void>;
  loading: boolean;
}) {
  const [payload, setPayload] = useState<CreateRoleRequest>({
    name: "",
    description: "",
    mfaRequirement: "None",
  });
  const valid = payload.name.trim().length >= 2;

  const submit = async () => {
    if (!valid) return;

    try {
      await onSubmit({
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        mfaRequirement: payload.mfaRequirement,
      });
      toast.success("Role criada com sucesso.");
      setPayload({
        name: "",
        description: "",
        mfaRequirement: "None",
      });
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível criar a role."));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nova role">
      <div className="space-y-4">
        <Input label="Nome" value={payload.name} onChange={(e) => setPayload((prev) => ({ ...prev, name: e.target.value }))} />
        <Input label="Descrição" value={payload.description ?? ""} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} />
        <Select
          label="MFA exigido"
          options={MFA_REQUIREMENT_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={payload.mfaRequirement}
          onChange={(e) =>
            setPayload((prev) => ({
              ...prev,
              mfaRequirement: e.target.value as MfaRequirement,
            }))
          }
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void submit()} loading={loading} disabled={!valid}>
            Criar role
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditRoleModal({
  role,
  onClose,
  onSubmit,
  loading,
}: {
  role: RoleDto;
  onClose: () => void;
  onSubmit: (payload: UpdateRoleRequest) => Promise<void>;
  loading: boolean;
}) {
  const [payload, setPayload] = useState<UpdateRoleRequest>({
    name: role.name,
    description: role.description,
    mfaRequirement: role.mfaRequirement,
    isActive: role.isActive,
  });

  const isSystemRole = role.isSystem;
  const valid = payload.name.trim().length >= 2;

  const submit = async () => {
    if (!valid) return;

    try {
      await onSubmit({
        ...payload,
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        mfaRequirement: payload.mfaRequirement,
      });
      toast.success("Role atualizada com sucesso.");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível atualizar a role."));
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Editar role: ${role.name}`}>
      <div className="space-y-4">
        {isSystemRole && (
          <div className="rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
            Em roles de sistema, apenas o MFA e o status podem ser ajustados.
          </div>
        )}

        <Input
          label="Nome"
          value={payload.name}
          disabled={isSystemRole}
          onChange={(e) => setPayload((prev) => ({ ...prev, name: e.target.value }))}
        />
        <Input
          label="Descrição"
          value={payload.description ?? ""}
          disabled={isSystemRole}
          onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))}
        />
        <Select
          label="MFA exigido"
          options={MFA_REQUIREMENT_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          value={payload.mfaRequirement}
          onChange={(e) =>
            setPayload((prev) => ({
              ...prev,
              mfaRequirement: e.target.value as MfaRequirement,
            }))
          }
        />

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={payload.isActive}
            onChange={(e) => setPayload((prev) => ({ ...prev, isActive: e.target.checked }))}
            className="rounded border-border-strong bg-surface-light"
          />
          Role ativa
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void submit()} loading={loading} disabled={!valid}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}

