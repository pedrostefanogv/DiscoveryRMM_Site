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
  type MeshCentralBackfillReport,
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
  useRunMeshCentralBackfill,
  useRunMeshCentralBackfillDryRun,
  useRevokeIamUserMfaAll,
  useRevokeIamUserMfaKey,
  useSites,
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

interface PostCreateDryRunOptions {
  enabled: boolean;
  clientId?: string | null;
  siteId?: string | null;
}

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
  const backfillDryRun = useRunMeshCentralBackfillDryRun();
  const backfillApply = useRunMeshCentralBackfill();
  const { hasAnyPermission } = useAuthorization();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserDto | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserDto | null>(null);
  const [securityTarget, setSecurityTarget] = useState<UserDto | null>(null);
  const [backfillClientId, setBackfillClientId] = useState("");
  const [backfillSiteId, setBackfillSiteId] = useState("");
  const [lastBackfillReport, setLastBackfillReport] =
    useState<MeshCentralBackfillReport | null>(null);

  const backfillSitesQuery = useSites(backfillClientId);

  const canView = hasAnyPermission([
    "Users.View",
    "Users.Edit",
    "identity.*",
    "admin.*",
  ]);

  const canEdit = hasAnyPermission(["Users.Edit", "identity.*", "admin.*"]);

  const canDelete = canEdit;
  const canChangePassword = canEdit;

  const canRunBackfill = canEdit;

  const mapOptionalId = (value: string): string | null => {
    const normalized = value.trim();
    return normalized ? normalized : null;
  };

  const runDryRun = async (clientId: string, siteId: string) => {
    const report = await backfillDryRun.mutateAsync({
      clientId: mapOptionalId(clientId),
      siteId: mapOptionalId(siteId),
    });
    setLastBackfillReport(report);
    return report;
  };

  const runApply = async (clientId: string, siteId: string) => {
    const report = await backfillApply.mutateAsync({
      applyChanges: true,
      clientId: mapOptionalId(clientId),
      siteId: mapOptionalId(siteId),
    });
    setLastBackfillReport(report);
    return report;
  };

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
        onSubmit={async (payload, groupIds, postCreateDryRun) => {
          const result = await createUser.mutateAsync({
            user: payload,
            groupIds,
          });

          const sync = result.meshCentralSync;
          if (!sync.synced) {
            toast.error(
              sync.error
                ? `Usuário criado, mas sync Mesh falhou: ${sync.error}`
                : "Usuário criado, mas o sync Mesh não convergiu.",
            );
            return;
          }

          toast.success(
            `Usuário criado com sync Mesh (${sync.siteBindingsApplied} bindings).`,
          );

          if (!postCreateDryRun.enabled) {
            return;
          }

          try {
            const dryRunReport = await runDryRun(
              postCreateDryRun.clientId ?? "",
              postCreateDryRun.siteId ?? "",
            );
            toast.success(
              `Dry-run concluído: ${dryRunReport.syncedUsers}/${dryRunReport.totalUsers} usuários convergidos.`,
            );
          } catch (error) {
            toast.error(
              getErrorMessage(
                error,
                "Usuário criado, mas o dry-run de convergência falhou.",
              ),
            );
          }
        }}
        loading={createUser.isPending || backfillDryRun.isPending}
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

      <BackfillMeshSection
        clientId={backfillClientId}
        siteId={backfillSiteId}
        onChangeClientId={(value) => {
          setBackfillClientId(value);
          setBackfillSiteId("");
        }}
        onChangeSiteId={setBackfillSiteId}
        clients={clientsQuery.data ?? []}
        sites={backfillSitesQuery.data ?? []}
        canRunBackfill={canRunBackfill}
        report={lastBackfillReport}
        dryRunLoading={backfillDryRun.isPending}
        applyLoading={backfillApply.isPending}
        onRunDryRun={async () => {
          try {
            const report = await runDryRun(backfillClientId, backfillSiteId);
            toast.success(
              `Dry-run concluído: ${report.syncedUsers}/${report.totalUsers} convergidos.`,
            );
          } catch (error) {
            toast.error(
              getErrorMessage(error, "Falha ao executar dry-run do backfill."),
            );
          }
        }}
        onRunApply={async () => {
          const confirmed = window.confirm(
            "Aplicar backfill fará reconciliação real no MeshCentral. Deseja continuar?",
          );
          if (!confirmed) return;
          try {
            const report = await runApply(backfillClientId, backfillSiteId);
            toast.success(
              `Backfill aplicado: ${report.syncedUsers}/${report.totalUsers} sincronizados.`,
            );
          } catch (error) {
            toast.error(
              getErrorMessage(error, "Falha ao aplicar backfill MeshCentral."),
            );
          }
        }}
      />
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
        <p className="text-sm text-slate-400">
          Gerencie as chaves MFA/2FA do usuário e ações de recuperação de acesso.
        </p>

        <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-slate-400">
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
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{key.name}</p>
                    <p className="text-xs text-slate-400">Criada em: {key.createdAt}</p>
                    <p className="text-xs text-slate-400">
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
              <div className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-slate-500">
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

function BackfillMeshSection({
  clientId,
  siteId,
  onChangeClientId,
  onChangeSiteId,
  clients,
  sites,
  canRunBackfill,
  report,
  dryRunLoading,
  applyLoading,
  onRunDryRun,
  onRunApply,
}: {
  clientId: string;
  siteId: string;
  onChangeClientId: (value: string) => void;
  onChangeSiteId: (value: string) => void;
  clients: Array<{ id: string; name: string }>;
  sites: Array<{ id: string; name: string }>;
  canRunBackfill: boolean;
  report: MeshCentralBackfillReport | null;
  dryRunLoading: boolean;
  applyLoading: boolean;
  onRunDryRun: () => Promise<void>;
  onRunApply: () => Promise<void>;
}) {
  const clientOptions = [
    { value: "", label: "Todos os clientes" },
    ...clients.map((client) => ({ value: client.id, label: client.name })),
  ];
  const siteOptions = [
    { value: "", label: "Todos os sites" },
    ...sites.map((site) => ({ value: site.id, label: site.name })),
  ];

  return (
    <Card>
      <CardHeader
        title="Backfill MeshCentral"
        subtitle="Execute dry-run para validar convergência ou apply para reconciliar identidades."
      />

      <div className="space-y-4 px-5 pb-5">
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            label="Cliente (filtro)"
            options={clientOptions}
            value={clientId}
            onChange={(e) => onChangeClientId(e.target.value)}
          />
          <Select
            label="Site (filtro)"
            options={siteOptions}
            value={siteId}
            onChange={(e) => onChangeSiteId(e.target.value)}
            disabled={!clientId}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void onRunDryRun()}
            loading={dryRunLoading}
            disabled={!canRunBackfill || applyLoading}
          >
            Executar dry-run
          </Button>
          <Button
            variant="danger"
            onClick={() => void onRunApply()}
            loading={applyLoading}
            disabled={!canRunBackfill || dryRunLoading}
          >
            Aplicar backfill
          </Button>
          {!canRunBackfill && (
            <p className="text-xs text-slate-500">
              Sem permissão para executar reconciliação de identidade.
            </p>
          )}
        </div>

        {report && (
          <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="accent">Total: {report.totalUsers}</Badge>
              <Badge color="success">Convergidos: {report.syncedUsers}</Badge>
              <Badge color={report.failedUsers > 0 ? "danger" : "slate"}>
                Falhas: {report.failedUsers}
              </Badge>
              <Badge color="slate">
                Modo: {report.applyChanges ? "Apply" : "Dry-run"}
              </Badge>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {report.items.map((item) => (
                <div
                  key={item.userId}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-white">
                      {item.login} ({item.meshUsername})
                    </p>
                    <p className="text-xs text-slate-400">
                      Bindings: {item.siteBindingsApplied} | Rights: {item.rightsUpdatesApplied}
                    </p>
                    <p className="text-xs text-slate-400">
                      Device ACL: +{item.deviceBindingsApplied} / -{item.deviceBindingsRevoked}
                    </p>
                    {item.deviceBindingsRevocationCandidates > 0 && (
                      <div
                        className="mt-1"
                        title="Grants fora do escopo desejado preservados por política."
                      >
                        <Badge color="warning">
                          Revocation candidates: {item.deviceBindingsRevocationCandidates}
                        </Badge>
                      </div>
                    )}
                    {item.error && (
                      <p className="text-xs text-danger">{item.error}</p>
                    )}
                  </div>
                  <Badge color={item.success ? "success" : "danger"}>
                    {item.success ? "OK" : "Falha"}
                  </Badge>
                </div>
              ))}
              {report.items.length === 0 && (
                <p className="text-sm text-slate-500">
                  Nenhum usuário retornado para os filtros selecionados.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function CreateUserModal({
  open,
  onClose,
  groups,
  clients,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  groups: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
  onSubmit: (
    payload: CreateUserRequest,
    groupIds: string[],
    postCreateDryRun: PostCreateDryRunOptions,
  ) => Promise<void>;
  loading: boolean;
}) {
  const [form, setForm] = useState<CreateUserRequest>(EMPTY_CREATE_FORM);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [runPostCreateDryRun, setRunPostCreateDryRun] = useState(false);
  const [dryRunClientId, setDryRunClientId] = useState("");
  const [dryRunSiteId, setDryRunSiteId] = useState("");

  const sitesQuery = useSites(dryRunClientId);

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
      await onSubmit(form, selectedGroupIds, {
        enabled: runPostCreateDryRun,
        clientId: dryRunClientId || null,
        siteId: dryRunSiteId || null,
      });
      setForm(EMPTY_CREATE_FORM);
      setSelectedGroupIds([]);
      setRunPostCreateDryRun(false);
      setDryRunClientId("");
      setDryRunSiteId("");
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

  const dryRunClientOptions = [
    { value: "", label: "Todos os clientes" },
    ...clients.map((client) => ({ value: client.id, label: client.name })),
  ];

  const dryRunSiteOptions = [
    {
      value: "",
      label: !dryRunClientId
        ? "Todos os sites"
        : sitesQuery.isLoading
          ? "Carregando sites..."
          : "Todos os sites",
    },
    ...(sitesQuery.data ?? []).map((site) => ({
      value: site.id,
      label: site.name,
    })),
  ];

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

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-300">Grupos iniciais (opcional)</p>
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-3">
            {groups.map((group) => (
              <label key={group.id} className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={selectedGroupIds.includes(group.id)}
                  onChange={(e) => toggleGroup(group.id, e.target.checked)}
                  className="rounded border-white/20 bg-white/5"
                />
                {group.name}
              </label>
            ))}
            {groups.length === 0 && (
              <p className="text-xs text-slate-500">Nenhum grupo disponível.</p>
            )}
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={runPostCreateDryRun}
              onChange={(e) => setRunPostCreateDryRun(e.target.checked)}
              className="rounded border-white/20 bg-white/5"
            />
            Executar dry-run de convergência MeshCentral após criar
          </label>

          {runPostCreateDryRun && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                label="Cliente (filtro)"
                options={dryRunClientOptions}
                value={dryRunClientId}
                onChange={(e) => {
                  setDryRunClientId(e.target.value);
                  setDryRunSiteId("");
                }}
              />
              <Select
                label="Site (filtro)"
                options={dryRunSiteOptions}
                value={dryRunSiteId}
                onChange={(e) => setDryRunSiteId(e.target.value)}
                disabled={!dryRunClientId}
              />
            </div>
          )}
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
