import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Fingerprint, ShieldCheck, ShieldEllipsis, TriangleAlert } from "lucide-react";
import { ApiError, authApi } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import {
  describeWebAuthnError,
  ensureWebAuthnSupport,
  parseAssertionOptions,
  serializeAssertionCredential,
} from "@/auth/webauthn";
import { Button, Card, CardHeader, Input } from "@/components/ui";

function resolveRoleMfaRequirement(roleMfaRequirement: string | undefined) {
  if (roleMfaRequirement === "Totp") return "Totp";
  if (roleMfaRequirement === "Fido2") return "Fido2";
  return "Fido2";
}

export default function MfaAssertionPage() {
  const navigate = useNavigate();
  const {
    session,
    completeAuthenticatedSession,
    setTemporaryStage,
    clearTemporarySession,
  } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  const token = session.temporaryMfaToken;
  const roleMfaRequirement = resolveRoleMfaRequirement(
    session.loginResponse?.roleMfaRequirement ??
      session.loginResponse?.RoleMfaRequirement,
  );
  const isTotpFlow = roleMfaRequirement === "Totp";

  const handleAuthenticateFido2 = async () => {
    if (!token) {
      navigate("/auth/login", { replace: true });
      return;
    }

    setError(null);
    setIsRunning(true);

    try {
      ensureWebAuthnSupport();
      setTemporaryStage("mfa-assert-begin");

      const begin = await authApi.beginLoginFido2(token);
      const credential = await navigator.credentials.get({
        publicKey: parseAssertionOptions(begin.options),
      });

      if (!(credential instanceof PublicKeyCredential)) {
        throw new Error("O navegador nao retornou uma credencial valida.");
      }

      setTemporaryStage("mfa-assert-complete");
      const tokens = await authApi.completeLoginFido2(token, {
        assertionResponseJson: JSON.stringify(
          serializeAssertionCredential(credential),
        ),
      });

      await completeAuthenticatedSession(tokens);
      toast.success("Autenticacao concluida com sucesso.");
      navigate("/", { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        const message = "Seu perfil exige outro metodo de MFA. Inicie novamente o login para seguir o fluxo correto.";
        setError(message);
        toast.error(message);
        return;
      }

      if (caught instanceof ApiError && caught.status === 401) {
        clearTemporarySession();
        setTemporaryStage("anonymous");
        toast.error(
          "Seu token temporario de MFA nao e mais valido. Faca login novamente para emitir um novo token.",
        );
        navigate("/auth/login", { replace: true });
        return;
      }

      const message = describeWebAuthnError(caught);
      setError(message);
      toast.error(message);
      setTemporaryStage("mfa-assert-begin");
    } finally {
      setIsRunning(false);
    }
  };

  const handleAuthenticateOtp = async () => {
    if (!token) {
      navigate("/auth/login", { replace: true });
      return;
    }

    const code = otpCode.trim();
    if (code.length < 6) {
      const message = "Informe o codigo OTP com 6 digitos.";
      setError(message);
      toast.error(message);
      return;
    }

    setError(null);
    setIsRunning(true);

    try {
      setTemporaryStage("mfa-assert-complete");
      const tokens = await authApi.completeLoginOtp(token, { code });
      await completeAuthenticatedSession(tokens);
      toast.success("Autenticacao concluida com sucesso.");
      navigate("/", { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        const message = "Seu perfil exige outro metodo de MFA. Inicie novamente o login para seguir o fluxo correto.";
        setError(message);
        toast.error(message);
        return;
      }

      if (caught instanceof ApiError && caught.status === 401) {
        clearTemporarySession();
        setTemporaryStage("anonymous");
        toast.error(
          "Seu token temporario de MFA nao e mais valido. Faca login novamente para emitir um novo token.",
        );
        navigate("/auth/login", { replace: true });
        return;
      }

      const message =
        caught instanceof ApiError
          ? caught.message
          : "Nao foi possivel validar o codigo OTP.";
      setError(message);
      toast.error(message);
      setTemporaryStage("mfa-assert-begin");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="border-white/10 bg-slate-900/80 shadow-2xl backdrop-blur" padding>
      <CardHeader
        title={isTotpFlow ? "Validar OTP" : "Validar chave de seguranca"}
        subtitle={
          isTotpFlow
            ? "Informe o codigo do autenticador para trocar o token temporario por uma sessao autenticada."
            : "Conclua a assercao WebAuthn para trocar o token temporario por uma sessao autenticada."
        }
      />

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
          <div className="flex items-start gap-3">
            {isTotpFlow ? (
              <ShieldEllipsis className="mt-0.5 h-5 w-5 text-primary" />
            ) : (
              <Fingerprint className="mt-0.5 h-5 w-5 text-primary" />
            )}
            {isTotpFlow
              ? "Seu perfil exige OTP. Digite o codigo temporario gerado no autenticador."
              : "Seu perfil exige FIDO2. Use sua passkey, chave fisica ou autenticador compativel registrado para concluir o login."}
          </div>
        </div>

        {isTotpFlow && (
          <Input
            label="Codigo OTP"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="123456"
            value={otpCode}
            onChange={(event) => {
              const sanitized = event.target.value.replace(/\D/g, "").slice(0, 8);
              setOtpCode(sanitized);
            }}
          />
        )}

        {error && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-red-100">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-4 w-4" />
              {error}
            </div>
          </div>
        )}

        <Button
          className="w-full"
          size="lg"
          loading={isRunning}
          onClick={isTotpFlow ? handleAuthenticateOtp : handleAuthenticateFido2}
        >
          <ShieldCheck className="h-4 w-4" />
          {isTotpFlow ? " Validar OTP" : " Iniciar validacao FIDO2"}
        </Button>
      </div>
    </Card>
  );
}