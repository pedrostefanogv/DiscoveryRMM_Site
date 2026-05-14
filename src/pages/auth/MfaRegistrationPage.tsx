import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { KeyRound, LaptopMinimal, ShieldPlus, ShieldEllipsis } from "lucide-react";
import { ApiError, authApi } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import {
  describeWebAuthnError,
  ensureWebAuthnSupport,
  getWebAuthnEnvironmentInfo,
  parseRegistrationOptions,
  serializeRegistrationCredential,
} from "@/auth/webauthn";
import { Button, Card, CardHeader, Input } from "@/components/ui";

function resolveRoleMfaRequirement(roleMfaRequirement: string | undefined) {
  if (roleMfaRequirement === "Totp") return "Totp";
  if (roleMfaRequirement === "Fido2") return "Fido2";
  return "Fido2";
}

export default function MfaRegistrationPage() {
  const navigate = useNavigate();
  const { session, clearTemporarySession, setTemporaryStage } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [totpSetupData, setTotpSetupData] = useState<{
    secretBase32: string;
    qrCodeUri: string;
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const environment = getWebAuthnEnvironmentInfo();

  const token = session.temporaryMfaToken ?? session.accessToken;
  const roleMfaRequirement = resolveRoleMfaRequirement(
    session.loginResponse?.roleMfaRequirement ??
      session.loginResponse?.RoleMfaRequirement,
  );
  const isTotpFlow = roleMfaRequirement === "Totp";

  const onSubmit = async () => {
    if (!token) {
      navigate("/auth/login", { replace: true });
      return;
    }

    const trimmedKeyName = keyName.trim();
    if (trimmedKeyName.length < 2 || trimmedKeyName.length > 80) {
      const message = "Informe um nome entre 2 e 80 caracteres.";
      setError(message);
      toast.error(message);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      if (isTotpFlow) {
        if (!totpSetupData) {
          setTemporaryStage("mfa-register-begin");
          const begin = await authApi.beginRegistrationTotp(token);
          setTotpSetupData(begin);
          toast.success(begin.message);
          return;
        }

        const sanitizedCode = verificationCode.replace(/\D/g, "");
        if (sanitizedCode.length < 6) {
          const message = "Informe o codigo de verificacao TOTP com 6 digitos.";
          setError(message);
          toast.error(message);
          return;
        }

        setTemporaryStage("mfa-register-complete");
        const result = await authApi.completeRegistrationTotp(token, {
          secretBase32: totpSetupData.secretBase32,
          verificationCode: sanitizedCode,
          keyName: trimmedKeyName,
        });

        if (result.backupCodes.length) {
          toast.success("OTP registrado. Guarde os codigos de backup em local seguro.");
        } else {
          toast.success(result.message);
        }
      } else {
        ensureWebAuthnSupport();
        setTemporaryStage("mfa-register-begin");

        const begin = await authApi.beginRegistrationFido2(token);
        const credential = await navigator.credentials.create({
          publicKey: parseRegistrationOptions(begin.options),
        });

        if (!(credential instanceof PublicKeyCredential)) {
          throw new Error("O navegador não retornou uma credencial válida.");
        }

        setTemporaryStage("mfa-register-complete");
        const result = await authApi.completeRegistrationFido2(token, {
          keyName: trimmedKeyName,
          attestationResponseJson: JSON.stringify(
            serializeRegistrationCredential(credential),
          ),
        });

        toast.success(result.message);
      }

      if (session.temporaryMfaToken) {
        clearTemporarySession();
        toast.success("MFA registrado. Faca login novamente para concluir a autenticacao.");
        navigate("/auth/login", { replace: true });
        return;
      }

      navigate("/", { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearTemporarySession();
        setTemporaryStage("anonymous");
        toast.error(
          "Seu token temporário de MFA não é mais válido. Faça login novamente para emitir um novo token de configuração.",
        );
        navigate("/auth/login", { replace: true });
        return;
      }

      if (caught instanceof ApiError && caught.status === 403) {
        const message = "Seu perfil exige outro metodo de MFA. Faca login novamente e siga o fluxo correspondente.";
        setError(message);
        toast.error(message);
        return;
      }

      const message =
        isTotpFlow && caught instanceof ApiError
          ? caught.message
          : describeWebAuthnError(caught);
      setError(message);
      toast.error(message);
      setTemporaryStage("mfa-register-begin");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-white/10 bg-slate-900/80 shadow-2xl backdrop-blur" padding>
      <CardHeader
        title={isTotpFlow ? "Registrar OTP" : "Registrar chave FIDO2"}
        subtitle={
          isTotpFlow
            ? "Configure o autenticador OTP para concluir o onboarding inicial de MFA."
            : "Esta etapa conclui o onboarding inicial do MFA obrigatorio no backend."
        }
      />

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
      >
        <Input
          label={isTotpFlow ? "Nome do autenticador" : "Nome da chave"}
          placeholder="Notebook Pedro"
          value={keyName}
          onChange={(event) => setKeyName(event.target.value)}
        />

        {isTotpFlow && totpSetupData && (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Use este URI no autenticador:</p>
              <p className="mt-2 break-all text-xs text-slate-300">{totpSetupData.qrCodeUri}</p>
              <p className="mt-3 text-xs text-slate-400">{totpSetupData.message}</p>
            </div>
            <Input
              label="Codigo de verificacao"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder="123456"
              value={verificationCode}
              onChange={(event) => {
                const sanitized = event.target.value.replace(/\D/g, "").slice(0, 8);
                setVerificationCode(sanitized);
              }}
            />
          </>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          <div className="flex items-start gap-3">
            {isTotpFlow ? (
              <ShieldEllipsis className="mt-0.5 h-4 w-4 text-primary" />
            ) : (
              <LaptopMinimal className="mt-0.5 h-4 w-4 text-primary" />
            )}
            {isTotpFlow
              ? "Escaneie o QR code (ou use o URI), gere o codigo e confirme para finalizar o cadastro OTP."
              : "Use um nome amigavel para distinguir passkeys, chaves fisicas e autenticadores de plataforma."}
          </div>
          <div className="mt-3 flex items-start gap-3">
            <KeyRound className="mt-0.5 h-4 w-4 text-accent" />
            O backend aceita nome vazio, mas a UI exige entre 2 e 80 caracteres para manter a gestao das chaves legivel.
          </div>
        </div>

        <div className={`rounded-2xl border px-4 py-3 text-sm ${environment.isSecureContext ? 'border-accent/30 bg-accent/10 text-cyan-100' : 'border-warning/30 bg-warning/10 text-amber-50'}`}>
          Local atual: <strong>{environment.origin}</strong>. {environment.isSecureContext
            ? "Este contexto e considerado seguro para WebAuthn; se houver 401, o problema e de token/permissao no backend."
            : "Este contexto não é seguro para WebAuthn; o navegador pode bloquear a operação."}
        </div>

        {error && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          <ShieldPlus className="h-4 w-4" />
          {isTotpFlow
            ? totpSetupData
              ? " Confirmar OTP"
              : "Iniciar configuração OTP"
            : " Registrar chave"}
        </Button>
      </form>
    </Card>
  );
}