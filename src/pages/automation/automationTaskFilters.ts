import { AppApprovalScopeType } from "@/api/types";

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

/** Parâmetros de escopo enviados à listagem de tarefas. */
export interface TaskScopeFilter {
  scopeType?: AppApprovalScopeType;
  scopeId?: string;
  clientId?: string;
  siteId?: string;
  agentId?: string;
}

/**
 * Traduz o "Escopo" + o bloco único Cliente/Site/Agent nos parâmetros da API.
 *
 * Com um tipo de escopo escolhido, o id vem do nível correspondente (o backend
 * casa `ScopeType + ScopeId`). Sem tipo, os ids viram filtro das colunas
 * derivadas da tarefa (tarefas que se aplicam àquele cliente/site/agente,
 * qualquer que seja o nível do escopo).
 */
export function buildTaskScopeFilter(
  scopeType: string,
  clientId: string,
  siteId: string,
  agentId: string,
): TaskScopeFilter {
  const type = scopeType ? (Number(scopeType) as AppApprovalScopeType) : undefined;

  if (type === AppApprovalScopeType.Global) return { scopeType: type };

  if (type === AppApprovalScopeType.Client) {
    return { scopeType: type, clientId: clientId || undefined, scopeId: clientId || undefined };
  }

  if (type === AppApprovalScopeType.Site) {
    return {
      scopeType: type,
      clientId: clientId || undefined,
      siteId: siteId || undefined,
      scopeId: siteId || undefined,
    };
  }

  if (type === AppApprovalScopeType.Agent) {
    return {
      scopeType: type,
      clientId: clientId || undefined,
      siteId: siteId || undefined,
      agentId: agentId || undefined,
      scopeId: agentId || undefined,
    };
  }

  // Sem tipo: filtro pelas colunas derivadas.
  return {
    clientId: clientId || undefined,
    siteId: siteId || undefined,
    agentId: agentId || undefined,
  };
}

/** Traduz o status escolhido na UI para o parâmetro `isActive` do backend. */
export function statusFilterToIsActive(status: TaskStatusFilterValue): boolean | undefined {
  if (status === "active") return true;
  if (status === "inactive") return false;
  return undefined;
}
