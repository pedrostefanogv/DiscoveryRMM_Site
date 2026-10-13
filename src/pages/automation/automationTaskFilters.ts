/**
 * Opções de filtro da listagem de tarefas em /automation/tasks.
 *
 * Os `value` são exatamente o que o backend espera em `actionTypes` e `triggers`
 * (nomes dos enums e das flags), para o filtro ser aplicado no servidor junto da
 * paginação por cursor — filtrar só a página carregada daria contagens erradas.
 */

export const TASK_ACTION_FILTERS = [
  { value: "InstallPackage", label: "Instalar pacote" },
  { value: "UpdatePackage", label: "Atualizar pacote" },
  { value: "RemovePackage", label: "Remover pacote" },
  { value: "UpdateOrInstallPackage", label: "Atualizar/Instalar pacote" },
  { value: "RunScript", label: "Executar script" },
  { value: "CustomCommand", label: "Comando personalizado" },
] as const;

export const TASK_TRIGGER_FILTERS = [
  { value: "Immediate", label: "Imediato" },
  { value: "Recurring", label: "Recorrente" },
  { value: "OnUserLogin", label: "Login do usuário" },
  { value: "OnAgentCheckIn", label: "Check-in do agent" },
] as const;

export const TASK_STATUS_FILTERS = [
  { value: "", label: "Todos" },
  { value: "active", label: "Ativas" },
  { value: "inactive", label: "Inativas" },
] as const;

export type TaskActionFilterValue = (typeof TASK_ACTION_FILTERS)[number]["value"];
export type TaskTriggerFilterValue = (typeof TASK_TRIGGER_FILTERS)[number]["value"];
export type TaskStatusFilterValue = (typeof TASK_STATUS_FILTERS)[number]["value"];

/** Adiciona/remove um valor da seleção múltipla (chips). */
export function toggleFilterValue<T extends string>(selected: readonly T[], value: T): T[] {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}

/** Traduz o status escolhido na UI para o parâmetro `isActive` do backend. */
export function statusFilterToIsActive(status: TaskStatusFilterValue): boolean | undefined {
  if (status === "active") return true;
  if (status === "inactive") return false;
  return undefined;
}
