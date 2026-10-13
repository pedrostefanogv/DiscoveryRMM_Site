import { describe, expect, it } from "vitest";
import {
  TASK_ACTION_FILTERS,
  TASK_STATUS_FILTERS,
  TASK_TRIGGER_FILTERS,
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
