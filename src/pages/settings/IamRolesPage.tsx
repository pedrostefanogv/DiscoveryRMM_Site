import { useMemo, useState } from "react";
import { KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  ErrorDisplay,
  Input,
  Loading,
  Modal,
  Select,
  type Column,
} from "@/components/ui";
import {
  type CreateRoleRequest,
  type MfaRequirement,
  type PermissionDto,
  type RoleDto,
  type UpdateRoleRequest,
} from "@/api";
import {
  useAddIamRolePermission,
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
              >
                <Trash2 className="h-4 w-4" />
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Roles e Permissões</h1>
        <p className="text-sm text-muted">
          Gerencie roles customizadas e atribua permissões do catálogo disponível na API.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Roles"
          subtitle={`${roles.length} registro(s)`}
          action={
            canWrite ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Nova role
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
  const addPermission = useAddIamRolePermission(role.id);
  const removePermission = useRemoveIamRolePermission(role.id);

  const [selectedPermissionId, setSelectedPermissionId] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");

  const normalizedCatalog = useMemo(
    () => {
      const uniqueById = new Map<string, { id: string; label: string; searchText: string }>();

      permissionsCatalog
        .map((permission) => permission as PermissionLike)
        .map((permission) => ({
          id: getPermissionId(permission),
          label: getPermissionLabel(permission),
          searchText: [
            getPermissionCode(permission),
            getPermissionName(permission),
            getPermissionId(permission),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        }))
        .filter((permission) => !!permission.id)
        .forEach((permission) => {
          if (!uniqueById.has(permission.id)) {
            uniqueById.set(permission.id, permission);
          }
        });

      return Array.from(uniqueById.values()).sort((a, b) =>
        a.label.localeCompare(b.label, "pt-BR"),
      );
    },
    [permissionsCatalog],
  );

  const filteredCatalog = useMemo(() => {
    const query = permissionSearch.trim().toLowerCase();
    if (!query) return normalizedCatalog;

    return normalizedCatalog.filter((permission) =>
      permission.searchText.includes(query),
    );
  }, [normalizedCatalog, permissionSearch]);

  const permissionOptions = [
    {
      value: "",
      label: loadingCatalog ? "Carregando permissões..." : "Selecione uma permissão",
    },
    ...filteredCatalog.map((permission) => ({
      value: permission.id,
      label: permission.label,
    })),
  ];

  const assignPermission = async () => {
    if (!selectedPermissionId) return;

    try {
      await addPermission.mutateAsync({ permissionId: selectedPermissionId });
      setSelectedPermissionId("");
      toast.success("Permissão atribuída com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível atribuir permissão."));
    }
  };

  const permissions = (rolePermissionsQuery.data ?? []).map(
    (permission) => permission as PermissionLike,
  );

  return (
    <Card>
      <CardHeader
        title={`Permissões da role: ${role.name}`}
        subtitle={`${permissions.length} permissão(ões)`}
      />

      {canManage && (
        <div className="mb-4 space-y-2">
          <Input
            value={permissionSearch}
            onChange={(e) => setPermissionSearch(e.target.value)}
            placeholder="Buscar permissão por código, nome ou id..."
          />
          <div className="flex gap-2">
            <div className="flex-1">
            <Select
              options={permissionOptions}
              value={selectedPermissionId}
              onChange={(e) => setSelectedPermissionId(e.target.value)}
            />
            </div>
            <Button size="sm" onClick={() => void assignPermission()} loading={addPermission.isPending} disabled={!selectedPermissionId}>
              <KeyRound className="h-4 w-4" /> Atribuir
            </Button>
          </div>
          <p className="text-xs text-muted">
            {filteredCatalog.length} permissão(ões) encontrada(s).
          </p>
        </div>
      )}

      {rolePermissionsQuery.isLoading ? (
        <Loading message="Carregando permissões da role..." />
      ) : (
        <div className="space-y-2">
          {permissions.map((permission) => {
            const permissionId = getPermissionId(permission);
            const permissionLabel = getPermissionLabel(permission);
            const code = getPermissionCode(permission);

            return (
            <div key={permissionId || permissionLabel} className="flex items-center justify-between rounded-lg border border-border bg-surface-light px-3 py-2">
              <div className="space-y-1">
                <p className="font-medium text-foreground">{permissionLabel}</p>
                <p className="text-xs text-muted">{code || permissionId}</p>
              </div>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    removePermission.mutate(permissionId, {
                      onSuccess: () => toast.success("Permissão removida."),
                      onError: (error) => toast.error(getErrorMessage(error, "Não foi possível remover permissão.")),
                    })
                  }
                  disabled={!permissionId}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            );
          })}
          {permissions.length === 0 && (
            <div className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted">
              Nenhuma permissão vinculada a esta role.
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

