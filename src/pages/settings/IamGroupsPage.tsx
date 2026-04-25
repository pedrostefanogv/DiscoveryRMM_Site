import { useMemo, useState } from "react";
import { Link2, Plus, Trash2, UserPlus } from "lucide-react";
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
  type AssignGroupRoleRequest,
  type CreateUserGroupRequest,
  type ScopeLevel,
  type UpdateUserGroupRequest,
  type UserGroupDto,
} from "@/api";
import {
  useAddIamGroupMember,
  useAssignIamGroupRole,
  useCreateIamGroup,
  useDeleteIamGroup,
  useIamGroupMembers,
  useIamGroupRoles,
  useIamGroups,
  useIamRoles,
  useIamUsers,
  useRemoveIamGroupMember,
  useRemoveIamGroupRole,
  useUpdateIamGroup,
} from "@/hooks";
import { ApiError } from "@/api";
import { useAuthorization } from "@/auth/authorization";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

const SCOPE_OPTIONS = [
  { value: "Global", label: "Global" },
  { value: "Client", label: "Cliente" },
  { value: "Site", label: "Site" },
];

export default function IamGroupsPage() {
  const groupsQuery = useIamGroups();
  const usersQuery = useIamUsers();
  const rolesQuery = useIamRoles();

  const createGroup = useCreateIamGroup();
  const updateGroup = useUpdateIamGroup();
  const deleteGroup = useDeleteIamGroup();

  const [selectedGroup, setSelectedGroup] = useState<UserGroupDto | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserGroupDto | null>(null);

  const { hasAnyPermission } = useAuthorization();
  const canWrite = hasAnyPermission(["groups.write", "groups.*", "identity.*", "admin.*"]);
  const canDelete = hasAnyPermission(["groups.delete", "groups.*", "identity.*", "admin.*"]);

  const groupColumns = useMemo<Column<UserGroupDto>[]>(
    () => [
      {
        key: "name",
        header: "Grupo",
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
        render: (item) => <Badge color={item.isActive ? "accent" : "slate"}>{item.isActive ? "Ativo" : "Inativo"}</Badge>,
      },
      {
        key: "actions",
        header: "Ações",
        className: "w-[180px]",
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
            {canDelete && (
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

  const handleDelete = async (group: UserGroupDto) => {
    const confirmed = window.confirm(`Excluir grupo \"${group.name}\"?`);
    if (!confirmed) return;

    try {
      await deleteGroup.mutateAsync(group.id);
      toast.success("Grupo removido com sucesso.");
      if (selectedGroup?.id === group.id) {
        setSelectedGroup(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover o grupo."));
    }
  };

  if (groupsQuery.isLoading) {
    return <Loading message="Carregando grupos de usuários..." />;
  }

  if (groupsQuery.isError) {
    return (
      <ErrorDisplay
        message="Falha ao carregar grupos de usuários."
        onRetry={() => void groupsQuery.refetch()}
      />
    );
  }

  const groups = groupsQuery.data ?? [];
  const selected = selectedGroup ? groups.find((group) => group.id === selectedGroup.id) ?? null : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Grupos de Usuários</h1>
        <p className="text-sm text-slate-400">
          Organize usuários por grupo e vincule roles por escopo para controlar acesso.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Grupos"
          subtitle={`${groups.length} registro(s)`}
          action={
            canWrite ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Novo grupo
              </Button>
            ) : undefined
          }
        />

        <DataTable
          columns={groupColumns}
          data={groups}
          keyExtractor={(item) => item.id}
          onRowClick={(item) => setSelectedGroup(item)}
          emptyMessage="Nenhum grupo encontrado."
        />
      </Card>

      {selected && (
        <GroupAssignmentsPanel
          group={selected}
          usersLoading={usersQuery.isLoading}
          users={usersQuery.data ?? []}
          rolesLoading={rolesQuery.isLoading}
          roles={rolesQuery.data ?? []}
        />
      )}

      <CreateGroupModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        loading={createGroup.isPending}
        onSubmit={async (payload) => {
          await createGroup.mutateAsync(payload);
        }}
      />

      {editTarget && (
        <EditGroupModal
          group={editTarget}
          onClose={() => setEditTarget(null)}
          loading={updateGroup.isPending}
          onSubmit={async (payload) => {
            await updateGroup.mutateAsync({ id: editTarget.id, payload });
          }}
        />
      )}
    </div>
  );
}

function GroupAssignmentsPanel({
  group,
  users,
  usersLoading,
  roles,
  rolesLoading,
}: {
  group: UserGroupDto;
  users: Array<{ id: string; fullName: string; login: string }>;
  usersLoading: boolean;
  roles: Array<{ id: string; name: string }>;
  rolesLoading: boolean;
}) {
  const membersQuery = useIamGroupMembers(group.id);
  const groupRolesQuery = useIamGroupRoles(group.id);
  const addMember = useAddIamGroupMember(group.id);
  const removeMember = useRemoveIamGroupMember(group.id);
  const assignRole = useAssignIamGroupRole(group.id);
  const removeRole = useRemoveIamGroupRole(group.id);

  const [memberUserId, setMemberUserId] = useState("");
  const [roleAssignment, setRoleAssignment] = useState<AssignGroupRoleRequest>({
    roleId: "",
    scopeLevel: "Global",
    scopeId: null,
  });

  const memberOptions = [
    { value: "", label: usersLoading ? "Carregando usuários..." : "Selecione um usuário" },
    ...users.map((user) => ({ value: user.id, label: `${user.fullName} (${user.login})` })),
  ];

  const roleOptions = [
    { value: "", label: rolesLoading ? "Carregando roles..." : "Selecione uma role" },
    ...roles.map((role) => ({ value: role.id, label: role.name })),
  ];

  const addMemberSubmit = async () => {
    if (!memberUserId) return;
    try {
      await addMember.mutateAsync({ userId: memberUserId });
      setMemberUserId("");
      toast.success("Membro adicionado com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível adicionar membro."));
    }
  };

  const assignRoleSubmit = async () => {
    if (!roleAssignment.roleId) return;
    try {
      await assignRole.mutateAsync(roleAssignment);
      setRoleAssignment({ roleId: "", scopeLevel: "Global", scopeId: null });
      toast.success("Role vinculada ao grupo com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível vincular a role."));
    }
  };

  const members = membersQuery.data ?? [];
  const assignments = groupRolesQuery.data ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title={`Membros de ${group.name}`} subtitle={`${members.length} vínculo(s)`} />

        <div className="mb-4 flex gap-2">
          <div className="flex-1">
            <Select options={memberOptions} value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} />
          </div>
          <Button size="sm" onClick={() => void addMemberSubmit()} loading={addMember.isPending} disabled={!memberUserId}>
            <UserPlus className="h-4 w-4" /> Adicionar
          </Button>
        </div>

        {membersQuery.isLoading ? (
          <Loading message="Carregando membros..." />
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div key={member.assignmentId} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <div>
                  <p className="font-medium text-white">{member.fullName ?? member.login ?? member.userId}</p>
                  <p className="text-xs text-slate-400">{member.email ?? member.userId}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    removeMember.mutate(member.userId, {
                      onSuccess: () => toast.success("Membro removido."),
                      onError: (error) => toast.error(getErrorMessage(error, "Falha ao remover membro.")),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {members.length === 0 && <p className="text-sm text-slate-500">Nenhum membro neste grupo.</p>}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Roles vinculadas" subtitle={`${assignments.length} vínculo(s)`} />

        <div className="mb-4 space-y-3">
          <Select
            options={roleOptions}
            value={roleAssignment.roleId}
            onChange={(e) => setRoleAssignment((prev) => ({ ...prev, roleId: e.target.value }))}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              options={SCOPE_OPTIONS}
              value={roleAssignment.scopeLevel}
              onChange={(e) =>
                setRoleAssignment((prev) => ({
                  ...prev,
                  scopeLevel: e.target.value as ScopeLevel,
                }))
              }
            />
            <Input
              placeholder="ScopeId (opcional)"
              value={roleAssignment.scopeId ?? ""}
              onChange={(e) =>
                setRoleAssignment((prev) => ({
                  ...prev,
                  scopeId: e.target.value.trim() ? e.target.value.trim() : null,
                }))
              }
            />
          </div>
          <Button
            size="sm"
            onClick={() => void assignRoleSubmit()}
            loading={assignRole.isPending}
            disabled={!roleAssignment.roleId}
          >
            <Link2 className="h-4 w-4" /> Vincular role
          </Button>
        </div>

        {groupRolesQuery.isLoading ? (
          <Loading message="Carregando roles do grupo..." />
        ) : (
          <div className="space-y-2">
            {assignments.map((assignment) => (
              <div key={assignment.assignmentId} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <div className="space-y-1">
                  <p className="font-medium text-white">{assignment.roleName ?? assignment.roleId}</p>
                  <div className="flex items-center gap-2">
                    <Badge color="accent">{assignment.scopeLevel}</Badge>
                    <span className="text-xs text-slate-400">{assignment.scopeId ?? "Sem scopeId"}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    removeRole.mutate(assignment.assignmentId, {
                      onSuccess: () => toast.success("Vínculo de role removido."),
                      onError: (error) => toast.error(getErrorMessage(error, "Falha ao remover vínculo.")),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {assignments.length === 0 && <p className="text-sm text-slate-500">Nenhuma role vinculada neste grupo.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

function CreateGroupModal({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateUserGroupRequest) => Promise<void>;
  loading: boolean;
}) {
  const [payload, setPayload] = useState<CreateUserGroupRequest>({ name: "", description: "" });

  const valid = payload.name.trim().length >= 2;

  const submit = async () => {
    if (!valid) return;

    try {
      await onSubmit({
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
      });
      toast.success("Grupo criado com sucesso.");
      setPayload({ name: "", description: "" });
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível criar o grupo."));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo grupo de usuários">
      <div className="space-y-4">
        <Input label="Nome" value={payload.name} onChange={(e) => setPayload((prev) => ({ ...prev, name: e.target.value }))} />
        <Input label="Descrição" value={payload.description ?? ""} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void submit()} loading={loading} disabled={!valid}>Criar grupo</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditGroupModal({
  group,
  onClose,
  onSubmit,
  loading,
}: {
  group: UserGroupDto;
  onClose: () => void;
  onSubmit: (payload: UpdateUserGroupRequest) => Promise<void>;
  loading: boolean;
}) {
  const [payload, setPayload] = useState<UpdateUserGroupRequest>({
    name: group.name,
    description: group.description,
    isActive: group.isActive,
  });

  const valid = payload.name.trim().length >= 2;

  const submit = async () => {
    if (!valid) return;

    try {
      await onSubmit({
        ...payload,
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
      });
      toast.success("Grupo atualizado com sucesso.");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível atualizar o grupo."));
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Editar grupo: ${group.name}`}>
      <div className="space-y-4">
        <Input label="Nome" value={payload.name} onChange={(e) => setPayload((prev) => ({ ...prev, name: e.target.value }))} />
        <Input label="Descrição" value={payload.description ?? ""} onChange={(e) => setPayload((prev) => ({ ...prev, description: e.target.value }))} />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={payload.isActive}
            onChange={(e) => setPayload((prev) => ({ ...prev, isActive: e.target.checked }))}
            className="rounded border-white/20 bg-white/5"
          />
          Grupo ativo
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void submit()} loading={loading} disabled={!valid}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}
