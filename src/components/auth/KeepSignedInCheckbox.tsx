import { useEffect, useState } from "react";

import { Icon } from "@/components/ui";
import { isKeepSignedInEnabled, setKeepSignedInEnabled } from "@/auth/storage";

/**
 * Checkbox "Manter-me conectado" da tela de login.
 *
 * Controla onde os tokens da sessão são persistidos:
 * - marcado   → localStorage (a sessão sobrevive ao fechar o navegador)
 * - desmarcado → sessionStorage (padrão; refazer login/MFA a cada nova aba)
 *
 * A preferência é aplicada na hora: marcar o checkbox já migra a sessão atual,
 * mesmo antes do próximo login, então alternar não exige recarregar a página.
 */
export function KeepSignedInCheckbox({ disabled }: { disabled?: boolean }) {
  const [checked, setChecked] = useState(() => isKeepSignedInEnabled());

  // Sincroniza com mudanças feitas em outra aba da mesma janela.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "discovery.auth.keep-signed-in.v1") {
        setChecked(isKeepSignedInEnabled());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleChange = (next: boolean) => {
    setChecked(next);
    setKeepSignedInEnabled(next);
  };

  return (
    <label
      className={
        "flex cursor-pointer select-none items-start gap-3 text-sm text-muted" +
        (disabled ? " cursor-not-allowed opacity-60" : "")
      }
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => handleChange(event.target.checked)}
      />
      <span className="flex items-start gap-1.5">
        <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        Manter-me conectado neste navegador — evita refazer o login e a
        verificação de MFA ao fechar a aba.
      </span>
    </label>
  );
}
