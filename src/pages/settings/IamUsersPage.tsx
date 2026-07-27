import { useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, Shield, Trash2, UserCog } from "lucide-react";
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
  type UserMfaKeyDto,
  type CreateUserRequest,
  type UpdateUserRequest,
  type UserDto,
} from "@/api";
import {
  useChangeIamUserPassword,
  useClients,
  useCreateIamUserWithGroups,
  useDeleteIamUser,
  useForceIamUserPasswordReset,
  useIamGroups,
  useIamUserMfaKeys,
  useRevokeIamUserMfaAll,
  useRevokeIamUserMfaKey,
  useIamUsers,
  useUpdateIamUser,
} from "@/hooks";
import { ApiError } from "@/api";
import { useAuthorization } from "@/auth/authorization";

const EMPTY_CREATE_FORM: CreateUserRequest = {
  login: "",
  email: "",
  fullName: "",
  password: "",
  mfaRequired: true,
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function userMfaKeyTypeLabel(keyType: UserMfaKeyDto["keyType"]) {
  return keyType === "Fido2" ? "FIDO2" : "TOTP";
}

export default function IamUsersPage() {
  const usersQuery = useIamUsers();
  const groupsQuery = useIamGroups();
  const clientsQuery = useClients();
  const createUser = useCreateIamUserWithGroups();
  const updateUser = useUpdateIamUser();
  const deleteUser = useDeleteIamUser();
  const changePassword = useChangeIamUserPassword();
  const { hasAnyPermission } = useAuthorization();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserDto | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserDto | null>(null);
  const [securityTarget, setSecurityTarget] = useState<UserDto | null>(null);

  const canView = hasAnyPermission([
    "Users.View",
    "Users.Edit",
    "identity.*",
    "admin.*",
  ]);

  const canEdit = hasAnyPermission(["Users.Edit", "identity.*", "admin.*"]);

  const canDelete = canEdit;
  const canChangePassword = canEdit;

  const columns = useMemo<Column<UserDto>[]>(
    () => [
      {
        key: "identity",
        header: "Usuário",
        render: (item) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{item.fullName}</p>
            <p className="text-xs text-muted">{item.login} · {item.email}</p>
          </div>
        ),
      },
      {
        key: "security",
        header: "Segurança",
        render: (item) => (
          <div className="flex items-center gap-2">
            {item.mfaRequired ? <Badge color="success">MFA obrigatório</Badge> : <Badge color="warning">MFA opcional</Badge>}
            {item.isActive ? <Badge color="accent">Ativo</Badge> : <Badge color="slate">Inativo</Badge>}
          </div>
        ),
      },
      {
        key: "actions",
        header: "Ações",
        className: "w-[260px]",
        render: (item) => (
          <div className="flex justify-end gap-2">
            {canChangePassword && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  setPasswordTarget(item);
                }}
              >
                <Shield className="h-4 w-4" /> Senha
              </Button>
            )}
            {canView && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  setSecurityTarget(item);
                }}
              >
                <KeyRound className="h-4 w-4" /> Segurança
              </Button>
            )}
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditTarget(item);
                }}
              >
                <Pencil className="h-4 w-4" /> Editar
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
                <Trash2 className="h-4 w-4" /> Desativar
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canChangePassword, canDelete, canEdit, canView],
  );

  const handleDelete = async (user: UserDto) => {
    const confirmed = window.confirm(`Desativar o usuário \"${user.fullName}\"?`);
    if (!confirmed) return;

    try {
      await deleteUser.mutateAsync(user.id);
      toast.success("Usuário desativado com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível desativar o usuário."));
    }
  };

  if (usersQuery.isLoading) {
    return <Loading message="Carregando usuários..." />;
  }

  if (usersQuery.isError) {
    return (
      <ErrorDisplay
        message="Falha ao carregar usuários."
        onRetry={() => void usersQuery.refetch()}
      />
    );
  }

  const users = usersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuários e Acesso</h1>
        <p className="text-sm text-muted">
          Cadastre, atualize e desative usuários. Defina se MFA é obrigatório no onboarding.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Usuários"
          subtitle={`${users.length} registro(s)`}
          action={
              canEdit ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Novo usuário
              </Button>
            ) : undefined
          }
        />
        <DataTable
          columns={columns}
          data={users}
          keyExtractor={(item) => item.id}
          emptyMessage="Nenhum usuário encontrado."
        />
      </Card>

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        groups={groupsQuery.data ?? []}
        clients={clientsQuery.data ?? []}
        onSubmit={async (payload, groupIds) => {
          await createUser.mutateAsync({
            user: payload,
            groupIds,
          });

          toast.success("Usuário criado com sucesso.");
        }}
        loading={createUser.isPending}
      />

      {editTarget && (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={async (payload) => {
            await updateUser.mutateAsync({ id: editTarget.id, payload });
          }}
          loading={updateUser.isPending}
        />
      )}

      {passwordTarget && (
        <ChangePasswordModal
          user={passwordTarget}
          onClose={() => setPasswordTarget(null)}
          onSubmit={async (password) => {
            await changePassword.mutateAsync({
              id: passwordTarget.id,
              payload: { newPassword: password },
            });
          }}
          loading={changePassword.isPending}
        />
      )}

      {securityTarget && (
        <UserSecurityModal
          user={securityTarget}
          canEdit={canEdit}
          onClose={() => setSecurityTarget(null)}
        />
      )}
    </div>
  );
}

function UserSecurityModal({
  user,
  canEdit,
  onClose,
}: {
  user: UserDto;
  canEdit: boolean;
  onClose: () => void;
}) {
  const userMfaKeys = useIamUserMfaKeys(user.id);
  const revokeMfaAll = useRevokeIamUserMfaAll(user.id);
  const revokeMfaKey = useRevokeIamUserMfaKey(user.id);
  const forcePasswordReset = useForceIamUserPasswordReset(user.id);

  const keys = userMfaKeys.data ?? [];

  const handleRemoveKey = async (key: UserMfaKeyDto) => {
    if (!canEdit) return;
    const confirmed = window.confirm(
      `Remover a chave "${key.name}" do usuário "${user.fullName}"?`,
    );
    if (!confirmed) return;

    try {
      await revokeMfaKey.mutateAsync(key.id);
      toast.success("Chave MFA removida com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remover a chave MFA."));
    }
  };

  const handleRevokeAllMfa = async () => {
    if (!canEdit) return;
    const confirmed = window.confirm(
      `Revogar TODAS as chaves MFA de "${user.fullName}"?`,
    );
    if (!confirmed) return;

    try {
      await revokeMfaAll.mutateAsync();
      toast.success(
        "MFA revogado. No próximo login, o usuário precisará recadastrar via mfaSetupToken.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível revogar o MFA do usuário."));
    }
  };

  const handleForcePasswordReset = async () => {
    if (!canEdit) return;
    const confirmed = window.confirm(
      `Forçar troca de senha para "${user.fullName}" no próximo login?`,
    );
    if (!confirmed) return;

    try {
      await forcePasswordReset.mutateAsync();
      toast.success("Troca de senha forçada com sucesso para o próximo login.");
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Não foi possível forçar a troca de senha."),
      );
    }
  };

  const hasPendingMutation =
    revokeMfaAll.isPending || revokeMfaKey.isPending || forcePasswordReset.isPending;

  return (
    <Modal open={true} onClose={onClose} title={`Segurança: ${user.fullName}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Gerencie as chaves MFA/2FA do usuário e ações de recuperação de acesso.
        </p>

        <div className="space-y-2 rounded-lg border border-border bg-surface-light p-3">
          <p className="text-xs text-muted">
            Fluxo de recuperação: após revogar MFA, no próximo login o usuário recebe
            mfaSetupToken e recadastra TOTP ou FIDO2 normalmente.
          </p>
        </div>

        {userMfaKeys.isLoading && <Loading message="Carregando chaves MFA..." />}

        {userMfaKeys.isError && (
          <ErrorDisplay
            message="Falha ao carregar chaves MFA do usuário."
            onRetry={() => void userMfaKeys.refetch()}
          />
        )}

        {!userMfaKeys.isLoading && !userMfaKeys.isError && (
          <div className="space-y-2">
            {keys.map((key) => (
              <div
                key={key.id}
                className="rounded-lg border border-border bg-surface-light px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{key.name}</p>
                    <p className="text-xs text-muted">Criada em: {key.createdAt}</p>
                    <p className="text-xs text-muted">
                      Último uso: {key.lastUsedAt ?? "Nunca"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge color={key.keyType === "Fido2" ? "accent" : "warning"}>
                      {userMfaKeyTypeLabel(key.keyType)}
                    </Badge>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleRemoveKey(key)}
                        loading={revokeMfaKey.isPending}
                        disabled={hasPendingMutation}
                      >
                        <Trash2 className="h-4 w-4" /> Remover
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {keys.length === 0 && (
              <div className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted">
                Nenhuma chave MFA cadastrada para este usuário.
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={hasPendingMutation}>
            Fechar
          </Button>
          {canEdit && (
            <>
              <Button
                variant="ghost"
                onClick={() => void handleForcePasswordReset()}
                loading={forcePasswordReset.isPending}
                disabled={hasPendingMutation}
              >
                <UserCog className="h-4 w-4" /> Forçar troca de senha
              </Button>
              <Button
                variant="danger"
                onClick={() => void handleRevokeAllMfa()}
                loading={revokeMfaAll.isPending}
                disabled={hasPendingMutation}
              >
                <Shield className="h-4 w-4" /> Revogar MFA
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function CreateUserModal({
  open,
  onClose,
  groups,
  clients: _clients,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  groups: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
  onSubmit: (payload: CreateUserRequest, groupIds: string[]) => Promise<void>;
  loading: boolean;
}) {
  const [form, setForm] = useState<CreateUserRequest>(EMPTY_CREATE_FORM);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const loginValid = form.login.trim().length >= 3;
  const fullNameValid = form.fullName.trim().length >= 3;
  const emailValid = form.email.trim().includes("@");
  const passwordValid = form.password.length >= 8;
  const valid = loginValid && fullNameValid && emailValid && passwordValid;

  const submit = async () => {
    if (!valid) {
      if (!loginValid) {
        toast.error("Informe um login com pelo menos 3 caracteres.");
        return;
      }
      if (!fullNameValid) {
        toast.error("Informe um nome completo com pelo menos 3 caracteres.");
        return;
      }
      if (!emailValid) {
        toast.error("Informe um e-mail válido.");
        return;
      }
      toast.error("A senha inicial deve ter pelo menos 8 caracteres.");
      return;
    }

    try {
      await onSubmit(form, selectedGroupIds);
      setForm(EMPTY_CREATE_FORM);
      setSelectedGroupIds([]);
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível criar o usuário."));
    }
  };

  const toggleGroup = (groupId: string, checked: boolean) => {
    setSelectedGroupIds((prev) => {
      if (checked) return [...new Set([...prev, groupId])];
      return prev.filter((id) => id !== groupId);
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo usuário">
      <div className="space-y-4">
        <Input label="Login" value={form.login} onChange={(e) => setForm((prev) => ({ ...prev, login: e.target.value }))} />
        <Input label="Nome completo" value={form.fullName} onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))} />
        <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
        <Input label="Senha inicial" type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={form.mfaRequired}
            onChange={(e) => setForm((prev) => ({ ...prev, mfaRequired: e.target.checked }))}
            className="rounded border-border-strong bg-surface-light"
          />
          Exigir MFA no primeiro acesso
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Grupos iniciais (opcional)</p>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border bg-surface-light p-3">
            {groups.map((group) => (
              <label key={group.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={selectedGroupIds.includes(group.id)}
                  onChange={(e) => toggleGroup(group.id, e.target.checked)}
                  className="rounded border-border-strong bg-surface-light"
                />
                {group.name}
              </label>
            ))}
            {groups.length === 0 && (
              <p className="text-xs text-muted">Nenhum grupo disponível.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void submit()} loading={loading} disabled={loading}>Criar usuário</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditUserModal({
  user,
  onClose,
  onSubmit,
  loading,
}: {
  user: UserDto;
  onClose: () => void;
  onSubmit: (payload: UpdateUserRequest) => Promise<void>;
  loading: boolean;
}) {
  const [form, setForm] = useState<UpdateUserRequest>({
    login: user.login,
    fullName: user.fullName,
    email: user.email,
    mfaRequired: user.mfaRequired,
    isActive: user.isActive,
  });

  const valid = form.login.trim().length >= 3 && form.fullName.trim().length >= 3 && form.email.includes("@");

  const submit = async () => {
    if (!valid) return;
    try {
      await onSubmit(form);
      toast.success("Usuário atualizado com sucesso.");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível atualizar o usuário."));
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Editar usuário: ${user.fullName}`}>
      <div className="space-y-4">
        <Input label="Login" value={form.login} onChange={(e) => setForm((prev) => ({ ...prev, login: e.target.value }))} />
        <Input label="Nome completo" value={form.fullName} onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))} />
        <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={form.mfaRequired}
            onChange={(e) => setForm((prev) => ({ ...prev, mfaRequired: e.target.checked }))}
            className="rounded border-border-strong bg-surface-light"
          />
          MFA obrigatório
        </label>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            className="rounded border-border-strong bg-surface-light"
          />
          Usuário ativo
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void submit()} loading={loading} disabled={!valid}>Salvar</Button>
        </div>
      </div>
    </Modal>
  );
}

function ChangePasswordModal({
  user,
  onClose,
  onSubmit,
  loading,
}: {
  user: UserDto;
  onClose: () => void;
  onSubmit: (newPassword: string) => Promise<void>;
  loading: boolean;
}) {
  const [newPassword, setNewPassword] = useState("");

  const valid = newPassword.length >= 8;

  const submit = async () => {
    if (!valid) return;
    try {
      await onSubmit(newPassword);
      toast.success("Senha atualizada com sucesso.");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível alterar a senha."));
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Alterar senha: ${user.fullName}`}>
      <div className="space-y-4">
        <Input
          label="Nova senha"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          hint="Use ao menos 8 caracteres."
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void submit()} loading={loading} disabled={!valid}>
            <UserCog className="h-4 w-4" /> Atualizar senha
          </Button>
        </div>
      </div>
    </Modal>
  );
}
