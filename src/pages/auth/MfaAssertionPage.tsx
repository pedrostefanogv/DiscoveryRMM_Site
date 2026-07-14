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

  const isFirefox =
    typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);

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
      const publicKeyOptions = parseAssertionOptions(begin.options);

      let credential: Credential | null;

      try {
        credential = await navigator.credentials.get({
          publicKey: publicKeyOptions,
        });
      } catch (error) {
        const shouldRetryWithoutRpId =
          isFirefox &&
          error instanceof DOMException &&
          error.name === "SecurityError" &&
          typeof publicKeyOptions.rpId === "string";

        if (!shouldRetryWithoutRpId) {
          throw error;
        }

        const fallbackOptions: PublicKeyCredentialRequestOptions = {
          ...publicKeyOptions,
        };
        delete fallbackOptions.rpId;

        credential = await navigator.credentials.get({
          publicKey: fallbackOptions,
        });
      }

      if (!(credential instanceof PublicKeyCredential)) {
        throw new Error("O navegador não retornou uma credencial válida.");
      }

      setTemporaryStage("mfa-assert-complete");
      const tokens = await authApi.completeLoginFido2(token, {
        assertionResponseJson: JSON.stringify(
          serializeAssertionCredential(credential),
        ),
      });

      await completeAuthenticatedSession(tokens);
      toast.success("Autenticação concluida com sucesso.");
      const target = sessionStorage.getItem("discovery.auth.redirectTo") ?? "/";
      sessionStorage.removeItem("discovery.auth.redirectTo");
      navigate(target, { replace: true });
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
          "Seu token temporário de MFA não é mais válido. Faça login novamente para emitir um novo token.",
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
      const message = "Informe o código OTP com 6 dígitos.";
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
       toast.success("Autenticação concluída com sucesso.");
       const target = sessionStorage.getItem("discovery.auth.redirectTo") ?? "/";
       sessionStorage.removeItem("discovery.auth.redirectTo");
       navigate(target, { replace: true });
     } catch (caught) {
       if (caught instanceof ApiError && caught.status === 403) {
         const message = "Seu perfil exige outro método de MFA. Inicie novamente o login para seguir o fluxo correto.";
        setError(message);
        toast.error(message);
        return;
      }

      if (caught instanceof ApiError && caught.status === 401) {
        clearTemporarySession();
        setTemporaryStage("anonymous");
        toast.error(
           "Seu token temporário de MFA não é mais válido. Faça login novamente para emitir um novo token.",
         );
         navigate("/auth/login", { replace: true });
         return;
       }

       const message =
         caught instanceof ApiError
           ? caught.message
           : "Não foi possível validar o código OTP.";
      setError(message);
      toast.error(message);
      setTemporaryStage("mfa-assert-begin");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="border-border bg-surface/80 shadow-2xl backdrop-blur" padding>
      <CardHeader
        title={isTotpFlow ? "Validar OTP" : "Validar chave de segurança"}
        subtitle={
          isTotpFlow
            ? "Informe o código do autenticador para trocar o token temporário por uma sessão autenticada."
             : "Conclua a asserção WebAuthn para trocar o token temporário por uma sessão autenticada."
        }
      />

      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface-light p-5 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            {isTotpFlow ? (
              <ShieldEllipsis className="mt-0.5 h-5 w-5 text-primary" />
            ) : (
              <Fingerprint className="mt-0.5 h-5 w-5 text-primary" />
            )}
            {isTotpFlow
               ? "Seu perfil exige OTP. Digite o código temporário gerado no autenticador."
               : "Seu perfil exige FIDO2. Use sua passkey, chave física ou autenticador compatível registrado para concluir o login."}
          </div>
        </div>

        {isTotpFlow && (
          <Input
            label="Código OTP"
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
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-red-800 dark:text-red-100">
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
          {isTotpFlow ? "Validar OTP" : "Iniciar validação FIDO2"}
        </Button>
      </div>
    </Card>
  );
}