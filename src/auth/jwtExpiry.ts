/**
 * Verifica se um JWT temporário (mfa_pending / mfa_setup) já está expirado,
 * decodificando o payload no cliente. Evita chamar a API com um token morto
 * e receber um 401 genérico: o token pendente vale 3 minutos e o de setup 30,
 * e ambos ficam persistidos em sessionStorage — um reload da página depois
 * desse prazo deixava a tela usar um token já inválido.
 *
 * Retorna false quando não dá para decidir no cliente (token ausente de exp,
 * formato inesperado): nesse caso o servidor continua sendo a fonte da verdade.
 */
export function isTemporaryTokenExpired(token: string | null | undefined): boolean {
  if (!token) return true;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: unknown };
    if (typeof payload.exp !== "number") return false;
    // Margem de 5s para cobrir latência entre decisão local e chegada no servidor.
    return payload.exp * 1000 <= Date.now() + 5_000;
  } catch {
    return false;
  }
}
