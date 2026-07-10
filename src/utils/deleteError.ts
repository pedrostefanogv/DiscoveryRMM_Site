import { ApiError } from "@/api";

/**
 * Normalizes delete error responses into user-friendly PT-BR messages.
 * Handles FK constraint violations (400/500), auth errors, and generic failures.
 */
export function getDeleteErrorMessage(
  error: unknown,
  entityName: string,
): string {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return `ID de ${entityName} inválido.`;
    }

    if (error.status === 401) {
      return `Não autenticado para excluir ${entityName}.`;
    }

    if (error.status === 404) {
      return `${entityName} não encontrado(a).`;
    }

    if (error.status === 500 || error.status === 409) {
      if (isLikelyDeleteDependencyError(error.message)) {
        return `Não foi possível excluir ${entityName} pois existem vínculos ativos (FK).`;
      }
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return `Falha ao excluir ${entityName}.`;
}

/**
 * Heuristic to detect FK/dependency constraint errors from the error message.
 */
function isLikelyDeleteDependencyError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("foreign key") ||
    normalized.includes("constraint") ||
    normalized.includes("violates") ||
    normalized.includes("dependency") ||
    normalized.includes("referenced") ||
    normalized.includes("vínculo") ||
    normalized.includes("dependentes") ||
    normalized.includes("an error occurred while processing your request") ||
    normalized === "erro interno do servidor" ||
    normalized === "internal server error"
  );
}
