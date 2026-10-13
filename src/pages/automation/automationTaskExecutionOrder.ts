/**
 * Ordem de execução das tarefas em /automation/tasks.
 *
 * O agent monta uma fila sequencial e executa da MENOR ordem para a MAIOR. Em
 * caso de empate, roda primeiro a tarefa atualizada há mais tempo. O valor é um
 * inteiro de 0 a 99. Quando a tarefa não informa a ordem, o servidor aplica o
 * default do ActionType — este arquivo replica o MESMO mapa do backend.
 */

import { AutomationTaskActionType } from "@/api/types";

/** Default de ordem de execução por ActionType (espelha o mapa do backend). */
export const DEFAULT_EXECUTION_ORDER_BY_ACTION = {
  InstallPackage: 10,
  UpdateOrInstallPackage: 20,
  UpdatePackage: 20,
  RemovePackage: 30,
  RunScript: 40,
  CustomCommand: 50,
} as const;

export type ExecutionOrderActionName = keyof typeof DEFAULT_EXECUTION_ORDER_BY_ACTION;

/** Limites aceitos pelo backend para a ordem de execução. */
export const MIN_EXECUTION_ORDER = 0;
export const MAX_EXECUTION_ORDER = 99;

/** Valor usado quando o ActionType não é reconhecido (o backend também usa 50). */
export const FALLBACK_EXECUTION_ORDER = DEFAULT_EXECUTION_ORDER_BY_ACTION.CustomCommand;

/**
 * Converte o ActionType (enum numérico ou nome em string) no nome canônico
 * usado pelo mapa de defaults. Devolve null quando não reconhece.
 */
function executionOrderActionName(actionType: unknown): ExecutionOrderActionName | null {
  if (actionType === null || actionType === undefined) return null;
  if (typeof actionType === "number") {
    switch (actionType) {
      case AutomationTaskActionType.InstallPackage:
        return "InstallPackage";
      case AutomationTaskActionType.UpdateOrInstallPackage:
        return "UpdateOrInstallPackage";
      case AutomationTaskActionType.UpdatePackage:
        return "UpdatePackage";
      case AutomationTaskActionType.RemovePackage:
        return "RemovePackage";
      case AutomationTaskActionType.RunScript:
        return "RunScript";
      case AutomationTaskActionType.CustomCommand:
        return "CustomCommand";
      default:
        return null;
    }
  }
  if (typeof actionType === "string") {
    if (actionType in DEFAULT_EXECUTION_ORDER_BY_ACTION) {
      return actionType as ExecutionOrderActionName;
    }
    const numeric = Number(actionType);
    if (!Number.isNaN(numeric)) return executionOrderActionName(numeric);
  }
  return null;
}

/**
 * Default de ordem de execução para um ActionType. Aceita tanto o enum numérico
 * quanto o nome em string ("InstallPackage"); desconhecido cai em 50.
 */
export function defaultExecutionOrderForAction(actionType: unknown): number {
  const name = executionOrderActionName(actionType);
  return name ? DEFAULT_EXECUTION_ORDER_BY_ACTION[name] : FALLBACK_EXECUTION_ORDER;
}

/**
 * Valida o valor DIGITADO no formulário. No formulário o campo é obrigatório:
 * string vazia é erro. Devolve a mensagem em pt-BR ou null quando é um inteiro
 * entre 0 e 99.
 */
export function executionOrderError(raw: string): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return "Ordem de execução é obrigatória";
  if (!/^\d+$/.test(value)) return "Ordem de execução deve ser um número inteiro entre 0 e 99";
  const numeric = Number(value);
  if (numeric < MIN_EXECUTION_ORDER || numeric > MAX_EXECUTION_ORDER) {
    return "Ordem de execução deve estar entre 0 e 99";
  }
  return null;
}

/**
 * Ajusta um número para o intervalo aceito (0..99). Valores não finitos caem no
 * default de segurança.
 */
export function clampExecutionOrder(value: number): number {
  if (!Number.isFinite(value)) return FALLBACK_EXECUTION_ORDER;
  return Math.min(MAX_EXECUTION_ORDER, Math.max(MIN_EXECUTION_ORDER, Math.trunc(value)));
}
