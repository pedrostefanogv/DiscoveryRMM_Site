import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Fingerprint, ShieldCheck, TriangleAlert } from "lucide-react";
import { authApi } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import {
  ensureWebAuthnSupport,
  parseAssertionOptions,
  serializeAssertionCredential,
} from "@/auth/webauthn";
import { Button, Card, CardHeader } from "@/components/ui";

export default function MfaAssertionPage() {
  const navigate = useNavigate();
  const { session, completeAuthenticatedSession, setTemporaryStage } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const token = session.temporaryMfaToken;

  const handleAuthenticate = async () => {
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
      const message =
        caught instanceof Error
          ? caught.message
          : "Nao foi possivel validar sua chave de seguranca.";
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
        title="Validar chave de seguranca"
        subtitle="Conclua a assercao WebAuthn para trocar o token temporario por uma sessao autenticada."
      />

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
          <div className="flex items-start gap-3">
            <Fingerprint className="mt-0.5 h-5 w-5 text-primary" />
            Use sua passkey, chave FIDO2 ou autenticador compativel registrado para concluir o login.
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-red-100">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-4 w-4" />
              {error}
            </div>
          </div>
        )}

        <Button className="w-full" size="lg" loading={isRunning} onClick={handleAuthenticate}>
          <ShieldCheck className="h-4 w-4" /> Iniciar validacao FIDO2
        </Button>
      </div>
    </Card>
  );
}