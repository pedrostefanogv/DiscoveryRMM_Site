import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { KeyRound, LockKeyhole, ShieldCheck, UserCircle2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, ErrorDisplay, Input, Loading, Modal, Select } from "@/components/ui";
import { ApiError, authApi } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import {
  describeWebAuthnError,
  ensureWebAuthnSupport,
  parseRegistrationOptions,
  serializeRegistrationCredential,
} from "@/auth/webauthn";
import {
  useChangeMyPassword,
  useMyProfile,
  useMySecurity,
  useNowTick,
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
  return type === 0 ? "FIDO2" : "OTP";
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

export default function ProfilePage() {
  const { session } = useAuth();
  const now = useNowTick(1_000);
  const profileQuery = useMyProfile();
  const securityQuery = useMySecurity();
  const updateMyProfile = useUpdateMyProfile();
  const changeMyPassword = useChangeMyPassword();
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
    if (passwordForm.newPassword.length < 8) {
      toast.error("A nova senha deve ter pelo menos 8 caracteres.");
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

  const registerNewFido2Key = async () => {
    if (!session.accessToken) {
      toast.error("Sessão autenticada ausente. Faça login novamente.");
      return;
    }

    const trimmedName = fido2KeyName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      toast.error("Informe um nome entre 2 e 80 caracteres.");
      return;
    }

    setRegisteringKey(true);

    try {
      ensureWebAuthnSupport();
      const begin = await authApi.beginRegistrationFido2(session.accessToken);
      const credential = await navigator.credentials.create({
        publicKey: parseRegistrationOptions(begin.options),
      });

      if (!(credential instanceof PublicKeyCredential)) {
        throw new Error("O navegador não retornou uma credencial válida.");
      }

      const result = await authApi.completeRegistrationFido2(session.accessToken, {
        keyName: trimmedName,
        attestationResponseJson: JSON.stringify(
          serializeRegistrationCredential(credential),
        ),
      });

      setFido2ModalOpen(false);
      toast.success(result.message || "Chave cadastrada com sucesso.");
      await securityQuery.refetch();
    } catch (error) {
      toast.error(describeWebAuthnError(error));
    } finally {
      setRegisteringKey(false);
    }
  };

  const registerTotpKey = async () => {
    if (!session.accessToken) {
      toast.error("Sessão autenticada ausente. Faça login novamente.");
      return;
    }

    setRegisteringKey(true);

    try {
      if (!totpSetup) {
        const begin = await authApi.beginRegistrationTotp(session.accessToken);
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

      const result = await authApi.completeRegistrationTotp(session.accessToken, {
        secretBase32: totpSetup.secretBase32,
        verificationCode,
        keyName,
      });

      setTotpCode("");
      setTotpSetup(null);
      toast.success(result.message || "Chave OTP cadastrada com sucesso.");
      await securityQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível cadastrar a chave OTP."));
    } finally {
      setRegisteringKey(false);
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
              <p className="mt-1 text-lg font-semibold text-foreground">{security.keys.length} chave(s)</p>
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
                    ? registerTotpKey()
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
          {security.keys.map((key) => (
            <div
              key={key.id ?? `${key.name}-${key.createdAt}`}
              className="rounded-lg border border-border bg-surface-light px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground">{key.name}</p>
                <Badge color={key.keyType === 0 ? "accent" : "warning"}>
                  {keyTypeLabel(key.keyType)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted">
                Criada em: {formatDate(key.createdAt)}
              </p>
              <p className="text-xs text-muted">
                Último uso: {formatDate(key.lastUsedAt)}
              </p>
            </div>
          ))}

          {security.keys.length === 0 && (
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
            Para manter sua conta protegida, escolha uma senha forte com letras, números e caracteres especiais.
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
            <Button type="button" loading={registeringKey} onClick={() => void registerNewFido2Key()}>
              Confirmar cadastro
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
