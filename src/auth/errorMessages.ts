import { ApiError } from "@/api";

/**
 * Mensagem única para falhas de acesso que NÃO devem expor detalhes internos
 * (gateway, proxy, banco, stack trace). Vale para erros 5xx e falhas de rede.
 */
export const GENERIC_AUTH_ERROR_MESSAGE =
  "Não foi possível concluir o acesso agora. Tente novamente em instantes ou contate o administrador.";

/**
 * Status cujas mensagens vêm do servidor de forma controlada e são úteis ao
 * usuário (credenciais inválidas, conta bloqueada, MFA pendente, excesso de
 * tentativas). Qualquer outro status cai na mensagem genérica.
 */
const SAFE_AUTH_STATUSES = new Set([400, 401, 403, 409, 422, 423, 429]);

/**
 * Resolve a mensagem exibida na tela de login.
 *
 * A saída bruta da API nunca é repassada para status inesperados: uma falha de
 * infraestrutura (502/503/504) ou de rede vira uma orientação genérica e segura,
 * evitando revelar topologia/infra ao usuário.
 */
export function resolveLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && SAFE_AUTH_STATUSES.has(error.status)) {
    const message = error.message?.trim();
    if (message) {
      return message;
    }
  }

  return GENERIC_AUTH_ERROR_MESSAGE;
}
