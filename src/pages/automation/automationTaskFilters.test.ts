import { describe, expect, it } from "vitest";
import { AppApprovalScopeType } from "@/api/types";
import {
  TASK_ACTION_FILTERS,
  TASK_STATUS_FILTERS,
  TASK_TRIGGER_FILTERS,
  buildTaskScopeFilter,
  statusFilterToIsActive,
  toggleFilterValue,
} from "./automationTaskFilters";

/**
 * Contrato dos filtros da tela de tarefas.
 *
 * Os `value` vão direto para a query da API (`actionTypes`, `triggers`,
 * `isActive`). Se alguém renomear um deles aqui sem mudar o backend, o filtro
 * deixa de casar silenciosamente — por isso os valores são fixados no teste.
 */
/**
 * A tela tinha DOIS conjuntos de selects de escopo (um para o ScopeId e outro
 * para os filtros avançados) + um campo read-only repetindo o GUID escolhido.
 * Agora o "Escopo" + um único bloco Cliente/Site/Agent alimentam a query.
 */
describe("buildTaskScopeFilter", () => {
  it("sem tipo de escopo filtra pelas colunas derivadas", () => {
    expect(buildTaskScopeFilter("", "c1", "s1", "a1")).toEqual({
      clientId: "c1",
      siteId: "s1",
      agentId: "a1",
    });
  });

  it("escopo global não envia ids", () => {
    expect(
      buildTaskScopeFilter(String(AppApprovalScopeType.Global), "c1", "s1", "a1"),
    ).toEqual({ scopeType: AppApprovalScopeType.Global });
  });

  it("escopo de cliente usa o cliente como ScopeId", () => {
    expect(
      buildTaskScopeFilter(String(AppApprovalScopeType.Client), "c1", "s1", "a1"),
    ).toEqual({
      scopeType: AppApprovalScopeType.Client,
      clientId: "c1",
      scopeId: "c1",
    });
  });

  it("escopo de site usa o site como ScopeId", () => {
    expect(
      buildTaskScopeFilter(String(AppApprovalScopeType.Site), "c1", "s1", "a1"),
    ).toEqual({
      scopeType: AppApprovalScopeType.Site,
      clientId: "c1",
      siteId: "s1",
      scopeId: "s1",
    });
  });

  it("escopo de agente usa o agent como ScopeId", () => {
    expect(
      buildTaskScopeFilter(String(AppApprovalScopeType.Agent), "c1", "s1", "a1"),
    ).toEqual({
      scopeType: AppApprovalScopeType.Agent,
      clientId: "c1",
      siteId: "s1",
      agentId: "a1",
      scopeId: "a1",
    });
  });

  it("tipo escolhido sem id selecionado não inventa ScopeId", () => {
    expect(buildTaskScopeFilter(String(AppApprovalScopeType.Site), "c1", "", "")).toEqual({
      scopeType: AppApprovalScopeType.Site,
      clientId: "c1",
      siteId: undefined,
      scopeId: undefined,
    });
  });
});

describe("automationTaskFilters", () => {
  it("usa os nomes de trigger aceitos pelo backend", () => {
    expect(TASK_TRIGGER_FILTERS.map((option) => option.value)).toEqual([
      "Immediate",
      "Recurring",
      "OnUserLogin",
      "OnAgentCheckIn",
    ]);
  });

  it("usa os nomes de ActionType aceitos pelo backend", () => {
    expect(TASK_ACTION_FILTERS.map((option) => option.value)).toEqual([
      "InstallPackage",
      "UpdatePackage",
      "RemovePackage",
      "UpdateOrInstallPackage",
      "RunScript",
      "CustomCommand",
    ]);
  });

  it("não repete valores nas opções", () => {
    for (const options of [TASK_ACTION_FILTERS, TASK_TRIGGER_FILTERS, TASK_STATUS_FILTERS]) {
      const values = options.map((option) => option.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("toggleFilterValue adiciona e remove", () => {
    expect(toggleFilterValue([], "RunScript")).toEqual(["RunScript"]);
    expect(toggleFilterValue(["RunScript"], "RunScript")).toEqual([]);
    expect(toggleFilterValue(["RunScript"], "InstallPackage")).toEqual(["RunScript", "InstallPackage"]);
  });

  it("não muta a lista original", () => {
    const original = ["Immediate"];
    toggleFilterValue(original, "Recurring");
    expect(original).toEqual(["Immediate"]);
  });

  it("traduz status para isActive", () => {
    expect(statusFilterToIsActive("active")).toBe(true);
    expect(statusFilterToIsActive("inactive")).toBe(false);
    expect(statusFilterToIsActive("")).toBeUndefined();
  });
});
