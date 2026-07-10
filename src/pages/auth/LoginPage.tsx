import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowRight, LockKeyhole, UserRound, AlertTriangle } from "lucide-react";
import { ApiError } from "@/api";
import { Button, Card, CardHeader, Input } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";

const loginSchema = z.object({
  loginOrEmail: z.string().trim().min(1, "Informe seu login ou e-mail."),
  password: z.string().min(1, "Informe sua senha."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function routeForStage(stage: string) {
  switch (stage) {
    case "authenticated":
      return "/";
    case "first-access":
      return "/auth/first-access";
    case "mfa-register-begin":
      return "/auth/mfa/register";
    case "mfa-assert-begin":
      return "/auth/mfa";
    default:
      return "/auth/login";
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      loginOrEmail: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(null);

    try {
      const nextStage = await login(values);
      navigate(routeForStage(nextStage), { replace: true });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? "Não foi possível autenticar sua sessão. Verifique suas credenciais e tente novamente."
          : "Não foi possível autenticar sua sessão.";
      setSubmitError(message);
      toast.error(message);
    }
  };

  return (
    <Card className="border-border bg-surface/80 shadow-2xl backdrop-blur-xl" padding>
      <CardHeader
        title="Entrar"
        subtitle="Use seu login ou e-mail e conclua o fluxo de segurança exigido."
      />

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <Input
          label="Login ou e-mail"
          autoComplete="username webauthn"
          placeholder="admin ou admin@empresa.com"
          error={errors.loginOrEmail?.message}
          {...register("loginOrEmail")}
        />

        <Input
          label="Senha"
          type="password"
          autoComplete="current-password"
          placeholder="Sua senha"
          error={errors.password?.message}
          {...register("password")}
        />

        {submitError && (
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface-light p-4 text-sm text-muted space-y-2">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Caso não seja possível acessar o sistema, revise suas credenciais e consulte o administrador.</span>
          </div>
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>Quando necessário, o login seguirá automaticamente para a configuração da autenticação em duas etapas.</span>
          </div>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          <ArrowRight className="h-4 w-4" /> Entrar
        </Button>
      </form>
    </Card>
  );
}