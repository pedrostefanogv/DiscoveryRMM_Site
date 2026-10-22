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
/**
 * Um 401 na asserção de MFA pode significar DUAS coisas:
 * - código OTP errado ("OTP inválido.") → o usuário pode tentar outro código na
 *   mesma tela (o token pendente continua válido);
 * - token pendente expirado (3 min), desafio já consumido ou estado de MFA
 *   inconsistente → é preciso refazer o login para emitir um novo token.
 * Diferencia pela mensagem do servidor para não expulsar o usuário do fluxo
 * quando ele só digitou o código errado.
 */
export function isRetryableMfaCodeError(message: string): boolean {
  return /otp inv[áa]lid|c[óo]digo inv[áa]lid|c[óo]digo de backup|informe o c[óo]digo/i.test(
    message,
  );
}

export function resolveLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && SAFE_AUTH_STATUSES.has(error.status)) {
    const message = error.message?.trim();
    if (message) {
      // "Credenciais inválidas" cobre usuário inexistente E senha errada (a API
      // não diferencia por segurança). Acrescenta dica acionável sem expor nada:
      // causa comum é usar o e-mail quando o cadastro é só o login, ou colar a
      // senha temporária com espaço extra (a API não faz trim da senha).
      if (/credenciais inv[áa]lid/i.test(message)) {
        return (
          message +
          " Verifique se este é exatamente o login ou e-mail cadastrado (ex.: use o login, se o e-mail nunca foi cadastrado) e cole a senha sem espaços extras."
        );
      }
      return message;
    }
  }

  return GENERIC_AUTH_ERROR_MESSAGE;
}
