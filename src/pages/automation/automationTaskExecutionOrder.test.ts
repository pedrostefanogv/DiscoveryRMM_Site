import { describe, expect, it } from "vitest";
import { AutomationTaskActionType } from "@/api/types";
import {
  DEFAULT_EXECUTION_ORDER_BY_ACTION,
  FALLBACK_EXECUTION_ORDER,
  MAX_EXECUTION_ORDER,
  MIN_EXECUTION_ORDER,
  clampExecutionOrder,
  defaultExecutionOrderForAction,
  executionOrderError,
} from "./automationTaskExecutionOrder";

/**
 * Contrato da ordem de execução das tarefas.
 *
 * O mapa replica o default que o backend aplica quando a ordem não é enviada.
 * Se um valor divergir daqui, a prévia no formulário passa a mentir — por isso
 * os valores são fixados no teste.
 */
describe("automationTaskExecutionOrder", () => {
  it("fixa os defaults por ActionType (mesmo mapa do backend)", () => {
    expect(DEFAULT_EXECUTION_ORDER_BY_ACTION).toEqual({
      InstallPackage: 10,
      UpdateOrInstallPackage: 20,
      UpdatePackage: 20,
      RemovePackage: 30,
      RunScript: 40,
      CustomCommand: 50,
    });
  });

  it("respeita os limites 0..99", () => {
    expect(MIN_EXECUTION_ORDER).toBe(0);
    expect(MAX_EXECUTION_ORDER).toBe(99);
  });

  it("resolve o default a partir do enum numérico", () => {
    expect(defaultExecutionOrderForAction(AutomationTaskActionType.InstallPackage)).toBe(10);
    expect(defaultExecutionOrderForAction(AutomationTaskActionType.UpdateOrInstallPackage)).toBe(20);
    expect(defaultExecutionOrderForAction(AutomationTaskActionType.UpdatePackage)).toBe(20);
    expect(defaultExecutionOrderForAction(AutomationTaskActionType.RemovePackage)).toBe(30);
    expect(defaultExecutionOrderForAction(AutomationTaskActionType.RunScript)).toBe(40);
    expect(defaultExecutionOrderForAction(AutomationTaskActionType.CustomCommand)).toBe(50);
  });

  it("resolve o default a partir do nome em string", () => {
    expect(defaultExecutionOrderForAction("InstallPackage")).toBe(10);
    expect(defaultExecutionOrderForAction("UpdateOrInstallPackage")).toBe(20);
    expect(defaultExecutionOrderForAction("UpdatePackage")).toBe(20);
    expect(defaultExecutionOrderForAction("RemovePackage")).toBe(30);
    expect(defaultExecutionOrderForAction("RunScript")).toBe(40);
    expect(defaultExecutionOrderForAction("CustomCommand")).toBe(50);
  });

  it("aceita o enum numérico como string", () => {
    expect(defaultExecutionOrderForAction(String(AutomationTaskActionType.InstallPackage))).toBe(10);
    expect(defaultExecutionOrderForAction(String(AutomationTaskActionType.RemovePackage))).toBe(30);
  });

  it("cai no fallback 50 para tipos desconhecidos", () => {
    expect(FALLBACK_EXECUTION_ORDER).toBe(50);
    for (const unknown of [999, -1, "NaoExiste", null, undefined, {}, []]) {
      expect(defaultExecutionOrderForAction(unknown)).toBe(50);
    }
  });

  it("executionOrderError aceita inteiro de 0 a 99", () => {
    expect(executionOrderError("0")).toBeNull();
    expect(executionOrderError("10")).toBeNull();
    expect(executionOrderError("99")).toBeNull();
    expect(executionOrderError(" 42 ")).toBeNull();
  });

  it("executionOrderError rejeita vazio, fora do intervalo e não inteiro", () => {
    expect(executionOrderError("")).toBeTruthy();
    expect(executionOrderError("   ")).toBeTruthy();
    expect(executionOrderError("-1")).toBeTruthy();
    expect(executionOrderError("100")).toBeTruthy();
    expect(executionOrderError("10.5")).toBeTruthy();
    expect(executionOrderError("abc")).toBeTruthy();
  });

  it("clampExecutionOrder limita ao intervalo", () => {
    expect(clampExecutionOrder(-5)).toBe(0);
    expect(clampExecutionOrder(0)).toBe(0);
    expect(clampExecutionOrder(42)).toBe(42);
    expect(clampExecutionOrder(99)).toBe(99);
    expect(clampExecutionOrder(150)).toBe(99);
    expect(clampExecutionOrder(10.9)).toBe(10);
  });
});
