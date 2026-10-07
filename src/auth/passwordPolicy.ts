import { z } from "zod";

/**
 * Fonte única da política de senha no console web.
 *
 * Espelha IPasswordService.ValidatePolicy (UserPasswordService, defaults de
 * Authentication:PasswordPolicy). Antes, ProfilePage exigia apenas 8 caracteres,
 * FirstAccessPage exigia 12+complexidade e o backend exigia 12+complexidade — o
 * usuário só descobria a regra real com o erro 400 do servidor.
 */
export const PASSWORD_MIN_LENGTH = 12;

export const PASSWORD_RULES = [
  `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`,
  "Pelo menos uma letra maiúscula.",
  "Pelo menos um número.",
  "Pelo menos um caractere especial.",
] as const;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`)
  .regex(/[A-Z]/, "A senha deve conter pelo menos uma letra maiúscula.")
  .regex(/[0-9]/, "A senha deve conter pelo menos um número.")
  .regex(/[^A-Za-z0-9]/, "A senha deve conter pelo menos um caractere especial.");

/** Retorna a primeira mensagem de violação ou null quando a senha é válida. */
export function validatePassword(password: string): string | null {
  const parsed = passwordSchema.safeParse(password);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? "A senha não atende à política mínima.";
}

/** Lista completa de violações (útil para exibir todas as regras pendentes). */
export function listPasswordViolations(password: string): string[] {
  const parsed = passwordSchema.safeParse(password);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}
