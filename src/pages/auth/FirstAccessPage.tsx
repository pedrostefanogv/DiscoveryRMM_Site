import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { CheckCircle2, KeyRound, UserRoundPen } from "lucide-react";
import { authApi } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, CardHeader, Input, Loading } from "@/components/ui";

const passwordRules = [
  "Minimo de 12 caracteres.",
  "Pelo menos uma letra maiuscula.",
  "Pelo menos um número.",
  "Pelo menos um caractere especial.",
];

const firstAccessSchema = z
  .object({
    newLogin: z.string().trim().min(1, "Informe o novo login."),
    newEmail: z.email("Informe um e-mail valido."),
    newFullName: z.string().trim().min(1, "Informe o nome completo."),
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z
      .string()
      .min(12, "A senha deve ter no mínimo 12 caracteres.")
      .regex(/[A-Z]/, "A senha deve conter pelo menos uma letra maiuscula.")
      .regex(/[0-9]/, "A senha deve conter pelo menos um número.")
      .regex(/[^A-Za-z0-9]/, "A senha deve conter pelo menos um caractere especial."),
    confirmPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "A confirmação de senha nao confere.",
  });

type FirstAccessFormValues = z.infer<typeof firstAccessSchema>;

export default function FirstAccessPage() {
  const navigate = useNavigate();
  const { session, setTemporaryStage } = useAuth();
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const token = session.temporaryMfaToken;

  const {
    register,
    handleSubmit,
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
          const nextPath = status.mfaRequired
            ? status.mfaConfigured
              ? "/auth/mfa"
              : "/auth/mfa/register"
            : "/auth/login";
          setTemporaryStage(
            status.mfaRequired
              ? status.mfaConfigured
                ? "mfa-assert-begin"
                : "mfa-register-begin"
              : "anonymous",
          );
          navigate(nextPath, {
            replace: true,
          });
          return;
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

    const result = await authApi.completeFirstAccess(token, {
      newLogin: values.newLogin.trim(),
      newEmail: values.newEmail.trim(),
      newFullName: values.newFullName.trim(),
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });

    toast.success(result.message);

    const status = await authApi.getFirstAccessStatus(token);
    if (status.mfaRequired) {
      setTemporaryStage(status.mfaConfigured ? "mfa-assert-begin" : "mfa-register-begin");
      navigate(status.mfaConfigured ? "/auth/mfa" : "/auth/mfa/register", {
        replace: true,
      });
      return;
    }

    toast.error("Fluxo de onboarding retornou um estado inesperado. Faça login novamente.");
    navigate("/auth/login", { replace: true });
  };

  if (loadingStatus) {
    return <Loading message="Carregando obrigações do primeiro acesso..." />;
  }

  return (
    <Card className="border-border bg-surface/80 shadow-2xl backdrop-blur" padding>
      <CardHeader
        title="Primeiro acesso"
        subtitle="Atualize seus dados iniciais antes de concluir o cadastro da chave de segurança."
      />

      {statusError && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-100">
          {statusError}
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <Input label="Novo login" error={errors.newLogin?.message} {...register("newLogin")} />
        <Input label="Novo e-mail" type="email" error={errors.newEmail?.message} {...register("newEmail")} />
        <Input label="Nome completo" error={errors.newFullName?.message} {...register("newFullName")} />
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
            {passwordRules.map((rule) => (
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