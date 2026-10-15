import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Formato real de `GET /app-store/approvals` e `GET /app-store/approvals/audit`.
 *
 * Dois pontos que quebravam a loja:
 *  1. a API responde a lista de aprovações direto (array JSON), e o front só
 *     entendia o envelope { items, count } — a aba ficava vazia;
 *  2. `Program.cs` registra `JsonStringEnumConverter`, então TODO enum chega
 *     como string ("Allow"/"Global"/"Created"). Comparações numéricas do front
 *     (action === AppApprovalActionType.Allow) nunca casavam: a aba Aprovações
 *     marcava tudo como "Negado" e a Auditoria mostrava "—"/inglês.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("./client", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    ApiError,
    api: { get: mocks.get, post: mocks.post },
  };
});

import { appStoreApi } from "./app-store";
import {
  AppApprovalActionType,
  AppApprovalAuditChangeType,
  AppApprovalScopeType,
  AppInstallationType,
} from "./types";

/** Regra como o wire devolve (enums por nome, sem packageName/reason/createdAt). */
const wireRule = {
  ruleId: "rule-1",
  scopeType: "Global",
  scopeId: null,
  installationType: "Custom",
  packageId: "foxit_editor",
  action: "Allow",
  autoUpdateEnabled: false,
  updatedAt: "2026-10-13T10:00:00Z",
};

describe("appStoreApi.getApprovals", () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it("normaliza a lista (array) com enums por nome", async () => {
    mocks.get.mockResolvedValue([wireRule]);

    const data = await appStoreApi.getApprovals({
      scopeType: AppApprovalScopeType.Global,
      installationType: AppInstallationType.Custom,
    });

    expect(data.count).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      ruleId: "rule-1",
      packageId: "foxit_editor",
      scopeType: AppApprovalScopeType.Global,
      installationType: AppInstallationType.Custom,
      action: AppApprovalActionType.Allow,
    });
    // Sem envelope, os metadados vêm dos filtros da consulta.
    expect(data.installationType).toBe(AppInstallationType.Custom);
    expect(data.scopeId).toBeNull();
  });

  it("marca 'Negado' corretamente e não chuta em valor desconhecido", async () => {
    mocks.get.mockResolvedValue([
      { ...wireRule, ruleId: "r-deny", action: "Deny" },
      { ...wireRule, ruleId: "r-x", action: "SomethingElse" },
    ]);

    const data = await appStoreApi.getApprovals({
      scopeType: AppApprovalScopeType.Global,
      installationType: AppInstallationType.Custom,
    });

    expect(data.items[0].action).toBe(AppApprovalActionType.Deny);
    expect(data.items[1].action).toBeNull();
  });

  it("continua aceitando o envelope { items, count } e enums numéricos", async () => {
    mocks.get.mockResolvedValue({
      scopeType: AppApprovalScopeType.Global,
      installationType: AppInstallationType.Winget,
      count: 1,
      items: [
        { ...wireRule, scopeType: 0, installationType: 0, action: 1 },
      ],
    });

    const data = await appStoreApi.getApprovals({
      scopeType: AppApprovalScopeType.Global,
      installationType: AppInstallationType.Winget,
    });

    expect(data.count).toBe(1);
    expect(data.items[0].action).toBe(AppApprovalActionType.Deny);
    expect(data.items[0].installationType).toBe(AppInstallationType.Winget);
  });

  it("trata resposta vazia, sem body e regra só com id", async () => {
    mocks.get.mockResolvedValue([]);
    const empty = await appStoreApi.getApprovals({
      scopeType: AppApprovalScopeType.Global,
      installationType: AppInstallationType.Winget,
    });
    expect(empty.count).toBe(0);
    expect(empty.items).toEqual([]);

    // `request()` devolve undefined em 204/content-length 0.
    mocks.get.mockResolvedValue(undefined);
    const noBody = await appStoreApi.getApprovals({
      scopeType: AppApprovalScopeType.Global,
      installationType: AppInstallationType.Winget,
    });
    expect(noBody.items).toEqual([]);

    mocks.get.mockResolvedValue([{ ...wireRule, ruleId: undefined, id: "rule-1" }]);
    const withIdOnly = await appStoreApi.getApprovals({
      scopeType: AppApprovalScopeType.Global,
      installationType: AppInstallationType.Custom,
    });
    expect(withIdOnly.items[0].ruleId).toBe("rule-1");
  });
});

describe("appStoreApi.createApproval", () => {
  beforeEach(() => {
    mocks.post.mockReset();
  });

  it("normaliza a regra devolvida pelo POST (enums por nome)", async () => {
    mocks.post.mockResolvedValue({
      ruleId: "rule-9",
      scopeType: "Client",
      scopeId: "c1",
      installationType: "Winget",
      packageId: "Microsoft.VSCode",
      action: "Deny",
      autoUpdateEnabled: true,
      updatedAt: "2026-10-13T12:00:00Z",
    });

    const rule = await appStoreApi.createApproval({
      scopeType: AppApprovalScopeType.Client,
      scopeId: "c1",
      installationType: AppInstallationType.Winget,
      packageId: "Microsoft.VSCode",
      action: AppApprovalActionType.Deny,
      autoUpdateEnabled: true,
    });

    expect(rule).toMatchObject({
      ruleId: "rule-9",
      scopeType: AppApprovalScopeType.Client,
      installationType: AppInstallationType.Winget,
      action: AppApprovalActionType.Deny,
      autoUpdateEnabled: true,
    });
  });
});

describe("appStoreApi.getAudit", () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it("converte o formato da API (id/oldAction/newAction, enums por nome)", async () => {
    mocks.get.mockResolvedValue({
      installationType: "Custom",
      returnedItems: 2,
      limit: 50,
      cursor: null,
      nextCursor: "cursor-1",
      hasMore: true,
      items: [
        {
          id: "audit-1",
          ruleId: "rule-1",
          changeType: "Created",
          scopeType: "Global",
          scopeId: null,
          installationType: "Custom",
          packageId: "foxit_editor",
          newAction: "Allow",
          newAutoUpdateEnabled: false,
          reason: "cadastro inicial",
          changedBy: "ti",
          changedAt: "2026-10-13T10:00:00Z",
        },
        {
          id: "audit-2",
          changeType: "Deleted",
          scopeType: "Site",
          scopeId: "site-1",
          installationType: "Custom",
          packageId: "foxit_zip",
          oldAction: "Deny",
          changedAt: "2026-10-13T11:00:00Z",
        },
      ],
    });

    const page = await appStoreApi.getAudit({ installationType: AppInstallationType.Custom });

    expect(page.items[0]).toMatchObject({
      auditId: "audit-1",
      action: AppApprovalActionType.Allow,
      changeType: AppApprovalAuditChangeType.Created,
      scopeType: AppApprovalScopeType.Global,
      autoUpdateEnabled: false,
      reason: "cadastro inicial",
      changedBy: "ti",
    });
    // Remoção: a API manda só oldAction.
    expect(page.items[1]).toMatchObject({
      auditId: "audit-2",
      action: AppApprovalActionType.Deny,
      changeType: AppApprovalAuditChangeType.Deleted,
      scopeType: AppApprovalScopeType.Site,
      scopeId: "site-1",
    });
    expect(page.returnedItems).toBe(2);
    expect(page.nextCursor).toBe("cursor-1");
    expect(page.hasMore).toBe(true);
  });

  it("mantém ação nula e tipo de alteração padrão quando o evento não os traz", async () => {
    mocks.get.mockResolvedValue({ items: [{ id: "audit-3", packageId: "x" }] });

    const page = await appStoreApi.getAudit();

    expect(page.items[0].auditId).toBe("audit-3");
    expect(page.items[0].action).toBeNull();
    expect(page.items[0].changeType).toBe(AppApprovalAuditChangeType.Created);
    expect(page.returnedItems).toBe(1);
    expect(page.hasMore).toBe(false);
  });

  it("não estoura quando o endpoint volta sem body", async () => {
    mocks.get.mockResolvedValue(undefined);
    const page = await appStoreApi.getAudit();
    expect(page.items).toEqual([]);
    expect(page.returnedItems).toBe(0);
  });
});
