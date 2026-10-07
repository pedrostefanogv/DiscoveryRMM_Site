import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CheckCircle2, KeyRound, UserRoundPen } from "lucide-react";
import { ApiError, authApi } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { PASSWORD_RULES, passwordSchema } from "@/auth/passwordPolicy";
import { Button, Card, CardHeader, Input, Loading } from "@/components/ui";

const firstAccessSchema = z
  .object({
    newLogin: z.string().trim().min(1, "Informe o novo login."),
    newEmail: z.email("Informe um e-mail valido."),
    newFullName: z.string().trim().min(1, "Informe o nome completo."),
    currentPassword: z.string().min(1, "Informe a senha atual."),
    // Política compartilhada com ProfilePage e com o backend.
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "A confirmação de senha nao confere.",
  });

type FirstAccessFormValues = z.infer<typeof firstAccessSchema>;

export default function FirstAccessPage() {
  const navigate = useNavigate();
  const { session, setTemporaryStage, clearTemporarySession } = useAuth();
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    mustChangeProfile: boolean;
    login: string;
    email: string;
    fullName: string;
  } | null>(null);
  const token = session.temporaryMfaToken;
  // Só exige (e exibe) os dados de perfil quando o onboarding pediu troca de perfil.
  const profileEditable = status?.mustChangeProfile ?? true;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FirstAccessFormValues>({
    resolver: zodResolver(firstAccessSchema),
    defaultValues: {
      newLogin: "",
      newEmail: "",
      newFullName: "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (!token) {
      navigate("/auth/login", { replace: true });
      return;
    }

    let cancelled = false;
    const loadStatus = async () => {
      try {
        const status = await authApi.getFirstAccessStatus(token);
        if (cancelled) {
          return;
        }

        if (!status.firstAccessRequired) {
          // O token de setup NÃO serve para a tela de asserção (exige mfa_pending).
          // Se o MFA já está configurado, o caminho correto é refazer o login.
          if (status.mfaRequired && !status.mfaConfigured) {
            setTemporaryStage("mfa-register-begin");
            navigate("/auth/mfa/register", { replace: true });
            return;
          }

          clearTemporarySession();
          navigate("/auth/login", { replace: true });
          return;
        }

        setStatus(status);
        if (!status.mustChangeProfile) {
          // Só a senha precisa mudar (ex.: reset administrativo): mantém o perfil atual
          // preenchido e os campos deixam de ser exibidos.
          reset({
            newLogin: status.login,
            newEmail: status.email,
            newFullName: status.fullName,
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
          });
        }

        setStatusError(null);
      } catch (error) {
        if (!cancelled) {
          setStatusError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o status do primeiro acesso.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingStatus(false);
        }
      }
    };

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [navigate, setTemporaryStage, token]);

  const onSubmit = async (values: FirstAccessFormValues) => {
    if (!token) {
      navigate("/auth/login", { replace: true });
      return;
    }

    try {
      const result = await authApi.completeFirstAccess(token, {
        newLogin: values.newLogin.trim(),
        newEmail: values.newEmail.trim(),
        newFullName: values.newFullName.trim(),
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });

      toast.success(result.message);

      const status = await authApi.getFirstAccessStatus(token);

      // MFA ainda pendente de cadastro: o token de setup serve para registrar a chave.
      if (status.mfaRequired && !status.mfaConfigured) {
        setTemporaryStage("mfa-register-begin");
        navigate("/auth/mfa/register", { replace: true });
        return;
      }

      // MFA já configurado (ou inexistente): o token de setup não permite asserção —
      // refaz o login com a nova senha em vez de cair num 401 de "token expirado".
      clearTemporarySession();
      toast.success("Dados atualizados. Entre novamente com a nova senha para concluir a autenticação.");
      navigate("/auth/login", { replace: true });
    } catch (caught) {
      // Token de setup expirado (10 min) → reinicia o fluxo de login.
      if (caught instanceof ApiError && caught.status === 401) {
        toast.error(
          "Sua sessão temporária expirou. Faça login novamente para continuar o primeiro acesso.",
        );
        navigate("/auth/login", { replace: true });
        return;
      }

      // Conflitos (login/e-mail em uso, política de senha) voltam como 400.
      const message =
        caught instanceof Error && caught.message?.trim()
          ? caught.message
          : "Não foi possível concluir o primeiro acesso. Revise os dados e tente novamente.";
      setStatusError(message);
      toast.error(message);
    }
  };

  if (loadingStatus) {
    return <Loading message="Carregando obrigações do primeiro acesso..." />;
  }

  return (
    <Card className="border-border bg-surface/80 shadow-2xl backdrop-blur" padding>
      <CardHeader
        title={profileEditable ? "Primeiro acesso" : "Troca de senha obrigatória"}
        subtitle={
          profileEditable
            ? "Atualize seus dados iniciais antes de concluir o cadastro da chave de segurança."
            : "Defina uma nova senha para continuar. Seus dados de perfil permanecem os mesmos."
        }
      />

      {statusError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-800 dark:text-red-100">
          {statusError}
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        {profileEditable ? (
          <>
            <Input label="Novo login" error={errors.newLogin?.message} {...register("newLogin")} />
            <Input label="Novo e-mail" type="email" error={errors.newEmail?.message} {...register("newEmail")} />
            <Input label="Nome completo" error={errors.newFullName?.message} {...register("newFullName")} />
          </>
        ) : (
          <div className="rounded-xl border border-border bg-surface-light p-4 text-sm text-muted-foreground">
            Conta: <strong>{status?.login}</strong> · {status?.email} · {status?.fullName}
          </div>
        )}
        <Input
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register("currentPassword")}
        />
        <Input
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <Input
          label="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <div className="rounded-xl border border-border bg-surface-light p-4 text-sm text-muted-foreground">
          <div className="mb-3 flex items-center gap-2 font-medium text-foreground">
            <KeyRound className="h-4 w-4 text-primary" /> Politica minima de senha
          </div>
          <ul className="space-y-2">
            {PASSWORD_RULES.map((rule) => (
              <li key={rule} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-accent" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface-light p-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <UserRoundPen className="mt-0.5 h-4 w-4 text-primary" />
            A API continua sendo a fonte de verdade para conflitos de login, e-mail e política final de senha.
          </div>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Salvar e continuar
        </Button>
      </form>
    </Card>
  );
}