import { useMemo, useState } from "react";
import { Pencil, Plus, Shield, Trash2, UserCog } from "lucide-react";
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
  type Column,
} from "@/components/ui";
import {
  type CreateUserRequest,
  type UpdateUserRequest,
  type UserDto,
} from "@/api";
import {
  useChangeIamUserPassword,
  useCreateIamUser,
  useDeleteIamUser,
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

export default function IamUsersPage() {
  const usersQuery = useIamUsers();
  const createUser = useCreateIamUser();
  const updateUser = useUpdateIamUser();
  const deleteUser = useDeleteIamUser();
  const changePassword = useChangeIamUserPassword();
  const { hasAnyPermission } = useAuthorization();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserDto | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserDto | null>(null);

  const canWrite = hasAnyPermission(["users.write", "users.*", "identity.*", "admin.*"]);
  const canDelete = hasAnyPermission(["users.delete", "users.*", "identity.*", "admin.*"]);
  const canChangePassword = hasAnyPermission([
    "users.password",
    "users.write",
    "users.*",
    "identity.*",
    "admin.*",
  ]);

  const columns = useMemo<Column<UserDto>[]>(
    () => [
      {
        key: "identity",
        header: "Usuário",
        render: (item) => (
          <div className="space-y-1">
            <p className="font-medium text-white">{item.fullName}</p>
            <p className="text-xs text-slate-400">{item.login} · {item.email}</p>
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
            {canWrite && (
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
    [canChangePassword, canDelete, canWrite],
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
        <h1 className="text-2xl font-bold text-white">Usuários e Acesso</h1>
        <p className="text-sm text-slate-400">
          Cadastre, atualize e desative usuários. Defina se MFA é obrigatório no onboarding.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Usuários"
          subtitle={`${users.length} registro(s)`}
          action={
            canWrite ? (
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
        onSubmit={async (payload) => {
          await createUser.mutateAsync(payload);
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
    </div>
  );
}

function CreateUserModal({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateUserRequest) => Promise<void>;
  loading: boolean;
}) {
  const [form, setForm] = useState<CreateUserRequest>(EMPTY_CREATE_FORM);

  const valid =
    form.login.trim().length >= 3 &&
    form.fullName.trim().length >= 3 &&
    form.email.includes("@") &&
    form.password.length >= 8;

  const submit = async () => {
    if (!valid) return;

    try {
      await onSubmit(form);
      toast.success("Usuário criado com sucesso.");
      setForm(EMPTY_CREATE_FORM);
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível criar o usuário."));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo usuário">
      <div className="space-y-4">
        <Input label="Login" value={form.login} onChange={(e) => setForm((prev) => ({ ...prev, login: e.target.value }))} />
        <Input label="Nome completo" value={form.fullName} onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))} />
        <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
        <Input label="Senha inicial" type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.mfaRequired}
            onChange={(e) => setForm((prev) => ({ ...prev, mfaRequired: e.target.checked }))}
            className="rounded border-white/20 bg-white/5"
          />
          Exigir MFA no primeiro acesso
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void submit()} loading={loading} disabled={!valid}>Criar usuário</Button>
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

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.mfaRequired}
            onChange={(e) => setForm((prev) => ({ ...prev, mfaRequired: e.target.checked }))}
            className="rounded border-white/20 bg-white/5"
          />
          MFA obrigatório
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            className="rounded border-white/20 bg-white/5"
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
