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
  useMeshRightsProfiles,
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

const MESH_RIGHT_BITS: Array<{ bit: number; label: string }> = [
  { bit: 1, label: "Edit Group" },
  { bit: 2, label: "Manage Users" },
  { bit: 4, label: "Manage Devices" },
  { bit: 8, label: "Remote Control" },
  { bit: 16, label: "Agent Console" },
  { bit: 32, label: "Server Files" },
  { bit: 64, label: "Wake Device" },
  { bit: 128, label: "Notes" },
  { bit: 256, label: "View-only Desktop" },
  { bit: 512, label: "No Terminal" },
  { bit: 1024, label: "No Files" },
  { bit: 2048, label: "No Intel AMT" },
  { bit: 4096, label: "Limited Desktop Input" },
  { bit: 8192, label: "Limited Events" },
  { bit: 16384, label: "Chat/Notify" },
  { bit: 32768, label: "Uninstall Agent" },
  { bit: 65536, label: "No Remote Desktop" },
  { bit: 131072, label: "Remote Commands" },
  { bit: 262144, label: "Reset/Power Off" },
];

type MeshMode = "automatic" | "profile" | "mask";

function inferMeshMode(meshRightsMask?: number | null, meshRightsProfile?: string | null): MeshMode {
  if (meshRightsMask !== null && meshRightsMask !== undefined) {
    return "mask";
  }
  if (meshRightsProfile && meshRightsProfile.trim()) {
    return "profile";
  }
  return "automatic";
}

function parseMaskInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function bitsFromRights(rights: number): number[] {
  if (!Number.isInteger(rights) || rights < 0) return [];
  return MESH_RIGHT_BITS.filter(({ bit }) => (rights & bit) === bit).map(({ bit }) => bit);
}

function sumRights(bits: number[]): number {
  return bits.reduce((acc, bit) => acc | bit, 0);
}

function summarizeRoleMeshRights(role: RoleDto) {
  if (role.meshRightsMask !== null && role.meshRightsMask !== undefined) {
    if (role.meshRightsMask === -1) {
      return "Máscara: Full (-1)";
    }
    return `Máscara: ${role.meshRightsMask}`;
  }

  if (role.meshRightsProfile && role.meshRightsProfile.trim()) {
    return `Perfil: ${role.meshRightsProfile}`;
  }

  return "Automático (fallback backend)";
}

function getMfaRequirementLabel(value: MfaRequirement) {
  return MFA_REQUIREMENT_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export default function IamRolesPage() {
  const rolesQuery = useIamRoles();
  const permissionsCatalogQuery = useIamPermissionsCatalog();
  const rightsProfilesQuery = useMeshRightsProfiles();

  const profileOptions = (rightsProfilesQuery.data ?? []).map((p) => ({
    value: p.name,
    label: p.description ? `${p.name} — ${p.description}` : p.name,
  }));

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
            <p className="font-medium text-white">{item.name}</p>
            <p className="text-xs text-slate-400">{item.description ?? "Sem descrição"}</p>
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
        key: "meshRights",
        header: "Permissão Mesh",
        render: (item) => (
          <span className="text-xs text-slate-300">{summarizeRoleMeshRights(item)}</span>
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
        <h1 className="text-2xl font-bold text-white">Roles e Permissões</h1>
        <p className="text-sm text-slate-400">
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
        profileOptions={profileOptions}
        onSubmit={async (payload) => {
          await createRole.mutateAsync(payload);
        }}
      />

      {editTarget && (
        <EditRoleModal
          role={editTarget}
          onClose={() => setEditTarget(null)}
          loading={updateRole.isPending}
          profileOptions={profileOptions}
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
          <p className="text-xs text-slate-500">
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
            <div key={permissionId || permissionLabel} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="space-y-1">
                <p className="font-medium text-white">{permissionLabel}</p>
                <p className="text-xs text-slate-400">{code || permissionId}</p>
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
            <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-slate-500">
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
  profileOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateRoleRequest) => Promise<void>;
  loading: boolean;
  profileOptions: Array<{ value: string; label: string }>;
}) {
  const [payload, setPayload] = useState<CreateRoleRequest>({
    name: "",
    description: "",
    mfaRequirement: "None",
    meshRightsMask: null,
    meshRightsProfile: null,
  });
  const [meshMode, setMeshMode] = useState<MeshMode>("automatic");
  const [meshProfile, setMeshProfile] = useState("operator");
  const [maskInput, setMaskInput] = useState("0");
  const [maskBits, setMaskBits] = useState<number[]>([]);

  const parsedMask = parseMaskInput(maskInput);
  const valid = payload.name.trim().length >= 2;
  const meshValid = meshMode !== "mask" || parsedMask !== null;

  const submit = async () => {
    if (!valid || !meshValid) return;

    const normalizedProfile = meshProfile.trim();
    const meshRightsMask = meshMode === "mask" ? parsedMask : null;
    const meshRightsProfile =
      meshMode === "profile" && normalizedProfile ? normalizedProfile : null;

    try {
      await onSubmit({
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        mfaRequirement: payload.mfaRequirement,
        meshRightsMask,
        meshRightsProfile,
      });
      toast.success("Role criada com sucesso.");
      setPayload({
        name: "",
        description: "",
        mfaRequirement: "None",
        meshRightsMask: null,
        meshRightsProfile: null,
      });
      setMeshMode("automatic");
      setMeshProfile("operator");
      setMaskInput("0");
      setMaskBits([]);
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

        <Select
          label="Modo de permissão Mesh"
          options={[
            { value: "automatic", label: "Automático (fallback backend)" },
            { value: "profile", label: "Perfil" },
            { value: "mask", label: "Máscara customizada" },
          ]}
          value={meshMode}
          onChange={(e) => {
            const nextMode = e.target.value as MeshMode;
            setMeshMode(nextMode);
            if (nextMode === "automatic") {
              setMaskInput("0");
              setMaskBits([]);
            }
          }}
        />

        {meshMode === "profile" && (
          <Select
            label="Perfil Mesh"
            options={profileOptions.length > 0 ? profileOptions : [{ value: "", label: "Nenhum perfil disponível" }]}
            value={meshProfile}
            onChange={(e) => setMeshProfile(e.target.value)}
          />
        )}

        {meshMode === "mask" && (
          <MeshMaskEditor
            maskInput={maskInput}
            selectedBits={maskBits}
            onMaskInputChange={(next) => {
              setMaskInput(next);
              const parsed = parseMaskInput(next);
              if (parsed === null || parsed < 0) {
                setMaskBits([]);
                return;
              }
              setMaskBits(bitsFromRights(parsed));
            }}
            onToggleBit={(bit, checked) => {
              const next = checked
                ? Array.from(new Set([...maskBits, bit]))
                : maskBits.filter((item) => item !== bit);
              setMaskBits(next);
              setMaskInput(String(sumRights(next)));
            }}
            onToggleFull={(checked) => {
              if (checked) {
                setMaskInput("-1");
                setMaskBits([]);
                return;
              }
              setMaskInput("0");
              setMaskBits([]);
            }}
          />
        )}

        {meshMode === "mask" && !meshValid && (
          <p className="text-xs text-warning">Use um inteiro válido para a máscara Mesh (ex.: 61176 ou -1).</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void submit()} loading={loading} disabled={!valid || !meshValid}>
            <ShieldCheck className="h-4 w-4" /> Criar role
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
  profileOptions,
}: {
  role: RoleDto;
  onClose: () => void;
  onSubmit: (payload: UpdateRoleRequest) => Promise<void>;
  loading: boolean;
  profileOptions: Array<{ value: string; label: string }>;
}) {
  const initialMeshMode = inferMeshMode(role.meshRightsMask, role.meshRightsProfile);
  const initialMaskInput =
    role.meshRightsMask !== null && role.meshRightsMask !== undefined
      ? String(role.meshRightsMask)
      : "0";

  const [payload, setPayload] = useState<UpdateRoleRequest>({
    name: role.name,
    description: role.description,
    mfaRequirement: role.mfaRequirement,
    meshRightsMask: role.meshRightsMask ?? null,
    meshRightsProfile: role.meshRightsProfile ?? null,
    isActive: role.isActive,
  });
  const [meshMode, setMeshMode] = useState<MeshMode>(initialMeshMode);
  const [meshProfile, setMeshProfile] = useState(role.meshRightsProfile ?? "operator");
  const [maskInput, setMaskInput] = useState(initialMaskInput);
  const [maskBits, setMaskBits] = useState(
    bitsFromRights(role.meshRightsMask ?? 0),
  );

  const isSystemRole = role.isSystem;
  const valid = payload.name.trim().length >= 2;
  const parsedMask = parseMaskInput(maskInput);
  const meshValid = meshMode !== "mask" || parsedMask !== null;

  const submit = async () => {
    if (!valid || !meshValid) return;

    const normalizedProfile = meshProfile.trim();
    const meshRightsMask = meshMode === "mask" ? parsedMask : null;
    const meshRightsProfile =
      meshMode === "profile" && normalizedProfile ? normalizedProfile : null;

    try {
      await onSubmit({
        ...payload,
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        mfaRequirement: payload.mfaRequirement,
        meshRightsMask,
        meshRightsProfile,
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

        <Select
          label="Modo de permissão Mesh"
          options={[
            { value: "automatic", label: "Automático (fallback backend)" },
            { value: "profile", label: "Perfil" },
            { value: "mask", label: "Máscara customizada" },
          ]}
          value={meshMode}
          disabled={isSystemRole}
          onChange={(e) => {
            const nextMode = e.target.value as MeshMode;
            setMeshMode(nextMode);
            if (nextMode === "automatic") {
              setMaskInput("0");
              setMaskBits([]);
            }
          }}
        />

        {meshMode === "profile" && (
          <Select
            label="Perfil Mesh"
            options={profileOptions.length > 0 ? profileOptions : [{ value: "", label: "Nenhum perfil disponível" }]}
            value={meshProfile}
            disabled={isSystemRole}
            onChange={(e) => setMeshProfile(e.target.value)}
          />
        )}

        {meshMode === "mask" && (
          <MeshMaskEditor
            maskInput={maskInput}
            selectedBits={maskBits}
            disabled={isSystemRole}
            onMaskInputChange={(next) => {
              setMaskInput(next);
              const parsed = parseMaskInput(next);
              if (parsed === null || parsed < 0) {
                setMaskBits([]);
                return;
              }
              setMaskBits(bitsFromRights(parsed));
            }}
            onToggleBit={(bit, checked) => {
              const next = checked
                ? Array.from(new Set([...maskBits, bit]))
                : maskBits.filter((item) => item !== bit);
              setMaskBits(next);
              setMaskInput(String(sumRights(next)));
            }}
            onToggleFull={(checked) => {
              if (checked) {
                setMaskInput("-1");
                setMaskBits([]);
                return;
              }
              setMaskInput("0");
              setMaskBits([]);
            }}
          />
        )}

        {meshMode === "mask" && !meshValid && (
          <p className="text-xs text-warning">Use um inteiro válido para a máscara Mesh (ex.: 61176 ou -1).</p>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={payload.isActive}
            onChange={(e) => setPayload((prev) => ({ ...prev, isActive: e.target.checked }))}
            className="rounded border-white/20 bg-white/5"
          />
          Role ativa
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void submit()} loading={loading} disabled={!valid || !meshValid}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}

function MeshMaskEditor({
  maskInput,
  selectedBits,
  onMaskInputChange,
  onToggleBit,
  onToggleFull,
  disabled,
}: {
  maskInput: string;
  selectedBits: number[];
  onMaskInputChange: (value: string) => void;
  onToggleBit: (bit: number, checked: boolean) => void;
  onToggleFull: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const fullSelected = maskInput.trim() === "-1";

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <Input
        label="MeshRightsMask (número)"
        value={maskInput}
        onChange={(event) => {
          const next = event.target.value.trim();
          if (!/^[-]?\d*$/.test(next)) return;
          onMaskInputChange(next === "" || next === "-" ? "0" : next);
        }}
        disabled={disabled}
      />

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={fullSelected}
          onChange={(event) => onToggleFull(event.target.checked)}
          className="rounded border-white/20 bg-white/5"
          disabled={disabled}
        />
        Full (-1)
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        {MESH_RIGHT_BITS.map((item) => (
          <label
            key={item.bit}
            className="flex items-center gap-2 rounded border border-white/10 px-2 py-1 text-xs text-slate-300"
          >
            <input
              type="checkbox"
              checked={selectedBits.includes(item.bit)}
              onChange={(event) => onToggleBit(item.bit, event.target.checked)}
              className="rounded border-white/20 bg-white/5"
              disabled={disabled || fullSelected}
            />
            <span>
              {item.label} ({item.bit})
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
