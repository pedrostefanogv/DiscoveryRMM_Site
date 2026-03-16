import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { KeyRound, LaptopMinimal, ShieldPlus } from "lucide-react";
import { authApi } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import {
  ensureWebAuthnSupport,
  parseRegistrationOptions,
  serializeRegistrationCredential,
} from "@/auth/webauthn";
import { Button, Card, CardHeader, Input } from "@/components/ui";

const registrationSchema = z.object({
  keyName: z
    .string()
    .trim()
    .min(2, "Informe um nome com pelo menos 2 caracteres.")
    .max(80, "Use no maximo 80 caracteres."),
});

type RegistrationFormValues = z.infer<typeof registrationSchema>;

export default function MfaRegistrationPage() {
  const navigate = useNavigate();
  const { session, clearTemporarySession, setTemporaryStage } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const token = session.temporaryMfaToken ?? session.accessToken;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      keyName: "",
    },
  });

  const onSubmit = async (values: RegistrationFormValues) => {
    if (!token) {
      navigate("/auth/login", { replace: true });
      return;
    }

    setError(null);

    try {
      ensureWebAuthnSupport();
      setTemporaryStage("mfa-register-begin");

      const begin = await authApi.beginRegistrationFido2(token);
      const credential = await navigator.credentials.create({
        publicKey: parseRegistrationOptions(begin.options),
      });

      if (!(credential instanceof PublicKeyCredential)) {
        throw new Error("O navegador nao retornou uma credencial valida.");
      }

      setTemporaryStage("mfa-register-complete");
      const result = await authApi.completeRegistrationFido2(token, {
        keyName: values.keyName.trim(),
        attestationResponseJson: JSON.stringify(
          serializeRegistrationCredential(credential),
        ),
      });

      toast.success(result.message);

      if (session.temporaryMfaToken) {
        clearTemporarySession();
        toast.success("Chave registrada. Faca login novamente para concluir a autenticacao.");
        navigate("/auth/login", { replace: true });
        return;
      }

      navigate("/", { replace: true });
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Nao foi possivel registrar sua chave de seguranca.";
      setError(message);
      toast.error(message);
      setTemporaryStage("mfa-register-begin");
    }
  };

  return (
    <Card className="border-white/10 bg-slate-900/80 shadow-2xl backdrop-blur" padding>
      <CardHeader
        title="Registrar chave FIDO2"
        subtitle="Esta etapa conclui o onboarding inicial do MFA obrigatorio no backend."
      />

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <Input
          label="Nome da chave"
          placeholder="Notebook Pedro"
          error={errors.keyName?.message}
          {...register("keyName")}
        />

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          <div className="flex items-start gap-3">
            <LaptopMinimal className="mt-0.5 h-4 w-4 text-primary" />
            Use um nome amigavel para distinguir passkeys, chaves fisicas e autenticadores de plataforma.
          </div>
          <div className="mt-3 flex items-start gap-3">
            <KeyRound className="mt-0.5 h-4 w-4 text-accent" />
            O backend aceita nome vazio, mas a UI exige entre 2 e 80 caracteres para manter a gestao das chaves legivel.
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          <ShieldPlus className="h-4 w-4" /> Registrar chave
        </Button>
      </form>
    </Card>
  );
}