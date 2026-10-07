import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { KeyRound, LockKeyhole, Pencil, ShieldCheck, Trash2, UserCircle2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, ErrorDisplay, Input, Loading, Modal, Select } from "@/components/ui";
import { ApiError, authApi } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { PASSWORD_RULES, validatePassword } from "@/auth/passwordPolicy";
import {
  describeWebAuthnError,
  ensureWebAuthnSupport,
  parseRegistrationOptions,
  serializeRegistrationCredential,
} from "@/auth/webauthn";
import {
  useChangeMyPassword,
  useDeleteMfaKey,
  useMfaKeys,
  useMyProfile,
  useMySecurity,
  useNowTick,
  useRenameMfaKey,
  useUpdateMyProfile,
} from "@/hooks";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Nunca utilizada";
  }

  return new Date(value).toLocaleString("pt-BR");
}

function keyTypeLabel(type: 0 | 1) {
  return type === 0 ? "FIDO2" : "OTP/TOTP";
}

function formatCountdown(msRemaining: number) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function mfaRequirementLabel(value: "None" | "Totp" | "Fido2") {
  if (value === "Totp") return "OTP/TOTP";
  if (value === "Fido2") return "FIDO2";
  return "Nenhum";
}

/** Visão única para as chaves vindas do endpoint próprio (/mfa/keys) ou do perfil de segurança. */
interface SecurityKeyView {
  id?: string;
  name: string;
  keyType: 0 | 1;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function ProfilePage() {
  const { session } = useAuth();
  const now = useNowTick(1_000);
  const profileQuery = useMyProfile();
  const securityQuery = useMySecurity();
  const updateMyProfile = useUpdateMyProfile();
  const changeMyPassword = useChangeMyPassword();

  // /api/v1/mfa/keys é a fonte preferencial (é o endpoint que sempre existiu e funciona);
  // /users/me/security é usado como complemento/fallback.
  const keysQuery = useMfaKeys();
  const renameMfaKey = useRenameMfaKey();
  const deleteMfaKey = useDeleteMfaKey();

  const [registeringKey, setRegisteringKey] = useState(false);
  const [fido2ModalOpen, setFido2ModalOpen] = useState(false);
  const [fido2KeyName, setFido2KeyName] = useState("Meu dispositivo");
  const [registerMethod, setRegisterMethod] = useState<"Fido2" | "Totp">("Fido2");
  const [totpSetup, setTotpSetup] = useState<{
    secretBase32: string;
    qrCodeUri: string;
    message: string;
  } | null>(null);
  const [totpKeyName, setTotpKeyName] = useState("Authenticator OTP");
  const [totpCode, setTotpCode] = useState("");
  const [renameTarget, setRenameTarget] = useState<SecurityKeyView | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Step-up: reautenticação por senha exigida pela API para gerenciar chaves MFA.
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);
  const [stepUpExpiresAt, setStepUpExpiresAt] = useState(0);
  const [stepUpModalOpen, setStepUpModalOpen] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState("");
  const [stepUpSubmitting, setStepUpSubmitting] = useState(false);
  const [stepUpPending, setStepUpPending] = useState<((token: string) => Promise<void>) | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const security = securityQuery.data;

  useEffect(() => {
    if (!profileQuery.data) return;

    setForm({
      fullName: profileQuery.data.fullName ?? "",
      email: profileQuery.data.email ?? "",
    });
  }, [profileQuery.data]);

  const profileChanged = useMemo(() => {
    const profile = profileQuery.data;
    if (!profile) return false;

    return (
      form.fullName.trim() !== (profile.fullName ?? "") ||
      form.email.trim() !== (profile.email ?? "")
    );
  }, [form.email, form.fullName, profileQuery.data]);

  /**
   * Lista de chaves exibida. Nunca assume que `security.keys` existe: o endpoint
   * /users/me/security já respondeu sem a propriedade e a página quebrava com
   * "cannot read length of undefined".
   */
  const keys = useMemo<SecurityKeyView[]>(() => {
    const fromKeysEndpoint = keysQuery.data as SecurityKeyView[] | undefined;
    if (fromKeysEndpoint && fromKeysEndpoint.length > 0) {
      return fromKeysEndpoint;
    }

    return (security?.keys ?? []) as SecurityKeyView[];
  }, [keysQuery.data, security?.keys]);

  const saveProfile = async () => {
    const payload = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
    };

    if (!payload.fullName || !payload.email) {
      toast.error("Preencha nome e e-mail para salvar seu perfil.");
      return;
    }

    try {
      await updateMyProfile.mutateAsync(payload);
      toast.success("Perfil atualizado com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível atualizar o perfil."));
    }
  };

  const savePassword = async () => {
    // Política compartilhada com o backend (12+ com maiúscula, número e especial).
    const policyError = validatePassword(passwordForm.newPassword);
    if (policyError) {
      toast.error(policyError);
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("A confirmação de senha não confere.");
      return;
    }

    try {
      await changeMyPassword.mutateAsync({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Senha alterada com sucesso.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível alterar a senha."));
    }
  };

  const registerNewFido2Key = async (authToken: string) => {
    const trimmedName = fido2KeyName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      toast.error("Informe um nome entre 2 e 80 caracteres.");
      return;
    }

    setRegisteringKey(true);

    try {
      ensureWebAuthnSupport();
      const begin = await authApi.beginRegistrationFido2(authToken);
      const credential = await navigator.credentials.create({
        publicKey: parseRegistrationOptions(begin.options),
      });

      if (!(credential instanceof PublicKeyCredential)) {
        throw new Error("O navegador não retornou uma credencial válida.");
      }

      const result = await authApi.completeRegistrationFido2(authToken, {
        keyName: trimmedName,
        attestationResponseJson: JSON.stringify(
          serializeRegistrationCredential(credential),
        ),
      });

      setFido2ModalOpen(false);
      toast.success(result.message || "Chave cadastrada com sucesso.");
      await Promise.all([keysQuery.refetch(), securityQuery.refetch()]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) setStepUpToken(null);
      toast.error(describeWebAuthnError(error));
    } finally {
      setRegisteringKey(false);
    }
  };

  const registerTotpKey = async (authToken: string) => {
    setRegisteringKey(true);

    try {
      if (!totpSetup) {
        const begin = await authApi.beginRegistrationTotp(authToken);
        setTotpSetup(begin);
        toast.success(begin.message || "Configuração OTP iniciada.");
        return;
      }

      const keyName = totpKeyName.trim();
      if (keyName.length < 2 || keyName.length > 80) {
        toast.error("Informe um nome entre 2 e 80 caracteres para o OTP.");
        return;
      }

      const verificationCode = totpCode.replace(/\D/g, "");
      if (verificationCode.length < 6) {
        toast.error("Informe o código OTP com 6 dígitos.");
        return;
      }

      const result = await authApi.completeRegistrationTotp(authToken, {
        secretBase32: totpSetup.secretBase32,
        verificationCode,
        keyName,
      });

      setTotpCode("");
      setTotpSetup(null);
      // Códigos de backup são exibidos uma única vez (uso único no login por OTP).
      setBackupCodes(result.backupCodes ?? []);
      toast.success(result.message || "Chave OTP cadastrada com sucesso.");
      await Promise.all([keysQuery.refetch(), securityQuery.refetch()]);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) setStepUpToken(null);
      toast.error(getErrorMessage(error, "Não foi possível cadastrar a chave OTP."));
    } finally {
      setRegisteringKey(false);
    }
  };

  const submitRename = async (authToken: string) => {
    if (!renameTarget?.id) return;

    const newName = renameValue.trim();
    if (newName.length < 2 || newName.length > 80) {
      toast.error("Informe um nome entre 2 e 80 caracteres.");
      return;
    }

    try {
      await renameMfaKey.mutateAsync({ keyId: renameTarget.id, data: { keyName: newName }, token: authToken });
      setRenameTarget(null);
      toast.success("Chave renomeada com sucesso.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) setStepUpToken(null);
      toast.error(getErrorMessage(error, "Não foi possível renomear a chave."));
    }
  };

  const removeKey = async (key: SecurityKeyView, authToken: string) => {
    if (!key.id) return;
    if (!window.confirm(`Remover a chave "${key.name}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      if (!key.id) return;
      await deleteMfaKey.mutateAsync({ keyId: key.id, token: authToken });
      toast.success("Chave removida com sucesso.");
      await securityQuery.refetch();
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) setStepUpToken(null);
      toast.error(getErrorMessage(error, "Não foi possível remover a chave de segurança."));
    }
  };

  const hasValidStepUp = stepUpToken !== null && stepUpExpiresAt > Date.now();

  /** Executa a operação com step-up: reaproveita o token válido ou pede a senha. */
  const runWithStepUp = async (action: (token: string) => Promise<void>) => {
    if (hasValidStepUp) {
      await action(stepUpToken as string);
      return;
    }

    setStepUpPending(() => action);
    setStepUpPassword("");
    setStepUpModalOpen(true);
  };

  const submitStepUp = async () => {
    if (!stepUpPassword) {
      toast.error("Informe sua senha para continuar.");
      return;
    }

    setStepUpSubmitting(true);
    try {
      const result = await authApi.stepUp(stepUpPassword);
      setStepUpToken(result.stepUpToken);
      setStepUpExpiresAt(Date.now() + result.expiresInSeconds * 1000);
      setStepUpModalOpen(false);
      setStepUpPassword("");

      const action = stepUpPending;
      setStepUpPending(null);
      if (action) await action(result.stepUpToken);
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível confirmar sua senha."));
    } finally {
      setStepUpSubmitting(false);
    }
  };

  useEffect(() => {
    if (!security) return;

    if (security.roleMfaRequirement === "Fido2") {
      setRegisterMethod("Fido2");
      setTotpSetup(null);
    }

    if (security.roleMfaRequirement === "Totp") {
      setRegisterMethod("Totp");
    }
  }, [security]);

  if (profileQuery.isLoading || securityQuery.isLoading) {
    return <Loading message="Carregando dados do perfil..." />;
  }

  if (profileQuery.isError || securityQuery.isError) {
    return (
      <ErrorDisplay
        message="Falha ao carregar informações do perfil."
        onRetry={() => {
          void profileQuery.refetch();
          void securityQuery.refetch();
        }}
      />
    );
  }

  const profile = profileQuery.data;
  const roleRequirement = security?.roleMfaRequirement ?? "None";
  const methodFixedByRole = roleRequirement === "Fido2" || roleRequirement === "Totp";
  const activeRegisterMethod = methodFixedByRole ? roleRequirement : registerMethod;
  const expiresInText =
    session.expiresAt && session.stage === "authenticated"
      ? formatCountdown(session.expiresAt - now)
      : null;

  if (!profile || !security) {
    return (
      <ErrorDisplay
        message="Não foi possível identificar os dados do perfil."
        onRetry={() => {
          void profileQuery.refetch();
          void securityQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meu perfil</h1>
        <p className="text-sm text-muted">
          Atualize seus dados de acesso e acompanhe o status de segurança da sua conta.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border bg-surface/40">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/15 p-3 text-primary">
              <UserCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted">Conta</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{profile.login}</p>
              <p className="mt-1 text-xs text-muted">{profile.email}</p>
            </div>
          </div>
        </Card>

        <Card className="border-border bg-surface/40">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-accent/15 p-3 text-accent">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted">Sessão</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {session.stage === "authenticated" ? "Autenticada" : "Sem sessão ativa"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {expiresInText ? `Expira em ${expiresInText}` : "Sem expiração local registrada"}
              </p>
            </div>
          </div>
        </Card>

        <Card className="border-border bg-surface/40">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-success/15 p-3 text-success">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted">MFA</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{keys.length} chave(s)</p>
              <p className="mt-1 text-xs text-muted">
                {security.mfaConfigured ? "Configurado" : "Ainda não configurado"}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="border-border bg-surface/40">
        <CardHeader title="Dados da conta" subtitle="Informações básicas do seu usuário" />
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Login" value={profile.login} disabled />
          <Input
            label="Nome completo"
            value={form.fullName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, fullName: event.target.value }))
            }
          />
          <Input
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => void saveProfile()}
            loading={updateMyProfile.isPending}
            disabled={!profileChanged}
          >
            Salvar perfil
          </Button>
        </div>
      </Card>

      <Card className="border-border bg-surface/40">
        <CardHeader
          title="Segurança"
          subtitle="Regras e chaves vinculadas ao seu usuário"
          action={
            <div className="flex items-center gap-2">
              {!methodFixedByRole && (
                <div className="w-40">
                  <Select
                    options={[
                      { value: "Fido2", label: "FIDO2" },
                      { value: "Totp", label: "OTP/TOTP" },
                    ]}
                    value={registerMethod}
                    onChange={(event) => {
                      const next = event.target.value as "Fido2" | "Totp";
                      setRegisterMethod(next);
                      if (next === "Fido2") {
                        setTotpSetup(null);
                      }
                    }}
                  />
                </div>
              )}
              <Button
                size="sm"
                onClick={() =>
                  void (activeRegisterMethod === "Totp"
                    ? runWithStepUp((token) => registerTotpKey(token))
                    : setFido2ModalOpen(true))
                }
                loading={registeringKey}
              >
                <KeyRound className="h-4 w-4" />
                {activeRegisterMethod === "Totp"
                  ? totpSetup
                    ? " Confirmar OTP"
                    : " Iniciar OTP"
                  : " Cadastrar nova chave"}
              </Button>
            </div>
          }
        />

        <div className="mb-4 flex flex-wrap gap-2">
          <Badge color={security.mfaRequired ? "success" : "warning"}>
            {security.mfaRequired ? "MFA obrigatório" : "MFA opcional"}
          </Badge>
          <Badge color={security.mfaConfigured ? "accent" : "slate"}>
            {security.mfaConfigured ? "MFA configurado" : "MFA não configurado"}
          </Badge>
          <Badge color="warning">
            Exigência por role: {mfaRequirementLabel(security.roleMfaRequirement)}
          </Badge>
        </div>

        {activeRegisterMethod === "Totp" && totpSetup && (
          <div className="mb-4 space-y-3 rounded-lg border border-border bg-surface-light p-3">
            <p className="text-xs text-muted-foreground">{totpSetup.message}</p>
            <p className="break-all text-xs text-muted">{totpSetup.qrCodeUri}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Nome da chave OTP"
                value={totpKeyName}
                onChange={(event) => setTotpKeyName(event.target.value)}
              />
              <Input
                label="Código de verificação"
                inputMode="numeric"
                placeholder="123456"
                value={totpCode}
                onChange={(event) => {
                  const sanitized = event.target.value.replace(/\D/g, "").slice(0, 8);
                  setTotpCode(sanitized);
                }}
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id ?? `${key.name}-${key.createdAt}`}
              className="rounded-lg border border-border bg-surface-light px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground">{key.name}</p>
                <div className="flex items-center gap-2">
                  <Badge color={key.keyType === 0 ? "accent" : "warning"}>
                    {keyTypeLabel(key.keyType)}
                  </Badge>
                  {key.isActive === false && <Badge color="slate">Inativa</Badge>}
                  {key.id && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRenameTarget(key);
                          setRenameValue(key.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" /> Renomear
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void runWithStepUp((token) => removeKey(key, token))}
                        disabled={deleteMfaKey.isPending}
                      >
                        <Trash2 className="h-4 w-4" /> Remover
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-muted">
                Criada em: {formatDate(key.createdAt)}
              </p>
              <p className="text-xs text-muted">
                Último uso: {formatDate(key.lastUsedAt)}
              </p>
            </div>
          ))}

          {keys.length === 0 && (
            <div className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted">
              Nenhuma chave de autenticação cadastrada para este usuário.
            </div>
          )}
        </div>
      </Card>

      <Card className="border-border bg-surface/40">
        <CardHeader title="Alterar senha" subtitle="Use sua senha atual para definir uma nova senha" />
        <div className="mb-4 rounded-xl border border-border bg-surface-light p-3 text-xs text-muted">
          <div className="flex items-start gap-2">
            <LockKeyhole className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="mb-1">A senha precisa atender à política mínima:</p>
              <ul className="list-inside list-disc space-y-0.5">
                {PASSWORD_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Input
            label="Senha atual"
            type="password"
            value={passwordForm.currentPassword}
            onChange={(event) =>
              setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))
            }
          />
          <Input
            label="Nova senha"
            type="password"
            value={passwordForm.newPassword}
            onChange={(event) =>
              setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))
            }
          />
          <Input
            label="Confirmar nova senha"
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(event) =>
              setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
            }
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={() => void savePassword()} loading={changeMyPassword.isPending}>
            Atualizar senha
          </Button>
        </div>
      </Card>

      <Modal open={fido2ModalOpen} onClose={() => setFido2ModalOpen(false)} title="Cadastrar nova chave FIDO2">
        <div className="space-y-4">
          <Input
            label="Nome da chave"
            placeholder="Meu dispositivo"
            value={fido2KeyName}
            onChange={(event) => setFido2KeyName(event.target.value)}
            hint="Use um nome para identificar este dispositivo depois."
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFido2ModalOpen(false)}
              disabled={registeringKey}
            >
              Cancelar
            </Button>
            <Button type="button" loading={registeringKey} onClick={() => void runWithStepUp((token) => registerNewFido2Key(token))}>
              Confirmar cadastro
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title="Renomear chave"
      >
        <div className="space-y-4">
          <Input
            label="Nome da chave"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            hint="Use um nome entre 2 e 80 caracteres."
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRenameTarget(null)}
              disabled={renameMfaKey.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              loading={renameMfaKey.isPending}
              onClick={() => void runWithStepUp((token) => submitRename(token))}
            >
              Salvar nome
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={stepUpModalOpen}
        onClose={() => {
          setStepUpModalOpen(false);
          setStepUpPending(null);
        }}
        title="Confirme sua senha"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Para cadastrar, renomear ou remover chaves de autenticação é preciso confirmar
            sua senha. A confirmação vale por alguns minutos.
          </p>
          <Input
            label="Senha atual"
            type="password"
            autoComplete="current-password"
            value={stepUpPassword}
            onChange={(event) => setStepUpPassword(event.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={stepUpSubmitting}
              onClick={() => {
                setStepUpModalOpen(false);
                setStepUpPending(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="button" loading={stepUpSubmitting} onClick={() => void submitStepUp()}>
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={backupCodes.length > 0}
        onClose={() => setBackupCodes([])}
        title="Códigos de backup"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Cada código serve <strong>uma única vez</strong> para entrar caso você perca o
            autenticador. Eles não serão exibidos novamente.
          </p>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm">
            {backupCodes.map((code) => (
              <span
                key={code}
                className="rounded-lg border border-border bg-surface-light px-3 py-2 text-center"
              >
                {code}
              </span>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setBackupCodes([])}>
              Já salvei os códigos
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}